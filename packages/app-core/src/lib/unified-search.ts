import type { NoteFolder, NoteMeta, VaultTextSearchMatch } from '@shared/ipc'
import {
  buildNoteSearchIndex,
  parseNoteSearchQuery,
  searchNoteIndexScored,
  type NoteSearchEntry
} from './note-search'
import { scoreMatch } from './vault-text-search'

export interface UnifiedResult {
  note: NoteMeta
  path: string
  title: string
  folder: NoteFolder
  /** Body preview line, present only when the match came from the note content. */
  snippet?: string
  /** 1-based line number of the body match. */
  lineNumber?: number
  /** Character offset of the body match into the raw markdown. */
  offset?: number
}

export { buildNoteSearchIndex }
export type { NoteSearchEntry }

// Bonus added to a note that matched by name/tags so that, at comparable
// relevance, the "right note by title" outranks an incidental body hit.
const NAME_MATCH_BONUS = 0.15
// Name candidates are gathered generously before fusing with body matches so
// the per-source cap doesn't drop a note that a body hit would have surfaced.
const NAME_CANDIDATE_LIMIT = 200

function normalize(score: number, max: number): number {
  if (max <= 0) return 0
  return score / max
}

/**
 * Fuse name/tag/path matches (from the in-memory index) with full-text body
 * matches into a single ranked list, one row per note. `bodyMatches` is the
 * best line per note (see {@link reduceToBestPerNote}); pass an empty map when
 * a content search hasn't resolved yet or the query is tag-only.
 */
export function searchUnified(
  index: NoteSearchEntry[],
  bodyMatches: Map<string, VaultTextSearchMatch>,
  query: string,
  options: { limit: number }
): UnifiedResult[] {
  const limit = Math.max(0, options.limit)
  if (limit === 0) return []
  const { freeText, tagTokens } = parseNoteSearchQuery(query)

  const nameMatches = searchNoteIndexScored(index, query, { limit: NAME_CANDIDATE_LIMIT })

  // No free text (empty or tag-only query): body search doesn't run, so just
  // surface the name/tag listing verbatim.
  if (!freeText) {
    return nameMatches.slice(0, limit).map((match) => ({
      note: match.note,
      path: match.note.path,
      title: match.note.title,
      folder: match.note.folder
    }))
  }

  const entryByPath = new Map<string, NoteSearchEntry>()
  for (const entry of index) entryByPath.set(entry.path, entry)

  const nameScoreByPath = new Map<string, { note: NoteMeta; score: number }>()
  for (const match of nameMatches) {
    nameScoreByPath.set(match.note.path, { note: match.note, score: match.score })
  }

  type Candidate = {
    note: NoteMeta
    path: string
    title: string
    folder: NoteFolder
    nameScore: number
    bodyScore: number
    snippet?: string
    lineNumber?: number
    offset?: number
  }

  const candidates = new Map<string, Candidate>()

  for (const [path, { note, score }] of nameScoreByPath) {
    candidates.set(path, {
      note,
      path,
      title: note.title,
      folder: note.folder,
      nameScore: score,
      bodyScore: 0
    })
  }

  for (const [path, match] of bodyMatches) {
    const entry = entryByPath.get(path)
    // A body hit still has to satisfy any #tag filter and never surfaces trash.
    if (!entry) continue
    if (entry.note.folder === 'trash') continue
    if (tagTokens.length > 0 && !tagTokens.every((tag) => entry.tagsLower.includes(tag))) continue

    const bodyScore = scoreMatch(freeText, match.lineText)
    const existing = candidates.get(path)
    if (existing) {
      existing.bodyScore = bodyScore
      existing.snippet = match.lineText
      existing.lineNumber = match.lineNumber
      existing.offset = match.offset
    } else {
      candidates.set(path, {
        note: entry.note,
        path,
        title: entry.note.title,
        folder: entry.note.folder,
        nameScore: 0,
        bodyScore,
        snippet: match.lineText,
        lineNumber: match.lineNumber,
        offset: match.offset
      })
    }
  }

  let nameMax = 0
  let bodyMax = 0
  for (const candidate of candidates.values()) {
    if (candidate.nameScore > nameMax) nameMax = candidate.nameScore
    if (candidate.bodyScore > bodyMax) bodyMax = candidate.bodyScore
  }

  const ranked = Array.from(candidates.values()).map((candidate) => {
    const nameNorm = normalize(candidate.nameScore, nameMax)
    const bodyNorm = normalize(candidate.bodyScore, bodyMax)
    const finalScore = Math.max(nameNorm, bodyNorm) + (candidate.nameScore > 0 ? NAME_MATCH_BONUS : 0)
    return { candidate, finalScore }
  })

  ranked.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore
    return b.candidate.note.updatedAt - a.candidate.note.updatedAt
  })

  return ranked.slice(0, limit).map(({ candidate }) => ({
    note: candidate.note,
    path: candidate.path,
    title: candidate.title,
    folder: candidate.folder,
    // Only attach a preview when the body actually matched.
    snippet: candidate.bodyScore > 0 ? candidate.snippet : undefined,
    lineNumber: candidate.bodyScore > 0 ? candidate.lineNumber : undefined,
    offset: candidate.bodyScore > 0 ? candidate.offset : undefined
  }))
}
