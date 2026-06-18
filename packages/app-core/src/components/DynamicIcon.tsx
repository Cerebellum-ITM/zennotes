import { useMemo } from 'react'
import type { CustomIcon } from '@shared/ipc'
import { buildCustomIconIndex, resolveIcon } from '../lib/icon-resolve'
import { normalizeIconSvg, sanitizeIconSvg } from '../lib/sanitize-icon'
import { iconOptionById } from './FolderIcons'

/**
 * Render a folder icon from an {@link import('@shared/ipc').IconRef}.
 *
 * Built-in refs reuse the shared glyph set. Custom refs inject the user's SVG —
 * always sanitized first ({@link sanitizeIconSvg}) — into a fixed-size span so
 * `currentColor`-based icons inherit the surrounding text color while icons with
 * their own colors are preserved. Returns `null` when the ref cannot be resolved
 * (the caller is expected to supply a fallback).
 */
export function DynamicIcon({
  iconRef,
  customIcons,
  size = 16
}: {
  iconRef: string
  customIcons: CustomIcon[]
  size?: number
}): JSX.Element | null {
  const customByName = useMemo(() => buildCustomIconIndex(customIcons), [customIcons])
  const resolved = useMemo(() => resolveIcon(iconRef, customByName), [iconRef, customByName])
  const sanitized = useMemo(
    () =>
      // Sanitize FIRST (security), then normalize so large-intrinsic-size SVGs
      // scale to the sized container in preview and in sidebar/header/tabs.
      resolved?.kind === 'custom' ? normalizeIconSvg(sanitizeIconSvg(resolved.icon.svg)) : '',
    [resolved]
  )

  if (!resolved) return null

  if (resolved.kind === 'builtin') {
    return iconOptionById(resolved.id).icon
  }

  return (
    <span
      aria-hidden
      style={{ width: size, height: size, display: 'inline-flex' }}
      className="[&>svg]:h-full [&>svg]:w-full"
      // Sanitized via sanitizeIconSvg above; never inject raw SVG.
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  )
}
