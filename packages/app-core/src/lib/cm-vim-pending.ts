import type { EditorView } from '@codemirror/view'
import { getCM } from '@replit/codemirror-vim'
import type { VimMarkHint, VimPendingState, VisualKind } from './vim-pending-hints'
import { formatMarkSnippet, isMarkCommand, isRegisterPendingCommand } from './vim-pending-hints'

interface VimMarkBookmark {
  find(): { line: number; ch: number } | null
}

interface CmCompat {
  getLine?: (line: number) => string
  state?: {
    vim?: {
      insertMode?: boolean
      visualMode?: boolean
      visualLine?: boolean
      visualBlock?: boolean
      status?: string
      expectLiteralNext?: boolean
      marks?: Record<string, VimMarkBookmark>
      inputState?: { operator?: string | null; keyBuffer?: string[] }
    }
  }
}

/** Read the existing alphabetic marks as `{ name, text }`, sorted by name. */
function readVimMarks(cm: CmCompat): VimMarkHint[] {
  const marks = cm.state?.vim?.marks
  if (!marks) return []
  const out: VimMarkHint[] = []
  for (const name of Object.keys(marks)) {
    if (!/^[a-zA-Z]$/.test(name)) continue
    const pos = marks[name]?.find?.()
    if (!pos) continue
    const lineText = typeof cm.getLine === 'function' ? cm.getLine(pos.line) : ''
    out.push({ name, text: formatMarkSnippet(lineText ?? '', pos.line) })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

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
  const cm = getCM(view) as CmCompat | null
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
    const pending: VimPendingState = { kind: 'literal', buffer: literalCmd }
    if (cm && isMarkCommand(literalCmd)) {
      const marks = readVimMarks(cm)
      if (marks.length) pending.marks = marks
    }
    return pending
  }

  // `g` / `z` command prefixes buffer a single key while awaiting completion.
  if (buffer === 'g' || buffer === 'z') {
    return { kind: 'prefix', prefix: buffer, buffer: '' }
  }

  return null
}

function marksEqual(a?: VimMarkHint[], b?: VimMarkHint[]): boolean {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every((m, i) => m.name === b[i].name && m.text === b[i].text)
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
    a.buffer === b.buffer &&
    marksEqual(a.marks, b.marks)
  )
}
