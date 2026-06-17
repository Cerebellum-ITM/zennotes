// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import type { CustomIcon } from '@shared/ipc'
import { resolveIcon } from './icon-resolve'
import { sanitizeIconSvg } from './sanitize-icon'

function icon(name: string): CustomIcon {
  return { name, svg: `<svg><title>${name}</title></svg>`, updatedAt: 1 }
}

describe('resolveIcon', () => {
  const customByName = new Map<string, CustomIcon>([
    ['star', icon('star')], // shadows the built-in "star"
    ['logo', icon('logo')]
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
