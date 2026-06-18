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
import { parseLangIconDirective } from './code-lang-icon'
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

class LangIconWidget extends WidgetType {
  constructor(
    readonly iconRef: string,
    readonly customByName: Map<string, CustomIcon>
  ) {
    super()
  }

  eq(other: LangIconWidget): boolean {
    return other.iconRef === this.iconRef
  }

  toDOM(): HTMLElement {
    const el = renderIconToDOM(this.iconRef, this.customByName, 14)
    if (!el) {
      const empty = document.createElement('span')
      empty.className = 'cm-code-lang-icon'
      return empty
    }
    el.classList.add('cm-code-lang-icon')
    el.style.marginRight = '0.1em'
    return el
  }

  ignoreEvent(): boolean {
    return true
  }
}

function computeDecorations(view: EditorView): DecorationSet {
  const state = view.state
  const store = useStore.getState()
  const rules = store.vaultSettings?.iconRules
  if (!rules || rules.length === 0) return Decoration.none
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
        const ticks = /^`+/.exec(raw)?.[0].length ?? 0
        const content = raw.slice(ticks)
        const parsed = parseLangIconDirective(content)
        if (!parsed) return
        const ref = resolveLangIconRef(parsed.lang, customByName, rules)
        if (!ref) return
        const dirFrom = node.from + ticks
        const dirTo = dirFrom + parsed.directiveLength
        pending.push({
          from: dirFrom,
          to: dirTo,
          deco: Decoration.replace({ widget: new LangIconWidget(ref, customByName) })
        })
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
 * Editor live-preview plugin for the `{lang icon}` inline-code directive: it
 * replaces the directive with the language's icon (resolved via `target: 'lang'`
 * rules), leaving the rest of the code visible. Hides while editing the span.
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
