/**
 * Per-weekday color themes for daily notes (Unit 30).
 *
 * The theme of a daily note is derived purely from its date — no per-note
 * state is stored. `EditorPane` stamps `data-daily-weekday="<0..6>"` on the
 * note pane and the actual styling lives in `styles/index.css` under the
 * matching `[data-daily-weekday="N"]` blocks.
 *
 * This record mirrors those CSS values so they can be consumed
 * programmatically (e.g. a future settings preview) and asserted in tests.
 * Keep it in sync with the CSS blocks: the `daily-day-theme.test.ts` guard
 * checks every weekday 0..6 has a palette, and the CSS is the rendering
 * source of truth.
 */
export interface DailyDayPalette {
  /** Human label (Spanish weekday) — for previews/tooling, not rendering. */
  label: string
  /** Tinted background of the note content area. */
  bg: string
  /** H1 color. */
  h1: string
  /** Accent: H1 rule, H2 side bar, H2 color. */
  accent: string
  /** H3 small-caps + labels. */
  muted: string
}

/**
 * Keyed by `Date.prototype.getDay()` — 0 = Sunday … 6 = Saturday.
 * Dark, curated palettes derived from the existing `--z-*` token vocabulary.
 */
export const DAILY_DAY_PALETTES: Record<number, DailyDayPalette> = {
  1: { label: 'lunes', bg: '#1b1012', h1: '#ff8a9b', accent: '#ff6b81', muted: '#b9929a' },
  2: { label: 'martes', bg: '#1c1408', h1: '#ffc15e', accent: '#ffb02e', muted: '#bba074' },
  3: { label: 'miércoles', bg: '#0f1810', h1: '#8fdc7a', accent: '#5fc24a', muted: '#8aa886' },
  4: { label: 'jueves', bg: '#0c1819', h1: '#5fd6c4', accent: '#2fc2ad', muted: '#7fa9a4' },
  5: { label: 'viernes', bg: '#0d1320', h1: '#6fb3f5', accent: '#3d8ee0', muted: '#8497b5' },
  6: { label: 'sábado', bg: '#15101f', h1: '#b79bff', accent: '#9a7cf0', muted: '#9a8fc0' },
  0: { label: 'domingo', bg: '#16140f', h1: '#d9c9a8', accent: '#c2a878', muted: '#a89c84' }
}

/**
 * Weekday index (0..6) for a daily note's date, used as the scope value for
 * `data-daily-weekday`. A thin wrapper over `getDay()` so the mapping has one
 * documented home and is unit-tested.
 */
export function dailyWeekdayThemeId(date: Date): number {
  return date.getDay()
}
