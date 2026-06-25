import { parseHighlightLinesAttr } from './code-fence-meta'

const CODE_BLOCK_CLASS = 'zen-code-block'
const CODE_BLOCK_HEADER_CLASS = 'zen-code-block-header'
const CODE_BLOCK_HEADER_LEFT_CLASS = 'zen-code-block-header-left'
const CODE_BLOCK_HEADER_RIGHT_CLASS = 'zen-code-block-header-right'
const CODE_BLOCK_LANG_LABEL_CLASS = 'zen-code-lang-label'
const CODE_BLOCK_TITLE_CLASS = 'zen-code-block-title'
const CODE_LINE_HL_CLASS = 'zen-code-line-hl'
const CODE_BLOCK_TOOLBAR_CLASS = 'zen-code-block-toolbar'
const CODE_BLOCK_SUMMARY_CLASS = 'zen-code-block-summary'
const CODE_LINE_CLASS = 'zen-code-line'
const CODE_BLOCK_FOLDED_ATTR = 'data-code-folded'
const CODE_BLOCK_STORAGE_KEY_ATTR = 'data-code-fold-storage-key'
const CODE_BLOCK_INDEX_ATTR = 'data-code-block-index'
const CODE_BLOCK_FOLDS_STORAGE_PREFIX = 'zen:code-block-folds:v1'

export const CODE_COPY_BUTTON_SELECTOR = '.zen-code-copy-button'
export const CODE_FOLD_BUTTON_SELECTOR = '.zen-code-fold-button'

const resetTimers = new WeakMap<HTMLButtonElement, number>()

interface CodeBlockEnhanceOptions {
  notePath?: string | null
}

export function enhanceCodeBlockCopy(
  root: ParentNode,
  options: CodeBlockEnhanceOptions = {}
): void {
  const blocks = Array.from(root.querySelectorAll<HTMLPreElement>('pre'))
  const storageKey = options.notePath ? codeBlockFoldStorageKey(options.notePath) : null
  let blockIndex = 0

  for (const pre of blocks) {
    const code = pre.firstElementChild
    if (!(code instanceof HTMLElement) || code.tagName.toLowerCase() !== 'code') {
      continue
    }

    const index = blockIndex
    blockIndex += 1
    const wrapper = ensureCodeBlockWrapper(pre)
    wrapper.setAttribute(CODE_BLOCK_INDEX_ATTR, String(index))
    if (storageKey) wrapper.setAttribute(CODE_BLOCK_STORAGE_KEY_ATTR, storageKey)
    else wrapper.removeAttribute(CODE_BLOCK_STORAGE_KEY_ATTR)

    ensureCodeBlockHeader(wrapper, pre, code)
    wrapCodeBlockLines(code)
    ensureCodeBlockSummary(wrapper, code)

    // Lift the per-block line-number override (`ln:true`/`ln:false`) onto the
    // wrapper so the stylesheet can gate the gutter at the block level.
    const lnOverride = code.getAttribute('data-code-linenums')
    if (lnOverride === 'true' || lnOverride === 'false') {
      wrapper.setAttribute('data-code-linenums', lnOverride)
    } else {
      wrapper.removeAttribute('data-code-linenums')
    }

    const persisted = storageKey ? readPersistedFoldState(storageKey, index) : null
    applyCodeBlockFoldState(wrapper, persisted ?? false)
  }
}

export function getCodeBlockTextForCopyButton(button: Element): string | null {
  const block = button.closest(`.${CODE_BLOCK_CLASS}`)
  const code = block?.querySelector<HTMLElement>('pre > code')
  return code?.textContent ?? null
}

export function copyCodeBlockToClipboard(button: HTMLButtonElement): boolean {
  const text = getCodeBlockTextForCopyButton(button)
  if (text == null) return false

  const copied = writeClipboardText(text)
  setCopyButtonFeedback(button, copied ? 'copied' : 'failed')
  return copied
}

export function toggleCodeBlockFold(button: HTMLButtonElement): boolean {
  const block = button.closest<HTMLElement>(`.${CODE_BLOCK_CLASS}`)
  if (!block) return false

  const folded = block.getAttribute(CODE_BLOCK_FOLDED_ATTR) !== 'true'
  applyCodeBlockFoldState(block, folded)
  persistCodeBlockFoldState(block, folded)
  return true
}

function ensureCodeBlockWrapper(pre: HTMLPreElement): HTMLElement {
  const parent = pre.parentElement
  if (parent?.classList.contains(CODE_BLOCK_CLASS)) return parent

  const wrapper = pre.ownerDocument.createElement('div')
  wrapper.className = CODE_BLOCK_CLASS
  pre.replaceWith(wrapper)
  wrapper.append(pre)
  return wrapper
}

