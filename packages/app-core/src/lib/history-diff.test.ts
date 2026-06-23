import { describe, expect, it } from 'vitest'
import { computeBlockDiff, computeLineDiff, diffStats, splitBlocks } from './history-diff'

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

describe('splitBlocks', () => {
  it('keeps paragraphs whole but splits headings and list items', () => {
    const md = '# Title\n\nA paragraph that\nwraps two lines.\n\n- one\n- two\n'
    expect(splitBlocks(md)).toEqual([
      '# Title',
      'A paragraph that\nwraps two lines.',
      '- one',
      '- two'
    ])
  })
})

describe('computeBlockDiff', () => {
  it('marks an edited paragraph as a single modified block carrying new text', () => {
    const blocks = computeBlockDiff('# T\n\nold body\n', '# T\n\nnew body\n')
    expect(blocks).toEqual([
      { kind: 'context', text: '# T' },
      { kind: 'modified', text: 'new body' }
    ])
  })

  it('marks an appended task as added and a removed task as removed', () => {
    const added = computeBlockDiff('- a\n', '- a\n- b\n')
    expect(added).toEqual([
      { kind: 'context', text: '- a' },
      { kind: 'added', text: '- b' }
    ])
    const removed = computeBlockDiff('- a\n- b\n', '- a\n')
    expect(removed).toEqual([
      { kind: 'context', text: '- a' },
      { kind: 'removed', text: '- b' }
    ])
  })
})
