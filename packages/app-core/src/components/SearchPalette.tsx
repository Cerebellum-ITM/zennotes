import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import type { VaultTextSearchMatch } from '@shared/ipc'
import { isPaletteNextKey, isPalettePreviousKey } from '../lib/palette-nav'
import { isImeComposing } from '../lib/ime'
import { parseNoteSearchQuery } from '../lib/note-search'
import { searchUnified, buildNoteSearchIndex, type UnifiedResult } from '../lib/unified-search'
import { searchVaultBodies, reduceToBestPerNote, renderHighlightedText } from '../lib/vault-text-search'
import { focusEditorNormalMode } from '../lib/editor-focus'
import { Modal } from './ui/Modal'

const RESULT_LIMIT = 30
const BODY_SEARCH_DEBOUNCE_MS = 120

export function SearchPalette(): JSX.Element {
  const notes = useStore((s) => s.notes)
  const noteContents = useStore((s) => s.noteContents)
  const setSearchOpen = useStore((s) => s.setSearchOpen)
  const selectNote = useStore((s) => s.selectNote)
  const openNoteAtOffset = useStore((s) => s.openNoteAtOffset)
  const backend = useStore((s) => s.vaultTextSearchBackend)
  const ripgrepBinaryPath = useStore((s) => s.ripgrepBinaryPath)
  const fzfBinaryPath = useStore((s) => s.fzfBinaryPath)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [bodyMatches, setBodyMatches] = useState<Map<string, VaultTextSearchMatch>>(new Map())
  const [bodyLoading, setBodyLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const requestIdRef = useRef(0)
  const bodyCacheRef = useRef(new Map<string, string>())
  const notesRef = useRef(notes)
  const noteContentsRef = useRef(noteContents)

  useEffect(() => {
    notesRef.current = notes
  }, [notes])
  useEffect(() => {
    noteContentsRef.current = noteContents
  }, [noteContents])

  const searchIndex = useMemo(() => buildNoteSearchIndex(notes), [notes])

  // Strip `#tag` tokens off the query so the user can narrow by one or
  // more tags inline: `#ops #prod migration` means "notes tagged with
  // #ops AND #prod, fuzzy-matching 'migration'". Pure-tag queries (no
  // free text) still work — in that case we just list matching notes.
  const { tagTokens, freeText } = useMemo(() => parseNoteSearchQuery(query), [query])

  const results = useMemo(
    () => searchUnified(searchIndex, bodyMatches, query, { limit: RESULT_LIMIT }),
    [searchIndex, bodyMatches, query]
  )

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-search-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  // Full-text body search. Runs only when there's free text to look for; the
  // name/tag index already covers titles instantly. Debounced and guarded by a
  // request id so stale responses can't clobber a newer query.
  useEffect(() => {
    requestIdRef.current += 1
    const requestId = requestIdRef.current
    // Drop stale body matches immediately so the unified list never mixes a
    // previous query's snippets with the new one.
    setBodyMatches(new Map())

    if (!freeText) {
      setBodyLoading(false)
      return
    }

    setBodyLoading(true)
    const timer = window.setTimeout(() => {
      void (async (): Promise<void> => {
        try {
          const matches = await searchVaultBodies(freeText, {
            notes: notesRef.current,
            backend,
            ripgrepPath: ripgrepBinaryPath,
            fzfPath: fzfBinaryPath,
            getCachedBody: (path) =>
              noteContentsRef.current[path]?.body ?? bodyCacheRef.current.get(path),
            setCachedBody: (path, body) => bodyCacheRef.current.set(path, body)
          })
          if (requestIdRef.current !== requestId) return
          setBodyMatches(reduceToBestPerNote(matches))
        } catch (error) {
          console.error('unified body search failed', error)
          if (requestIdRef.current !== requestId) return
          setBodyMatches(new Map())
        } finally {
          if (requestIdRef.current === requestId) setBodyLoading(false)
        }
      })()
    }, BODY_SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [freeText, backend, ripgrepBinaryPath, fzfBinaryPath])

  const open = async (result: UnifiedResult): Promise<void> => {
    setSearchOpen(false)
    if (typeof result.offset === 'number') {
      await openNoteAtOffset(result.path, result.offset, { scrollMode: 'center' })
    } else {
      await selectNote(result.path)
    }
    focusEditorNormalMode()
  }

  const close = (): void => {
    setSearchOpen(false)
    focusEditorNormalMode()
  }

  return (
    <Modal size="md" layer="palette" onClose={close} closeOnEsc={false}>
      <div className="border-b border-paper-300/70 px-4 py-3">
          <input
            ref={inputRef}
            value={query}
            placeholder="Search notes and content…  ·  use #tag to filter"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // While composing (IME), let the input own Enter/Arrows. (#183)
              if (isImeComposing(e)) return
              if (isPaletteNextKey(e)) {
                e.preventDefault()
                e.stopPropagation()
                setActive((a) => Math.min(results.length - 1, a + 1))
              } else if (isPalettePreviousKey(e)) {
                e.preventDefault()
                e.stopPropagation()
                setActive((a) => Math.max(0, a - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                const result = results[active]
                if (result) open(result)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                close()
              }
            }}
            className="w-full bg-transparent text-base text-ink-900 outline-none placeholder:text-ink-400"
          />
          {tagTokens.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tagTokens.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent ring-1 ring-accent/30"
                >
                  #{t}
                </span>
              ))}
              <span className="text-xs text-ink-500">
                notes must carry {tagTokens.length === 1 ? 'this tag' : 'all of these tags'}
              </span>
            </div>
          )}
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-x-hidden overflow-y-auto py-1">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-ink-400">
              {bodyLoading ? 'Searching…' : 'No matches.'}
            </div>
          ) : (
            results.map((n, i) => (
              <button
                key={n.path}
                data-search-idx={i}
                onClick={() => open(n)}
                onMouseMove={() => setActive(i)}
                className={[
                  'flex w-full min-w-0 flex-col gap-0.5 px-4 py-2 text-left',
                  i === active ? 'bg-paper-200' : 'hover:bg-paper-200/70'
                ].join(' ')}
              >
                <div className="flex w-full min-w-0 items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">
                    {renderHighlightedText(n.title, freeText)}
                  </span>
                  <span className="shrink-0 text-xs uppercase tracking-wide text-ink-400">
                    {n.folder}
                  </span>
                </div>
                {n.snippet && (
                  <div className="flex w-full min-w-0 items-baseline gap-2">
                    <span className="shrink-0 text-2xs tabular-nums text-ink-400">
                      L{n.lineNumber}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-500">
                      {renderHighlightedText(n.snippet, freeText)}
                    </span>
                  </div>
                )}
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-end gap-4 border-t border-paper-300/70 bg-paper-100 px-4 py-2 text-xs text-ink-500">
          {bodyLoading && <span className="mr-auto text-ink-400">searching content…</span>}
          <span>
            <kbd className="rounded bg-paper-200 px-1">↑↓</kbd>{' '}
            <kbd className="rounded bg-paper-200 px-1">Ctrl+N/P</kbd>{' '}
            <kbd className="rounded bg-paper-200 px-1">Ctrl+J/K</kbd> move
          </span>
          <span>
            <kbd className="rounded bg-paper-200 px-1">↵</kbd> open
          </span>
          <span>
            <kbd className="rounded bg-paper-200 px-1">esc</kbd> close
          </span>
        </div>
    </Modal>
  )
}
