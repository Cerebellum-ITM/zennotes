// Curated brand color per language, used to tint the fenced code-block's top
// accent strip (in both the preview card and the WYSIWYG editor) so each block
// gets a subtle, language-specific colored edge instead of a single bright
// theme accent. Colors are stored as space-separated `R G B` triplets so CSS
// can dim them via the rgb()/alpha syntax: `rgb(var(--zen-code-accent) / 0.5)`.
//
// Tokens are the canonical language tokens produced by `normalizeLangToken`
// (see lang-icons.ts), so aliases like `js`/`py` resolve here too. Languages
// without an entry fall back to the theme accent (handled in CSS).
import { normalizeLangToken } from './lang-icons'

/** Canonical language token → brand color as an `R G B` triplet. */
export const LANG_COLORS: Record<string, string> = {
  javascript: '240 219 79',
  typescript: '49 120 198',
  python: '55 118 171',
  go: '0 173 216',
  rust: '247 76 0',
  java: '231 111 0',
  kotlin: '127 82 255',
  c: '101 154 210',
  cpp: '0 89 156',
  csharp: '149 79 144',
  php: '119 123 180',
  ruby: '204 52 45',
  swift: '240 81 56',
  dart: '1 117 194',
  scala: '220 50 47',
  elixir: '110 74 130',
  erlang: '169 5 51',
  haskell: '94 79 133',
  clojure: '88 129 216',
  lua: '81 120 207',
  perl: '57 69 126',
  r: '39 109 195',
  julia: '149 88 178',
  html: '227 79 38',
  css: '21 114 182',
  sass: '204 102 153',
  markdown: '139 148 158',
  latex: '0 128 128',
  bash: '78 170 37',
  powershell: '83 145 254',
  sql: '227 140 0',
  postgresql: '51 103 145',
  mongodb: '71 162 72',
  graphql: '225 0 152',
  docker: '36 150 237',
  kubernetes: '50 108 229',
  terraform: '123 66 188',
  nginx: '0 150 57',
  react: '97 218 251',
  vue: '66 184 131',
  git: '240 80 50'
}

/**
 * Brand color (`R G B` triplet) for a raw language token, or `null` when the
 * language has no curated color (caller should fall back to the theme accent).
 */
export function langAccentTriplet(rawLang: string): string | null {
  return LANG_COLORS[normalizeLangToken(rawLang)] ?? null
}
