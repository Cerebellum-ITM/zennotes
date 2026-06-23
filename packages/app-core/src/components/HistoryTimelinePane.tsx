/**
 * Right-side per-note version-history timeline. Lives inside EditorPane (like
 * OutlinePanel / ConnectionsPanel) so each pane shows history for its own note.
 *
 * Git lives in the desktop main process (see `vault-history.ts`); this panel
 * only talks to the bridge. Snapshots are listed newest-first as a vertical
 * commit timeline. Selecting a snapshot opens it read-only in the editor (the
 * `HistoryPreviewOverlay` "viewing" mode) rather than showing the diff in this
 * narrow panel. Restore is non-destructive — it brings back old content as a
 * new forward snapshot.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { HistorySnapshot, NoteContent } from '@shared/ipc'
import { useStore } from '../store'
import { usePanelResize } from '../lib/use-panel-resize'
import { PanelResizeHandle } from './PanelResizeHandle'
import { computeLineDiff, diffStats, type DiffStats } from '../lib/history-diff'
import { promptApp } from '../lib/prompt-requests'
import { confirmApp } from '../lib/confirm-requests'

function formatTimestamp(seconds: number): string {
  const d = new Date(seconds * 1000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

function StatsBadges({ stats }: { stats: DiffStats | undefined }): JSX.Element | null {
  if (!stats) return null
  const { added, modified, removed } = stats
  if (!added && !modified && !removed) return null
  return (
    <span className="flex shrink-0 items-center gap-1 font-mono text-2xs font-medium">
      {added > 0 && (
        <span className="rounded bg-success/15 px-1.5 py-0.5 text-success">+{added}</span>
      )}
      {modified > 0 && (
        <span className="rounded bg-warning/15 px-1.5 py-0.5 text-warning">~{modified}</span>
      )}
      {removed > 0 && (
        <span className="rounded bg-danger/15 px-1.5 py-0.5 text-danger">-{removed}</span>
      )}
    </span>
  )
}

/** A node on the vertical commit line: connecting rail + colored dot. */
function TimelineRail({
  isFirst,
  isLast,
  tone
}: {
  isFirst: boolean
  isLast: boolean
  tone: 'head' | 'viewing' | 'normal' | 'working'
}): JSX.Element {
  const dot =
    tone === 'head'
      ? 'border-accent bg-accent'
      : tone === 'viewing'
        ? 'border-accent bg-paper-50 ring-2 ring-accent/40'
        : tone === 'working'
          ? 'border-accent-soft bg-paper-50'
          : 'border-ink-400/60 bg-paper-50'
  return (
    <div className="relative flex w-7 shrink-0 justify-center">
      {/* connecting line (clipped at the ends of the list) */}
      <span
        aria-hidden
        className="absolute left-1/2 w-px -translate-x-1/2 bg-paper-300/80"
        style={{ top: isFirst ? '14px' : 0, bottom: isLast ? 'calc(100% - 14px)' : 0 }}
      />
      <span
        aria-hidden
        className={`absolute top-[10px] h-2.5 w-2.5 rounded-full border ${dot}`}
      />
    </div>
  )
}

