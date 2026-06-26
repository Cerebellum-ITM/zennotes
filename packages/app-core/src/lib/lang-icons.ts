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
 * Neutral `< >` fallback logo for languages without a bundled devicon (e.g.
 * `ini`, `toml`, `text`), so every code-block header still shows an icon. The
 * stroke color is baked (not `currentColor`) so it also works when painted as a
 * background-image data-URI in the editor header.
 */
export const GENERIC_LANG_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#8b8b91" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/></svg>'

/** Bundled logo for `token`, or the generic `< >` fallback when none exists. */
export function langIconSvgOrGeneric(token: string): string {
  return LANG_ICON_SVGS[token] ?? GENERIC_LANG_ICON_SVG
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
