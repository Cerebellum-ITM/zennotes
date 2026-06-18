// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import type { CustomIcon } from '@shared/ipc'
import { buildCustomIconIndex, resolveIcon, resolveNoteIcon } from './icon-resolve'
import { sanitizeIconSvg } from './sanitize-icon'

function icon(id: string, section = ''): CustomIcon {
  const name = id.includes('/') ? (id.split('/').pop() as string) : id
  return { id, name, section, svg: `<svg><title>${id}</title></svg>`, updatedAt: 1 }
}

describe('resolveIcon', () => {
  const customByName = buildCustomIconIndex([
    icon('star'), // shadows the built-in "star"
    icon('logo')
  ])

  it('resolves a custom: prefixed ref', () => {
    expect(resolveIcon('custom:logo', customByName)).toEqual({
      kind: 'custom',
      icon: customByName.get('logo')
    })
  })

  it('returns null for a custom: ref with no matching file', () => {
    expect(resolveIcon('custom:missing', customByName)).toBeNull()
  })

  it('resolves a bare name that exists as a custom icon (back-compat)', () => {
    // "star" is both a built-in id and a custom file; custom wins.
    expect(resolveIcon('star', customByName)).toEqual({
      kind: 'custom',
      icon: customByName.get('star')
    })
  })

  it('resolves a bare built-in id', () => {
    expect(resolveIcon('folder', customByName)).toEqual({ kind: 'builtin', id: 'folder' })
  })

  it('resolves a builtin: prefixed ref', () => {
    expect(resolveIcon('builtin:calendar', customByName)).toEqual({
      kind: 'builtin',
      id: 'calendar'
    })
  })

  it('returns null for an unknown ref', () => {
    expect(resolveIcon('nope', customByName)).toBeNull()
    expect(resolveIcon('builtin:nope', customByName)).toBeNull()
    expect(resolveIcon('', customByName)).toBeNull()
  })
})

describe('resolveIcon — sections / stems', () => {
  it('resolves a sectioned custom:<id> ref containing a slash', () => {
    const idx = buildCustomIconIndex([icon('work/star', 'work'), icon('home/star', 'home')])
    expect(resolveIcon('custom:work/star', idx)).toEqual({
      kind: 'custom',
      icon: idx.get('work/star')
    })
  })

  it('resolves a bare stem to a sectioned icon when the stem is unique', () => {
    const idx = buildCustomIconIndex([icon('pack/foo', 'pack')])
    // `icon: foo` (no section) → pack/foo because the stem is unique.
    expect(resolveIcon('foo', idx)).toEqual({ kind: 'custom', icon: idx.get('pack/foo') })
    // `custom:foo` (no exact id match) also falls back to the unique stem.
    expect(resolveIcon('custom:foo', idx)).toEqual({
      kind: 'custom',
      icon: idx.get('pack/foo')
    })
  })

  it('returns null for an ambiguous stem (same name in two sections)', () => {
    const idx = buildCustomIconIndex([icon('a/foo', 'a'), icon('b/foo', 'b')])
    expect(resolveIcon('foo', idx)).toBeNull()
    expect(resolveIcon('custom:foo', idx)).toBeNull()
  })

  it('prefers an exact root id over a same-stem sectioned icon', () => {
    const idx = buildCustomIconIndex([icon('foo'), icon('pack/foo', 'pack')])
    // Root `foo` (id === stem) wins, and is unambiguous despite pack/foo.
    expect(resolveIcon('foo', idx)).toEqual({ kind: 'custom', icon: idx.get('foo') })
  })
})

describe('resolveIcon — Obsidian Iconize pack prefixes', () => {
  const idx = buildCustomIconIndex([icon('custom_icons/PendingTaskPage', 'custom_icons')])

  it('strips a pack prefix and resolves the stem (CuPendingTaskPage)', () => {
    // Obsidian Iconize frontmatter: `Cu` (custom pack) + `PendingTaskPage`.
    expect(resolveIcon('CuPendingTaskPage', idx)).toEqual({
      kind: 'custom',
      icon: idx.get('custom_icons/PendingTaskPage')
    })
    // Also via a custom: prefixed Iconize id.
    expect(resolveIcon('custom:CuPendingTaskPage', idx)).toEqual({
      kind: 'custom',
      icon: idx.get('custom_icons/PendingTaskPage')
    })
  })

  it('prefers a literal match over a prefix strip', () => {
    // `Cubeacon` exists literally → not stripped to `beacon`.
    const withLiteral = buildCustomIconIndex([icon('Cubeacon'), icon('beacon')])
    expect(resolveIcon('Cubeacon', withLiteral)).toEqual({
      kind: 'custom',
      icon: withLiteral.get('Cubeacon')
    })
  })

  it('returns null when the stripped stem is ambiguous', () => {
    const ambiguous = buildCustomIconIndex([icon('a/House', 'a'), icon('b/House', 'b')])
    expect(resolveIcon('FabHouse', ambiguous)).toBeNull()
  })
})

describe('resolveNoteIcon', () => {
  const customByName = buildCustomIconIndex([icon('logo')])

  it('resolves a note icon that names a custom icon', () => {
    expect(resolveNoteIcon({ icon: 'logo' }, customByName)).toEqual({
      kind: 'custom',
      icon: customByName.get('logo')
    })
  })

  it('resolves a note icon that names a built-in id', () => {
    expect(resolveNoteIcon({ icon: 'calendar' }, customByName)).toEqual({
      kind: 'builtin',
      id: 'calendar'
    })
  })

  it('returns null when the note has no icon', () => {
    expect(resolveNoteIcon({}, customByName)).toBeNull()
    expect(resolveNoteIcon({ icon: undefined }, customByName)).toBeNull()
  })

  it('returns null when the icon matches neither custom nor built-in', () => {
    expect(resolveNoteIcon({ icon: 'nope' }, customByName)).toBeNull()
  })
})

describe('sanitizeIconSvg', () => {
  it('strips <script> elements', () => {
    const out = sanitizeIconSvg('<svg><script>alert(1)</script><path d="M0 0"/></svg>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert(1)')
    expect(out).toContain('path')
  })

  it('strips onload and other on* handlers', () => {
    const out = sanitizeIconSvg('<svg onload="alert(1)"><circle onclick="x()" r="1"/></svg>')
    expect(out.toLowerCase()).not.toContain('onload')
    expect(out.toLowerCase()).not.toContain('onclick')
  })

  it('returns an empty string for blank input', () => {
    expect(sanitizeIconSvg('')).toBe('')
    expect(sanitizeIconSvg('   ')).toBe('')
  })

  it('keeps benign svg markup', () => {
    const out = sanitizeIconSvg('<svg viewBox="0 0 24 24"><path d="M1 1" stroke="currentColor"/></svg>')
    expect(out).toContain('path')
    expect(out).toContain('currentColor')
  })
})
