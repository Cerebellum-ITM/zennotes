import { describe, expect, it } from 'vitest'
import { langAccentTriplet, LANG_COLORS } from './lang-colors'

describe('langAccentTriplet', () => {
  it('returns the brand triplet for a canonical token', () => {
    expect(langAccentTriplet('python')).toBe('55 118 171')
  })

  it('resolves aliases through normalizeLangToken', () => {
    expect(langAccentTriplet('py')).toBe(LANG_COLORS.python)
    expect(langAccentTriplet('JS')).toBe(LANG_COLORS.javascript)
    expect(langAccentTriplet('c++')).toBe(LANG_COLORS.cpp)
  })

  it('returns null for an unknown language', () => {
    expect(langAccentTriplet('cobol')).toBeNull()
    expect(langAccentTriplet('')).toBeNull()
  })

  it('every color is a valid space-separated RGB triplet', () => {
    for (const [token, triplet] of Object.entries(LANG_COLORS)) {
      const parts = triplet.split(' ')
      expect(parts, token).toHaveLength(3)
      for (const p of parts) {
        const n = Number(p)
        expect(Number.isInteger(n) && n >= 0 && n <= 255, `${token}:${p}`).toBe(true)
      }
    }
  })
})
