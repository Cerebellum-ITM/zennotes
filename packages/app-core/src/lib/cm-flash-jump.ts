import {
  EditorSelection,
  Prec,
  StateEffect,
  StateField,
  type Extension
} from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate
} from '@codemirror/view'
import { getCM } from '@replit/codemirror-vim'
import { generateHintLabels } from './vim-nav'

/**
 * flash.nvim-style jump for the CodeMirror editor.
 *
 * Pressing the bound key (default `s`, wired as a vim action in
 * `Editor.tsx`) arms the jump: as the user types, every match in the
 * **visible viewport** is highlighted and labelled; pressing a label moves the
 * cursor there (normal mode) or extends the selection to it (visual mode).
 *
 * Scope is deliberately the visible viewport only — never an off-screen search
 * with auto-scroll — mirroring how `HintOverlay` labels only on-screen DOM.
 */

export type FlashMode = 'normal' | 'visual'

export interface FlashMatch {
  from: number
  to: number
}

export interface FlashTarget extends FlashMatch {
  label: string
}

export interface FlashState {
  query: string
  mode: FlashMode
  /** Selection anchor captured when flash started — used to extend in visual mode. */
  anchor: number
  targets: FlashTarget[]
  /** Chars of a multi-char label pressed so far (for >25 matches). */
  labelBuffer: string
}

export interface VisibleRange {
  from: number
  to: number
}

// ---------------------------------------------------------------------------
// Pure logic (unit-tested in cm-flash-jump.test.ts)
// ---------------------------------------------------------------------------

/**
 * Find every literal, case-insensitive occurrence of `query` inside the visible
 * ranges of `docText`, sorted by proximity to `cursor` (closest first).
 */
export function findFlashMatches(
  docText: string,
  ranges: readonly VisibleRange[],
  query: string,
  cursor: number
): FlashMatch[] {
  if (!query) return []
  const needle = query.toLowerCase()
  const matches: FlashMatch[] = []
  for (const range of ranges) {
    const hay = docText.slice(range.from, range.to).toLowerCase()
    let idx = hay.indexOf(needle)
    while (idx !== -1) {
      const absFrom = range.from + idx
      matches.push({ from: absFrom, to: absFrom + needle.length })
      idx = hay.indexOf(needle, idx + Math.max(1, needle.length))
    }
  }
  matches.sort((a, b) => Math.abs(a.from - cursor) - Math.abs(b.from - cursor))
  return matches
}

/**
 * Assign jump labels to matches, excluding the character that immediately
 * follows each match so the natural next search keystroke never collides with a
 * label (it always extends the query instead).
 */
export function assignFlashLabels(docText: string, matches: readonly FlashMatch[]): FlashTarget[] {
  const exclude = new Set<string>()
  for (const m of matches) {
    const next = docText.slice(m.to, m.to + 1).toLowerCase()
    if (/^[a-z]$/.test(next)) exclude.add(next)
  }
  const labels = generateHintLabels(matches.length, exclude)
  const targets: FlashTarget[] = []
  for (let i = 0; i < matches.length; i++) {
    const label = labels[i]
    if (!label) continue
    targets.push({ ...matches[i], label })
  }
  return targets
}

export function computeFlashTargets(
  docText: string,
  ranges: readonly VisibleRange[],
  query: string,
  cursor: number
): FlashTarget[] {
  return assignFlashLabels(docText, findFlashMatches(docText, ranges, query, cursor))
}

/**
 * Resolve the selection produced by jumping to `targetFrom`. Normal mode places
 * a bare cursor; visual mode keeps the original anchor and moves the head.
 */
export function flashSelection(
  mode: FlashMode,
  anchor: number,
  targetFrom: number
): { anchor: number; head: number } {
  if (mode === 'visual') return { anchor, head: targetFrom }
  return { anchor: targetFrom, head: targetFrom }
}

// ---------------------------------------------------------------------------
// CodeMirror extension
// ---------------------------------------------------------------------------

const setFlash = StateEffect.define<FlashState | null>()

class FlashLabelWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly matched: string
  ) {
    super()
  }

  eq(other: FlashLabelWidget): boolean {
    return other.label === this.label && other.matched === this.matched
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'zen-flash-label'
    const remaining = this.label.slice(this.matched.length)
    if (this.matched) {
      const matched = document.createElement('span')
      matched.className = 'zen-flash-label-matched'
      matched.textContent = this.matched
      span.appendChild(matched)
    }
    span.appendChild(document.createTextNode(remaining))
    return span
  }

  ignoreEvent(): boolean {
    return true
  }
}

