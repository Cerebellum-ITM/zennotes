import { renderToStaticMarkup } from 'react-dom/server'
import type { CustomIcon } from '@shared/ipc'
import { resolveIcon } from './icon-resolve'
import { iconOptionById } from '../components/FolderIcons'
import { normalizeIconSvg, sanitizeIconSvg } from './sanitize-icon'

/**
 * Render an {@link import('@shared/ipc').IconRef} into a standalone DOM node, for
 * the vanilla-DOM contexts where {@link import('../components/DynamicIcon').DynamicIcon}
 * (React) can't be used: CodeMirror widgets and the preview's post-process pass.
 *
 * Custom refs inject the sanitized + normalized SVG; built-in refs are rendered
 * from the shared glyph via `renderToStaticMarkup`. Returns `null` when the ref
 * doesn't resolve, so callers simply render no icon.
 */
export function renderIconToDOM(
  iconRef: string,
  customByName: Map<string, CustomIcon>,
  size = 14
): HTMLSpanElement | null {
  const resolved = resolveIcon(iconRef, customByName)
  if (!resolved) return null

  const span = document.createElement('span')
  span.className = 'zen-inline-icon'
  span.setAttribute('aria-hidden', 'true')
  span.style.width = `${size}px`
  span.style.height = `${size}px`
  span.style.display = 'inline-flex'
  span.style.alignItems = 'center'
  span.style.justifyContent = 'center'
  span.style.verticalAlign = 'text-bottom'
  span.style.flex = '0 0 auto'

  const markup =
    resolved.kind === 'custom'
      ? normalizeIconSvg(sanitizeIconSvg(resolved.icon.svg))
      : renderToStaticMarkup(iconOptionById(resolved.id).icon)
  span.innerHTML = markup

  const svg = span.firstElementChild as HTMLElement | null
  if (svg) {
    svg.style.width = '100%'
    svg.style.height = '100%'
  }
  return span
}
