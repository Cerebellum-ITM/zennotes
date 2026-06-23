import { syntaxTree } from '@codemirror/language'
import { RangeSetBuilder, StateEffect } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType
} from '@codemirror/view'
import type { CustomIcon } from '@shared/ipc'
import hljs from 'highlight.js/lib/common'
import { useStore } from '../store'
import { parseLangIconDirective, parseInlineLangDirective } from './code-lang-icon'
import { buildCustomIconIndex, resolveLangIconRef } from './icon-resolve'
import { renderIconToDOM } from './render-icon-dom'

/** True when the selection (or a bare cursor) overlaps [from, to]. */
function selectionTouchesRange(
  state: EditorView['state'],
  from: number,
  to: number
): boolean {
  for (const range of state.selection.ranges) {
    if (range.empty) {
      if (range.from >= from && range.from <= to) return true
      continue
    }
    if (Math.max(range.from, from) < Math.min(range.to, to)) return true
  }
  return false
}

// hljs token class → editor Lezer token class, so highlighted inline code reuses
// the editor's `.tok-*` colors (app theme via index.css + named theme via
// editorCodeThemeCss). Unmapped scopes fall back to the chip's base color.
const HLJS_TO_TOK: Record<string, string> = {
  'hljs-keyword': 'tok-keyword',
  'hljs-built_in': 'tok-keyword',
  'hljs-literal': 'tok-keyword',
  'hljs-string': 'tok-string',
  'hljs-regexp': 'tok-string',
  'hljs-comment': 'tok-comment',
  'hljs-quote': 'tok-comment',
  'hljs-number': 'tok-number',
  'hljs-symbol': 'tok-number',
  'hljs-title': 'tok-function',
  'hljs-type': 'tok-type',
  'hljs-tag': 'tok-tag',
  'hljs-name': 'tok-tag',
  'hljs-selector-tag': 'tok-tag',
  'hljs-attr': 'tok-attr',
  'hljs-attribute': 'tok-attr',
  'hljs-variable': 'tok-variable-def',
  'hljs-property': 'tok-property',
  'hljs-params': 'tok-variable-def',
  'hljs-operator': 'tok-operator',
  'hljs-punctuation': 'tok-punct',
  'hljs-meta': 'tok-meta'
}

function remapHljsClass(classes: string): string {
  const list = classes.split(/\s+/)
  if (list.includes('class_')) return 'tok-type'
  const hljsClass = list.find((c) => c.startsWith('hljs-'))
  return (hljsClass && HLJS_TO_TOK[hljsClass]) || ''
}

/** Highlight `code` as `lang` and rewrite hljs classes to the editor's `.tok-*`
 *  classes. Returns `null` when the language is unknown (leave code plain). */
function highlightedTokHtml(code: string, lang: string): string | null {
  if (!hljs.getLanguage(lang)) return null
  const html = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
  return html.replace(/class="([^"]*)"/g, (_m, classes: string) => {
    const tok = remapHljsClass(classes)
    return tok ? `class="${tok}"` : ''
  })
}

/**
 * Renders the whole inline-code content as a single chip — `[icon] code` — with
 * the optional icon inside the inline-code background and the code optionally
 * syntax-highlighted (hljs → `.tok-*`), matching the rendered preview.
 */
class InlineCodeChipWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly tokHtml: string | null,
    readonly iconRef: string | null,
    readonly customByName: Map<string, CustomIcon>
  ) {
    super()
  }

  eq(other: InlineCodeChipWidget): boolean {
    return (
      other.text === this.text &&
      other.tokHtml === this.tokHtml &&
      other.iconRef === this.iconRef
    )
  }

  toDOM(): HTMLElement {
    const chip = document.createElement('span')
    chip.className = 'cm-code-lang-chip cm-inline-hl tok-monospace'
    if (this.iconRef) {
      const icon = renderIconToDOM(this.iconRef, this.customByName, 14)
      if (icon) chip.appendChild(icon)
    }
    if (this.tokHtml != null) {
      const codeSpan = document.createElement('span')
      codeSpan.innerHTML = this.tokHtml
      chip.appendChild(codeSpan)
    } else if (this.text) {
      chip.appendChild(document.createTextNode(this.text))
    }
    return chip
  }

  ignoreEvent(): boolean {
    return false
  }
}

