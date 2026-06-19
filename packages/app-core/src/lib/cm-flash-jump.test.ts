import { describe, expect, it } from 'vitest'
import {
  assignFlashLabels,
  computeFlashTargets,
  findFlashMatches,
  flashSelection
} from './cm-flash-jump'

describe('findFlashMatches', () => {
  const doc = 'foo bar foo baz foo'
  const fullRange = [{ from: 0, to: doc.length }]

  it('returns nothing for an empty query', () => {
    expect(findFlashMatches(doc, fullRange, '', 0)).toEqual([])
  })

  it('finds every literal occurrence in the visible range', () => {
    const matches = findFlashMatches(doc, fullRange, 'foo', 0)
    expect(matches.map((m) => m.from).sort((a, b) => a - b)).toEqual([0, 8, 16])
    expect(matches.every((m) => m.to - m.from === 3)).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(findFlashMatches('Foo FOO foo', fullRange, 'foo', 0)).toHaveLength(3)
  })

  it('only searches inside the provided visible ranges', () => {
    // Hide the middle "foo" (offset 8) by excluding it from the ranges; the
    // first (offset 0) and last (offset 16) stay visible.
    const ranges = [
      { from: 0, to: 7 },
      { from: 12, to: doc.length }
    ]
    const matches = findFlashMatches(doc, ranges, 'foo', 0)
    expect(matches.map((m) => m.from).sort((a, b) => a - b)).toEqual([0, 16])
  })

  it('orders matches by proximity to the cursor', () => {
    const matches = findFlashMatches(doc, fullRange, 'foo', 16)
    expect(matches[0].from).toBe(16)
  })
})

describe('assignFlashLabels', () => {
  it('labels each match and excludes the immediate next character', () => {
    // "foo" is followed by a space at 0 and 8, but the doc below makes "fo"
    // followed by "o" — so "o" must never be used as a label.
    const doc = 'fox foy foz'
    const matches = findFlashMatches(doc, [{ from: 0, to: doc.length }], 'fo', 0)
    const targets = assignFlashLabels(doc, matches)
    expect(targets).toHaveLength(3)
    expect(targets.every((t) => !t.label.includes('x'))).toBe(true)
    expect(targets.every((t) => !t.label.includes('y'))).toBe(true)
    expect(targets.every((t) => !t.label.includes('z'))).toBe(true)
    // Labels are unique.
    expect(new Set(targets.map((t) => t.label)).size).toBe(3)
  })
})

describe('computeFlashTargets', () => {
  it('combines matching and labelling', () => {
    const doc = 'alpha beta alpha'
    const targets = computeFlashTargets(doc, [{ from: 0, to: doc.length }], 'alpha', 0)
    expect(targets).toHaveLength(2)
    expect(targets[0].from).toBe(0)
    expect(targets.every((t) => t.label.length >= 1)).toBe(true)
  })
})

describe('flashSelection', () => {
  it('places a bare cursor in normal mode', () => {
    expect(flashSelection('normal', 3, 10)).toEqual({ anchor: 10, head: 10 })
  })

  it('keeps the anchor and moves the head in visual mode', () => {
    expect(flashSelection('visual', 3, 10)).toEqual({ anchor: 3, head: 10 })
  })
})
