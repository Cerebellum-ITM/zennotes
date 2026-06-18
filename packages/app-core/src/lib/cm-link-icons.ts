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
import { useStore } from '../store'
import { buildCustomIconIndex, resolveNoteIconRef } from './icon-resolve'
import { renderIconToDOM } from './render-icon-dom'
import { resolveWikilinkTarget } from './wikilinks'

const WIKILINK_RE = /\[\[([^\]\n]+?)\]\]/g
// A markdown inline link `[text](href)` — the href is captured. Images are
// excluded by checking the char before `[` is not `!` (see below).
const MDLINK_RE = /\[[^\]\n]*\]\(([^)\n]+)\)/g

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

/** True when `pos` sits inside an inline/fenced code span or a comment. */
function isInCode(state: EditorView['state'], pos: number): boolean {
  let node: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(state).resolveInner(
    pos,
    1
  )
  while (node) {
    const name = node.name
    if (name === 'InlineCode' || name === 'FencedCode' || name === 'CodeText' || name === 'Comment') {
      return true
    }
    node = node.parent
  }
  return false
}

function decodeHref(href: string): string {
  try {
    return decodeURIComponent(href)
  } catch {
    return href
  }
}

class NoteLinkIconWidget extends WidgetType {
  constructor(
    readonly iconRef: string,
    readonly customByName: Map<string, CustomIcon>
  ) {
    super()
  }

  eq(other: NoteLinkIconWidget): boolean {
    return other.iconRef === this.iconRef
  }

  toDOM(): HTMLElement {
    const el = renderIconToDOM(this.iconRef, this.customByName, 14)
    if (!el) {
      const empty = document.createElement('span')
      empty.className = 'cm-note-link-icon'
      return empty
    }
    el.classList.add('cm-note-link-icon')
    return el
  }

  ignoreEvent(): boolean {
    return true
  }
}

function computeDecorations(view: EditorView): DecorationSet {
  const state = view.state
  const store = useStore.getState()
  const notes = store.notes
  if (!notes || notes.length === 0) return Decoration.none
  const settings = store.vaultSettings
  const rules = settings?.iconRules
  const customByName = buildCustomIconIndex(store.customIcons)

  const pending: { from: number; deco: Decoration }[] = []

  const addFor = (target: string, from: number, to: number): void => {
    if (!target) return
    if (selectionTouchesRange(state, from, to)) return
    if (isInCode(state, from)) return
    const note = resolveWikilinkTarget(notes, target)
    if (!note) return
    const ref = resolveNoteIconRef(note, settings, customByName, rules)
    if (!ref) return
    pending.push({
      from,
      deco: Decoration.widget({
        side: -1,
        widget: new NoteLinkIconWidget(ref, customByName)
      })
    })
  }

  for (const { from, to } of view.visibleRanges) {
    const firstLine = state.doc.lineAt(from).number
    const lastLine = state.doc.lineAt(Math.max(from, to - 1)).number
    for (let n = firstLine; n <= lastLine; n++) {
      const line = state.doc.line(n)
      const text = line.text

      WIKILINK_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = WIKILINK_RE.exec(text)) !== null) {
        const start = line.from + m.index
        const end = start + m[0].length
        const target = m[1].split(/[|#]/)[0].trim()
        addFor(target, start, end)
      }

      MDLINK_RE.lastIndex = 0
      while ((m = MDLINK_RE.exec(text)) !== null) {
        if (m.index > 0 && text[m.index - 1] === '!') continue // image, not a link
        const href = m[1].trim()
        if (
          !href ||
          href.startsWith('#') ||
          href.startsWith('<') ||
          /^[a-z][a-z0-9+.-]*:\/\//i.test(href)
        ) {
          continue
        }
        const start = line.from + m.index
        const end = start + m[0].length
        addFor(decodeHref(href).replace(/^\.\//, ''), start, end)
      }
    }
  }

  pending.sort((a, b) => a.from - b.from)
  const builder = new RangeSetBuilder<Decoration>()
  for (const item of pending) builder.add(item.from, item.from, item.deco)
  return builder.finish()
}

/** Forces a recompute when app state (notes/icons/settings) changes. */
const refreshLinkIconsEffect = StateEffect.define<null>()

/**
 * Editor live-preview plugin that prepends the target note's icon to wikilinks
 * and markdown links that resolve to a vault note. The icon hides while the
 * cursor is inside the link so the raw markdown stays editable.
 */
export const linkIconsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    unsubscribe: (() => void) | null = null

    constructor(view: EditorView) {
      this.decorations = computeDecorations(view)
      this.unsubscribe = useStore.subscribe((state, prev) => {
        if (
          state.notes !== prev.notes ||
          state.customIcons !== prev.customIcons ||
          state.vaultSettings !== prev.vaultSettings
        ) {
          view.dispatch({ effects: refreshLinkIconsEffect.of(null) })
        }
      })
    }

    update(update: ViewUpdate): void {
      const externalRefresh = update.transactions.some((tr) =>
        tr.effects.some((e) => e.is(refreshLinkIconsEffect))
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
