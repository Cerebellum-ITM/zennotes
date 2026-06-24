import type { EditorView } from '@codemirror/view'
import { getCM } from '@replit/codemirror-vim'
import type { VimPendingState, VisualKind } from './vim-pending-hints'
import { isRegisterPendingCommand } from './vim-pending-hints'

/**
 * Read the current "pending" vim state from an editor view, for the motion hint
 * panel. Returns null when nothing is pending (idle normal mode, insert mode, or
 * vim disabled).
 *
 * Pressing `c`/`g`/`z` changes neither the document nor the selection, so this
 * is meant to be polled on keydown rather than from a `ViewPlugin.update`.
 */
export function readVimPendingState(view: EditorView | null): VimPendingState | null {
  if (!view) return null
  const cm = getCM(view) as
    | {
        state?: {
          vim?: {
            insertMode?: boolean
            visualMode?: boolean
            visualLine?: boolean
            visualBlock?: boolean
            status?: string
            expectLiteralNext?: boolean
            inputState?: { operator?: string | null; keyBuffer?: string[] }
          }
        }
      }
    | null
  const vim = cm?.state?.vim
  if (!vim || vim.insertMode) return null

  // Keys typed after the trigger (e.g. `i`/`a` of `ciw`, or the char of `cf`).
  const buffer = vim.inputState?.keyBuffer?.join('') ?? ''

  const operator = vim.inputState?.operator
  if (operator) {
    return { kind: 'operator', operator, buffer }
  }

  if (vim.visualMode) {
    const visualKind: VisualKind = vim.visualBlock ? 'block' : vim.visualLine ? 'line' : 'char'
    return { kind: 'visual', visualKind, buffer }
  }

  // Single-key command awaiting one literal/register key (r, f, m, …). The
  // count prefix (3r → r) is stripped so the command is identified by itself.
  const literalCmd = buffer.replace(/^\d+/, '')
  if (vim.expectLiteralNext || isRegisterPendingCommand(literalCmd)) {
    return { kind: 'literal', buffer: literalCmd }
  }

  // `g` / `z` command prefixes buffer a single key while awaiting completion.
  if (buffer === 'g' || buffer === 'z') {
    return { kind: 'prefix', prefix: buffer, buffer: '' }
  }

  return null
}

/** Cheap structural equality so the panel only re-renders on real changes. */
export function pendingStateEqual(
  a: VimPendingState | null,
  b: VimPendingState | null
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.kind === b.kind &&
    a.operator === b.operator &&
    a.visualKind === b.visualKind &&
    a.prefix === b.prefix &&
    a.buffer === b.buffer
  )
}
