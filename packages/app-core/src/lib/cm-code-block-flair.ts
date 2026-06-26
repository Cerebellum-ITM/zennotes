/**
 * Code-block chrome for the WYSIWYG (Edit) editor. Turns each fenced block's
 * opening fence line into a header bar (title + language) and hides the closing
 * fence, so the block reads like the preview. Putting the caret on a fence line
 * reveals its raw text so it stays editable (the Obsidian live-preview pattern).
 *
 * Everything is done with LINE decorations (`data-*` attributes painted via CSS
 * pseudo-elements) and empty `Decoration.replace` ranges (to hide the raw fence
 * text) — never an inline content widget. A content widget at the line end made
 * CodeMirror measure the caret at the widget, so the cursor jumped to the
 * top-right; line decorations + CSS live outside the text flow and never touch
 * the caret. It also highlights the `{n}` lines from the fence meta.
 *
 * WYSIWYG-only: lives in `wysiwygExtensions()`, never in the Split editor.
 */
import { foldEffect, foldedRanges, syntaxTree, unfoldEffect } from '@codemirror/language'
import { RangeSetBuilder } from '@codemirror/state'
import type { SyntaxNode } from '@lezer/common'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType
} from '@codemirror/view'
import {
  BTN_ICON_CLASS,
  BTN_LABEL_CLASS,
  COPY_ICON_SVG,
  FOLD_ICON_SVG,
  writeClipboardText
} from './code-block-copy'
import { parseFenceMeta } from './code-fence-meta'
import { langAccentTriplet } from './lang-colors'
import { langIconSvgOrGeneric, normalizeLangToken } from './lang-icons'

