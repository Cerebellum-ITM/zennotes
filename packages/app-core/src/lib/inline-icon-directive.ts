/**
 * The inline-icon body directive `{icon:<ref>}` (Unit 31).
 *
 * `<ref>` is an IconRef resolved by `resolveIcon` (custom-first, then builtin):
 * a bare custom name (`star`, `work/check`) or an explicit `custom:<path>` /
 * `builtin:<id>`. Distinct from the `{lang icon}` code-span directive — this one
 * lives in plain body text and is shared by the editor plugin and the preview
 * post-process pass.
 */
export interface InlineIconMatch {
  /** Offset of the opening `{` within the scanned string. */
  start: number
  /** Offset just past the closing `}`. */
  end: number
  /** The captured IconRef (e.g. `star`, `work/check`, `builtin:inbox`). */
  ref: string
}

/** Source for `{icon:<ref>}`. Allows `:` so explicit `builtin:`/`custom:` refs
 *  and `/` section paths work. */
const INLINE_ICON_SOURCE = '\\{icon:([A-Za-z0-9._/:+#-]+)\\}'

/** A fresh global regex (callers that `.exec` need their own `lastIndex`). */
export function inlineIconRegex(): RegExp {
  return new RegExp(INLINE_ICON_SOURCE, 'g')
}

/** All `{icon:<ref>}` directives in `text`, with absolute offsets. */
export function findInlineIconDirectives(text: string): InlineIconMatch[] {
  const re = inlineIconRegex()
  const out: InlineIconMatch[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length, ref: m[1] })
  }
  return out
}

/** Open `{icon:` + optional partial ref, with no closing `}` yet (autocomplete). */
const ICON_PREFIX_RE = /\{icon:([A-Za-z0-9._/:+#-]*)$/

/**
 * If the text immediately before the cursor is an unclosed `{icon:<partial>`
 * directive, return `from` (offset of the ref start, just after `{icon:`) and
 * the typed `query`. Pure — used by the editor autocomplete source.
 */
export function matchIconDirectivePrefix(
  textBefore: string
): { from: number; query: string } | null {
  const m = ICON_PREFIX_RE.exec(textBefore)
  if (!m) return null
  return { from: textBefore.length - m[1].length, query: m[1] }
}
