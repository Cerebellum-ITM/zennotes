/**
 * Code syntax-highlight palettes for the preview. `theme` derives token colors
 * from the active app theme (`--z-*`), `mono` drops colors entirely, and the
 * named entries reuse highlight.js's shipped themes (loaded on demand by
 * `code-theme.ts`). Kept free of CSS imports so the store and tests can depend
 * on the type/values without pulling theme stylesheets into their graph.
 */
export type CodePalette =
  | 'theme'
  | 'mono'
  | 'github-dark'
  | 'github'
  | 'atom-one-dark'
  | 'atom-one-light'
  | 'nord'
  | 'tokyo-night-dark'
  | 'night-owl'
  | 'monokai'
  | 'vs2015'
  | 'stackoverflow-dark'
  | 'rose-pine'

export interface CodePaletteOption {
  value: CodePalette
  label: string
}

export const CODE_PALETTE_OPTIONS: CodePaletteOption[] = [
  { value: 'theme', label: 'Match app theme' },
  { value: 'mono', label: 'Monochrome' },
  { value: 'github-dark', label: 'GitHub Dark' },
  { value: 'github', label: 'GitHub Light' },
  { value: 'atom-one-dark', label: 'Atom One Dark' },
  { value: 'atom-one-light', label: 'Atom One Light' },
  { value: 'nord', label: 'Nord' },
  { value: 'tokyo-night-dark', label: 'Tokyo Night' },
  { value: 'night-owl', label: 'Night Owl' },
  { value: 'monokai', label: 'Monokai' },
  { value: 'vs2015', label: 'VS Dark' },
  { value: 'stackoverflow-dark', label: 'Stack Overflow' },
  { value: 'rose-pine', label: 'Rosé Pine' }
]

export const CODE_PALETTE_VALUES: CodePalette[] = CODE_PALETTE_OPTIONS.map((o) => o.value)

/** Palettes that load a named highlight.js stylesheet (everything but the two
 *  built-in token modes). */
export function isNamedCodePalette(palette: CodePalette): boolean {
  return palette !== 'theme' && palette !== 'mono'
}