// Opening fence: capture the language (group 1) and the rest — the meta (2).
const FENCE_RE = /^\s*(?:`{3,}|~{3,})\s*([^\s`]*)[ \t]*(.*)$/
// A bare closing fence line (only backticks/tildes).
const CLOSE_FENCE_RE = /^\s*(?:`{3,}|~{3,})\s*$/

type DocState = EditorView['state']
type DocLine = ReturnType<DocState['doc']['lineAt']>

const hideText = Decoration.replace({})

type LnMode = 'auto' | 'on' | 'off'

const contentDecoCache = new Map<string, Decoration>()
/**
 * A content line: its block-relative number (data attr), highlight class, and
 * the per-block line-number override (`cm-code-ln-on`/`-off` from `ln:true`/
 * `ln:false`; `auto` follows the global setting).
 */
function contentLineDeco(rel: number, highlighted: boolean, lnMode: LnMode): Decoration {
  const key = `${rel}|${highlighted ? 1 : 0}|${lnMode}`
  let deco = contentDecoCache.get(key)
  if (!deco) {
    const classes: string[] = []
    if (highlighted) classes.push('cm-code-line-hl')
    if (lnMode === 'on') classes.push('cm-code-ln-on')
    else if (lnMode === 'off') classes.push('cm-code-ln-off')
    deco = Decoration.line({
      attributes: { 'data-code-ln': String(rel) },
      class: classes.length ? classes.join(' ') : undefined
    })
    contentDecoCache.set(key, deco)
  }
  return deco
}

const lineDecoCache = new Map<string, Decoration>()
function lineDeco(attrs: Record<string, string>): Decoration {
  const key = JSON.stringify(attrs)
  let deco = lineDecoCache.get(key)
  if (!deco) {
    deco = Decoration.line({ attributes: attrs })
    lineDecoCache.set(key, deco)
  }
  return deco
}

function selectionTouchesLine(state: DocState, line: DocLine): boolean {
  for (const range of state.selection.ranges) {
    if (range.empty) {
      if (range.from >= line.from && range.from <= line.to) return true
      continue
    }
    if (Math.max(range.from, line.from) < Math.min(range.to, line.to)) return true
  }
  return false
}

/**
 * Resolve the fenced block whose opening fence starts at `headerFrom` to the
 * body range CodeMirror should fold (everything after the opening fence line up
 * to the end of the block). Recomputed live on click so it survives edits that
 * shifted positions since the widget was built.
 */
function fencedBlockBody(state: DocState, headerFrom: number): { from: number; to: number } | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(headerFrom, 1)
  for (; node; node = node.parent) if (node.name === 'FencedCode') break
  if (!node) return null
  const beginLine = state.doc.lineAt(node.from)
  const endLine = state.doc.lineAt(Math.min(state.doc.length, Math.max(node.from, node.to - 1)))
  const from = beginLine.to
  const to = endLine.to
  return to > from ? { from, to } : null
}

/** Toggle CodeMirror's native fold over a block's body (button click). */
function toggleCodeFold(view: EditorView, headerFrom: number): void {
  const range = fencedBlockBody(view.state, headerFrom)
  if (!range) return
  const folded = foldedRanges(view.state)
  let existing: { from: number; to: number } | null = null
  folded.between(range.from, range.to, (from, to) => {
    if (from === range.from) {
      existing = { from, to }
      return false
    }
    return undefined
  })
  view.dispatch({ effects: existing ? unfoldEffect.of(existing) : foldEffect.of(range) })
}

/** True when this block's body is currently folded (drives the chevron flip). */
function isBlockFolded(state: DocState, bodyFrom: number, bodyTo: number): boolean {
  let result = false
  foldedRanges(state).between(bodyFrom, bodyTo, (from) => {
    if (from === bodyFrom) {
      result = true
      return false
    }
    return undefined
  })
  return result
}

function makeActionButton(cls: string, iconSvg: string, label: string): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = cls
  const icon = document.createElement('span')
  icon.className = BTN_ICON_CLASS
  icon.setAttribute('aria-hidden', 'true')
  icon.innerHTML = iconSvg
  const text = document.createElement('span')
  text.className = BTN_LABEL_CLASS
  text.textContent = label
  btn.append(icon, text)
  return btn
}

const copyResetTimers = new WeakMap<HTMLButtonElement, number>()

/**
 * Header action cluster (Fold · Copy · LANG) for the Edit pane, rendered as an
 * absolutely-positioned widget at the START of the fence line (`side: -1`) — the
 * same caret-safe placement the heading-fold arrow uses. It only exists while
 * the header is shown (caret off the fence line), so it never measures the
 * caret. CSS pins it to the header's top-right; it reuses the preview's button
 * classes so both panes look identical.
 */
class CodeHeaderActionsWidget extends WidgetType {
  constructor(
    private readonly headerFrom: number,
    private readonly language: string,
    private readonly bodyText: string,
    private readonly folded: boolean
  ) {
    super()
  }

  eq(other: CodeHeaderActionsWidget): boolean {
    return (
      other.headerFrom === this.headerFrom &&
      other.language === this.language &&
      other.bodyText === this.bodyText &&
      other.folded === this.folded
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'cm-code-actions'
    wrap.setAttribute('contenteditable', 'false')

    const toolbar = document.createElement('div')
    toolbar.className = 'zen-code-block-toolbar'

    const fold = makeActionButton(
      'zen-code-fold-button',
      FOLD_ICON_SVG,
      this.folded ? 'Expand' : 'Fold'
    )
    fold.setAttribute('aria-label', this.folded ? 'Expand code block' : 'Collapse code block')
    fold.setAttribute('aria-expanded', String(!this.folded))
    if (this.folded) fold.setAttribute('data-code-folded', 'true')
    fold.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      toggleCodeFold(view, this.headerFrom)
    })

    const copy = makeActionButton('zen-code-copy-button', COPY_ICON_SVG, 'Copy')
    copy.setAttribute('aria-label', 'Copy code block')
    copy.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.handleCopy(copy)
    })

    // Eat mousedown/pointerdown so CodeMirror doesn't read the press as a caret
    // placement and pull focus into the block before our click handler runs.
    const swallow = (event: Event): void => {
      event.preventDefault()
      event.stopPropagation()
    }
    for (const btn of [fold, copy]) {
      btn.addEventListener('mousedown', swallow)
      btn.addEventListener('pointerdown', swallow)
    }

    toolbar.append(fold, copy)

    const label = document.createElement('span')
    label.className = 'zen-code-lang-label'
    label.textContent = this.language ? this.language.toUpperCase() : ''

    wrap.append(toolbar, label)
    return wrap
  }

  private handleCopy(button: HTMLButtonElement): void {
    const ok = writeClipboardText(this.bodyText)
    const previous = copyResetTimers.get(button)
    if (previous != null) window.clearTimeout(previous)
    button.dataset.copyState = ok ? 'copied' : 'failed'
    const labelEl = button.querySelector<HTMLElement>(`.${BTN_LABEL_CLASS}`)
    if (labelEl) labelEl.textContent = ok ? 'Copied' : 'Failed'
    const timer = window.setTimeout(() => {
      if (labelEl) labelEl.textContent = 'Copy'
      delete button.dataset.copyState
      copyResetTimers.delete(button)
    }, 1400)
    copyResetTimers.set(button, timer)
  }

  ignoreEvent(): boolean {
    // Atomic: CodeMirror skips its own click→caret logic; our DOM listeners
    // still fire because they're bound directly to the buttons.
    return true
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view
  const tree = syntaxTree(state)
  const seen = new Set<number>()
  // rank 0 = line decoration (point), rank 1 = replace range. At an equal
  // position, line decorations must be added before replace ranges.
  const items: Array<{ from: number; to: number; rank: number; deco: Decoration }> = []

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'FencedCode') return
        const beginLine = state.doc.lineAt(node.from)
        if (seen.has(beginLine.from)) return false
        seen.add(beginLine.from)

        const match = beginLine.text.match(FENCE_RE)
        const language = (match?.[1] || 'text').toLowerCase()
        const meta = parseFenceMeta(match?.[2] ?? '')
        const endLine = state.doc.lineAt(
          Math.min(state.doc.length, Math.max(node.from, node.to - 1))
        )
        const hasClose = endLine.number > beginLine.number && CLOSE_FENCE_RE.test(endLine.text)
        const lastContent = hasClose ? endLine.number - 1 : endLine.number
        const lnMode: LnMode =
          meta.lineNumbers === true ? 'on' : meta.lineNumbers === false ? 'off' : 'auto'

        // Per-language accent for the top strip (read by .cm-code-block-begin);
        // falls back to the theme accent in CSS when the language has no color.
        const accent = langAccentTriplet(language)
        const accentVar = accent ? `--zen-code-accent: ${accent};` : ''

        // Opening fence → header bar (hidden raw text) unless the caret is on it.
        if (selectionTouchesLine(state, beginLine)) {
          const activeAttrs: Record<string, string> = { 'data-code-lang': language }
          if (accentVar) activeAttrs.style = accentVar
          items.push({
            from: beginLine.from,
            to: beginLine.from,
            rank: 0,
            deco: lineDeco(activeAttrs)
          })
        } else {
          const headerAttrs: Record<string, string> = {
            'data-code-lang': language,
            'data-code-title': meta.title ?? '',
            'data-code-header': ''
          }
          const iconSvg = langIconSvgOrGeneric(normalizeLangToken(language))
          // Expose the icon (as a background-image data-URI) and the per-language
          // accent as CSS vars so the ::before header and the card border can use
          // them — both live outside the text flow (no widget, caret-safe).
          const iconVar = iconSvg
            ? `--zen-code-icon: url("data:image/svg+xml,${encodeURIComponent(iconSvg)}");`
            : ''
          if (iconVar || accentVar) {
            headerAttrs.style = `${accentVar}${iconVar}`
          }
          items.push({
            from: beginLine.from,
            to: beginLine.from,
            rank: 0,
            deco: lineDeco(headerAttrs)
          })

          // Caret-safe header actions (Fold · Copy · LANG): a widget at the line
          // START (side -1, rank between the line deco and the replace) pinned to
          // the top-right by CSS. The body text is sliced now for Copy; the fold
          // state drives the chevron flip.
          const firstContent = beginLine.number + 1
          const bodyText =
            lastContent >= firstContent
              ? state.doc.sliceString(
                  state.doc.line(firstContent).from,
                  state.doc.line(lastContent).to
                )
              : ''
          const folded = isBlockFolded(state, beginLine.to, endLine.to)
          items.push({
            from: beginLine.from,
            to: beginLine.from,
            rank: 1,
            deco: Decoration.widget({
              side: -1,
              widget: new CodeHeaderActionsWidget(beginLine.from, language, bodyText, folded)
            })
          })
          if (beginLine.to > beginLine.from) {
            items.push({ from: beginLine.from, to: beginLine.to, rank: 2, deco: hideText })
          }
        }

        // Number each content line (1-based within the block body) and flag the
        // highlighted ones. The number is shown by CSS only when the line-number
        // setting is on; the attribute is harmless otherwise.
        for (let n = beginLine.number + 1; n <= lastContent; n += 1) {
          const rel = n - beginLine.number
          const line = state.doc.line(n)
          items.push({
            from: line.from,
            to: line.from,
            rank: 0,
            deco: contentLineDeco(rel, meta.highlightLines.has(rel), lnMode)
          })
        }

        // Closing fence → hidden unless the caret is on it.
        if (hasClose && !selectionTouchesLine(state, endLine) && endLine.to > endLine.from) {
          items.push({
            from: endLine.from,
            to: endLine.from,
            rank: 0,
            deco: lineDeco({ 'data-code-end': '' })
          })
          items.push({ from: endLine.from, to: endLine.to, rank: 1, deco: hideText })
        }
        return false
      }
    })
  }

  items.sort((a, b) => a.from - b.from || a.rank - b.rank)
  const builder = new RangeSetBuilder<Decoration>()
  for (const item of items) builder.add(item.from, item.to, item.deco)
  return builder.finish()
}

export const codeBlockFlairPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        update.transactions.some((tr) =>
          tr.effects.some((e) => e.is(foldEffect) || e.is(unfoldEffect))
        )
      ) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
)
