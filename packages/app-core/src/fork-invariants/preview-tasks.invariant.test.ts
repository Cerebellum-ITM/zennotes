// @vitest-environment jsdom
/**
 * FORK INVARIANT — Preview's task click index counts every task line, and this
 * fork's language icons still reach fenced-block headers.
 *
 * Two things share the same `useEffect` over the rendered stage, one from each
 * side of the fork:
 *
 *   - Upstream (#512): the index a click writes back with must count EVERY task
 *     line, including the states drawn without a checkbox (`[/]`, `[-]`, `[>]`).
 *     Numbering only the checkboxes made the index drift by one per such line,
 *     so in a note opening with a cancelled task, clicking the first real
 *     checkbox toggled the cancelled line instead.
 *   - This fork: a language icon is prepended to each `.zen-code-block-header`
 *     so fenced blocks match the editor's inline icons.
 *
 * The v2.24.0 merge put them in conflict; the resolution adopted upstream's
 * rewritten loop and kept our icon pass. Testing them together is the point —
 * either one can be dropped while the other keeps working.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  // Unknown keys answer with a no-op fn, so Preview's ~24 selectors resolve
  // without enumerating every one of them here.
  const state = new Proxy(
    {
      mathRenderer: 'katex',
      looseMathDelimiters: false,
      vault: { root: '/tmp/zennotes-test-vault', name: 'Test Vault' },
      notes: [],
      folders: [],
      customIcons: [],
      assetFiles: [],
      customCodeLanguagesRevision: 0,
      vaultSettings: {
        primaryNotesLocation: 'inbox',
        folderIcons: {},
        iconRules: [],
        langIcons: {},
        enabledHistoryPaths: []
      },
      previewSmoothScroll: false,
      completedTaskStyle: 'none',
      codeShowToolbar: true,
      codeLineNumbers: false,
      codeWrapLines: false,
      langIcons: {},
      noteRefs: {},
      pinnedRefVisible: false,
      zenMode: false
    } as Record<string, unknown>,
    {
      get(target, property: string) {
        if (property in target) return target[property]
        return vi.fn()
      }
    }
  )
  return { state }
})

vi.mock('../store', () => ({
  useStore: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state)
}))

// Theme resolution is not what this invariant is about, and the real hook pulls
// in custom themes, overrides and matchMedia.
vi.mock('../lib/use-diagram-theme-mode', () => ({
  useDiagramTheme: () => ({ key: 'default-light', mode: 'light' })
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  // jsdom ships no matchMedia; the diagram-theme hook reads it on mount.
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      })
    })
  }
  // Preview asks the bridge whether it runs on desktop (asset context menus).
  Object.defineProperty(window, 'zen', {
    configurable: true,
    value: {
      getAppInfo: () => ({ runtime: 'web', version: '0.0.0' }),
      getCapabilities: () => ({ supportsLocalFilesystemPickers: false }),
      readNote: vi.fn().mockResolvedValue({ body: '' }),
      listAssets: vi.fn().mockResolvedValue([])
    }
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

/**
 * Opens with a cancelled task on purpose: that is the exact shape that used to
 * make the first real checkbox toggle the wrong line.
 */
const MARKDOWN = [
  '# Tasks',
  '',
  '- [-] cancelled, no checkbox of its own',
  '- [ ] FIRST real task',
  '- [/] in progress, no checkbox of its own',
  '- [ ] SECOND real task',
  '- [x] already done',
  '',
  '```python',
  'def check():',
  '    return "code highlight"',
  '```',
  ''
].join('\n')

async function renderPreview(markdown: string): Promise<void> {
  const { Preview } = await import('../components/Preview')
  await act(async () => {
    root.render(createElement(Preview, { markdown, notePath: 'inbox/Tasks.md' }))
  })
  // The stage is populated in an effect after the async markdown render.
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  })
}

describe('fork invariant: Preview tasks and language icons', () => {
  it('numbers checkboxes by task line, counting the states without a checkbox', async () => {
    await renderPreview(MARKDOWN)

    const items = Array.from(container.querySelectorAll('li.task-list-item'))
    expect(items.length, 'all five task lines should render as task items').toBe(5)

    const indexOfTextedTask = (needle: string): string | undefined => {
      const li = items.find((item) => item.textContent?.includes(needle))
      const input = li?.querySelector<HTMLInputElement>('input[type="checkbox"]')
      return input?.dataset.taskIndex
    }

    // Line order: 0 cancelled, 1 FIRST, 2 in-progress, 3 SECOND, 4 done.
    expect(
      indexOfTextedTask('FIRST real task'),
      'The first real checkbox must carry the index of ITS line (1), not of the ' +
        'first checkbox (0). Counting only checkboxes makes a click toggle the ' +
        'cancelled line above it (#512).'
    ).toBe('1')
    expect(
      indexOfTextedTask('SECOND real task'),
      'The second real checkbox sits on line 3 once the cancelled and ' +
        'in-progress lines are counted.'
    ).toBe('3')
  })

  it('gives the states without a checkbox no clickable input', async () => {
    await renderPreview(MARKDOWN)

    const items = Array.from(container.querySelectorAll('li.task-list-item'))
    const cancelled = items.find((item) => item.textContent?.includes('cancelled'))
    const inProgress = items.find((item) => item.textContent?.includes('in progress'))

    expect(cancelled?.querySelector('input[type="checkbox"]')).toBeNull()
    expect(inProgress?.querySelector('input[type="checkbox"]')).toBeNull()
  })

  it("keeps this fork's language icon on the fenced block header", async () => {
    await renderPreview(MARKDOWN)

    const block = container.querySelector('.zen-code-block')
    expect(block, 'the fenced block should render as a zen code block').toBeTruthy()

    expect(
      block?.querySelector('.zen-code-block-icon'),
      'The language icon pass shares its effect with upstream’s task loop; ' +
        'losing it means a merge dropped this fork’s icons from code block headers.'
    ).toBeTruthy()
  })
})
