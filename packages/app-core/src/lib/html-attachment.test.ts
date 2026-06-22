import { describe, expect, it } from 'vitest'
import { buildHtmlAttachmentCsp, wrapHtmlWithCsp } from './html-attachment'

describe('buildHtmlAttachmentCsp', () => {
  it('is fully offline when network is disallowed', () => {
    const csp = buildHtmlAttachmentCsp(false)
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("script-src 'unsafe-inline' 'unsafe-eval'")
    expect(csp).not.toContain('https:')
    expect(csp).toContain("connect-src 'none'")
    expect(csp).toContain("form-action 'none'")
  })

  it('allows https CDNs but never connect/forms when network is allowed', () => {
    const csp = buildHtmlAttachmentCsp(true)
    expect(csp).toContain('script-src')
    expect(csp).toMatch(/script-src[^;]*https:/)
    expect(csp).toMatch(/style-src[^;]*https:/)
    expect(csp).toMatch(/img-src[^;]*https:/)
    // The exfiltration boundary stays shut in both modes.
    expect(csp).toContain("connect-src 'none'")
    expect(csp).toContain("form-action 'none'")
  })
})

describe('wrapHtmlWithCsp', () => {
  const csp = buildHtmlAttachmentCsp(false)

  it('injects the meta right after <head>', () => {
    const out = wrapHtmlWithCsp('<html><head><title>x</title></head><body>hi</body></html>', csp)
    expect(out).toMatch(/<head><meta http-equiv="Content-Security-Policy"/i)
    expect(out).toContain('data-zen-html-csp')
  })

  it('creates a head when only <html> is present', () => {
    const out = wrapHtmlWithCsp('<html><body>hi</body></html>', csp)
    expect(out).toMatch(/<html><head><meta http-equiv="Content-Security-Policy"[^>]*><\/head>/i)
  })

  it('prepends a meta for a bare fragment', () => {
    const out = wrapHtmlWithCsp('<div>hi</div>', csp)
    expect(out.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true)
  })

  it('does not stack on re-wrap (idempotent)', () => {
    const once = wrapHtmlWithCsp('<html><head></head><body></body></html>', csp)
    const twice = wrapHtmlWithCsp(once, buildHtmlAttachmentCsp(true))
    expect(twice.match(/data-zen-html-csp/g)).toHaveLength(1)
    // The re-wrap uses the new (network-allowed) policy.
    expect(twice).toMatch(/script-src[^;]*https:/)
  })
})