function computeDecorations(view: EditorView): DecorationSet {
  const state = view.state
  const store = useStore.getState()
  const rules = store.vaultSettings?.iconRules
  const langIcons = store.vaultSettings?.langIcons
  const customByName = buildCustomIconIndex(store.customIcons)

  const pending: { from: number; to: number; deco: Decoration }[] = []

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'InlineCode') return
        // Keep the raw markdown editable while the cursor is in the span.
        if (selectionTouchesRange(state, node.from, node.to)) return
        const raw = state.doc.sliceString(node.from, node.to)
        const lead = /^`+/.exec(raw)?.[0].length ?? 0
        const trail = /`+$/.exec(raw)?.[0].length ?? 0
        const content = raw.slice(lead, raw.length - trail)
        const contentFrom = node.from + lead
        const contentTo = node.to - trail

        // 1) `{lang icon}…` → chip with the icon and (when the token is a known
        // language) the rest syntax-highlighted, matching the preview.
        const iconParsed = parseLangIconDirective(content)
        if (iconParsed) {
          const ref = resolveLangIconRef(iconParsed.lang, customByName, rules, langIcons)
          if (ref) {
            pending.push({
              from: contentFrom,
              to: contentTo,
              deco: Decoration.replace({
                widget: new InlineCodeChipWidget(
                  iconParsed.rest,
                  highlightedTokHtml(iconParsed.rest, iconParsed.lang),
                  ref,
                  customByName
                )
              })
            })
            return
          }
        }

        // 2) `{lang}…` → replace with a syntax-highlighted chip (known languages
        // only), so the editor matches the preview's inline highlighting.
        const langParsed = parseInlineLangDirective(content)
        if (langParsed) {
          const tokHtml = highlightedTokHtml(langParsed.rest, langParsed.lang)
          if (tokHtml != null) {
            pending.push({
              from: contentFrom,
              to: contentTo,
              deco: Decoration.replace({
                widget: new InlineCodeChipWidget(
                  langParsed.rest,
                  tokHtml,
                  null,
                  customByName
                )
              })
            })
          }
        }
      }
    })
  }

  pending.sort((a, b) => a.from - b.from)
  const builder = new RangeSetBuilder<Decoration>()
  for (const item of pending) builder.add(item.from, item.to, item.deco)
  return builder.finish()
}

/** Forces a recompute when app state (icon rules / custom icons) changes. */
const refreshLangIconsEffect = StateEffect.define<null>()

/**
 * Editor live-preview plugin for inline-code directives:
 *  - `{lang icon}…` → replaced with the language's icon (resolved via
 *    `target: 'lang'` rules), leaving the rest of the code visible.
 *  - `{lang}…` → the directive prefix is hidden (known languages only), matching
 *    the preview where `{lang}` is consumed before highlighting.
 * Both reveal the raw markdown while the cursor is inside the span.
 */
export const langIconsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    unsubscribe: (() => void) | null = null

    constructor(view: EditorView) {
      this.decorations = computeDecorations(view)
      this.unsubscribe = useStore.subscribe((state, prev) => {
        if (
          state.customIcons !== prev.customIcons ||
          state.vaultSettings !== prev.vaultSettings
        ) {
          view.dispatch({ effects: refreshLangIconsEffect.of(null) })
        }
      })
    }

    update(update: ViewUpdate): void {
      const externalRefresh = update.transactions.some((tr) =>
        tr.effects.some((e) => e.is(refreshLangIconsEffect))
      )
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        update.focusChanged ||
        externalRefresh
      ) {
        this.decorations = computeDecorations(update.view)
      }
    }

    destroy(): void {
      this.unsubscribe?.()
      this.unsubscribe = null
    }
  },
  {
    decorations: (v) => v.decorations
  }
)
