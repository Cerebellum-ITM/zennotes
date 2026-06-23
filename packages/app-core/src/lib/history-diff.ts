// Pure line-diff helpers for the note-history timeline. Kept free of git/IPC so
// the logic is unit-testable; the panel fetches snapshot contents via the bridge
// and renders the result of these functions.
import { diffLines } from 'diff'

export type DiffLineKind = 'context' | 'added' | 'removed'

export interface DiffLine {
  kind: DiffLineKind
  text: string
}

export interface DiffStats {
  added: number
  modified: number
  removed: number
}

/** Split a diff chunk's value into individual lines, dropping the synthetic
 *  trailing empty produced by a value that ends in a newline. */
function splitChunk(value: string): string[] {
  const lines = value.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** Line-level diff between two note bodies (old → new). */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const out: DiffLine[] = []
  for (const part of diffLines(oldText, newText)) {
    const kind: DiffLineKind = part.added ? 'added' : part.removed ? 'removed' : 'context'
    for (const text of splitChunk(part.value)) out.push({ kind, text })
  }
  return out
}

/**
 * Summarize a diff into added / modified / removed counts. A contiguous
 * removed-then-added region counts `min(removed, added)` lines as *modified*;
 * the surplus on either side counts as a pure add or remove. Mirrors how the
 * timeline shows `+N ~N -N` badges.
 */
export function diffStats(lines: DiffLine[]): DiffStats {
  let added = 0
  let removed = 0
  let modified = 0
  let i = 0
  while (i < lines.length) {
    if (lines[i].kind === 'context') {
      i++
      continue
    }
    let r = 0
    while (i < lines.length && lines[i].kind === 'removed') {
      r++
      i++
    }
    let a = 0
    while (i < lines.length && lines[i].kind === 'added') {
      a++
      i++
    }
    const m = Math.min(r, a)
    modified += m
    removed += r - m
    added += a - m
  }
  return { added, modified, removed }
}
