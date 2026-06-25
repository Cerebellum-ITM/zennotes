/**
 * Parser for the metadata that follows the language token on a fenced code
 * block's opening line — e.g. ` ```python title=My script {3,5-7} `. Pure and
 * unit-tested; shared by the preview pipeline and the CodeMirror editor flair.
 *
 * Supported tokens (order-independent):
 *  - `title=Foo` or `title="Foo with spaces"` → block title.
 *  - `{3,5-7,9}` → highlighted line numbers (1-based), ranges allowed.
 */
export interface FenceMeta {
  title?: string
  highlightLines: Set<number>
}

const TITLE_RE = /\btitle=(?:"([^"]*)"|'([^']*)'|(\S+))/
const HL_RE = /\{([\d,\s-]+)\}/

/** Parse `{3,5-7,9}` → {3,5,6,7,9}. Invalid/≤0/inverted ranges are skipped. */
export function parseHighlightLines(spec: string): Set<number> {
  const out = new Set<number>()
  for (const part of spec.split(',')) {
    const piece = part.trim()
    if (!piece) continue
    const range = /^(\d+)-(\d+)$/.exec(piece)
    if (range) {
      const start = Number.parseInt(range[1], 10)
      const end = Number.parseInt(range[2], 10)
      if (start > 0 && end >= start) {
        for (let n = start; n <= end; n += 1) out.add(n)
      }
      continue
    }
    if (/^\d+$/.test(piece)) {
      const n = Number.parseInt(piece, 10)
      if (n > 0) out.add(n)
    }
  }
  return out
}

/** Parse a fence info-string's metadata (everything after the language token). */
export function parseFenceMeta(meta: string | null | undefined): FenceMeta {
  const result: FenceMeta = { highlightLines: new Set() }
  if (!meta) return result

  const title = TITLE_RE.exec(meta)
  if (title) {
    const value = title[1] ?? title[2] ?? title[3] ?? ''
    if (value) result.title = value
  }

  const hl = HL_RE.exec(meta)
  if (hl) result.highlightLines = parseHighlightLines(hl[1])

  return result
}

/** True when the 1-based `line` is in the highlight set. */
export function isLineHighlighted(meta: FenceMeta, line: number): boolean {
  return meta.highlightLines.has(line)
}

/** Serialize highlight lines as a sorted CSV (for a data-attribute). */
export function highlightLinesAttr(meta: FenceMeta): string {
  return [...meta.highlightLines].sort((a, b) => a - b).join(',')
}

/** Parse a `data-code-hl-lines` CSV back into a set of line numbers. */
export function parseHighlightLinesAttr(value: string | null | undefined): Set<number> {
  const out = new Set<number>()
  if (!value) return out
  for (const part of value.split(',')) {
    const n = Number.parseInt(part.trim(), 10)
    if (Number.isFinite(n) && n > 0) out.add(n)
  }
  return out
}
