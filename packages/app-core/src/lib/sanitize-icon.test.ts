// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { normalizeIconSvg, sanitizeIconSvg } from './sanitize-icon'

describe('normalizeIconSvg', () => {
  it('synthesizes a viewBox from numeric width/height when missing', () => {
    const out = normalizeIconSvg('<svg width="512" height="256"><path d="M0 0h1v1z"/></svg>')
    const root = new DOMParser().parseFromString(out, 'image/svg+xml').documentElement
    expect(root.getAttribute('viewBox')).toBe('0 0 512 256')
  })

  it('forces width/height 100% and preserveAspectRatio', () => {
    const out = normalizeIconSvg('<svg width="512" height="512"><rect/></svg>')
    const root = new DOMParser().parseFromString(out, 'image/svg+xml').documentElement
    expect(root.getAttribute('width')).toBe('100%')
    expect(root.getAttribute('height')).toBe('100%')
    expect(root.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
  })

  it('keeps an existing viewBox intact', () => {
    const out = normalizeIconSvg('<svg viewBox="0 0 24 24"><circle/></svg>')
    const root = new DOMParser().parseFromString(out, 'image/svg+xml').documentElement
    expect(root.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(root.getAttribute('width')).toBe('100%')
    expect(root.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
  })

  it('does not synthesize a viewBox when dimensions are non-numeric', () => {
    const out = normalizeIconSvg('<svg width="auto" height="auto"><g/></svg>')
    const root = new DOMParser().parseFromString(out, 'image/svg+xml').documentElement
    expect(root.getAttribute('viewBox')).toBeNull()
    expect(root.getAttribute('width')).toBe('100%')
  })

  it('returns an empty string for empty input', () => {
    expect(normalizeIconSvg('')).toBe('')
    expect(normalizeIconSvg('   ')).toBe('')
  })

  it('composes with sanitizeIconSvg (sanitize first, then normalize)', () => {
    const dirty = '<svg width="512" height="512"><script>alert(1)</script><path d="M0 0"/></svg>'
    const out = normalizeIconSvg(sanitizeIconSvg(dirty))
    expect(out).not.toContain('<script')
    const root = new DOMParser().parseFromString(out, 'image/svg+xml').documentElement
    expect(root.getAttribute('viewBox')).toBe('0 0 512 512')
    expect(root.getAttribute('width')).toBe('100%')
  })
})
