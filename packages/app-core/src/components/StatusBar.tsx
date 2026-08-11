import { useEffect, useMemo, useState } from 'react'
import { getCM } from '@replit/codemirror-vim'
import { useStore } from '../store'
import type { NoteContent, NoteMeta } from '@shared/ipc'
import { backlinksForNote } from '../lib/wikilinks'
import { countWords } from '../lib/word-count'
import { useHoveredLinkStore } from '../lib/hovered-link'
import {
  formatVimMode,
  readVimStateMode,
  type VimStatus,
  type VimStatusKind,
  type VimModeChangePayload
} from '../lib/vim-status'

// `getCM(view)` returns codemirror-vim's CM5-compat adapter. We only need its
// event emitter (`on`/`off`) and the `state.vim` flags for the initial read.
interface VimCmCompat {
  on?: (type: string, handler: (e: VimModeChangePayload) => void) => void
  off?: (type: string, handler: (e: VimModeChangePayload) => void) => void
  state?: {
    vim?: {
      insertMode?: boolean
      visualMode?: boolean
      visualLine?: boolean
      visualBlock?: boolean
    }
  }
}

// Per-kind accent, driven entirely by theme tokens (no hardcoded hex).
const VIM_KIND_VAR: Record<VimStatusKind, string> = {
  normal: '--z-accent',
  insert: '--z-green',
  visual: '--z-blue',
  replace: '--z-red'
}

function copyText(text: string): void {
  try {
    window.zen.clipboardWriteText(text)
  } catch {
    void navigator.clipboard?.writeText(text)
  }
}

/**
 * Footer strip showing quick stats for the active note: backlinks,
 * word count, character count, and estimated read time. Modelled on
 * the Obsidian status bar.
 *
 * The left side carries app context — the live Vim mode (when Vim is enabled)
 * and the running version + exact commit — mirroring how Vim / VS Code anchor
 * the mode indicator at the bottom-left.
 *
 * Backlinks use the `wikilinks` field populated by the main process
 * on every `readMeta` call, so we don't need to re-scan note bodies
 * at render time.
 */
export function StatusBar({ note }: { note: NoteContent | null }): JSX.Element {
  const notes = useStore((s) => s.notes)
  const vimEnabled = useStore((s) => s.vimMode)
  const editorView = useStore((s) => s.editorViewRef)

  const appInfo = useMemo(() => window.zen.getAppInfo(), [])
  const [vimStatus, setVimStatus] = useState<VimStatus | null>(null)

  useEffect(() => {
    if (!vimEnabled || !editorView) {
      setVimStatus(null)
      return
    }
    const cm = getCM(editorView) as VimCmCompat | null
    if (!cm?.on) {
      setVimStatus(null)
      return
    }
    const handler = (e: VimModeChangePayload): void => setVimStatus(formatVimMode(e))
    cm.on('vim-mode-change', handler)
    // Seed the initial mode so the badge is correct before the first change.
    setVimStatus(readVimStateMode(cm.state?.vim))
    return () => cm.off?.('vim-mode-change', handler)
  }, [editorView, vimEnabled])

  const { words, characters, minutes } = useMemo(() => {
    const body = note?.body ?? ''
    const w = countWords(body)
    const c = body.length
    const m = Math.max(1, Math.round(w / 200))
    return { words: w, characters: c, minutes: m }
  }, [note?.body])

  // Backlinks depend only on the active note's *path* and the vault's
  // wikilink metadata — never on the note body. Keying the memo on
  // `note.path` (instead of the whole `note` object, which changes on every
  // keystroke) keeps this O(n) scan off the typing hot path while producing
  // an identical count.
  const backlinks = useMemo(() => {
    if (!note) return 0
    return backlinksForNote(notes as NoteMeta[], note).length
  }, [note?.path, notes])

  const commitShort = appInfo.commit ? appInfo.commit.slice(0, 7) : ''
  const versionLabel = `v${appInfo.version}${commitShort ? ` · ${commitShort}` : ''}`

  // The target of the link the mouse is over (browser-style), shown on the left.
  const hoveredLink = useHoveredLinkStore((s) => s.href)

  return (
    <div
      className="flex h-8 shrink-0 items-center justify-between gap-5 px-6 text-xs text-ink-500"
      style={{ borderTop: '1px solid var(--glass-stroke)' }}
    >
      <div className="flex shrink-0 items-center gap-3">
        {vimStatus && (
          <span
            className="rounded px-1.5 font-mono text-2xs font-semibold tracking-wide"
            style={{
              color: `rgb(var(${VIM_KIND_VAR[vimStatus.kind]}))`,
              backgroundColor: `rgb(var(${VIM_KIND_VAR[vimStatus.kind]}) / 0.14)`
            }}
          >
            {vimStatus.label}
          </span>
        )}
        <button
          type="button"
          title={
            appInfo.commit
              ? `${appInfo.productName} ${versionLabel}\n${appInfo.commit}`
              : versionLabel
          }
          onClick={() => copyText(appInfo.commit || appInfo.version)}
          className="cursor-pointer truncate font-mono text-2xs text-ink-400 transition-colors hover:text-ink-600"
        >
          {versionLabel}
        </button>
      </div>
      {/* Target of the hovered link (browser-style), between app context and stats. */}
      <span
        className="min-w-0 flex-1 truncate font-mono text-ink-400"
        title={hoveredLink ?? undefined}
      >
        {hoveredLink}
      </span>
      {note && (
        <div className="flex shrink-0 items-center gap-5">
          <Stat>
            {backlinks} {backlinks === 1 ? 'backlink' : 'backlinks'}
          </Stat>
          <Stat>
            {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
          </Stat>
          <Stat>{characters.toLocaleString()} characters</Stat>
          <Stat>{minutes} min read</Stat>
        </div>
      )}
    </div>
  )
}

function Stat({ children }: { children: React.ReactNode }): JSX.Element {
  return <span className="tabular-nums">{children}</span>
}
