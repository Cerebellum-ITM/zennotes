// Pure helpers for the editor status bar's Vim-mode badge.
//
// `@replit/codemirror-vim` raises a `vim-mode-change` event with payload
// `{ mode, subMode }` whenever the mode changes (see the package's adapter:
// mode ∈ normal | insert | visual | replace; subMode ∈ '' | linewise |
// blockwise, only meaningful for visual). We map that raw payload to a short
// uppercase label + a kind the component colors by. Keeping this pure makes it
// unit-testable without mounting CodeMirror.

export type VimStatusKind = 'normal' | 'insert' | 'visual' | 'replace'

export interface VimStatus {
  label: string
  kind: VimStatusKind
}

export interface VimModeChangePayload {
  mode?: string | null
  subMode?: string | null
}

/**
 * Map a `vim-mode-change` payload to a display status. Returns `null` for an
 * empty/unknown mode so the caller can hide the badge.
 */
export function formatVimMode(payload: VimModeChangePayload | null | undefined): VimStatus | null {
  const mode = payload?.mode
  switch (mode) {
    case 'normal':
      return { label: 'NORMAL', kind: 'normal' }
    case 'insert':
      return { label: 'INSERT', kind: 'insert' }
    case 'replace':
      return { label: 'REPLACE', kind: 'replace' }
    case 'visual': {
      const sub = payload?.subMode
      const label = sub === 'linewise' ? 'V-LINE' : sub === 'blockwise' ? 'V-BLOCK' : 'VISUAL'
      return { label, kind: 'visual' }
    }
    default:
      return null
  }
}

/** Shape of the relevant `cm.state.vim` flags we read for the initial mode. */
export interface VimStateFlags {
  insertMode?: boolean
  visualMode?: boolean
  visualLine?: boolean
  visualBlock?: boolean
}

/**
 * Derive the current mode from a Vim state object, so the badge shows the right
 * mode immediately on mount instead of waiting for the first `vim-mode-change`.
 * Replace mode isn't represented as a distinct flag (it rides on insertMode),
 * so it surfaces only once the live event fires — acceptable since the editor
 * always starts in normal mode.
 */
export function readVimStateMode(vim: VimStateFlags | null | undefined): VimStatus | null {
  if (!vim) return null
  if (vim.insertMode) return formatVimMode({ mode: 'insert' })
  if (vim.visualMode) {
    const subMode = vim.visualLine ? 'linewise' : vim.visualBlock ? 'blockwise' : ''
    return formatVimMode({ mode: 'visual', subMode })
  }
  return formatVimMode({ mode: 'normal' })
}
