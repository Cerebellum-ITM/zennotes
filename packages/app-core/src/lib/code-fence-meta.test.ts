import { describe, expect, it } from 'vitest'
import {
  highlightLinesAttr,
  isLineHighlighted,
  parseFenceMeta,
  parseHighlightLines,
  parseHighlightLinesAttr
} from './code-fence-meta'

describe('parseHighlightLines', () => {
  it('parses single numbers and ranges', () => {
    expect([...parseHighlightLines('3,5-7,9')]).toEqual([3, 5, 6, 7, 9])
  })

  it('ignores blanks, zero, and inverted ranges', () => {
    expect([...parseHighlightLines(' 0, 2 , 5-3, 4 ')].sort((a, b) => a - b)).toEqual([2, 4])
  })
})

describe('parseFenceMeta', () => {
  it('returns an empty result for no meta', () => {
    const m = parseFenceMeta('')
    expect(m.title).toBeUndefined()
    expect(m.highlightLines.size).toBe(0)
    expect(parseFenceMeta(null).highlightLines.size).toBe(0)
  })

  it('parses a bare title', () => {
    expect(parseFenceMeta('title=test').title).toBe('test')
  })

  it('parses a quoted title with spaces', () => {
    expect(parseFenceMeta('title="My script"').title).toBe('My script')
    expect(parseFenceMeta("title='My script'").title).toBe('My script')
  })

  it('parses highlight lines', () => {
    expect([...parseFenceMeta('{5}').highlightLines]).toEqual([5])
  })

  it('parses title + lines in any order', () => {
    const a = parseFenceMeta('title=test {2,4}')
    const b = parseFenceMeta('{2,4} title=test')
    expect(a.title).toBe('test')
    expect([...a.highlightLines]).toEqual([2, 4])
    expect(b.title).toBe('test')
    expect([...b.highlightLines]).toEqual([2, 4])
  })

  it('does not throw on garbage', () => {
    expect(() => parseFenceMeta('!!! {{{ title=')).not.toThrow()
  })

  it('leaves lineNumbers undefined when no ln token', () => {
    expect(parseFenceMeta('title=test {5}').lineNumbers).toBeUndefined()
  })

  it('parses ln:true / ln:false (and aliases/values)', () => {
    expect(parseFenceMeta('ln:true').lineNumbers).toBe(true)
    expect(parseFenceMeta('ln=false').lineNumbers).toBe(false)
    expect(parseFenceMeta('line-numbers:on').lineNumbers).toBe(true)
    expect(parseFenceMeta('linenumbers=0').lineNumbers).toBe(false)
    expect(parseFenceMeta('LN:NO').lineNumbers).toBe(false)
  })

  it('parses ln alongside title and highlight in any order', () => {
    const m = parseFenceMeta('title=test ln:true {5}')
    expect(m.title).toBe('test')
    expect(m.lineNumbers).toBe(true)
    expect([...m.highlightLines]).toEqual([5])
  })
})

describe('isLineHighlighted', () => {
  it('reports membership', () => {
    const m = parseFenceMeta('{3,5-6}')
    expect(isLineHighlighted(m, 3)).toBe(true)
    expect(isLineHighlighted(m, 5)).toBe(true)
    expect(isLineHighlighted(m, 4)).toBe(false)
  })
})

describe('highlightLinesAttr round-trip', () => {
  it('serializes sorted and parses back', () => {
    const m = parseFenceMeta('{9,3,5-6}')
    const attr = highlightLinesAttr(m)
    expect(attr).toBe('3,5,6,9')
    expect([...parseHighlightLinesAttr(attr)]).toEqual([3, 5, 6, 9])
  })
})
