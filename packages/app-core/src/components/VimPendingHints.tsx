import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import { pendingStateEqual, readVimPendingState } from '../lib/cm-vim-pending'
import { getPendingHints, type VimPendingState } from '../lib/vim-pending-hints'

interface PanelPosition {
  top: number
  right: number
  maxHeight: number
}

const PANEL_GUTTER = 16

function computePosition(view: ReturnType<typeof useStore.getState>['editorViewRef']): PanelPosition | null {
  if (!view) return null
  const rect = view.scrollDOM.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return null
  return {
    top: rect.top + PANEL_GUTTER,
    right: Math.max(PANEL_GUTTER, window.innerWidth - rect.right + PANEL_GUTTER),
    maxHeight: Math.max(120, rect.height - PANEL_GUTTER * 2)
  }
}

/**
 * LazyGit-style motion hint panel. Mounts at app level; while vim is waiting to
 * complete a command (operator pending, visual mode, or a g/z prefix) it floats
 * a curated which-key list against the right edge of the active editor.
 */
export function VimPendingHints(): JSX.Element | null {
  const vimMode = useStore((s) => s.vimMode)
  const enabled = useStore((s) => s.vimPendingHints)
  const editorViewRef = useStore((s) => s.editorViewRef)

  const [pending, setPending] = useState<VimPendingState | null>(null)
  const [position, setPosition] = useState<PanelPosition | null>(null)
  const pendingRef = useRef<VimPendingState | null>(null)

  const active = vimMode && enabled

  useEffect(() => {
    if (!active || !editorViewRef) {
      pendingRef.current = null
      setPending(null)
      return undefined
    }
    const view = editorViewRef
    const sync = (): void => {
      const next = readVimPendingState(view)
      if (!pendingStateEqual(pendingRef.current, next)) {
        pendingRef.current = next
        setPending(next)
        setPosition(next ? computePosition(view) : null)
      }
    }
    // Read after vim has processed the key (rAF keeps us off the hot path and
    // avoids racing CM's own keydown handler).
    let frame = 0
    const schedule = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(sync)
    }
    const hide = (): void => {
      pendingRef.current = null
      setPending(null)
    }
    view.contentDOM.addEventListener('keydown', schedule)
    view.contentDOM.addEventListener('keyup', schedule)
    view.contentDOM.addEventListener('blur', hide)
    return () => {
      cancelAnimationFrame(frame)
      view.contentDOM.removeEventListener('keydown', schedule)
      view.contentDOM.removeEventListener('keyup', schedule)
      view.contentDOM.removeEventListener('blur', hide)
    }
  }, [active, editorViewRef])

  // Keep the panel pinned to the editor while it scrolls or the window resizes.
  useEffect(() => {
    if (!pending || !editorViewRef) return undefined
    const reposition = (): void => setPosition(computePosition(editorViewRef))
    const scroller = editorViewRef.scrollDOM
    window.addEventListener('resize', reposition)
    scroller.addEventListener('scroll', reposition, { passive: true })
    return () => {
      window.removeEventListener('resize', reposition)
      scroller.removeEventListener('scroll', reposition)
    }
  }, [pending, editorViewRef])

  if (!active || !pending || !position) return null

  const hints = getPendingHints(pending)

  return createPortal(
    <div
      className="zen-motion-hints pointer-events-none fixed z-popover"
      style={{ top: position.top, right: position.right, maxHeight: position.maxHeight }}
    >
      <div className="zen-motion-hints-card glass-raised flex max-h-full w-[260px] flex-col overflow-hidden rounded-xl border border-paper-300/70 shadow-float">
        <div className="flex items-center gap-2 border-b border-paper-300/60 px-3 py-2">
          <span className="rounded-md border border-accent/35 bg-paper-200 px-2 py-0.5 text-2xs font-semibold uppercase tracking-[0.16em] text-accent">
            {hints.title}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {hints.groups.map((group) => (
            <div key={group.title} className="mb-2 last:mb-0">
              <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-500">
                {group.title}
              </div>
              <div className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <div key={item.keys} className="flex items-center gap-2">
                    <span className="min-w-[2rem] rounded-md border border-paper-300 bg-paper-200/85 px-1.5 py-0.5 text-center text-2xs font-semibold text-ink-700">
                      {item.keys}
                    </span>
                    <span className="min-w-0 truncate text-xs text-ink-900">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
