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
import { buildCustomIconIndex } from './icon-resolve'
import { findInlineIconDirectives } from './inline-icon-directive'
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

/** True when `pos` sits inside any code construct (inline code or fenced block),
 *  where `{icon:…}` must stay literal. */
function isInCode(state: EditorView['state'], pos: number): boolean {
  let node = syntaxTree(state).resolveInner(pos, 1)
  while (node) {
    if (/Code/.test(node.name)) return true
    if (!node.parent) break
    node = node.parent
  }
  return false
}

/** `{icon:<ref>}` in body text → the resolved icon glyph, sized to the text. */
class InlineIconWidget extends WidgetType {
  constructor(
    readonly ref: string,
    readonly customByName: Map<string, CustomIcon>
  ) {
    super()
  }

  eq(other: InlineIconWidget): boolean {
    return other.ref === this.ref
  }

  toDOM(): HTMLElement {
    const icon = renderIconToDOM(this.ref, this.customByName, 16)
    if (icon) {
      icon.classList.add('cm-inline-icon')
      return icon
    }
    // Unresolved ref: keep the literal text so the line isn't lost.
    const span = document.createElement('span')
    span.textContent = `{icon:${this.ref}}`
    return span
  }

  ignoreEvent(): boolean {
    return false
  }
}

function computeDecorations(view: EditorView): DecorationSet {
  const state = view.state
  const customByName = buildCustomIconIndex(useStore.getState().customIcons)

  const pending: { from: number; to: number; deco: Decoration }[] = []

  for (const { from, to } of view.visibleRanges) {
    const slice = state.doc.sliceString(from, to)
    for (const match of findInlineIconDirectives(slice)) {
      const start = from + match.start
      const end = from + match.end
      // Keep raw markdown editable while the cursor is in the span, and never
      // render inside code (inline `…` or fenced) — leave it literal there.
      if (selectionTouchesRange(state, start, end)) continue
      if (isInCode(state, start)) continue
      pending.push({
        from: start,
        to: end,
        deco: Decoration.replace({ widget: new InlineIconWidget(match.ref, customByName) })
      })
    }
  }

  pending.sort((a, b) => a.from - b.from)
  const builder = new RangeSetBuilder<Decoration>()
  for (const item of pending) builder.add(item.from, item.to, item.deco)
  return builder.finish()
}

/** Forces a recompute when app state (custom icons / vault settings) changes. */
const refreshInlineIconsEffect = StateEffect.define<null>()

/**
 * Editor live-preview plugin for the `{icon:<ref>}` body directive: replaces it
 * with the resolved custom/builtin icon, sized to the text. Reveals the raw
 * markdown while the cursor is inside the span; never fires inside code.
 */
export const inlineIconsPlugin = ViewPlugin.fromClass(
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
          view.dispatch({ effects: refreshInlineIconsEffect.of(null) })
        }
      })
    }

    update(update: ViewUpdate): void {
      const externalRefresh = update.transactions.some((tr) =>
        tr.effects.some((e) => e.is(refreshInlineIconsEffect))
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
