/**
 * Code-block "flair" for the WYSIWYG (Edit) editor: the language name shown at
 * the top-right of each fenced code block.
 *
 * It is rendered as a **line decoration** (a `data-code-lang` attribute on the
 * opening fence line) and painted via a CSS `::after` pseudo-element — NOT as an
 * inline content widget. An absolutely-positioned content widget at the end of
 * the line made CodeMirror measure the caret at the widget, so the cursor
 * "jumped" to the top-right when editing the block. A line-attribute + CSS label
 * lives outside the text flow, so the caret is never affected.
 *
 * WYSIWYG-only: this lives in `wysiwygExtensions()` and never loads in the
 * Split (source) editor.
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

// Capture the language token (group 1) and the rest — the meta (group 2).
const FENCE_RE = /^\s*(?:`{3,}|~{3,})\s*([^\s`]*)[ \t]*(.*)$/

const hlLineDeco = Decoration.line({ class: 'cm-code-line-hl' })

const langDecoCache = new Map<string, Decoration>()
function langLineDeco(language: string): Decoration {
  let deco = langDecoCache.get(language)
  if (!deco) {
    deco = Decoration.line({ attributes: { 'data-code-lang': language } })
    langDecoCache.set(language, deco)
  }
  return deco
}

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view
  const tree = syntaxTree(state)
  const seen = new Set<number>()
  const pending: Array<{ at: number; deco: Decoration }> = []

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'FencedCode') return
        const beginLine = state.doc.lineAt(node.from)
        if (seen.has(beginLine.from)) return false
        seen.add(beginLine.from)

        const langMatch = beginLine.text.match(FENCE_RE)
        const language = (langMatch?.[1] || 'text').toLowerCase()
        pending.push({ at: beginLine.from, deco: langLineDeco(language) })

        // Highlight the lines requested via `{n}` (1-based within the block
        // body, i.e. the first content line is line 1). Safe additive line
        // decorations — no content widgets, so the caret is unaffected.
        const meta = parseFenceMeta(langMatch?.[2] ?? '')
        if (meta.highlightLines.size > 0) {
          const lastLine = state.doc.lineAt(Math.max(node.from, node.to - 1))
          for (let n = beginLine.number + 1; n < lastLine.number; n += 1) {
            if (!meta.highlightLines.has(n - beginLine.number)) continue
            pending.push({ at: state.doc.line(n).from, deco: hlLineDeco })
          }
        }
        return false
      }
    })
  }

  pending.sort((a, b) => a.at - b.at)
  const builder = new RangeSetBuilder<Decoration>()
  for (const item of pending) builder.add(item.at, item.at, item.deco)
  return builder.finish()
}

export const codeBlockFlairPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
)