function ensureCodeBlockHeader(
  wrapper: HTMLElement,
  pre: HTMLPreElement,
  code: HTMLElement
): void {
  let header = wrapper.querySelector<HTMLElement>(`.${CODE_BLOCK_HEADER_CLASS}`)
  if (!header) {
    header = pre.ownerDocument.createElement('div')
    header.className = CODE_BLOCK_HEADER_CLASS

    // Two flex groups: meta on the left (icon + title), language label + toolbar
    // on the right — so the language label sits on the RIGHT like the editor's,
    // not wedged next to the title on the left.
    const left = pre.ownerDocument.createElement('div')
    left.className = CODE_BLOCK_HEADER_LEFT_CLASS
    const right = pre.ownerDocument.createElement('div')
    right.className = CODE_BLOCK_HEADER_RIGHT_CLASS

    const label = pre.ownerDocument.createElement('span')
    label.className = CODE_BLOCK_LANG_LABEL_CLASS

    const toolbar = pre.ownerDocument.createElement('div')
    toolbar.className = CODE_BLOCK_TOOLBAR_CLASS

    const foldButton = pre.ownerDocument.createElement('button')
    foldButton.type = 'button'
    foldButton.className = CODE_FOLD_BUTTON_SELECTOR.slice(1)
    foldButton.setAttribute('aria-label', 'Collapse code block')
    foldButton.setAttribute('aria-expanded', 'true')
    foldButton.title = 'Collapse code block'
    foldButton.textContent = 'Fold'

    const copyButton = pre.ownerDocument.createElement('button')
    copyButton.type = 'button'
    copyButton.className = CODE_COPY_BUTTON_SELECTOR.slice(1)
    copyButton.setAttribute('aria-label', 'Copy code block')
    copyButton.title = 'Copy code block'
    copyButton.textContent = 'Copy'

    toolbar.append(foldButton, copyButton)
    right.append(label, toolbar)
    header.append(left, right)
    wrapper.insertBefore(header, pre)
  }

  const label = header.querySelector<HTMLElement>(`.${CODE_BLOCK_LANG_LABEL_CLASS}`)
  if (label) label.textContent = codeLanguageName(code)

  // Optional `title=…` from the fence meta, in the left group (after the icon).
  const left = header.querySelector<HTMLElement>(`.${CODE_BLOCK_HEADER_LEFT_CLASS}`)
  const title = code.getAttribute('data-code-title')?.trim() || ''
  let titleEl = header.querySelector<HTMLElement>(`.${CODE_BLOCK_TITLE_CLASS}`)
  if (title) {
    if (!titleEl) {
      titleEl = pre.ownerDocument.createElement('span')
      titleEl.className = CODE_BLOCK_TITLE_CLASS
      left?.append(titleEl)
    }
    titleEl.textContent = title
  } else {
    titleEl?.remove()
  }
}

/** Bare language token (e.g. `JS`) for the header label, `''` when unknown. */
function codeLanguageName(code: HTMLElement): string {
  const language = Array.from(code.classList)
    .find((className) => className.startsWith('language-'))
    ?.slice('language-'.length)
    .trim()
  return language ? language.toUpperCase() : ''
}

/** Wrap each source line in a `.zen-code-line` span so line numbers can be
 *  rendered (CSS counters) without changing the copied text. The exact
 *  `textContent` — including any single trailing newline — is preserved. */
function wrapCodeBlockLines(code: HTMLElement): void {
  if (code.querySelector(`.${CODE_LINE_CLASS}`)) return

  const html = code.innerHTML
  if (!html) return

  const highlighted = parseHighlightLinesAttr(code.getAttribute('data-code-hl-lines'))

  // Preserve a single trailing newline as a literal text node so it stays in
  // textContent (copy) without rendering an extra numbered blank line.
  const hasTrailingNewline = html.endsWith('\n')
  const body = hasTrailingNewline ? html.slice(0, -1) : html

  const lines = splitHighlightedLines(body)
  const wrapped = lines
    .map((line, i) => {
      const cls = highlighted.has(i + 1)
        ? `${CODE_LINE_CLASS} ${CODE_LINE_HL_CLASS}`
        : CODE_LINE_CLASS
      return `<span class="${cls}">${line}</span>`
    })
    .join('\n')
  code.innerHTML = wrapped + (hasTrailingNewline ? '\n' : '')
}

/** Split highlight.js output into per-line HTML, re-opening any spans that a
 *  multi-line token (string/comment) leaves open across the newline. */
function splitHighlightedLines(html: string): string[] {
  const lines: string[] = []
  const openTags: string[] = []
  let current = ''
  let i = 0

  while (i < html.length) {
    const ch = html[i]
    if (ch === '<') {
      const end = html.indexOf('>', i)
      if (end === -1) {
        current += html.slice(i)
        break
      }
      const tag = html.slice(i, end + 1)
      current += tag
      if (tag.startsWith('</')) openTags.pop()
      else if (!tag.endsWith('/>')) openTags.push(tag)
      i = end + 1
    } else if (ch === '\n') {
      current += '</span>'.repeat(openTags.length)
      lines.push(current)
      current = openTags.join('')
      i += 1
    } else {
      current += ch
      i += 1
    }
  }
  lines.push(current)
  return lines
}

