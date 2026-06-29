import { describe, it, expect } from 'vitest'
import { DAILY_DAY_PALETTES, dailyWeekdayThemeId } from './daily-day-theme'

describe('dailyWeekdayThemeId', () => {
  it('maps a known Monday to 1 and a known Sunday to 0', () => {
    // 2026-06-29 is a Monday, 2026-07-05 is a Sunday (local-time construction).
    expect(dailyWeekdayThemeId(new Date(2026, 5, 29))).toBe(1)
    expect(dailyWeekdayThemeId(new Date(2026, 6, 5))).toBe(0)
  })

  it('covers the full week with distinct ids', () => {
    const ids = new Set<number>()
    for (let d = 1; d <= 7; d++) ids.add(dailyWeekdayThemeId(new Date(2026, 5, 28 + d)))
    expect([...ids].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
})

describe('DAILY_DAY_PALETTES', () => {
  it('defines a palette for every weekday 0..6', () => {
    for (let wd = 0; wd <= 6; wd++) {
      expect(DAILY_DAY_PALETTES[wd], `weekday ${wd}`).toBeDefined()
    }
  })

  it('every palette has the four color fields as hex strings', () => {
    for (const wd of Object.keys(DAILY_DAY_PALETTES)) {
      const p = DAILY_DAY_PALETTES[Number(wd)]
      for (const key of ['bg', 'h1', 'accent', 'muted'] as const) {
        expect(p[key], `weekday ${wd} ${key}`).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  })
})
