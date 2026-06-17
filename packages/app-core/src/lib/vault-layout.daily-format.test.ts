import { describe, expect, it } from 'vitest'
import { DEFAULT_VAULT_SETTINGS, type VaultSettings } from '@shared/ipc'
import { classifyDateNote, dailyNoteRelPathForDate, parseDailyPattern } from './vault-layout'

// 2026-05-22 (local).
const REF = new Date(2026, 4, 22)

function settings(daily: Partial<VaultSettings['dailyNotes']>): VaultSettings {
  return {
    ...DEFAULT_VAULT_SETTINGS,
    // The Obsidian-style vault keeps notes at the root.
    primaryNotesLocation: 'root',
    dailyNotes: { enabled: true, directory: 'Daily Notes', ...daily }
  }
}

describe('dailyNoteRelPathForDate', () => {
  it('uses legacy flat ISO when no pathFormat is set', () => {
    const { subpath, title } = dailyNoteRelPathForDate(REF, settings({}))
    expect(subpath).toBe('Daily Notes')
    expect(title).toBe('2026-05-22')
  })

  it('renders the Obsidian scheme with nested folders and DD-MM-YYYY', () => {
    const { subpath, title } = dailyNoteRelPathForDate(
      REF,
      settings({ directory: 'Daily notes', pathFormat: 'YYYY/MM-MMMM/DD-MM-YYYY', locale: 'es' })
    )
    expect(subpath).toBe('Daily notes/2026/05-mayo')
    expect(title).toBe('22-05-2026')
  })
})

describe('classifyDateNote (configured pattern)', () => {
  const s = settings({
    directory: 'Daily notes',
    pathFormat: 'YYYY/MM-MMMM/DD-MM-YYYY',
    locale: 'es'
  })

  it('recognizes an existing Obsidian-style daily note', () => {
    const info = classifyDateNote(
      { folder: 'inbox', path: 'Daily notes/2026/05-mayo/22-05-2026.md', title: '22-05-2026' },
      s
    )
    expect(info?.kind).toBe('daily')
    expect(info?.date.getFullYear()).toBe(2026)
    expect(info?.date.getMonth()).toBe(4)
    expect(info?.date.getDate()).toBe(22)
  })

  it('ignores notes outside the daily directory', () => {
    const info = classifyDateNote(
      { folder: 'inbox', path: 'Other/22-05-2026.md', title: '22-05-2026' },
      s
    )
    expect(info).toBeNull()
  })

  it('ignores notes whose name does not match the pattern', () => {
    const info = classifyDateNote(
      { folder: 'inbox', path: 'Daily notes/2026/05-mayo/random.md', title: 'random' },
      s
    )
    expect(info).toBeNull()
  })

  it('still classifies legacy flat ISO notes when no pathFormat is set', () => {
    const info = classifyDateNote(
      { folder: 'inbox', path: 'Daily Notes/2026-05-22.md', title: '2026-05-22' },
      settings({})
    )
    expect(info?.kind).toBe('daily')
    expect(info?.date.getDate()).toBe(22)
  })
})

describe('parseDailyPattern', () => {
  it('parses numeric and localized month forms to the same date', () => {
    const d = parseDailyPattern('2026/05-mayo/22-05-2026', 'YYYY/MM-MMMM/DD-MM-YYYY', 'es')
    expect(d).not.toBeNull()
    expect(d?.getMonth()).toBe(4)
  })

  it('rejects impossible dates', () => {
    expect(parseDailyPattern('31-02-2026', 'DD-MM-YYYY', undefined)).toBeNull()
  })
})
