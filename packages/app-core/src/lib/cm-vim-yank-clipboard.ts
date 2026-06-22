import { Vim } from '@replit/codemirror-vim'

/**
 * Mirror Vim yanks to the system clipboard.
 *
 * `@replit/codemirror-vim` only writes to the OS clipboard for the `+` register
 * (`"+y`); a plain `y` stays in Vim's internal register. The yank operator calls
 * `vimGlobalState.registerController.pushText(name, 'yank', text, …)` — the same
 * object `Vim.getRegisterController()` returns — so we wrap that method and copy
 * the text on yank. Vim's own register behavior is untouched (in-app `p` still
 * works); only `operator === 'yank'` is mirrored, never delete/change.
 */

interface RegisterController {
  pushText: (
    registerName: string,
    operator: string,
    text: string,
    linewise?: boolean,
    blockwise?: boolean
  ) => void
}

let installed = false
let enabled = true

function writeSystemClipboard(text: string): void {
  if (typeof window === 'undefined') return
  try {
    const bridge = (window as Window & { zen?: { clipboardWriteText?: (v: string) => void } }).zen
    if (typeof bridge?.clipboardWriteText === 'function') {
      bridge.clipboardWriteText(text)
      return
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text)
    }
  } catch {
    /* clipboard may be unavailable or blocked */
  }
}

/** Install the yank→clipboard wrapper once (idempotent, per renderer). */
export function setupVimYankClipboard(): void {
  if (installed) return
  let controller: RegisterController | null = null
  try {
    controller = Vim.getRegisterController() as unknown as RegisterController
  } catch {
    return
  }
  if (!controller || typeof controller.pushText !== 'function') return

  const original = controller.pushText.bind(controller)
  controller.pushText = (registerName, operator, text, linewise, blockwise): void => {
    original(registerName, operator, text, linewise, blockwise)
    if (enabled && operator === 'yank' && typeof text === 'string' && text.length > 0) {
      writeSystemClipboard(text)
    }
  }
  installed = true
}

export function setVimYankClipboardEnabled(on: boolean): void {
  enabled = on
}
