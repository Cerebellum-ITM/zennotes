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
import { syntaxTree } from '@codemirror/language'
import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate
} from '@codemirror/view'
import { parseFenceMeta } from './code-fence-meta'
import { langAccentTriplet } from './lang-colors'
import { langIconSvg, normalizeLangToken } from './lang-icons'

// Opening fence: capture the language (group 1) and the rest — the meta (2).
const FENCE_RE = /^\s*(?:`{3,}|~{3,})\s*([^\s`]*)[ \t]*(.*)$/
// A bare closing fence line (only backticks/tildes).
const CLOSE_FENCE_RE = /^\s*(?:`{3,}|~{3,})\s*$/

type DocState = EditorView['state']
type DocLine = ReturnType<DocState['doc']['lineAt']>

const hideText = Decoration.replace({})

const contentDecoCache = new Map<string, Decoration>()
/** A content line: its block-relative number (data attr) + highlight class. */
function contentLineDeco(rel: number, highlighted: boolean): Decoration {
  const key = `${rel}|${highlighted ? 1 : 0}`
  let deco = contentDecoCache.get(key)
  if (!deco) {
    deco = Decoration.line({
      attributes: { 'data-code-ln': String(rel) },
      class: highlighted ? 'cm-code-line-hl' : undefined
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
          const iconSvg = language === 'text' ? null : langIconSvg(normalizeLangToken(language))
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
          if (beginLine.to > beginLine.from) {
            items.push({ from: beginLine.from, to: beginLine.to, rank: 1, deco: hideText })
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
            deco: contentLineDeco(rel, meta.highlightLines.has(rel))
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
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
)
