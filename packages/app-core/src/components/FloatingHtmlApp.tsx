/**
 * Single HTML-attachment window mounted when the renderer boots with
 * `?floating=1&htmlAsset=1&htmlUrl=<zen-asset url>&htmlTitle=…&net=0|1`.
 * Spawned by the main process via `window.zen.openHtmlAttachmentWindow(...)`.
 *
 * It renders the attachment through the same `HtmlAttachmentFrame` the inline
 * reference pane uses, so the security model of U17 is preserved verbatim:
 * a sandboxed, opaque-origin iframe over the privileged `zen-asset://` scheme
 * (whose handler injects the CSP). The window chrome is intentionally minimal —
 * a draggable title bar + close — and the module stays free of CodeMirror so it
 * ships as its own small lazy chunk.
 */
import { useEffect, useMemo } from 'react'
import { HtmlAttachmentFrame } from './HtmlAttachmentFrame'
import { CloseIcon } from './icons'
import {
  DEFAULT_THEME_ID,
  THEMES,
  resolveAuto,
  type ThemeFamily,
  type ThemeMode
} from '../lib/themes'

const PREFS_KEY = 'zen:prefs:v2'

interface MinimalThemePrefs {
  themeId: string
  themeFamily: ThemeFamily
  themeMode: ThemeMode
}

function loadThemePrefs(): MinimalThemePrefs {
  const fallback: MinimalThemePrefs = {
    themeId: DEFAULT_THEME_ID,
    themeFamily: 'gruvbox',
    themeMode: 'dark'
  }
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<MinimalThemePrefs>
    return {
      themeId: typeof parsed.themeId === 'string' ? parsed.themeId : fallback.themeId,
      themeFamily: (parsed.themeFamily as ThemeFamily) ?? fallback.themeFamily,
      themeMode: (parsed.themeMode as ThemeMode) ?? fallback.themeMode
    }
  } catch {
    return fallback
  }
}

function applyTheme(prefs: MinimalThemePrefs): void {
  const html = document.documentElement
  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  let id = prefs.themeId
  if (prefs.themeMode === 'auto') {
    id = resolveAuto(prefs.themeFamily, mql.matches, prefs.themeId)
  }
  if (!THEMES.some((t) => t.id === id)) id = DEFAULT_THEME_ID
  html.dataset.theme = id
  html.setAttribute('data-opaque', '')
}

export function FloatingHtmlApp({
  assetUrl,
  title,
  allowNetwork
}: {
  assetUrl: string
  title: string
  allowNetwork: boolean
}): JSX.Element {
  const prefs = useMemo(() => loadThemePrefs(), [])

  useEffect(() => {
    applyTheme(prefs)
    if (prefs.themeMode === 'auto') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)')
      const onChange = (): void => applyTheme(prefs)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    }
    return undefined
  }, [prefs])

  return (
    <div className="flex h-screen min-h-0 flex-col bg-paper-50 text-ink-900">
      <header
        className="glass-header flex h-12 shrink-0 items-center justify-between gap-2 border-b border-paper-300/70 px-4"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
        <button
          type="button"
          title="Close window"
          onClick={() => window.zen.windowClose()}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-500 hover:bg-paper-200 hover:text-ink-900"
        >
          <CloseIcon width={14} height={14} />
        </button>
      </header>
      <div className="relative min-h-0 min-w-0 flex-1">
        <HtmlAttachmentFrame assetUrl={assetUrl} allowNetwork={allowNetwork} />
      </div>
    </div>
  )
}
