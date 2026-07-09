import { Fragment } from 'react'
import type {
  NoteMeta,
  VaultTextSearchBackendPreference,
  VaultTextSearchMatch
} from '@shared/ipc'

// ---------------------------------------------------------------------------
// Text-match scoring helpers (shared by the unified search palette).
// ---------------------------------------------------------------------------

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Score a single line/field against the query. Exact and prefix matches rank
 * highest, then word-boundary, then substring, then subsequence (fuzzy).
 * Returns 0 when there is no match at all.
 */
export function scoreMatch(query: string, text: string): number {
  if (!query) return 1
  if (!text) return 0
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (t === q) return 1000
  if (t.startsWith(q)) return 900 - t.length * 0.5
  const wordBoundary = new RegExp(`(?:^|[\\s·:_\\-/])${escapeRegex(q)}`)
  if (wordBoundary.test(t)) return 700 - t.length * 0.5
  if (t.includes(q)) return 500 - t.length * 0.5

  let i = 0
  let gaps = 0
  let prev = -1
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] !== q[i]) continue
    if (prev === -1) gaps += j
    else gaps += j - prev - 1
    prev = j
    i += 1
  }
  if (i === q.length) return Math.max(1, 200 - gaps * 3 - t.length * 0.2)
  return 0
}

/** Column of the first character of the match (direct or subsequence start). */
export function firstMatchColumn(query: string, text: string): number {
  const q = query.trim().toLowerCase()
  const t = text.toLowerCase()
  const direct = t.indexOf(q)
  if (direct >= 0) return direct

  let qi = 0
  let start = -1
  for (let i = 0; i < t.length && qi < q.length; i += 1) {
    if (t[i] !== q[qi]) continue
    if (start === -1) start = i
    qi += 1
  }
  return start >= 0 ? start : 0
}

export function collapseSearchLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim()
}

function getHighlightRanges(text: string, query: string): Array<[number, number]> {
  const trimmed = query.trim()
  if (!trimmed || !text) return []
  const lowerText = text.toLowerCase()
  const lowerQuery = trimmed.toLowerCase()
  const directIndex = lowerText.indexOf(lowerQuery)
  if (directIndex >= 0) return [[directIndex, directIndex + lowerQuery.length]]

  const matchedIndexes: number[] = []
  let queryIndex = 0
  for (let textIndex = 0; textIndex < text.length && queryIndex < lowerQuery.length; textIndex += 1) {
    if (lowerText[textIndex] !== lowerQuery[queryIndex]) continue
    matchedIndexes.push(textIndex)
    queryIndex += 1
  }
  if (queryIndex < lowerQuery.length || matchedIndexes.length === 0) return []

  const ranges: Array<[number, number]> = []
  let rangeStart = matchedIndexes[0]
  let previous = matchedIndexes[0]
  for (let index = 1; index < matchedIndexes.length; index += 1) {
    const current = matchedIndexes[index]
    if (current === previous + 1) {
      previous = current
      continue
    }
    ranges.push([rangeStart, previous + 1])
    rangeStart = current
    previous = current
  }
  ranges.push([rangeStart, previous + 1])
  return ranges
}

/** Render `text` with the portions matching `query` wrapped in accent marks. */
export function renderHighlightedText(text: string, query: string): JSX.Element {
  const ranges = getHighlightRanges(text, query)
  if (ranges.length === 0) return <>{text}</>

  const nodes: JSX.Element[] = []
  let cursor = 0
  ranges.forEach(([start, end], index) => {
    if (cursor < start) {
      nodes.push(
        <Fragment key={`plain-${index}-${cursor}`}>{text.slice(cursor, start)}</Fragment>
      )
    }
    nodes.push(
      <mark
        key={`hit-${index}-${start}`}
        className="rounded-sm bg-accent/[0.14] px-[1px] text-current ring-1 ring-inset ring-accent/[0.24]"
      >
        {text.slice(start, end)}
      </mark>
    )
    cursor = end
  })
  if (cursor < text.length) {
    nodes.push(<Fragment key={`plain-tail-${cursor}`}>{text.slice(cursor)}</Fragment>)
  }
  return <>{nodes}</>
}

