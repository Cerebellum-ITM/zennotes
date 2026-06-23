import { describe, expect, it } from 'vitest'
import { computeLineDiff, diffStats } from './history-diff'

describe('computeLineDiff', () => {
  it('marks pure additions', () => {
    const lines = computeLineDiff('a\nb\n', 'a\nb\nc\n')
    expect(lines).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'context', text: 'b' },
      { kind: 'added', text: 'c' }
    ])
    expect(diffStats(lines)).toEqual({ added: 1, modified: 0, removed: 0 })
  })

  it('marks pure removals', () => {
    const lines = computeLineDiff('a\nb\nc\n', 'a\nc\n')
    expect(diffStats(lines)).toEqual({ added: 0, modified: 0, removed: 1 })
    expect(lines.some((l) => l.kind === 'removed' && l.text === 'b')).toBe(true)
  })

  it('counts a replaced line as modified', () => {
    const lines = computeLineDiff('hello\nworld\n', 'hello\nthere\n')
    expect(diffStats(lines)).toEqual({ added: 0, modified: 1, removed: 0 })
  })

  it('splits surplus of an uneven replacement into add/remove', () => {
    // 1 line removed, 3 added → 1 modified + 2 added.
    const lines = computeLineDiff('one\n', 'uno\ndos\ntres\n')
    expect(diffStats(lines)).toEqual({ added: 2, modified: 1, removed: 0 })
  })

  it('reports no changes for identical text', () => {
    const lines = computeLineDiff('same\ntext\n', 'same\ntext\n')
    expect(diffStats(lines)).toEqual({ added: 0, modified: 0, removed: 0 })
  })
})
