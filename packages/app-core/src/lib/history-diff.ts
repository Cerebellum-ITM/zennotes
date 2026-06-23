// Pure line-diff helpers for the note-history timeline. Kept free of git/IPC so
// the logic is unit-testable; the panel fetches snapshot contents via the bridge
// and renders the result of these functions.
import { diffArrays, diffLines } from 'diff'

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

// --- Block-level diff (for the rendered "viewing" overlay) -------------------

export type DiffBlockKind = 'context' | 'added' | 'removed' | 'modified'

export interface DiffBlock {
  kind: DiffBlockKind
  /** Raw markdown for this block (the new text, except for `removed`). */
  text: string
}

const STANDALONE_BLOCK_RE = /^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|---\s*$|===\s*$)/

/**
 * Split markdown into renderable blocks for block-level diffing. Blank lines end
 * a block; headings, list items, task items, blockquotes and rules each become
 * their own block so they decorate (and diff) independently — matching how the
 * timeline highlights one paragraph / heading / task at a time.
 */
export function splitBlocks(text: string): string[] {
  const blocks: string[] = []
  let buf: string[] = []
  const flush = (): void => {
    if (buf.length) blocks.push(buf.join('\n'))
    buf = []
  }
  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      flush()
      continue
    }
    if (STANDALONE_BLOCK_RE.test(line)) {
      flush()
      blocks.push(line)
      continue
    }
    buf.push(line)
  }
  flush()
  return blocks
}

/**
 * Block-level diff between two note bodies (old → new). A removed block
 * immediately followed by an added block is reported as a single `modified`
 * block (carrying the new text), mirroring the timeline's `~` semantics; the
 * surplus on either side stays a pure add/remove.
 */
export function computeBlockDiff(oldText: string, newText: string): DiffBlock[] {
  const parts = diffArrays(splitBlocks(oldText), splitBlocks(newText))
  const out: DiffBlock[] = []
  let i = 0
  while (i < parts.length) {
    const p = parts[i]
    if (!p.added && !p.removed) {
      for (const t of p.value) out.push({ kind: 'context', text: t })
      i++
      continue
    }
    if (p.removed) {
      const removed = p.value
      const next = parts[i + 1]
      if (next?.added) {
        const added = next.value
        const m = Math.min(removed.length, added.length)
        for (let k = 0; k < m; k++) out.push({ kind: 'modified', text: added[k] })
        for (let k = m; k < removed.length; k++) out.push({ kind: 'removed', text: removed[k] })
        for (let k = m; k < added.length; k++) out.push({ kind: 'added', text: added[k] })
        i += 2
        continue
      }
      for (const t of removed) out.push({ kind: 'removed', text: t })
      i++
      continue
    }
    for (const t of p.value) out.push({ kind: 'added', text: t })
    i++
  }
  return out
}