function ensureCodeBlockSummary(wrapper: HTMLElement, code: HTMLElement): void {
  let summary = wrapper.querySelector<HTMLElement>(`.${CODE_BLOCK_SUMMARY_CLASS}`)
  if (!summary) {
    summary = code.ownerDocument.createElement('div')
    summary.className = CODE_BLOCK_SUMMARY_CLASS
    wrapper.insertBefore(summary, wrapper.querySelector('pre')?.nextSibling ?? null)
  }
  summary.textContent = summarizeCodeBlock(code)
}

function summarizeCodeBlock(code: HTMLElement): string {
  const lineCount = countCodeLines(code.textContent ?? '')
  const language = codeLanguageLabel(code)
  const noun = lineCount === 1 ? 'line' : 'lines'
  return `${language} folded (${lineCount} ${noun})`
}

function countCodeLines(text: string): number {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '')
  if (!normalized) return 0
  return normalized.split('\n').length
}

function codeLanguageLabel(code: HTMLElement): string {
  const classes = Array.from(code.classList)
  const language = classes
    .find((className) => className.startsWith('language-'))
    ?.slice('language-'.length)
    .trim()
  if (!language) return 'Code block'
  return `${language.toUpperCase()} code block`
}

function applyCodeBlockFoldState(block: HTMLElement, folded: boolean): void {
  block.setAttribute(CODE_BLOCK_FOLDED_ATTR, folded ? 'true' : 'false')

  const button = block.querySelector<HTMLButtonElement>(CODE_FOLD_BUTTON_SELECTOR)
  if (!button) return
  button.textContent = folded ? 'Expand' : 'Fold'
  button.setAttribute('aria-expanded', String(!folded))
  button.setAttribute('aria-label', folded ? 'Expand code block' : 'Collapse code block')
  button.title = folded ? 'Expand code block' : 'Collapse code block'
}

function persistCodeBlockFoldState(block: HTMLElement, folded: boolean): void {
  const storageKey = block.getAttribute(CODE_BLOCK_STORAGE_KEY_ATTR)
  const rawIndex = block.getAttribute(CODE_BLOCK_INDEX_ATTR)
  const index = rawIndex == null ? Number.NaN : Number.parseInt(rawIndex, 10)
  if (!storageKey || !Number.isFinite(index) || index < 0) return

  const next = readFoldMap(storageKey)
  if (folded) next[String(index)] = true
  else delete next[String(index)]

  try {
    if (Object.keys(next).length > 0) {
      window.localStorage.setItem(storageKey, JSON.stringify(next))
    } else {
      window.localStorage.removeItem(storageKey)
    }
  } catch {
    // Persistence is best-effort; folding should still work without storage.
  }
}

function readPersistedFoldState(storageKey: string, index: number): boolean | null {
  const value = readFoldMap(storageKey)[String(index)]
  return typeof value === 'boolean' ? value : null
}

function readFoldMap(storageKey: string): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, boolean] =>
          /^\d+$/.test(entry[0]) && typeof entry[1] === 'boolean'
      )
    )
  } catch {
    return {}
  }
}

function codeBlockFoldStorageKey(notePath: string): string {
  return `${CODE_BLOCK_FOLDS_STORAGE_PREFIX}:${encodeURIComponent(notePath)}`
}

function writeClipboardText(text: string): boolean {
  if (typeof window === 'undefined') return false

  try {
    const bridge = (window as Window & {
      zen?: { clipboardWriteText?: (value: string) => void }
    }).zen
    if (typeof bridge?.clipboardWriteText === 'function') {
      bridge.clipboardWriteText(text)
      return true
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    return false
  }

  return false
}

function setCopyButtonFeedback(
  button: HTMLButtonElement,
  state: 'copied' | 'failed'
): void {
  const previousTimer = resetTimers.get(button)
  if (previousTimer != null) window.clearTimeout(previousTimer)

  const copied = state === 'copied'
  button.dataset.copyState = state
  button.textContent = copied ? 'Copied' : 'Failed'
  button.setAttribute('aria-label', copied ? 'Copied code block' : 'Copy failed')
  button.title = copied ? 'Copied code block' : 'Copy failed'

  const resetTimer = window.setTimeout(() => {
    button.textContent = 'Copy'
    button.setAttribute('aria-label', 'Copy code block')
    button.title = 'Copy code block'
    delete button.dataset.copyState
    resetTimers.delete(button)
  }, 1400)
  resetTimers.set(button, resetTimer)
}
