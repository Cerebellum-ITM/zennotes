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