export function HistoryTimelinePane({ note }: { note: NoteContent }): JSX.Element {
  const width = useStore((s) => s.panelWidths.history)
  const setPanelWidth = useStore((s) => s.setPanelWidth)
  const { startResize } = usePanelResize(width, (px) => setPanelWidth('history', px))
  const enabled = useStore((s) => s.isNoteHistoryEnabled(note.path))
  const enableNoteHistory = useStore((s) => s.enableNoteHistory)
  const disableNoteHistory = useStore((s) => s.disableNoteHistory)
  const takeHistorySnapshot = useStore((s) => s.takeHistorySnapshot)
  const restoreHistorySnapshot = useStore((s) => s.restoreHistorySnapshot)
  const historyPreview = useStore((s) => s.historyPreview)
  const setHistoryPreview = useStore((s) => s.setHistoryPreview)
  const viewingOid =
    historyPreview && historyPreview.path === note.path ? historyPreview.oid : null

  const [snapshots, setSnapshots] = useState<HistorySnapshot[]>([])
  const [workingDirty, setWorkingDirty] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [statsByOid, setStatsByOid] = useState<Record<string, DiffStats>>({})
  const contentCache = useRef<Map<string, string>>(new Map())

  const getContent = useCallback(
    async (oid: string): Promise<string> => {
      const cached = contentCache.current.get(oid)
      if (cached != null) return cached
      const text = await window.zen.getHistorySnapshotContent(note.path, oid)
      contentCache.current.set(oid, text)
      return text
    },
    [note.path]
  )

  const reload = useCallback(async () => {
    if (!enabled) {
      setSnapshots([])
      setWorkingDirty(false)
      return
    }
    setLoading(true)
    try {
      const [list, ws] = await Promise.all([
        window.zen.listHistorySnapshots(note.path),
        window.zen.getHistoryWorkingState(note.path)
      ])
      setSnapshots(list)
      setWorkingDirty(ws.dirty)
      const stats: Record<string, DiffStats> = {}
      for (let i = 0; i < list.length; i++) {
        const newText = await getContent(list[i].oid)
        const olderOid = list[i + 1]?.oid
        const oldText = olderOid ? await getContent(olderOid) : ''
        stats[list[i].oid] = diffStats(computeLineDiff(oldText, newText))
      }
      setStatsByOid(stats)
    } catch (err) {
      console.error('history reload failed', err)
    } finally {
      setLoading(false)
    }
  }, [enabled, note.path, getContent])

  // Reload (and leave any stale viewing mode) when the note changes, history is
  // toggled, or a snapshot/restore happens elsewhere.
  useEffect(() => {
    contentCache.current.clear()
    setNotice(null)
    if (historyPreview && historyPreview.path !== note.path) setHistoryPreview(null)
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload])

  useEffect(() => {
    const handler = (): void => void reload()
    window.addEventListener('zen:history-changed', handler)
    return () => window.removeEventListener('zen:history-changed', handler)
  }, [reload])

  const onSnapshot = useCallback(async () => {
    const message = await promptApp({
      title: 'Take snapshot',
      description: note.title,
      initialValue: '',
      okLabel: 'Snapshot'
    })
    if (message == null) return
    const snap = await takeHistorySnapshot(note.path, message.trim() || 'Snapshot')
    setNotice(snap ? null : 'No changes to snapshot.')
  }, [note.path, note.title, takeHistorySnapshot])

  const onRestore = useCallback(
    async (snap: HistorySnapshot) => {
      const ok = await confirmApp({
        title: 'Restore snapshot?',
        description: `Bring back the content from ${snap.shortOid} as a new snapshot. Nothing is lost — later snapshots stay in the history.`,
        confirmLabel: 'Restore'
      })
      if (!ok) return
      await restoreHistorySnapshot(note.path, snap.oid)
    },
    [note.path, restoreHistorySnapshot]
  )

  return (
    <section
      aria-label="History"
      style={{ width }}
      className="relative flex shrink-0 flex-col border-l border-paper-300/70 bg-paper-50/18"
    >
      <PanelResizeHandle onStart={startResize} />
      <div className="flex items-center justify-between gap-2 border-b border-paper-300/60 px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-ink-400">History</div>
        {enabled && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void onSnapshot()}
              className="rounded-md bg-accent px-2 py-1 text-2xs font-medium text-paper-50 hover:bg-accent-soft"
            >
              Take snapshot
            </button>
            <button
              type="button"
              onClick={() => void disableNoteHistory(note.path)}
              title="Stop tracking this note (keeps existing snapshots)"
              className="rounded-md border border-paper-300/60 px-2 py-1 text-2xs text-ink-500 hover:text-ink-900"
            >
              Disable
            </button>
          </div>
        )}
      </div>

      {!enabled ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-ink-600">
            Version history is off for this note. Enable it to take snapshots and restore earlier
            versions.
          </p>
          <button
            type="button"
            onClick={() => void enableNoteHistory(note.path)}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-paper-50 hover:bg-accent-soft"
          >
            Enable history for this note
          </button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {notice && (
            <div className="mx-3 my-1 rounded-md bg-paper-200/50 px-3 py-1.5 text-2xs text-ink-500">
              {notice}
            </div>
          )}

          {/* Working state — the live, unsnapshotted buffer. Selecting it leaves
              viewing mode (the editor already shows the current content). */}
          {workingDirty && (
            <button
              type="button"
              onClick={() => setHistoryPreview(null)}
              className={`flex w-full items-stretch gap-1 px-2 text-left ${
                viewingOid == null ? 'bg-accent/5' : 'hover:bg-paper-200/40'
              }`}
            >
              <TimelineRail isFirst isLast={false} tone="working" />
              <span className="min-w-0 flex-1 py-2 pr-2">
                <span className="block text-xs font-medium text-ink-900">Working state</span>
                <span className="block text-2xs text-ink-500">
                  Unsaved local changes{viewingOid == null ? ' · current' : ''}
                </span>
              </span>
            </button>
          )}

          {snapshots.length === 0 && !loading && (
            <div className="px-4 py-6 text-center text-xs text-ink-400">
              No snapshots yet. Edit the note and take a snapshot.
            </div>
          )}

          <ul className="flex flex-col">
            {snapshots.map((snap, i) => {
              const isViewing = viewingOid === snap.oid
              const isHead = i === 0
              return (
                <li key={snap.oid}>
                  <div
                    className={`group flex items-stretch gap-1 px-2 ${
                      isViewing ? 'bg-accent/10' : 'hover:bg-paper-200/40'
                    }`}
                  >
                    <TimelineRail
                      isFirst={!workingDirty && isHead}
                      isLast={i === snapshots.length - 1}
                      tone={isViewing ? 'viewing' : isHead ? 'head' : 'normal'}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setHistoryPreview({ path: note.path, oid: snap.oid, shortOid: snap.shortOid })
                      }
                      className="flex min-w-0 flex-1 flex-col gap-1 py-2 pr-1 text-left"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`min-w-0 flex-1 truncate text-xs ${
                            isViewing ? 'font-semibold text-accent' : 'font-medium text-ink-900'
                          }`}
                        >
                          {snap.message}
                        </span>
                        {isHead && (
                          <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-2xs font-medium text-accent">
                            HEAD
                          </span>
                        )}
                        <StatsBadges stats={statsByOid[snap.oid]} />
                      </span>
                      <span className="flex items-center gap-2 text-2xs text-ink-500">
                        <span className="rounded bg-paper-300/60 px-1 py-0.5 font-mono text-ink-600">
                          {snap.shortOid}
                        </span>
                        <span>{formatTimestamp(snap.timestamp)}</span>
                        {snap.author?.name && <span className="truncate">{snap.author.name}</span>}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void onRestore(snap)}
                      title="Restore this version"
                      className={`my-2 shrink-0 self-start rounded-md border border-paper-300/60 px-2 py-1 text-2xs text-ink-600 transition-opacity hover:border-accent hover:text-accent ${
                        isViewing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      Restore
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
