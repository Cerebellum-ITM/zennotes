import { describe, expect, it } from 'vitest'
import type { NoteMeta, VaultTextSearchMatch } from '@shared/ipc'
import { buildNoteSearchIndex } from './note-search'
import { searchUnified } from './unified-search'

function note(overrides: Partial<NoteMeta> & Pick<NoteMeta, 'path' | 'title'>): NoteMeta {
  return {
    folder: 'inbox',
    siblingOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    size: 0,
    tags: [],
    wikilinks: [],
    assetEmbeds: [],
    hasAttachments: false,
    excerpt: '',
    ...overrides
  }
}

function bodyMatch(
  note: NoteMeta,
  lineText: string,
  extra?: Partial<VaultTextSearchMatch>
): VaultTextSearchMatch {
  return {
    path: note.path,
    title: note.title,
    folder: note.folder,
    lineNumber: 3,
    offset: 42,
    lineText,
    ...extra
  }
}

describe('searchUnified', () => {
  it('surfaces a note whose only match is in the body, with a snippet', () => {
    const setup = note({ path: 'inbox/Docker.md', title: 'Docker setup' })
    const index = buildNoteSearchIndex([setup])
    const bodies = new Map([[setup.path, bodyMatch(setup, 'Configured Mailpit on port 1025')]])

    const results = searchUnified(index, bodies, 'Mailpit', { limit: 10 })

    expect(results).toHaveLength(1)
    expect(results[0].path).toBe('inbox/Docker.md')
    expect(results[0].snippet).toBe('Configured Mailpit on port 1025')
    expect(results[0].lineNumber).toBe(3)
    expect(results[0].offset).toBe(42)
  })

  it('ranks a title match above an incidental body match', () => {
    const byTitle = note({ path: 'inbox/Mailpit.md', title: 'Mailpit' })
    const byBody = note({ path: 'inbox/Notes.md', title: 'Random notes' })
    const index = buildNoteSearchIndex([byTitle, byBody])
    const bodies = new Map([[byBody.path, bodyMatch(byBody, 'see Mailpit docs later')]])

    const results = searchUnified(index, bodies, 'Mailpit', { limit: 10 })

    expect(results.map((r) => r.path)).toEqual(['inbox/Mailpit.md', 'inbox/Notes.md'])
    // Title match carries no snippet; the body-only one does.
    expect(results[0].snippet).toBeUndefined()
    expect(results[1].snippet).toBe('see Mailpit docs later')
  })

  it('emits a single row per note when both name and body match', () => {
    const n = note({ path: 'inbox/Mailpit.md', title: 'Mailpit config' })
    const index = buildNoteSearchIndex([n])
    const bodies = new Map([[n.path, bodyMatch(n, 'Mailpit SMTP settings')]])

    const results = searchUnified(index, bodies, 'Mailpit', { limit: 10 })

    expect(results).toHaveLength(1)
    expect(results[0].snippet).toBe('Mailpit SMTP settings')
  })

  it('honors #tag filters even for body-only matches', () => {
    const tagged = note({ path: 'inbox/A.md', title: 'A', tags: ['ops'] })
    const untagged = note({ path: 'inbox/B.md', title: 'B', tags: [] })
    const index = buildNoteSearchIndex([tagged, untagged])
    const bodies = new Map([
      [tagged.path, bodyMatch(tagged, 'deploy Mailpit')],
      [untagged.path, bodyMatch(untagged, 'deploy Mailpit')]
    ])

    const results = searchUnified(index, bodies, '#ops Mailpit', { limit: 10 })

    expect(results.map((r) => r.path)).toEqual(['inbox/A.md'])
  })

  it('excludes trash notes from body results', () => {
    const trashed = note({ path: 'trash/Old.md', title: 'Old', folder: 'trash' })
    const index = buildNoteSearchIndex([trashed])
    const bodies = new Map([[trashed.path, bodyMatch(trashed, 'Mailpit notes', { folder: 'trash' })]])

    const results = searchUnified(index, bodies, 'Mailpit', { limit: 10 })

    expect(results).toHaveLength(0)
  })

  it('lists tag-only queries without running content search', () => {
    const a = note({ path: 'inbox/A.md', title: 'A', tags: ['ops'] })
    const b = note({ path: 'inbox/B.md', title: 'B', tags: ['ops'] })
    const index = buildNoteSearchIndex([a, b])

    const results = searchUnified(index, new Map(), '#ops', { limit: 10 })

    expect(results.map((r) => r.path).sort()).toEqual(['inbox/A.md', 'inbox/B.md'])
    expect(results.every((r) => r.snippet === undefined)).toBe(true)
  })
})
