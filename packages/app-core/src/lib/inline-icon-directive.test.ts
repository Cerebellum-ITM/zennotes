import { describe, it, expect } from 'vitest'
import { findInlineIconDirectives, matchIconDirectivePrefix } from './inline-icon-directive'

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

describe('matchIconDirectivePrefix', () => {
  it('matches an empty `{icon:` opener', () => {
    const t = 'hola {icon:'
    expect(matchIconDirectivePrefix(t)).toEqual({ from: t.length, query: '' })
  })

  it('captures a partial ref and the right `from`', () => {
    const t = 'texto {icon:custom_ic'
    const m = matchIconDirectivePrefix(t)
    expect(m).not.toBeNull()
    expect(m!.query).toBe('custom_ic')
    expect(t.slice(m!.from)).toBe('custom_ic')
  })

  it('allows section paths and explicit builtin refs', () => {
    expect(matchIconDirectivePrefix('{icon:work/st')!.query).toBe('work/st')
    expect(matchIconDirectivePrefix('{icon:builtin:cal')!.query).toBe('builtin:cal')
  })

  it('does not match once the directive is closed, or plain text', () => {
    expect(matchIconDirectivePrefix('{icon:star}')).toBeNull()
    expect(matchIconDirectivePrefix('no directive')).toBeNull()
    expect(matchIconDirectivePrefix('{lang icon} x')).toBeNull()
  })
})
