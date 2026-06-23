import { defaultKeymap } from '@codemirror/commands'
import type { EditorView, KeyBinding } from '@codemirror/view'
import { Vim, getCM } from '@replit/codemirror-vim'

/**
 * macOS-only Vim keymap conflict (`Ctrl-d` deletes instead of half-page-down).
 *
 * `@codemirror/commands`' `defaultKeymap` folds in the emacs-style control
 * chords as **mac-only** bindings (each entry's `mac` field). On macOS that
 * makes the editor bind, among others:
 *
 *   Ctrl-d → deleteCharForward     Ctrl-a → cursorLineStart
 *   Ctrl-e → cursorLineEnd         Ctrl-f → cursorCharRight
 *   Ctrl-b → cursorCharLeft        Ctrl-v → cursorPageDown   …
 *
 * These collide with Vim's own normal/visual-mode chords (`<C-d>` half-page
 * down, `<C-a>` increment, `<C-v>` visual-block, `<C-f>`/`<C-b>` page, …).
 * Because the keymap's key handler runs at higher precedence than the Vim
 * plugin's, the emacs action wins — so in Vim mode on macOS `Ctrl-d` deletes a
 * character instead of scrolling. (Linux/Windows are unaffected: these bindings
 * are mac-only. `Ctrl-u`, which has no emacs binding, already worked — hence the
 * up/down asymmetry users notice.)
 *
 * The fix is to drop these chords from the editor keymap while Vim mode is on,
 * so Vim receives them and handles them natively. When Vim is off we keep them —
 * they're standard macOS text-editing keys.
 */
const MAC_EMACS_CHORDS = new Set([
  'Ctrl-b',
  'Ctrl-f',
  'Ctrl-p',
  'Ctrl-n',
  'Ctrl-a',
  'Ctrl-e',
  'Ctrl-d',
  'Ctrl-h',
  'Ctrl-k',
  'Ctrl-Alt-h',
  'Ctrl-o',
  'Ctrl-t',
  'Ctrl-v'
])

const isMacEmacsChord = (binding: KeyBinding): boolean =>
  typeof binding.mac === 'string' && MAC_EMACS_CHORDS.has(binding.mac)

/** `defaultKeymap` with the macOS emacs-style control chords removed. */
const defaultKeymapWithoutMacEmacs: readonly KeyBinding[] = defaultKeymap.filter(
  (binding) => !isMacEmacsChord(binding)
)

/**
 * In Vim **visual** mode the arrow keys must extend the selection just like
 * `h`/`j`/`k`/`l` — not collapse it. CodeMirror's `defaultKeymap` binds the
 * arrows to `cursorLine*`/`cursorChar*`, and (per the note above) that keymap
 * runs at higher precedence than the Vim plugin's key handler, so without this
 * the arrows drop a bare cursor and fall out of visual mode (whereas `hjkl`,
 * which the default keymap leaves alone, work). We intercept the four arrows
 * *before* the default arrow bindings and, only while a visual mode is active,
 * forward them to Vim (which maps `<Up>/<Down>/<Left>/<Right>` → `k/j/h/l`).
 *
 * Returning `false` in every other case is deliberate and important: in normal
 * mode the default arrows already move the cursor as expected, and in **insert**
 * mode Vim ignores arrows entirely (its bindings are context-gated), so letting
 * the default keymap handle them keeps cursor movement working there.
 */
function forwardArrowToVisualVim(vimKey: string): (view: EditorView) => boolean {
  return (view) => {
    const cm = getCM(view)
    const vim = (cm?.state as { vim?: { visualMode?: boolean; insertMode?: boolean } } | undefined)
      ?.vim
    if (!cm || !vim?.visualMode || vim.insertMode) return false
    Vim.handleKey(cm, vimKey, 'user')
    return true
  }
}

const visualArrowKeymap: readonly KeyBinding[] = [
  { key: 'ArrowDown', run: forwardArrowToVisualVim('<Down>') },
  { key: 'ArrowUp', run: forwardArrowToVisualVim('<Up>') },
  { key: 'ArrowLeft', run: forwardArrowToVisualVim('<Left>') },
  { key: 'ArrowRight', run: forwardArrowToVisualVim('<Right>') }
]

/**
 * CodeMirror's `defaultKeymap`, made Vim-aware: in Vim mode the arrow keys are
 * routed to Vim while in visual mode (so they extend the selection), and the
 * macOS emacs-style control chords are stripped so Vim's `<C-d>`/`<C-a>`/… work.
 * With Vim off the full keymap (including those chords) is used unchanged.
 */
export function vimAwareDefaultKeymap(vimMode: boolean): readonly KeyBinding[] {
  return vimMode ? [...visualArrowKeymap, ...defaultKeymapWithoutMacEmacs] : defaultKeymap
}
