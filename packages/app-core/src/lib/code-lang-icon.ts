/**
 * Inline code-icon directive: `{<lang> icon}` at the START of an inline code
 * span renders the language's icon (resolved via `target: 'lang'` icon rules)
 * and the rest of the span stays as code. Shared by the preview post-process
 * pass and the CodeMirror live-preview plugin so both parse it identically.
 */
export const CODE_LANG_ICON_RE = /^\{([A-Za-z0-9+#._-]+)\s+icon\}/

export interface ParsedLangIcon {
  /** The language token (e.g. `lua`). */
  lang: string
  /** Length of the matched `{lang icon}` directive in characters. */
  directiveLength: number
  /** The code text after the directive. */
  rest: string
}

/** Parse a leading `{lang icon}` directive, or `null` when absent. The single
 *  separator space after the directive (`{lua icon} foo`) is dropped from
 *  `rest` so the icon's own gap doesn't stack with it. */
export function parseLangIconDirective(text: string): ParsedLangIcon | null {
  const match = CODE_LANG_ICON_RE.exec(text)
  if (!match) return null
  return {
    lang: match[1],
    directiveLength: match[0].length,
    rest: text.slice(match[0].length).replace(/^[ \t]/, '')
  }
}
