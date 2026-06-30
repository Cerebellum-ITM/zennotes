import { describe, it, expect } from 'vitest'
import { findInlineIconDirectives } from './inline-icon-directive'

describe('findInlineIconDirectives', () => {
  it('matches a bare custom ref', () => {
    expect(findInlineIconDirectives('hola {icon:star} fin')).toEqual([
      { start: 5, end: 16, ref: 'star' }
    ])
  })

  it('matches a sectioned ref and an explicit builtin ref', () => {
    expect(findInlineIconDirectives('{icon:work/check}').map((m) => m.ref)).toEqual([
      'work/check'
    ])
    expect(findInlineIconDirectives('{icon:builtin:inbox}').map((m) => m.ref)).toEqual([
      'builtin:inbox'
    ])
  })

  it('finds multiple directives in one line with correct offsets', () => {
    const text = 'a {icon:star} b {icon:moon}'
    const got = findInlineIconDirectives(text)
    expect(got).toHaveLength(2)
    expect(got[0]).toEqual({ start: 2, end: 13, ref: 'star' })
    expect(text.slice(got[1].start, got[1].end)).toBe('{icon:moon}')
    expect(got[1].ref).toBe('moon')
  })

  it('ignores an empty ref and plain text', () => {
    expect(findInlineIconDirectives('{icon:}')).toEqual([])
    expect(findInlineIconDirectives('no directive here')).toEqual([])
  })

  it('does not leak regex lastIndex across calls', () => {
    expect(findInlineIconDirectives('{icon:a}')).toHaveLength(1)
    expect(findInlineIconDirectives('{icon:a}')).toHaveLength(1)
  })
})
