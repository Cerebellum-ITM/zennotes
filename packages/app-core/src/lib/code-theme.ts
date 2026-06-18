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

// Only color/emphasis declarations are kept; everything else (padding, display,
// overflow, margins, borders, vendor props) is dropped so the theme can't
// reflow or repaint anything beyond the syntax tokens.
const KEPT_PROPS = new Set([
  'color',
  'background',
  'background-color',
  'font-style',
  'font-weight',
  'text-decoration',
  'text-decoration-line',
  'opacity'
])

function filterDeclarations(body: string): string {
  return body
    .split(';')
    .map((decl) => decl.trim())
    .filter(Boolean)
    .filter((decl) => {
      const prop = decl.slice(0, decl.indexOf(':')).trim().toLowerCase()
      return KEPT_PROPS.has(prop)
    })
    .join('; ')
}

const memo = new Map<CodePalette, string>()

/**
 * Return the scoped, color-only CSS for a named palette, or `''` for the
 * built-in `theme`/`mono` modes (handled directly in index.css). Results are
 * memoized since the source strings are static.
 */
export function scopedCodeThemeCss(palette: CodePalette): string {
  const cached = memo.get(palette)
  if (cached != null) return cached

  const raw = THEME_CSS[palette]
  if (!raw) {
    memo.set(palette, '')
    return ''
  }

  const prefix = `:root[data-code-palette="${palette}"] .prose-zen `
  const scoped = raw
    .replace(/\/\*[\s\S]*?\*\//g, '') // strip comments
    .replace(/([^{}]+)\{([^{}]*)\}/g, (_match, selector: string, body: string) => {
      const decls = filterDeclarations(body)
      if (!decls) return ''
      const scopedSelector = selector
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => prefix + part)
        .join(', ')
      return scopedSelector ? `${scopedSelector} { ${decls} }\n` : ''
    })
    .trim()

  memo.set(palette, scoped)
  return scoped
}
