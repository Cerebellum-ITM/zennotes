/**
 * WYSIWYG KaTeX rendering for the editor's live preview:
 *  - inline `$…$` renders as an inline formula
 *  - block `$$…$$` (whose fences own their lines) renders as a centered display
 *    formula
 *
 * The raw source is revealed on whichever formula the cursor sits in, matching
 * how the rest of live preview reveals the active token. Math inside a code
 * span or fenced code is left literal, mirroring the Preview pipeline (whose
 * remark-math transform never visits code nodes).
 *
 * Block replace decorations must be supplied from a StateField (CodeMirror needs
 * the block structure before the viewport is computed), so inline and block math
 * share one field — which also lets the inline scan skip inside block regions.
 *
 * WYSIWYG-only: registered via `wysiwygExtensions()`.
 */
import { syntaxTree } from '@codemirror/language'
import { RangeSetBuilder, StateField, type EditorState, type Extension } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import katex from 'katex'

// Inline `$…$`: a single dollar (not `$$`), opening not escaped or space-led,
// closing not space-trailed. Mirrors remark-math so currency like `$5` is left
// alone (see the inline-math handling in markdown.ts).
const INLINE_MATH_RE = /(?<![\\$])\$(?!\s)(?!\$)((?:\\.|[^$\\])+?)(?<!\s)\$(?!\$)/g
// Block `$$…$$`, shortest match, may span lines.
const BLOCK_MATH_RE = /\$\$(?!\$)([\s\S]+?)\$\$/g

function renderKatex(el: HTMLElement, latex: string, display: boolean): void {
  try {
    katex.render(latex.trim(), el, { displayMode: display, throwOnError: false, output: 'html' })
  } catch {
    el.textContent = display ? `$$${latex}$$` : `$${latex}$`
    el.classList.add('cm-math-error')
  }
}

class InlineMathWidget extends WidgetType {
  constructor(readonly latex: string) {
    super()
  }
  eq(other: InlineMathWidget): boolean {
    return other.latex === this.latex
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = 'cm-math-inline'
    renderKatex(el, this.latex, false)
    return el
  }
  ignoreEvent(): boolean {
    return false
  }
}

class BlockMathWidget extends WidgetType {
  constructor(readonly latex: string) {
    super()
  }
  eq(other: BlockMathWidget): boolean {
    return other.latex === this.latex
  }
  toDOM(): HTMLElement {
    const el = document.createElement('div')
    el.className = 'cm-math-block'
    renderKatex(el, this.latex, true)
    return el
  }
}

/** Cursor/selection overlaps (or just touches an edge of) `[from, to]`. */
function selectionTouches(state: EditorState, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
    if (Math.max(range.from, from) <= Math.min(range.to, to)) return true
  }
  return false
}

function isInsideCode(state: EditorState, pos: number): boolean {
  let node = syntaxTree(state).resolveInner(pos, 1)
  for (;;) {
    const n = node.name
    if (n === 'FencedCode' || n === 'CodeBlock' || n === 'InlineCode') return true
    if (!node.parent) return false
    node = node.parent
  }
}

function buildDecorations(state: EditorState): DecorationSet {
  const pending: Array<{ from: number; to: number; deco: Decoration }> = []
  const consumed: Array<[number, number]> = []
  const doc = state.doc
  const text = doc.toString()

  // --- Block math `$$…$$` ------------------------------------------------
  BLOCK_MATH_RE.lastIndex = 0
  let bm: RegExpExecArray | null
  while ((bm = BLOCK_MATH_RE.exec(text)) !== null) {
    const inner = bm[1]
    if (!inner.trim()) continue
    const rawFrom = bm.index
    const rawTo = bm.index + bm[0].length
    if (isInsideCode(state, rawFrom)) continue
    const openLine = doc.lineAt(rawFrom)
    const closeLine = doc.lineAt(rawTo)
    // Only render when the fences own their lines (nothing but whitespace before
    // the opening `$$` and after the closing `$$`), so the whole-line block
    // replace can never swallow surrounding prose.
    const before = openLine.text.slice(0, rawFrom - openLine.from)
    const after = closeLine.text.slice(rawTo - closeLine.from)
    if (before.trim() !== '' || after.trim() !== '') continue
    // Reserve the whole-line span so inline scanning skips inside it, whether the
    // block ends up rendered or revealed.
    consumed.push([openLine.from, closeLine.to])
    if (selectionTouches(state, openLine.from, closeLine.to)) continue
    pending.push({
      from: openLine.from,
      to: closeLine.to,
      deco: Decoration.replace({ block: true, widget: new BlockMathWidget(inner) })
    })
  }

  const insideBlock = (from: number, to: number): boolean =>
    consumed.some(([a, b]) => from >= a && to <= b)

  // --- Inline math `$…$` -------------------------------------------------
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n)
    if (!line.text.includes('$')) continue
    INLINE_MATH_RE.lastIndex = 0
    let im: RegExpExecArray | null
    while ((im = INLINE_MATH_RE.exec(line.text)) !== null) {
      const inner = im[1]
      if (!inner.trim()) continue
      const from = line.from + im.index
      const to = from + im[0].length
      if (insideBlock(from, to)) continue
      if (isInsideCode(state, from + 1)) continue
      if (selectionTouches(state, from, to)) continue
      pending.push({ from, to, deco: Decoration.replace({ widget: new InlineMathWidget(inner) }) })
    }
  }

  pending.sort((a, b) => a.from - b.from || a.to - b.to)
  const builder = new RangeSetBuilder<Decoration>()
  for (const p of pending) builder.add(p.from, p.to, p.deco)
  return builder.finish()
}

const mathRenderField = StateField.define<DecorationSet>({
  create: (state) => buildDecorations(state),
  update(deco, tr) {
    // Rebuild on edits, on cursor moves (to reveal/hide the active formula), and
    // when the parser advances (isInsideCode reads the syntax tree).
    if (tr.docChanged || tr.selection || syntaxTree(tr.startState) !== syntaxTree(tr.state)) {
      return buildDecorations(tr.state)
    }
    return deco
  },
  provide: (field) => EditorView.decorations.from(field)
})

export const mathRenderExtension: Extension = [mathRenderField]
