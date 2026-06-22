/**
 * Renders an HTML attachment (often AI-generated) inside a hardened iframe.
 *
 * The HTML is served by the privileged `zen-asset://` scheme with a
 * Content-Security-Policy *response header* (see the protocol handler in the
 * desktop main process) and mounted with `sandbox="allow-scripts"` (no
 * `allow-same-origin`). Two details matter:
 *
 * - We point `src` straight at the `zen-asset` URL rather than fetching the
 *   text and using a `blob:`/`srcdoc` URL. A blob/srcdoc document inherits the
 *   renderer's strict CSP (`script-src 'self' 'unsafe-eval'`, no
 *   `'unsafe-inline'`), which silently blocks the attachment's own inline
 *   scripts — the page renders but is dead. A non-local scheme carries its own
 *   header CSP instead, so local scripts run.
 * - The sandbox drops same-origin, giving the page an opaque origin: it can run
 *   its own scripts but cannot reach `window.zen`, the vault, the scheme's
 *   fetch privileges, cookies, or storage. The header CSP governs whether it
 *   may load external resources (`connect-src 'none'` always blocks
 *   fetch/exfiltration); see `htmlAttachmentAllowNetwork`.
 */
export function HtmlAttachmentFrame({
  assetUrl,
  allowNetwork
}: {
  assetUrl: string
  allowNetwork: boolean
}): JSX.Element {
  // assetUrl already carries `?path=...`; append the render markers.
  const src = `${assetUrl}&zenHtml=1&zenNet=${allowNetwork ? '1' : '0'}`

  return (
    <iframe
      // Opaque origin: scripts run, but no same-origin access to the app/vault.
      sandbox="allow-scripts allow-popups"
      src={src}
      title="HTML attachment"
      className="absolute inset-0 h-full w-full border-0 bg-paper-50"
    />
  )
}
