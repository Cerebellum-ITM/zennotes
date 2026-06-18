/**
 * Loads highlight.js's shipped theme stylesheets (imported as raw strings) and
 * rewrites them so the selected one applies ONLY to preview code under the
 * matching `:root[data-code-palette="…"]` and never disturbs page layout: every
 * selector is scoped under `.prose-zen`, and layout declarations (padding,
 * display, overflow…) are stripped so only colors/weights survive. The box
 * chrome, padding, and line layout stay owned by our own CSS.
 */
import githubDark from 'highlight.js/styles/github-dark.css?inline'
import github from 'highlight.js/styles/github.css?inline'
import atomOneDark from 'highlight.js/styles/atom-one-dark.css?inline'
import atomOneLight from 'highlight.js/styles/atom-one-light.css?inline'
import nord from 'highlight.js/styles/nord.css?inline'
import tokyoNightDark from 'highlight.js/styles/tokyo-night-dark.css?inline'
import nightOwl from 'highlight.js/styles/night-owl.css?inline'
import monokai from 'highlight.js/styles/monokai.css?inline'
import vs2015 from 'highlight.js/styles/vs2015.css?inline'
import stackoverflowDark from 'highlight.js/styles/stackoverflow-dark.css?inline'
import rosePine from 'highlight.js/styles/rose-pine.css?inline'

import type { CodePalette } from './code-palette'

const THEME_CSS: Partial<Record<CodePalette, string>> = {
  'github-dark': githubDark,
  github,
  'atom-one-dark': atomOneDark,
  'atom-one-light': atomOneLight,
  nord,
  'tokyo-night-dark': tokyoNightDark,
  'night-owl': nightOwl,
  monokai,
  vs2015,
  'stackoverflow-dark': stackoverflowDark,
  'rose-pine': rosePine
}

// Token rules carry color/emphasis only (no background), so a theme's token
// colors can apply to inline code too without dragging the block background
// onto an inline chip. Base/element rules additionally keep the background,
// which is only ever scoped to fenced blocks.
const TOKEN_PROPS = new Set([
  'color',
  'font-style',
  'font-weight',
  'text-decoration',
  'text-decoration-line',
  'opacity'
])
const BASE_PROPS = new Set([...TOKEN_PROPS, 'background', 'background-color'])

function filterDeclarations(body: string, allowed: Set<string>): string {
  return body
    .split(';')
    .map((decl) => decl.trim())
    .filter(Boolean)
    .filter((decl) => {
      const prop = decl.slice(0, decl.indexOf(':')).trim().toLowerCase()
      return allowed.has(prop)
    })
    .join('; ')
}

// Parse a raw hljs theme into a map of `hljs-*` class → color, reading only
// flat single-class selectors (skipping descendant rules like `.hljs-meta
// .hljs-string`). Chained classes (`.hljs-title.function_`) are kept as one key.
function parseHljsColors(raw: string): Map<string, string> {
  const colors = new Map<string, string>()
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const colorMatch = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(rule[2])
    if (!colorMatch) continue
    const color = colorMatch[1].trim()
    for (const partRaw of rule[1].split(',')) {
      const part = partRaw.trim()
      if (/^\.hljs[\w.-]*$/.test(part)) {
        const key = part.slice(1)
        if (!colors.has(key)) colors.set(key, color)
      }
    }
  }
  return colors
}

// Maps the editor's Lezer token classes (`.tok-*`, set on fenced code lines) to
// the hljs class whose color should drive them. First hljs key with a color wins.
const EDITOR_TOKEN_MAP: { toks: string[]; hljs: string[] }[] = [
  { toks: ['tok-keyword'], hljs: ['hljs-keyword', 'hljs-built_in', 'hljs-literal'] },
  { toks: ['tok-string'], hljs: ['hljs-string', 'hljs-regexp'] },
  { toks: ['tok-comment'], hljs: ['hljs-comment', 'hljs-quote'] },
  { toks: ['tok-number', 'tok-atom'], hljs: ['hljs-number', 'hljs-symbol'] },
  { toks: ['tok-function'], hljs: ['hljs-title.function_', 'hljs-title', 'hljs-built_in'] },
  { toks: ['tok-type'], hljs: ['hljs-type', 'hljs-title.class_', 'hljs-title'] },
  { toks: ['tok-tag'], hljs: ['hljs-tag', 'hljs-name', 'hljs-selector-tag'] },
  { toks: ['tok-attr', 'tok-label'], hljs: ['hljs-attr', 'hljs-attribute'] },
  { toks: ['tok-variable-def', 'tok-property'], hljs: ['hljs-variable', 'hljs-property'] },
  { toks: ['tok-operator', 'tok-punct', 'tok-bracket'], hljs: ['hljs-operator', 'hljs-punctuation'] }
]

