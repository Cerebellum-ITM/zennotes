// Built-in language-icon registry for the `{lang icon}` directive and the
// Settings "Code language icons" panel. The actual SVG markup lives in the
// generated `lang-icon-data.ts` (devicon logos, MIT, inlined as strings — run
// `node tooling/scripts/gen-lang-icons.mjs` to refresh). This module adds the
// alias normalization, the `lang:<token>` default refs, and re-exports the
// curated list for the UI.
import {
  LANG_ALIASES,
  LANG_ICON_LIST,
  LANG_ICON_SVGS,
  type LangIconEntry
} from './lang-icon-data'

export { LANG_ICON_SVGS, LANG_ICON_LIST, LANG_ALIASES }
export type { LangIconEntry }

/** Prefix marking a built-in bundled language logo (an {@link IconRef}). */
export const LANG_ICON_PREFIX = 'lang:'

/**
 * Lowercase a raw language token and canonicalize it through {@link LANG_ALIASES}
 * (e.g. `JS`/`js` → `javascript`, `c++` → `cpp`, `py` → `python`). Returns the
 * canonical token, which may or may not have a bundled logo.
 */
export function normalizeLangToken(raw: string): string {
  const lower = (raw ?? '').trim().toLowerCase()
  return LANG_ALIASES[lower] ?? lower
}

/** True when `token` (already canonical) ships with a bundled logo. */
export function hasLangIcon(token: string): boolean {
  return Object.prototype.hasOwnProperty.call(LANG_ICON_SVGS, token)
}

/** Look up the inlined SVG markup for a `lang:<token>` ref token. */
export function langIconSvg(token: string): string | null {
  return LANG_ICON_SVGS[token] ?? null
}

/**
 * Canonical token → default `lang:<token>` {@link IconRef}. The "built-in list
 * of common languages + default logo": every language with a bundled logo.
 */
export const DEFAULT_LANG_ICONS: Record<string, string> = Object.fromEntries(
  LANG_ICON_LIST.filter((e) => hasLangIcon(e.token)).map((e) => [
    e.token,
    `${LANG_ICON_PREFIX}${e.token}`
  ])
)
