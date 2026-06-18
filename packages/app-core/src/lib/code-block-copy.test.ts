// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  copyCodeBlockToClipboard,
  enhanceCodeBlockCopy,
  getCodeBlockTextForCopyButton,
  toggleCodeBlockFold
} from './code-block-copy'

type TestWindow = Omit<Window, 'zen'> & { zen?: Window['zen'] }

const getOptionalWindow = (): TestWindow => window as unknown as TestWindow

afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
  delete getOptionalWindow().zen
})

describe('code block controls enhancement', () => {
  it('wraps rendered code blocks with one accessible toolbar', () => {
    const root = document.createElement('article')
    root.innerHTML = '<pre><code>const answer = 42;\n</code></pre>'

    enhanceCodeBlockCopy(root)
    enhanceCodeBlockCopy(root)

    const buttons = root.querySelectorAll<HTMLButtonElement>('.zen-code-copy-button')
    const foldButtons = root.querySelectorAll<HTMLButtonElement>('.zen-code-fold-button')
    const code = root.querySelector<HTMLElement>('.zen-code-block pre > code')

    expect(buttons).toHaveLength(1)
    expect(foldButtons).toHaveLength(1)
    expect(buttons[0]?.type).toBe('button')
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Copy code block')
    expect(foldButtons[0]?.getAttribute('aria-expanded')).toBe('true')
    expect(code?.textContent).toBe('const answer = 42;\n')
    expect(getCodeBlockTextForCopyButton(buttons[0]!)).toBe('const answer = 42;\n')
  })

  it('copies the code text through the Zen clipboard bridge', () => {
    vi.useFakeTimers()
    const writeText = vi.fn()
    getOptionalWindow().zen = {
      clipboardWriteText: writeText
    } as Partial<Window['zen']> as Window['zen']

    const root = document.createElement('article')
    root.innerHTML = '<pre><code>console.log("hi")\n</code></pre>'
    enhanceCodeBlockCopy(root)
    const button = root.querySelector<HTMLButtonElement>('.zen-code-copy-button')!

    expect(copyCodeBlockToClipboard(button)).toBe(true)
    expect(writeText).toHaveBeenCalledWith('console.log("hi")\n')
    expect(button.textContent).toBe('Copied')
    expect(button.dataset.copyState).toBe('copied')

    vi.runOnlyPendingTimers()
    expect(button.textContent).toBe('Copy')
    expect(button.dataset.copyState).toBeUndefined()
  })

  it('persists folded code blocks by note path and block index', () => {
    const html = [
      '<pre><code class="language-ts">const answer = 42;\n</code></pre>',
      '<pre><code>console.log("open")\n</code></pre>'
    ].join('')
    const root = document.createElement('article')
    root.innerHTML = html

    enhanceCodeBlockCopy(root, { notePath: 'inbox/Code Copy.md' })

    const blocks = root.querySelectorAll<HTMLElement>('.zen-code-block')
    const firstFoldButton = blocks[0]?.querySelector<HTMLButtonElement>('.zen-code-fold-button')
    expect(firstFoldButton).toBeTruthy()
    expect(toggleCodeBlockFold(firstFoldButton!)).toBe(true)
    expect(blocks[0]?.getAttribute('data-code-folded')).toBe('true')
    expect(firstFoldButton?.textContent).toBe('Expand')
    expect(firstFoldButton?.getAttribute('aria-expanded')).toBe('false')

    const rerendered = document.createElement('article')
    rerendered.innerHTML = html

    enhanceCodeBlockCopy(rerendered, { notePath: 'inbox/Code Copy.md' })

    const nextBlocks = rerendered.querySelectorAll<HTMLElement>('.zen-code-block')
    expect(nextBlocks[0]?.getAttribute('data-code-folded')).toBe('true')
    expect(nextBlocks[1]?.getAttribute('data-code-folded')).toBe('false')
    expect(
      nextBlocks[0]?.querySelector<HTMLButtonElement>('.zen-code-fold-button')?.textContent
    ).toBe('Expand')
    expect(nextBlocks[0]?.querySelector<HTMLElement>('.zen-code-block-summary')?.textContent).toBe(
      'TS code block folded (1 line)'
    )

    const expandedButton = nextBlocks[0]?.querySelector<HTMLButtonElement>('.zen-code-fold-button')
    expect(toggleCodeBlockFold(expandedButton!)).toBe(true)

    const reopened = document.createElement('article')
    reopened.innerHTML = html
    enhanceCodeBlockCopy(reopened, { notePath: 'inbox/Code Copy.md' })
    expect(reopened.querySelector<HTMLElement>('.zen-code-block')?.getAttribute('data-code-folded')).toBe(
      'false'
    )
  })

  it('wraps source lines for numbering while preserving copied text', () => {
    const root = document.createElement('article')
    // Includes a highlight.js span that straddles a newline (multi-line token).
    root.innerHTML =
      '<pre><code class="language-ts">const a = 1;\n' +
      '<span class="hljs-comment">/* multi\nline */</span>\n</code></pre>'

    enhanceCodeBlockCopy(root)

    const code = root.querySelector<HTMLElement>('.zen-code-block pre > code')!
    const lines = code.querySelectorAll('.zen-code-line')
    // 3 source lines (`const`, `/* multi`, `line */`); the trailing newline does
    // not produce an extra numbered line.
    expect(lines).toHaveLength(3)
    // The multi-line comment span is re-opened on the continuation line.
    expect(code.querySelectorAll('.hljs-comment').length).toBe(2)
    // Copied text is byte-for-byte identical to the original, trailing \n included.
    expect(code.textContent).toBe('const a = 1;\n/* multi\nline */\n')
  })

  it('shows the language label in the header and is idempotent', () => {
    const root = document.createElement('article')
    root.innerHTML = '<pre><code class="language-python">print(1)\n</code></pre>'

    enhanceCodeBlockCopy(root)
    enhanceCodeBlockCopy(root)

    const labels = root.querySelectorAll<HTMLElement>('.zen-code-lang-label')
    expect(labels).toHaveLength(1)
    expect(labels[0]?.textContent).toBe('PYTHON')
  })
})
