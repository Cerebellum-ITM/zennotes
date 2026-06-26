// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

// A standalone Markdown link to a local `.html` attachment must render as the
// same compact "open as reference" chip the editor shows (parity), not a bare
// link. Inline html links (mixed with other text) stay plain.

function installZen(): void {
  Object.defineProperty(window, 'zen', {
    configurable: true,
    value: {
      getCapabilities: vi.fn().mockReturnValue({
        supportsUpdater: false,
        supportsNativeMenus: false,
        supportsFloatingWindows: false,
        supportsLocalFilesystemPickers: true,
        supportsRemoteWorkspace: false,
        supportsCliInstall: false,
        supportsCustomTemplates: false
      }),
      resolveLocalAssetUrl: vi.fn(
        (_root: string, _note: string, href: string) => `zen-asset://v/${href}`
      ),
      resolveVaultAssetUrl: vi.fn((_root: string, rel: string) => `zen-asset://v/${rel}`)
    }
  })
}

async function load() {
  vi.resetModules()
  localStorage.clear()
  installZen()
  const { useStore } = await import('../store')
  const { enhanceLocalAssetNodes } = await import('./local-assets')
  return { useStore, enhanceLocalAssetNodes }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('enhanceLocalAssetNodes — HTML reference chip (preview/editor parity)', () => {
  it('replaces a standalone .html link with the compact reference chip', async () => {
    const { useStore, enhanceLocalAssetNodes } = await load()
    useStore.setState({ assetFiles: [{ path: 'docs/cancelacion.html' }] as never })

    const root = document.createElement('div')
    root.innerHTML = '<p><a href="cancelacion.html">Documentación técnica</a></p>'

    const opened: string[] = []
    enhanceLocalAssetNodes(root, {
      vaultRoot: '/v',
      notePath: 'docs/note.md',
      onOpenAsset: (p) => opened.push(p)
    })

    // The <p> is gone, replaced by the chip figure.
    expect(root.querySelector('p')).toBeNull()
    const chip = root.querySelector<HTMLElement>('figure.local-asset-pinned-ref')
    expect(chip).not.toBeNull()
    expect(chip?.dataset.localAssetKind).toBe('html')
    expect(chip?.querySelector('.local-asset-pinned-ref-icon')?.textContent).toBe('↗')
    expect(chip?.querySelector('.local-asset-pinned-ref-text')?.textContent).toBe(
      'Documentación técnica'
    )
    expect(chip?.querySelector('.local-asset-pinned-ref-badge')?.textContent).toBe(
      'open as reference'
    )

    // Clicking opens the resolved asset in the reference pane.
    chip
      ?.querySelector<HTMLButtonElement>('.local-asset-pinned-ref-button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(opened).toEqual(['docs/cancelacion.html'])
  })

  it('leaves an inline .html link (mixed with text) as a plain anchor', async () => {
    const { useStore, enhanceLocalAssetNodes } = await load()
    useStore.setState({ assetFiles: [{ path: 'docs/cancelacion.html' }] as never })

    const root = document.createElement('div')
    root.innerHTML = '<p>see <a href="cancelacion.html">the doc</a> for details</p>'

    enhanceLocalAssetNodes(root, { vaultRoot: '/v', notePath: 'docs/note.md' })

    expect(root.querySelector('figure.local-asset-pinned-ref')).toBeNull()
    const anchor = root.querySelector<HTMLAnchorElement>('a')
    expect(anchor).not.toBeNull()
    // Still tagged as an html asset (so the context menu / open handler work).
    expect(anchor?.dataset.localAssetKind).toBe('html')
  })
})
