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
  // Accept a plain number or any absolute/relative length unit (px, pt, pc, mm,
  // cm, in, em, ex, …). For the synthesized viewBox only the width:height ratio
  // matters, so the unit can be ignored. Percentages are excluded — they don't
  // describe an intrinsic size we can turn into a viewBox.
  const match = value.trim().match(/^([0-9]*\.?[0-9]+)\s*([a-z]+)?$/i)
  if (!match) return null
  const n = Number.parseFloat(match[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Measure the tight geometry bounding box of an `<svg>` by rendering a clone
 * offscreen and calling `getBBox()`. Returns `null` when no DOM is available
 * (tests/SSR) or the box is empty/non-finite.
 *
 * This is the only reliable way to size SVGs whose authored `width`/`height`
 * don't match the coordinate system of their content (e.g. Inkscape exports
 * with no `viewBox` whose paths overflow the declared size). The box is in user
 * units, independent of the CSS size we give the clone.
 */
function measureSvgViewBox(
  root: Element
): { x: number; y: number; width: number; height: number } | null {
  if (typeof document === 'undefined' || !document.body) return null
  let host: HTMLDivElement | null = null
  try {
    host = document.createElement('div')
    // Offscreen but still rendered — getBBox returns 0 for display:none.
    host.setAttribute(
      'style',
      'position:absolute;left:-99999px;top:-99999px;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none'
    )
    const clone = document.importNode(root, true) as Element
    // Give it an explicit pixel size so it lays out; getBBox is unaffected.
    clone.setAttribute('width', '100')
    clone.setAttribute('height', '100')
    host.appendChild(clone)
    document.body.appendChild(host)
    const box = (clone as unknown as SVGGraphicsElement).getBBox()
    if (
      box &&
      Number.isFinite(box.width) &&
      Number.isFinite(box.height) &&
      box.width > 0 &&
      box.height > 0
    ) {
      // 2% padding each side so strokes/round caps aren't clipped at the edge.
      const padX = box.width * 0.02
      const padY = box.height * 0.02
      return {
        x: box.x - padX,
        y: box.y - padY,
        width: box.width + padX * 2,
        height: box.height + padY * 2
      }
    }
    return null
  } catch {
    return null
  } finally {
    if (host && host.parentNode) host.parentNode.removeChild(host)
  }
}

/** Memoized {@link normalizeIconSvg} results, keyed by the (sanitized) input. */
const normalizeCache = new Map<string, string>()

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
  const cached = normalizeCache.get(svg)
  if (cached !== undefined) return cached

  const result = computeNormalizedIconSvg(svg)
  normalizeCache.set(svg, result)
  return result
}

function computeNormalizedIconSvg(svg: string): string {
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
    // Prefer the real rendered geometry: it handles SVGs whose declared
    // width/height don't match their content's coordinate system (and crops
    // surrounding whitespace). Fall back to width/height when unmeasurable.
    const box = measureSvgViewBox(root)
    if (box) {
      root.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`)
    } else {
      const w = parseSvgLength(root.getAttribute('width'))
      const h = parseSvgLength(root.getAttribute('height'))
      if (w != null && h != null) {
        root.setAttribute('viewBox', `0 0 ${w} ${h}`)
      }
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
