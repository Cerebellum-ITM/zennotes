/**
 * Security helpers for rendering HTML attachments (often AI-generated) inside a
 * sandboxed iframe. The HTML runs with an opaque origin (`sandbox` without
 * `allow-same-origin`) so it can't reach the app/vault; this module builds the
 * Content-Security-Policy that additionally governs what it may load.
 *
 * Two modes, driven by the `htmlAttachmentAllowNetwork` preference:
 * - OFF (default): fully offline — only inline scripts/styles and `data:` media.
 * - ON: allow scripts/styles/images/fonts from `https:` CDNs, but keep
 *   `connect-src`/`form-action` blocked so the page can't fetch/POST anywhere
 *   (anti-exfiltration).
 *
 * Pure string logic — unit-tested without a DOM.
 */

const CSP_MARKER = 'data-zen-html-csp'

export function buildHtmlAttachmentCsp(allowNetwork: boolean): string {
  // Inline scripts/styles are required: AI HTML inlines them, and the sandbox
  // gives an opaque origin so 'self' would match nothing anyway.
  const directives: Record<string, string> = {
    'default-src': "'none'",
    'script-src': "'unsafe-inline' 'unsafe-eval'",
    'style-src': "'unsafe-inline'",
    'img-src': 'data: blob:',
    'font-src': 'data:',
    'media-src': 'data: blob:',
    // Always blocked, in both modes — this is the exfiltration boundary.
    'connect-src': "'none'",
    'form-action': "'none'",
    'base-uri': "'none'"
  }

  if (allowNetwork) {
    directives['script-src'] += ' https:'
    directives['style-src'] += ' https:'
    directives['img-src'] += ' https:'
    directives['font-src'] += ' https:'
    directives['media-src'] += ' https:'
  }

  return Object.entries(directives)
    .map(([key, value]) => `${key} ${value}`)
    .join('; ')
}

/**
 * Prepend our CSP `<meta>` to the document head so it is the enforced baseline
 * (the first applicable policy; any policy the HTML ships only further
 * restricts). Idempotent: re-wrapping replaces our previous meta.
 */
export function wrapHtmlWithCsp(html: string, csp: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}" ${CSP_MARKER}>`

  // Drop a previous injection so re-wraps don't stack.
  const cleaned = html.replace(
    new RegExp(`<meta[^>]*${CSP_MARKER}[^>]*>\\s*`, 'i'),
    ''
  )

  const headOpen = cleaned.match(/<head[^>]*>/i)
  if (headOpen && headOpen.index != null) {
    const at = headOpen.index + headOpen[0].length
    return `${cleaned.slice(0, at)}${meta}${cleaned.slice(at)}`
  }

  const htmlOpen = cleaned.match(/<html[^>]*>/i)
  if (htmlOpen && htmlOpen.index != null) {
    const at = htmlOpen.index + htmlOpen[0].length
    return `${cleaned.slice(0, at)}<head>${meta}</head>${cleaned.slice(at)}`
  }

  // Bare fragment — a top-level meta still applies.
  return `${meta}${cleaned}`
}