// ---------------------------------------------------------------------------
// Vault body search: preferred main-process path with a renderer fallback.
// ---------------------------------------------------------------------------

export interface VaultBodySearchDeps {
  notes: NoteMeta[]
  backend: VaultTextSearchBackendPreference
  ripgrepPath: string | null
  fzfPath: string | null
  /** Read a note body from the renderer-side cache, if present. */
  getCachedBody: (path: string) => string | undefined
  setCachedBody: (path: string, body: string) => void
}

/**
 * Pure-renderer fallback used when the desktop main process can't run the
 * search (web build, or the IPC endpoint is missing). Reads every non-trash
 * note body and scores each line, returning matches sorted best-first.
 */
async function fallbackSearchVaultBodies(
  query: string,
  deps: VaultBodySearchDeps
): Promise<VaultTextSearchMatch[]> {
  type ScoredMatch = VaultTextSearchMatch & { score: number }
  const results: ScoredMatch[] = []
  const searchableNotes = deps.notes.filter((note) => note.folder !== 'trash')

  const bodies = await Promise.all(
    searchableNotes.map(async (note) => {
      const cachedBody = deps.getCachedBody(note.path)
      if (typeof cachedBody === 'string') return { note, body: cachedBody }
      try {
        const content = await window.zen.readNote(note.path)
        deps.setCachedBody(note.path, content.body)
        return { note, body: content.body }
      } catch {
        return { note, body: '' }
      }
    })
  )

  for (const { note, body } of bodies) {
    if (!body) continue
    const lines = body.split('\n')
    let lineOffset = 0

    for (let index = 0; index < lines.length; index += 1) {
      const rawLine = lines[index] ?? ''
      const lineText = collapseSearchLine(rawLine)
      const bodyScore = scoreMatch(query, lineText)
      if (bodyScore <= 0) {
        lineOffset += rawLine.length + 1
        continue
      }

      const column = firstMatchColumn(query, rawLine)
      results.push({
        path: note.path,
        title: note.title,
        folder: note.folder,
        lineNumber: index + 1,
        offset: lineOffset + Math.max(0, Math.min(column, rawLine.length)),
        lineText: lineText.slice(0, 220),
        score: bodyScore
      })

      lineOffset += rawLine.length + 1
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, 200).map(({ score: _score, ...match }) => match)
}

/**
 * Search note bodies across the vault. Prefers the desktop main-process engine
 * (ripgrep/fzf/builtin) and falls back to the renderer walk on any failure.
 * Returns matches already ranked best-first; may contain several lines per note.
 */
export async function searchVaultBodies(
  query: string,
  deps: VaultBodySearchDeps
): Promise<VaultTextSearchMatch[]> {
  if (typeof window.zen.searchVaultText !== 'function') {
    return fallbackSearchVaultBodies(query, deps)
  }
  try {
    return await window.zen.searchVaultText(query, deps.backend, {
      ripgrepPath: deps.ripgrepPath,
      fzfPath: deps.fzfPath
    })
  } catch (error) {
    console.error('searchVaultText failed, falling back to renderer search', error)
    return fallbackSearchVaultBodies(query, deps)
  }
}

/**
 * Collapse a ranked match list to the single best (first-seen) line per note.
 * Both search backends return matches best-first, so the first hit for a path
 * is its strongest.
 */
export function reduceToBestPerNote(
  matches: VaultTextSearchMatch[]
): Map<string, VaultTextSearchMatch> {
  const best = new Map<string, VaultTextSearchMatch>()
  for (const match of matches) {
    if (!best.has(match.path)) best.set(match.path, match)
  }
  return best
}
