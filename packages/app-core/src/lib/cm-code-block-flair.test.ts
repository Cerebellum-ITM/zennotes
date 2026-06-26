// @vitest-environment jsdom

// The Edit-pane code-block header gets a caret-safe actions widget (Fold · Copy
// · LANG). These tests verify it renders into the header (not as an inline
// content widget on the caret line), folds via CodeMirror's native codeFolding,
// and copies the block body through the clipboard bridge.

import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { codeFolding, foldedRanges, forceParsing } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { codeBlockFlairPlugin } from './cm-code-block-flair'

const DOC = ['# Title', '', '```js', 'const x = 1', 'const y = 2', '```', ''].join('\n')

function mountEditor(doc = DOC): EditorView {
  const parent = document.createElement('div')
  document.body.append(parent)
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      // Caret on the title line → the code block is inactive (header shown).
      selection: { anchor: 0 },
      extensions: [
        markdown({ base: markdownLanguage }),
        codeFolding(),
        codeBlockFlairPlugin
      ]
    })
  })
  forceParsing(view, doc.length, 5000)
  // A no-op edit nudges the viewport-driven plugin to emit.
  view.dispatch({ changes: { from: doc.length, insert: ' ' } })
  view.dispatch({ changes: { from: doc.length, to: doc.length + 1 } })
  return view
}

describe('code-block flair header actions', () => {
  let view: EditorView

  afterEach(() => {
    view?.destroy()
    vi.restoreAllMocks()
  })

  it('renders the Fold · Copy · LANG cluster in the header', () => {
    view = mountEditor()
    const actions = view.dom.querySelector('.cm-code-actions')
    expect(actions).not.toBeNull()
    expect(actions?.querySelector('.zen-code-fold-button')).not.toBeNull()
    expect(actions?.querySelector('.zen-code-copy-button')).not.toBeNull()
    // LANG label is the last child (far right), matching the preview order.
    const label = actions?.querySelector('.zen-code-lang-label')
    expect(label?.textContent).toBe('JS')
    expect(actions?.lastElementChild).toBe(label)
  })

  it('toggles a native fold over the block body when Fold is clicked', () => {
    view = mountEditor()
    const fold = view.dom.querySelector<HTMLButtonElement>('.zen-code-fold-button')
    expect(fold).not.toBeNull()

    const countFolds = (): number => {
      let n = 0
      foldedRanges(view.state).between(0, view.state.doc.length, () => {
        n += 1
      })
      return n
    }

    expect(countFolds()).toBe(0)
    fold?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(countFolds()).toBe(1)
    // Re-render reflects the folded state on the button (drives the chevron flip).
    expect(
      view.dom
        .querySelector('.zen-code-fold-button')
        ?.getAttribute('data-code-folded')
    ).toBe('true')

    view.dom
      .querySelector<HTMLButtonElement>('.zen-code-fold-button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(countFolds()).toBe(0)
  })

  it('copies the block body (without the fences) via the clipboard bridge', () => {
    const writes: string[] = []
    ;(window as unknown as { zen?: unknown }).zen = {
      clipboardWriteText: (value: string) => writes.push(value)
    }
    view = mountEditor()
    const copy = view.dom.querySelector<HTMLButtonElement>('.zen-code-copy-button')
    copy?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(writes).toEqual(['const x = 1\nconst y = 2'])
    expect(copy?.querySelector('.zen-code-btn-label')?.textContent).toBe('Copied')
    delete (window as unknown as { zen?: unknown }).zen
  })
})