function buildDecorations(state: FlashState | null): DecorationSet {
  if (!state || state.targets.length === 0) return Decoration.none
  const decos: { from: number; to: number; deco: Decoration }[] = []
  for (const target of state.targets) {
    // Only show labels still reachable given the label buffer.
    if (state.labelBuffer && !target.label.startsWith(state.labelBuffer)) continue
    decos.push({
      from: target.from,
      to: target.to,
      deco: Decoration.mark({ class: 'zen-flash-match' })
    })
    decos.push({
      from: target.from,
      to: target.from,
      deco: Decoration.widget({
        widget: new FlashLabelWidget(target.label, state.labelBuffer),
        side: -1
      })
    })
  }
  decos.sort((a, b) => a.from - b.from || (a.to === a.from ? -1 : 1))
  return Decoration.set(
    decos.map((d) => d.deco.range(d.from, d.to)),
    true
  )
}

export const flashStateField = StateField.define<FlashState | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setFlash)) return effect.value
    }
    // Flash is transient: any document change ends it.
    if (value && tr.docChanged) return null
    return value
  },
  provide: (field) => EditorView.decorations.from(field, buildDecorations)
})

export function isFlashActive(view: EditorView): boolean {
  return view.state.field(flashStateField, false) != null
}

function recompute(view: EditorView, base: FlashState): FlashState {
  const targets = computeFlashTargets(
    view.state.doc.toString(),
    view.visibleRanges,
    base.query,
    view.state.selection.main.head
  )
  return { ...base, targets }
}

export function startFlashJump(view: EditorView, mode: FlashMode): void {
  const anchor = view.state.selection.main.anchor
  view.dispatch({
    effects: setFlash.of({ query: '', mode, anchor, targets: [], labelBuffer: '' })
  })
}

function endFlash(view: EditorView): void {
  view.dispatch({ effects: setFlash.of(null) })
  view.focus()
}

function commitJump(view: EditorView, target: FlashTarget, state: FlashState): void {
  const sel = flashSelection(state.mode, state.anchor, target.from)
  view.dispatch({
    effects: setFlash.of(null),
    selection: EditorSelection.range(sel.anchor, sel.head),
    scrollIntoView: true
  })
  view.focus()
}

function onFlashKeydown(view: EditorView, event: KeyboardEvent): void {
  const state = view.state.field(flashStateField, false)
  if (!state) return

  const key = event.key

  // Let bare modifier presses through without disturbing flash.
  if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') return

  event.preventDefault()
  event.stopImmediatePropagation()

  if (key === 'Escape') {
    endFlash(view)
    return
  }

  if (key === 'Backspace') {
    if (state.labelBuffer) {
      view.dispatch({ effects: setFlash.of({ ...state, labelBuffer: '' }) })
    } else if (state.query) {
      view.dispatch({ effects: setFlash.of(recompute(view, { ...state, query: state.query.slice(0, -1) })) })
    } else {
      endFlash(view)
    }
    return
  }

  // Modifier combos (Ctrl+x …) abort rather than typing junk.
  if (key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) {
    endFlash(view)
    return
  }

  const lower = key.toLowerCase()

  // Once we have matches, a key that advances a label takes priority (labels
  // are chosen to never collide with the immediate next search char).
  if (state.query) {
    const buffer = state.labelBuffer + lower
    const exact = state.targets.find((t) => t.label === buffer)
    if (exact) {
      commitJump(view, exact, state)
      return
    }
    const prefixed = state.targets.some((t) => t.label.startsWith(buffer))
    if (prefixed) {
      view.dispatch({ effects: setFlash.of({ ...state, labelBuffer: buffer }) })
      return
    }
  }

  // Otherwise extend the search query (reset any partial label buffer).
  view.dispatch({
    effects: setFlash.of(recompute(view, { ...state, query: state.query + lower, labelBuffer: '' }))
  })
}

const flashKeyCapture = ViewPlugin.fromClass(
  class {
    private handler: ((event: KeyboardEvent) => void) | null = null

    constructor(private readonly view: EditorView) {}

    update(update: ViewUpdate): void {
      const active = update.state.field(flashStateField, false) != null
      if (active && !this.handler) {
        this.handler = (event) => onFlashKeydown(this.view, event)
        // Capture phase so we intercept keys before the vim keymap reads them.
        this.view.contentDOM.addEventListener('keydown', this.handler, true)
      } else if (!active && this.handler) {
        this.view.contentDOM.removeEventListener('keydown', this.handler, true)
        this.handler = null
      }
    }

    destroy(): void {
      if (this.handler) {
        this.view.contentDOM.removeEventListener('keydown', this.handler, true)
        this.handler = null
      }
    }
  }
)

/** Resolve the active vim mode (visual vs normal) for an editor view. */
export function flashModeFor(view: EditorView): FlashMode {
  const cm = getCM(view) as { state?: { vim?: { visualMode?: boolean } } } | null
  return cm?.state?.vim?.visualMode ? 'visual' : 'normal'
}

export function flashJump(): Extension {
  return [flashStateField, Prec.highest(flashKeyCapture)]
}
