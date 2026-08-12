// @vitest-environment jsdom
/**
 * FORK INVARIANT — the reference pane survives browsing, and only a real
 * deletion closes it.
 *
 * The pane used to flicker: `refreshNotes` decided `pinnedStillExists` against
 * the transient note list, so a lookup miss cleared `pinnedRefPath` (closing the
 * pane) and the next refresh re-pinned it. Fixed in `8853c0e` / `5f7191e` by
 * making `refreshNotes` keep both pins as-is and leaving removal to the events
 * that actually know a file is gone. Upstream's own #384 is the same shape one
 * layer up (never close every tab on a refresh).
 *
 * In the v2.24.0 sync upstream lifted that unlink handling into
 * `closeUnlinkedNote`, reused after a change-feed gap; this fork's
 * `lastActiveRef` cleanup moved inside it, so the guarantee now covers the
 * reconnect path too.
 *
 * If this test disappears, the next sync can quietly reintroduce the auto-unpin
 * in `refreshNotes` and bring the flicker back. See §5 (v2.13.2, v2.24.0).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const NOTE = 'inbox/Referenced.md'
const OTHER = 'inbox/Other.md'

function makeNote(path: string) {
  const title = path.split('/').pop()?.replace(/\.md$/i, '') ?? 'Note'
  return {
    path,
    title,
    folder: 'inbox' as const,
    siblingOrder: 0,
    createdAt: 0,
    updatedAt: 1,
    size: 0,
    tags: [],
    wikilinks: [],
    assetEmbeds: [],
    body: ''
  }
}

/** Only the surface `refreshNotes` / `applyChange` touch in this test. */
function installZen(notes: ReturnType<typeof makeNote>[]): void {
  Object.defineProperty(window, 'zen', {
    configurable: true,
    value: {
      listNotes: vi.fn().mockResolvedValue(notes),
      listFolders: vi.fn().mockResolvedValue([]),
      listAssets: vi.fn().mockResolvedValue([]),
      hasAssetsDir: vi.fn().mockResolvedValue(false),
      listLocalVaults: vi.fn().mockResolvedValue([]),
      getVaultSettings: vi.fn().mockResolvedValue({}),
      getRemoteWorkspaceInfo: vi.fn().mockResolvedValue(null),
      readNote: vi.fn().mockResolvedValue(makeNote(NOTE)),
      scanTasks: vi.fn().mockResolvedValue([]),
      scanTasksForPath: vi.fn().mockResolvedValue([]),
      getCapabilities: vi.fn().mockReturnValue({
        supportsUpdater: false,
        supportsNativeMenus: false,
        supportsFloatingWindows: false,
        supportsLocalFilesystemPickers: true,
        supportsRemoteWorkspace: false,
        supportsCliInstall: false,
        supportsCustomTemplates: false
      })
    }
  })
}

async function loadStore() {
  vi.resetModules()
  localStorage.clear()
  return await import('../store')
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.resetModules()
})

describe('fork invariant: sticky reference pane', () => {
  it('keeps both pins when a refresh cannot see the referenced note', async () => {
    // The note list is transient during a refresh; a miss here must NOT be read
    // as "the file is gone".
    installZen([makeNote(OTHER)])
    const { useStore } = await loadStore()

    useStore.setState({
      pinnedRefPath: NOTE,
      lastActiveRef: { path: NOTE, kind: 'note', fragment: null }
    })

    await useStore.getState().refreshNotes()

    expect(
      useStore.getState().pinnedRefPath,
      'refreshNotes must never clear pinnedRefPath — that auto-unpin was the ' +
        'reference-pane flicker fixed in 8853c0e. Only a real deletion clears it.'
    ).toBe(NOTE)
    expect(
      useStore.getState().lastActiveRef?.path,
      'refreshNotes must never clear lastActiveRef (the sticky reference, 5f7191e).'
    ).toBe(NOTE)
  })

  it('clears both pins when the referenced note is actually deleted', async () => {
    installZen([makeNote(NOTE), makeNote(OTHER)])
    const { useStore } = await loadStore()

    // `applyChange` only reacts to an unlink for a path that is open somewhere
    // (`store.ts`: `if (!open) return`), so the note has to be in a pane for
    // `closeUnlinkedNote` — where this fork's pin cleanup lives — to run.
    await useStore.getState().refreshNotes()
    await useStore.getState().openNoteInPane(useStore.getState().activePaneId, NOTE)

    useStore.setState({
      pinnedRefPath: NOTE,
      lastActiveRef: { path: NOTE, kind: 'note', fragment: null }
    })

    await useStore.getState().applyChange({
      kind: 'unlink',
      path: NOTE,
      folder: 'inbox',
      scope: 'content'
    })

    expect(
      useStore.getState().pinnedRefPath,
      'a real unlink must drop the global pin'
    ).toBeNull()
    expect(
      useStore.getState().lastActiveRef,
      'a real unlink must drop the sticky reference too — this cleanup lives ' +
        'inside closeUnlinkedNote since v2.24.0, so it also covers the resync path'
    ).toBeNull()
  })

  it('leaves a pin on a different note alone when one note is deleted', async () => {
    installZen([makeNote(NOTE), makeNote(OTHER)])
    const { useStore } = await loadStore()

    await useStore.getState().refreshNotes()
    await useStore.getState().openNoteInPane(useStore.getState().activePaneId, NOTE)

    useStore.setState({
      pinnedRefPath: OTHER,
      lastActiveRef: { path: OTHER, kind: 'note', fragment: null }
    })

    await useStore.getState().applyChange({
      kind: 'unlink',
      path: NOTE,
      folder: 'inbox',
      scope: 'content'
    })

    expect(useStore.getState().pinnedRefPath).toBe(OTHER)
    expect(useStore.getState().lastActiveRef?.path).toBe(OTHER)
  })
})
