import { describe, expect, it } from 'vitest'
import { getPendingHints } from './vim-pending-hints'

describe('getPendingHints — operator top level', () => {
  it('shows next-key choices (text object + motion), not full sequences', () => {
    const hints = getPendingHints({ kind: 'operator', operator: 'change', buffer: '' })
    expect(hints.title).toBe('Change')
    const titles = hints.groups.map((g) => g.title)
    expect(titles).toContain('Text object')
    expect(titles).toContain('Motion')
    // Top level only offers the single intro keys i/a, never `iw`/`aw`.
    const textObj = hints.groups.find((g) => g.title === 'Text object')
    expect(textObj?.items.map((i) => i.keys)).toEqual(['i', 'a'])
    // Whole-line shortcut for change.
    expect(hints.groups.find((g) => g.title === 'Line')?.items[0].keys).toBe('cc')
  })

  it('uses dd / yy and omits the line group for operators without a doubled form', () => {
    expect(
      getPendingHints({ kind: 'operator', operator: 'delete', buffer: '' }).groups.find(
        (g) => g.title === 'Line'
      )?.items[0].keys
    ).toBe('dd')
    expect(
      getPendingHints({ kind: 'operator', operator: 'indent', buffer: '' }).groups.some(
        (g) => g.title === 'Line'
      )
    ).toBe(false)
  })
})

describe('getPendingHints — drill-down', () => {
  it('after `ci` shows inner text-object targets', () => {
    const hints = getPendingHints({ kind: 'operator', operator: 'change', buffer: 'i' })
    expect(hints.title).toBe('Change i')
    expect(hints.groups).toHaveLength(1)
    expect(hints.groups[0].title).toBe('Inside')
    const keys = hints.groups[0].items.map((i) => i.keys)
    expect(keys).toEqual(expect.arrayContaining(['w', 'p', '"', '(', '{', 't']))
  })

  it('after `ca` shows the around scope', () => {
    expect(getPendingHints({ kind: 'operator', operator: 'change', buffer: 'a' }).groups[0].title).toBe(
      'Around'
    )
  })

  it('after `cf` waits for a character', () => {
    const hints = getPendingHints({ kind: 'operator', operator: 'change', buffer: 'f' })
    expect(hints.groups[0].title).toBe('Find')
    expect(hints.groups[0].items[0].label).toMatch(/character/)
  })

  it('visual `vi` also drills into text-object targets', () => {
    const hints = getPendingHints({ kind: 'visual', visualKind: 'char', buffer: 'i' })
    expect(hints.groups[0].title).toBe('Inside')
  })
})

describe('getPendingHints — visual top level', () => {
  it('lists text-object intros and selection operators', () => {
    const hints = getPendingHints({ kind: 'visual', visualKind: 'char', buffer: '' })
    expect(hints.title).toBe('Visual')
    const titles = hints.groups.map((g) => g.title)
    expect(titles).toEqual(expect.arrayContaining(['Text object', 'Operator', 'Other']))
    expect(
      hints.groups.find((g) => g.title === 'Operator')?.items.map((i) => i.keys)
    ).toEqual(expect.arrayContaining(['d', 'c', 'y', '>', '<']))
  })

  it('titles each visual kind', () => {
    expect(getPendingHints({ kind: 'visual', visualKind: 'line', buffer: '' }).title).toBe('Visual Line')
    expect(getPendingHints({ kind: 'visual', visualKind: 'block', buffer: '' }).title).toBe('Visual Block')
  })
})

describe('getPendingHints — prefix', () => {
  it('shows the g-prefix menu with next keys', () => {
    const hints = getPendingHints({ kind: 'prefix', prefix: 'g', buffer: '' })
    expect(hints.title).toBe('g')
    expect(hints.groups.flatMap((g) => g.items.map((i) => i.keys))).toContain('d')
  })

  it('shows the z-prefix folding menu', () => {
    const hints = getPendingHints({ kind: 'prefix', prefix: 'z', buffer: '' })
    expect(hints.title).toBe('z')
    expect(hints.groups.flatMap((g) => g.items.map((i) => i.keys))).toEqual(
      expect.arrayContaining(['c', 'o', 'M', 'R'])
    )
  })
})
