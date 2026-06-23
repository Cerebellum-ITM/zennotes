/**
 * Read-only "viewing" overlay shown on top of the live editor when a history
 * snapshot is selected in the timeline. It never touches the CodeMirror buffer
 * — closing it reveals the live editor untouched.
 *
 * The snapshot is rendered as formatted markdown (headings, math, task lists —
 * reusing the same `renderMarkdown` pipeline as the preview) block by block,
 * each block decorated with a colored left rail + sign reflecting how it changed
 * vs the previous snapshot (+ added / ~ modified / - removed), matching the
 * timeline semantics. A banner offers Back / Restore.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { NoteContent } from '@shared/ipc'
import { useStore } from '../store'
import { computeBlockDiff, type DiffBlock } from '../lib/history-diff'
import { renderMarkdown } from '../lib/markdown'

interface Props {
  note: NoteContent
  oid: string
  shortOid: string
}

const RAIL: Record<DiffBlock['kind'], { bar: string; sign: string; signClass: string; tint: string }> = {
  added: { bar: 'border-success/70', sign: '+', signClass: 'text-success', tint: 'bg-success/5' },
  removed: { bar: 'border-danger/70', sign: '-', signClass: 'text-danger', tint: 'bg-danger/5' },
  modified: { bar: 'border-warning/70', sign: '~', signClass: 'text-warning', tint: 'bg-warning/5' },
  context: { bar: 'border-transparent', sign: '', signClass: '', tint: '' }
}

function Block({ block }: { block: DiffBlock }): JSX.Element {
  const style = RAIL[block.kind]
  const html = useMemo(() => renderMarkdown(block.text), [block.text])
  return (
    <div className={`flex items-stretch gap-1 ${style.tint}`}>
      <span
        className={`w-5 shrink-0 select-none pt-[2px] text-center font-mono text-sm ${style.signClass}`}
        aria-hidden
      >
        {style.sign}
      </span>
      <div
        className={`min-w-0 flex-1 border-l-2 pl-3 ${style.bar} ${
          block.kind === 'removed' ? 'opacity-60' : ''
        }`}
      >
        {/* `comment-prose` drops the full-note container padding (incl. the
            40vh bottom pad) so each block sizes to its own content. */}
        <div className="prose-zen comment-prose" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  )
}

export function HistoryPreviewOverlay({ note, oid, shortOid }: Props): JSX.Element {
  const setHistoryPreview = useStore((s) => s.setHistoryPreview)
  const restoreHistorySnapshot = useStore((s) => s.restoreHistorySnapshot)
  const [blocks, setBlocks] = useState<DiffBlock[] | null>(null)
  const [meta, setMeta] = useState<{ when: number; author: string | null } | null>(null)
  const reqRef = useRef(0)

  useEffect(() => {
    const req = ++reqRef.current
    setBlocks(null)
    void (async () => {
      try {
        const list = await window.zen.listHistorySnapshots(note.path)
        const idx = list.findIndex((s) => s.oid === oid)
        const snap = idx >= 0 ? list[idx] : null
        const parentOid = idx >= 0 ? list[idx + 1]?.oid : undefined
        const [newText, oldText] = await Promise.all([
          window.zen.getHistorySnapshotContent(note.path, oid),
          parentOid ? window.zen.getHistorySnapshotContent(note.path, parentOid) : Promise.resolve('')
        ])
        if (req !== reqRef.current) return
        setBlocks(computeBlockDiff(oldText, newText))
        setMeta({ when: snap?.timestamp ?? 0, author: snap?.author?.name ?? null })
      } catch {
        if (req === reqRef.current) setBlocks([])
      }
    })()
  }, [note.path, oid])

  const whenLabel = useMemo(() => {
    if (!meta?.when) return ''
    const d = new Date(meta.when * 1000)
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }, [meta])

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-paper-100">
      <div className="flex items-center justify-between gap-3 border-b border-paper-300/70 bg-paper-200/40 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs text-ink-600">
          <span className="rounded bg-accent/15 px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-accent">
            Viewing
          </span>
          <span className="rounded bg-paper-300/60 px-1.5 py-0.5 font-mono text-ink-700">
            {shortOid}
          </span>
          {whenLabel && <span className="truncate">{whenLabel}</span>}
          {meta?.author && <span className="truncate text-ink-500">· {meta.author}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setHistoryPreview(null)}
            className="rounded-md border border-paper-300/70 px-2.5 py-1 text-2xs font-medium text-ink-700 hover:bg-paper-200"
          >
            Back to current
          </button>
          <button
            type="button"
            onClick={() => void restoreHistorySnapshot(note.path, oid)}
            className="rounded-md bg-accent px-2.5 py-1 text-2xs font-medium text-paper-50 hover:bg-accent-soft"
          >
            Restore this version
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-6">
        {blocks == null ? (
          <div className="text-xs text-ink-400">Loading snapshot…</div>
        ) : blocks.length === 0 ? (
          <div className="text-xs text-ink-400">Empty snapshot.</div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-1">
            {blocks.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
