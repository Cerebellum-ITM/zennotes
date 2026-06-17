import DOMPurify from 'dompurify'

/**
 * Sanitize a user-supplied SVG icon so it is safe to inject into the DOM.
 *
 * Uses DOMPurify's SVG profile, which keeps presentational SVG markup (paths,
 * shapes, gradients, filters) while stripping anything scriptable: `<script>`,
 * `on*` event handlers, and `<foreignObject>` (which can smuggle HTML/JS). The
 * result is intended for `dangerouslySetInnerHTML`; never inject raw SVG.
 */
export function sanitizeIconSvg(svg: string): string {
  if (typeof svg !== 'string' || !svg.trim()) return ''
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'foreignObject'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick']
  })
}

/** Parse a CSS/SVG length to a finite number, or null when it isn't numeric. */
function parseSvgLength(value: string | null): number | null {
  if (!value) return null
  // Accept plain numbers and `px` (the only unit that maps 1:1 to user units).
  const match = value.trim().match(/^([0-9]*\.?[0-9]+)(px)?$/i)
  if (!match) return null
  const n = Number.parseFloat(match[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Make a (already-sanitized) SVG scale to its container.
 *
 * Parses the root `<svg>` and:
 * - synthesizes a `viewBox="0 0 W H"` from numeric `width`/`height` when none
 *   is present (so icons with a large intrinsic size still map to the box);
 * - forces `width="100%" height="100%"` and
 *   `preserveAspectRatio="xMidYMid meet"` so the glyph fits and centers.
 *
 * Must run AFTER {@link sanitizeIconSvg} — never normalize unsanitized input.
 * Returns the input unchanged when it can't be parsed as a single `<svg>`.
 */
export function normalizeIconSvg(svg: string): string {
  if (typeof svg !== 'string' || !svg.trim()) return ''
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    return svg
  }
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  } catch {
    return svg
  }
  const root = doc.documentElement
  if (!root || root.tagName.toLowerCase() !== 'svg') return svg
  // A parse error yields a <parsererror> root or child; bail in that case.
  if (root.getElementsByTagName('parsererror').length > 0) return svg

  if (!root.getAttribute('viewBox')) {
    const w = parseSvgLength(root.getAttribute('width'))
    const h = parseSvgLength(root.getAttribute('height'))
    if (w != null && h != null) {
      root.setAttribute('viewBox', `0 0 ${w} ${h}`)
    }
  }
  root.setAttribute('width', '100%')
  root.setAttribute('height', '100%')
  root.setAttribute('preserveAspectRatio', 'xMidYMid meet')

  try {
    return new XMLSerializer().serializeToString(root)
  } catch {
    return svg
  }
}
