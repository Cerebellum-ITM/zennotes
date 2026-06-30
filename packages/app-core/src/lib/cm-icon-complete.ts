import type { CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'
import { useStore } from '../store'
import { VALID_FOLDER_ICON_IDS } from './icon-resolve'
import { matchIconDirectivePrefix } from './inline-icon-directive'

type IconCompletion = Completion & { _kind: 'icon'; _iconRef: string }

function applyIconRef(ref: string) {
  return (view: EditorView, _c: Completion, from: number, to: number): void => {
    const insert = `${ref}}`
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length }
    })
  }
}

/**
 * CodeMirror completion source for the `{icon:<ref>}` directive: when typing
 * inside `{icon:…`, offers the vault's custom icons plus the built-in ids, each
 * rendered with its SVG preview (see `renderCompletion` in cm-slash-commands).
 */
export function iconDirectiveSource(context: CompletionContext): CompletionResult | null {
  const { state, pos } = context
  const line = state.doc.lineAt(pos)
  const textBefore = state.doc.sliceString(line.from, pos)
  const m = matchIconDirectivePrefix(textBefore)
  if (!m) return null

  const from = line.from + m.from
  const customIcons = useStore.getState().customIcons

  const options: IconCompletion[] = []
  for (const icon of customIcons) {
    options.push({
      label: icon.id,
      displayLabel: icon.id,
      _kind: 'icon',
      _iconRef: icon.id,
      type: 'icon',
      apply: applyIconRef(icon.id)
    })
  }
  for (const id of VALID_FOLDER_ICON_IDS) {
    const ref = `builtin:${id}`
    options.push({
      label: ref,
      displayLabel: ref,
      // Float the user's own icons above the built-ins on an empty query.
      boost: -1,
      _kind: 'icon',
      _iconRef: ref,
      type: 'icon',
      apply: applyIconRef(ref)
    })
  }

  // `validFor` keeps the popup open and filters the ~950 options CLIENT-SIDE as
  // the user types ref characters, instead of re-running this source (and
  // rebuilding every option) on each keystroke — which made the menu close/jank.
  // CM only re-queries when the typed continuation leaves the ref grammar (e.g.
  // a `}` or space), where this source correctly returns null.
  return { from, options, filter: true, validFor: /^[A-Za-z0-9._/:+#-]*$/ }
}