const editorMemo = new Map<CodePalette, string>()

/**
 * CSS that recolors the EDITOR's fenced-code token classes (`.tok-*` inside
 * `.cm-code-block-line`) to match a named hljs palette, extracted from that
 * theme's stylesheet. Colors only — no background box — scoped to the active
 * palette. Returns `''` for theme/mono (the editor already uses `--z-*`).
 */
export function editorCodeThemeCss(palette: CodePalette): string {
  const cached = editorMemo.get(palette)
  if (cached != null) return cached

  const raw = THEME_CSS[palette]
  if (!raw) {
    editorMemo.set(palette, '')
    return ''
  }

  const colors = parseHljsColors(raw)
  const root = `:root[data-code-palette="${palette}"] .cm-editor`
  // Base text color only on fenced blocks (the chip keeps the app foreground so
  // an inline chip on the app surface stays readable). Token colors apply to
  // both fenced lines and the inline highlight chip.
  const blockBase = `${root} .cm-code-block-line`
  const tokenBase = `${root} :is(.cm-code-block-line, .cm-inline-hl)`
  const lines: string[] = []

  const baseColor = colors.get('hljs')
  if (baseColor) lines.push(`${blockBase} { color: ${baseColor}; }`)

  for (const { toks, hljs: keys } of EDITOR_TOKEN_MAP) {
    const color = keys.map((k) => colors.get(k)).find(Boolean)
    if (!color) continue
    const selector = toks.map((t) => `${tokenBase} .${t}`).join(', ')
    lines.push(`${selector} { color: ${color}; }`)
  }

  const result = lines.join('\n')
  editorMemo.set(palette, result)
  return result
}

const memo = new Map<CodePalette, string>()

/**
 * Return the scoped preview CSS for a named palette, or `''` for the built-in
 * `theme`/`mono` modes (handled directly in index.css). Token color rules
 * (`.hljs-*`) are scoped to `.prose-zen` so they apply to BOTH inline and block
 * code; element/base rules (`.hljs`, carrying the background) are scoped to
 * `.zen-code-block` so the dark surface only lands on fenced blocks, never on an
 * inline chip. Layout declarations are stripped. Results are memoized.
 */
export function scopedCodeThemeCss(palette: CodePalette): string {
  const cached = memo.get(palette)
  if (cached != null) return cached

  const raw = THEME_CSS[palette]
  if (!raw) {
    memo.set(palette, '')
    return ''
  }

  const tokenRoot = `:root[data-code-palette="${palette}"] .prose-zen `
  const blockRoot = `${tokenRoot}.zen-code-block `
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: string[] = []

  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = rule[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    // Token classes (`.hljs-keyword`, `.hljs-meta .hljs-string`, …) carry token
    // colors → inline + block. Bare element selectors (`.hljs`, `code.hljs`)
    // carry the base color + background → block only.
    const tokenSels = selectors.filter((s) => s.includes('.hljs-'))
    const baseSels = selectors.filter((s) => !s.includes('.hljs-'))

    const tokenDecls = filterDeclarations(rule[2], TOKEN_PROPS)
    if (tokenSels.length && tokenDecls) {
      out.push(`${tokenSels.map((s) => tokenRoot + s).join(', ')} { ${tokenDecls} }`)
    }

    const baseDecls = filterDeclarations(rule[2], BASE_PROPS)
    if (baseSels.length && baseDecls) {
      out.push(`${baseSels.map((s) => blockRoot + s).join(', ')} { ${baseDecls} }`)
    }
  }

  const scoped = out.join('\n')
  memo.set(palette, scoped)
  return scoped
}
