/**
 * Right-side per-note version-history timeline. Lives inside EditorPane (like
 * OutlinePanel / ConnectionsPanel) so each pane shows history for its own note.
 *
 * Git lives in the desktop main process (see `vault-history.ts`); this panel
 * only talks to the bridge. Snapshots are listed newest-first; expanding a row
 * shows the line diff against the previous snapshot (computed with the pure
 * `history-diff` helpers). Restore is non-destructive — it brings back old
 * content as a new forward snapshot.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { HistorySnapshot, NoteContent } from '@shared/ipc'
import { useStore } from '../store'
import { usePanelResize } from '../lib/use-panel-resize'
import { PanelResizeHandle } from './PanelResizeHandle'
import { computeLineDiff, diffStats, type DiffLine, type DiffStats } from '../lib/history-diff'
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
    <span className="flex shrink-0 items-center gap-1.5 text-2xs font-mono">
      {added > 0 && <span className="text-success">+{added}</span>}
      {modified > 0 && <span className="text-warning">~{modified}</span>}
      {removed > 0 && <span className="text-danger">-{removed}</span>}
    </span>
  )
}

function DiffView({ lines }: { lines: DiffLine[] | undefined }): JSX.Element {
  if (!lines) {
    return <div className="px-3 py-2 text-2xs text-ink-400">Loading diff…</div>
  }
  if (lines.length === 0) {
    return <div className="px-3 py-2 text-2xs text-ink-400">No changes.</div>
  }
  return (
    <pre className="overflow-x-auto px-3 py-2 text-2xs font-mono leading-relaxed">
      {lines.map((line, i) => {
        const cls =
          line.kind === 'added'
            ? 'bg-success/10 text-success'
            : line.kind === 'removed'
              ? 'bg-danger/10 text-danger line-through decoration-danger/40'
              : 'text-ink-600'
        const sign = line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '
        return (
          <div key={i} className={`whitespace-pre-wrap ${cls}`}>
            <span className="select-none opacity-60">{sign} </span>
            {line.text || ' '}
          </div>
        )
      })}
    </pre>
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

  const [snapshots, setSnapshots] = useState<HistorySnapshot[]>([])
  const [workingDirty, setWorkingDirty] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [diffByOid, setDiffByOid] = useState<Record<string, DiffLine[]>>({})
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
      // Compute per-snapshot stats/diffs against the previous (older) snapshot.
      const diffs: Record<string, DiffLine[]> = {}
      const stats: Record<string, DiffStats> = {}
      for (let i = 0; i < list.length; i++) {
        const newText = await getContent(list[i].oid)
        const olderOid = list[i + 1]?.oid
        const oldText = olderOid ? await getContent(olderOid) : ''
        const lines = computeLineDiff(oldText, newText)
        diffs[list[i].oid] = lines
        stats[list[i].oid] = diffStats(lines)
      }
      setDiffByOid(diffs)
      setStatsByOid(stats)
    } catch (err) {
      console.error('history reload failed', err)
    } finally {
      setLoading(false)
    }
  }, [enabled, note.path, getContent])

  // Reload when the note changes, history is toggled, or a snapshot/restore
  // happens elsewhere (command palette, another pane).
  useEffect(() => {
    contentCache.current.clear()
    setExpanded(null)
    setNotice(null)
    void reload()
  }, [reload])

  useEffect(() => {
    const handler = (): void => void reload()
    window.addEventListener('zen:history-changed', handler)
    return () => window.removeEventListener('zen:history-changed', handler)
  }, [reload])

  // The working-state diff (disk vs latest snapshot) is computed on demand.
  const [workingDiff, setWorkingDiff] = useState<DiffLine[] | undefined>(undefined)
  useEffect(() => {
    setWorkingDiff(undefined)
  }, [note.body, snapshots])
  const ensureWorkingDiff = useCallback(async () => {
    const head = snapshots[0]
    const oldText = head ? await getContent(head.oid) : ''
    setWorkingDiff(computeLineDiff(oldText, note.body))
  }, [snapshots, note.body, getContent])

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
        <div className="min-h-0 flex-1 overflow-y-auto">
          {notice && (
            <div className="border-b border-paper-300/40 px-4 py-2 text-2xs text-ink-500">
              {notice}
            </div>
          )}
          {workingDirty && (
            <div className="border-b border-paper-300/40 border-l-2 border-l-accent-soft">
              <button
                type="button"
                onClick={() => {
                  const open = expanded === 'working'
                  setExpanded(open ? null : 'working')
                  if (!open) void ensureWorkingDiff()
                }}
                className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left hover:bg-paper-200/40"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-ink-900">Working state</span>
                  <span className="block text-2xs text-ink-500">Unsaved local changes</span>
                </span>
                <span className="text-2xs text-ink-400">{expanded === 'working' ? '▾' : '▸'}</span>
              </button>
              {expanded === 'working' && <DiffView lines={workingDiff} />}
            </div>
          )}
          {snapshots.length === 0 && !loading && (
            <div className="px-4 py-6 text-center text-xs text-ink-400">
              No snapshots yet. Edit the note and take a snapshot.
            </div>
          )}
          <ul className="flex flex-col">
            {snapshots.map((snap, i) => {
              const isOpen = expanded === snap.oid
              return (
                <li key={snap.oid} className="border-b border-paper-300/30">
                  <div className="flex items-stretch">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : snap.oid)}
                      className="flex min-w-0 flex-1 flex-col gap-1 px-4 py-2 text-left hover:bg-paper-200/40"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink-900">
                          {snap.message}
                        </span>
                        {i === 0 && (
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
                  </div>
                  {isOpen && (
                    <div>
                      <DiffView lines={diffByOid[snap.oid]} />
                      <div className="flex justify-end px-3 pb-2">
                        <button
                          type="button"
                          onClick={() => void onRestore(snap)}
                          className="rounded-md border border-paper-300/60 px-2 py-1 text-2xs text-ink-600 hover:border-accent hover:text-accent"
                        >
                          Restore
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
