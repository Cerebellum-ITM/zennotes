// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Vim } from '@replit/codemirror-vim'
import { setVimYankClipboardEnabled, setupVimYankClipboard } from './cm-vim-yank-clipboard'

interface Controller {
  pushText: (name: string, operator: string, text: string, linewise?: boolean, blockwise?: boolean) => void
}

// The yank operator drives `getRegisterController().pushText(name, 'yank', …)`
// (verified against the library). We drive that method directly so the test
// stays free of a real editor (jsdom can't measure layout).
function pushText(operator: string, text: string): void {
  const controller = Vim.getRegisterController() as unknown as Controller
  controller.pushText('"', operator, text, false, false)
}

describe('vim yank → clipboard', () => {
  let writeText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    writeText = vi.fn()
    ;(navigator as unknown as { clipboard: { writeText: typeof writeText } }).clipboard = { writeText }
    setupVimYankClipboard()
    setVimYankClipboardEnabled(true)
  })

  afterEach(() => {
    setVimYankClipboardEnabled(true)
    vi.restoreAllMocks()
  })

  it('copies the yanked text to the system clipboard', () => {
    pushText('yank', 'hello')
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('does NOT copy on delete or change', () => {
    pushText('delete', 'gone')
    pushText('change', 'swapped')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('ignores empty yanks', () => {
    pushText('yank', '')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('does nothing when disabled', () => {
    setVimYankClipboardEnabled(false)
    pushText('yank', 'hello')
    expect(writeText).not.toHaveBeenCalled()
  })
})
