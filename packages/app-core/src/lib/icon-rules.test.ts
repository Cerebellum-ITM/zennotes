// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import type { CustomIcon, IconRule, NoteMeta } from '@shared/ipc'
import { resolveByRules } from './icon-rules'
import { resolveNoteIconRef } from './icon-resolve'

function rule(partial: Partial<IconRule> & Pick<IconRule, 'target' | 'icon'>): IconRule {
  return { id: partial.id ?? Math.random().toString(36).slice(2), ...partial }
}

describe('resolveByRules — glob matching', () => {
  it('matches a single-segment glob (* stops at /)', () => {
    const rules = [
      rule({ target: 'folder', pathGlob: 'Daily Notes/*', icon: 'calendar' })
    ]
    expect(
      resolveByRules('folder', { subpath: 'Daily Notes/2026', name: '2026' }, rules)
    ).toBe('calendar')
    // Two nested segments must NOT match a single `*`.
    expect(
      resolveByRules('folder', { subpath: 'Daily Notes/2026/06', name: '06' }, rules)
    ).toBeNull()
  })

  it('matches a deep glob (** crosses /)', () => {
    const rules = [rule({ target: 'folder', pathGlob: 'Daily Notes/**', icon: 'calendar' })]
    expect(
      resolveByRules('folder', { subpath: 'Daily Notes/2026/06', name: '06' }, rules)
    ).toBe('calendar')
  })

  it('drops a rule with an empty glob (no matcher) when it is the only matcher', () => {
    // resolveByRules itself never sees an empty-glob-only rule (normalization
    // strips it), but if one slips through it must not match anything.
    const rules = [rule({ target: 'note', pathGlob: '', icon: 'star' })]
    expect(resolveByRules('note', { subpath: 'x', name: 'x' }, rules)).toBeNull()
  })
})

describe('resolveByRules — nameRegex matching', () => {
  it('matches the name against the regex', () => {
    const rules = [rule({ target: 'note', nameRegex: '^\\d{4}-\\d{2}-\\d{2}$', icon: 'calendar' })]
    expect(resolveByRules('note', { subpath: '', name: '2026-06-17' }, rules)).toBe('calendar')
    expect(resolveByRules('note', { subpath: '', name: 'Hello' }, rules)).toBeNull()
  })
})

describe('resolveByRules — frontmatter conditions', () => {
  it('equals matches a strict value', () => {
    const rules = [
      rule({ target: 'note', frontmatter: { key: 'status', equals: 'done' }, icon: 'star' })
    ]
    expect(
      resolveByRules('note', { subpath: '', name: 'n', frontmatter: { status: 'done' } }, rules)
    ).toBe('star')
    expect(
      resolveByRules('note', { subpath: '', name: 'n', frontmatter: { status: 'open' } }, rules)
    ).toBeNull()
  })

  it('exists:true matches when the key is present', () => {
    const rules = [
      rule({ target: 'note', frontmatter: { key: 'pinned', exists: true }, icon: 'bookmark' })
    ]
    expect(
      resolveByRules('note', { subpath: '', name: 'n', frontmatter: { pinned: 'yes' } }, rules)
    ).toBe('bookmark')
    expect(resolveByRules('note', { subpath: '', name: 'n', frontmatter: {} }, rules)).toBeNull()
  })

  it('folder rules ignore frontmatter conditions', () => {
    // A folder-target rule with only a frontmatter matcher has no applicable
    // matcher for folders, so it never matches.
    const rules = [
      rule({ target: 'folder', frontmatter: { key: 'status', equals: 'done' }, icon: 'star' })
    ]
    expect(
      resolveByRules('folder', { subpath: 'x', name: 'x', frontmatter: { status: 'done' } }, rules)
    ).toBeNull()
  })
})

describe('resolveByRules — multiple matchers (AND)', () => {
  it('requires all present matchers to match', () => {
    const rules = [
      rule({
        target: 'note',
        pathGlob: 'Projects/**',
        frontmatter: { key: 'status', equals: 'done' },
        icon: 'star'
      })
    ]
    expect(
      resolveByRules(
        'note',
        { subpath: 'Projects/web', name: 'n', frontmatter: { status: 'done' } },
        rules
      )
    ).toBe('star')
    // Path matches but frontmatter does not -> no match.
    expect(
      resolveByRules(
        'note',
        { subpath: 'Projects/web', name: 'n', frontmatter: { status: 'open' } },
        rules
      )
    ).toBeNull()
    // Frontmatter matches but path does not -> no match.
    expect(
      resolveByRules('note', { subpath: 'Other', name: 'n', frontmatter: { status: 'done' } }, rules)
    ).toBeNull()
  })
})

describe('resolveByRules — priority / first match', () => {
  it('returns the icon of the first matching rule in array order', () => {
    const ordered = [
      rule({ target: 'note', nameRegex: 'a', icon: 'star' }),
      rule({ target: 'note', nameRegex: 'a', icon: 'calendar' })
    ]
    expect(resolveByRules('note', { subpath: '', name: 'a' }, ordered)).toBe('star')
  })

  it('skips rules of the other target', () => {
    const rules = [
      rule({ target: 'folder', nameRegex: '.', icon: 'folder' }),
      rule({ target: 'note', nameRegex: '.', icon: 'star' })
    ]
    expect(resolveByRules('note', { subpath: '', name: 'x' }, rules)).toBe('star')
  })
})

describe('resolveNoteIconRef — precedence (explicit > rule > default)', () => {
  const customByName = new Map<string, CustomIcon>()
  const settings = null

  function note(partial: Partial<NoteMeta>): NoteMeta {
    return {
      path: 'inbox/n.md',
      title: 'n',
      folder: 'inbox',
      siblingOrder: 0,
      createdAt: 0,
      updatedAt: 0,
      size: 0,
      tags: [],
      wikilinks: [],
      hasAttachments: false,
      excerpt: '',
      ...partial
    }
  }

  it('explicit frontmatter icon beats a matching rule', () => {
    const rules: IconRule[] = [
      { id: 'r', target: 'note', nameRegex: '.', icon: 'calendar' }
    ]
    const ref = resolveNoteIconRef(
      note({ icon: 'star', title: 'anything' }),
      settings,
      customByName,
      rules
    )
    expect(ref).toBe('star')
  })

  it('falls back to a matching rule when there is no explicit icon', () => {
    const rules: IconRule[] = [
      { id: 'r', target: 'note', nameRegex: '^2026', icon: 'calendar' }
    ]
    const ref = resolveNoteIconRef(note({ title: '2026-06-17' }), settings, customByName, rules)
    expect(ref).toBe('calendar')
  })

  it('returns null (default) when neither explicit nor rule applies', () => {
    const rules: IconRule[] = [
      { id: 'r', target: 'note', nameRegex: '^never$', icon: 'calendar' }
    ]
    expect(resolveNoteIconRef(note({ title: 'plain' }), settings, customByName, rules)).toBeNull()
  })
})
