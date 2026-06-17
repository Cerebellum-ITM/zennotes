import { useMemo, useRef, useState } from 'react'
import type { CustomIcon } from '@shared/ipc'
import { FOLDER_ICON_OPTIONS } from './FolderIcons'
import { DynamicIcon } from './DynamicIcon'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'

/** Section header shown for root-level custom icons. */
const ROOT_SECTION_LABEL = 'General'

type PreviewBg = 'app' | 'white' | 'dark'

function previewSurfaceClass(bg: PreviewBg): string {
  if (bg === 'white') return 'bg-white text-ink-900'
  if (bg === 'dark') return 'bg-ink-900 text-white'
  // 'app' — the real sidebar surface.
  return 'bg-paper-100 text-ink-700'
}

export function FolderIconPickerModal({
  targetLabel,
  currentIconRef,
  customIcons,
  onSelect,
  onImport,
  onCancel
}: {
  targetLabel: string
  /** The target's currently-stored IconRef (bare id, `builtin:`/`custom:`). */
  currentIconRef: string
  customIcons: CustomIcon[]
  /** Receives an IconRef: a bare built-in id or `custom:<id>`. */
  onSelect: (iconRef: string) => void
  /** Persist an imported SVG (name derived from the file) and select it. */
  onImport?: (input: { name: string; svg: string }) => void | Promise<void>
  onCancel: () => void
}): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // The ref currently hovered (drives the preview) — falls back to the selected.
  const [hoverRef, setHoverRef] = useState<string | null>(null)
  const [previewBg, setPreviewBg] = useState<PreviewBg>('app')
  // One search box per custom section, keyed by section id ('' = root).
  const [sectionQueries, setSectionQueries] = useState<Record<string, string>>({})

  const previewRef = hoverRef ?? currentIconRef

  const handleFile = async (file: File | null | undefined): Promise<void> => {
    if (!file || !onImport) return
    const svg = await file.text()
    const base = file.name.replace(/\.svg$/i, '')
    const name = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'icon'
    await onImport({ name, svg })
  }

  // Group custom icons by section, preserving the backend's sort order.
  const sections = useMemo(() => {
    const bySection = new Map<string, CustomIcon[]>()
    for (const icon of customIcons) {
      const list = bySection.get(icon.section)
      if (list) list.push(icon)
      else bySection.set(icon.section, [icon])
    }
    return [...bySection.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [customIcons])

  const tileClass = (active: boolean): string =>
    [
      'flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
      // Always paint the glyph on a white tile so dark/colored SVGs stay visible.
      active
        ? 'border-accent ring-1 ring-accent bg-white text-ink-900'
        : 'border-paper-300 bg-white text-ink-900 hover:border-accent/60'
    ].join(' ')

  return (
    <Modal size="md" layer="modal" onClose={onCancel}>
      <Modal.Header
        title="Choose icon"
        description={
          <>
            Select a sidebar icon for{' '}
            <span className="font-medium text-ink-700">{targetLabel}</span>.
          </>
        }
      />
      <Modal.Body className="space-y-4">
        {/* Preview strip: the selected/hovered icon at ~32px on a real surface. */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-paper-300 px-3 py-2">
          <div className="flex items-center gap-3">
            <span
              className={[
                'flex h-12 w-12 items-center justify-center rounded-lg border border-paper-300',
                previewSurfaceClass(previewBg)
              ].join(' ')}
            >
              {previewRef ? (
                <DynamicIcon iconRef={previewRef} customIcons={customIcons} size={32} />
              ) : (
                <span className="text-xs text-ink-400">—</span>
              )}
            </span>
            <span className="truncate text-xs text-ink-500">Preview</span>
          </div>
          <div className="flex items-center gap-1">
            {(['app', 'white', 'dark'] as const).map((bg) => (
              <button
                key={bg}
                type="button"
                onClick={() => setPreviewBg(bg)}
                className={[
                  'rounded-md border px-2 py-1 text-xs font-medium capitalize transition-colors',
                  previewBg === bg
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-paper-300 bg-paper-50 text-ink-600 hover:border-paper-400'
                ].join(' ')}
              >
                {bg}
              </button>
            ))}
          </div>
        </div>

        {/* Built-in glyphs. */}
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Built-in
          </span>
          <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
            {FOLDER_ICON_OPTIONS.map((option) => {
              const active =
                option.id === currentIconRef || `builtin:${option.id}` === currentIconRef
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelect(option.id)}
                  onMouseEnter={() => setHoverRef(option.id)}
                  onMouseLeave={() => setHoverRef(null)}
                  className={tileClass(active)}
                >
                  <span className="text-ink-700">{option.icon}</span>
                  <span className="truncate text-sm font-medium">{option.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Custom icons, grouped by section. */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Custom
            </span>
            {onImport && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-paper-300 bg-paper-50 px-2 py-1 text-xs font-medium text-ink-700 transition-colors hover:border-paper-400 hover:bg-paper-200/70"
              >
                Import SVG…
              </button>
            )}
          </div>
          {customIcons.length === 0 ? (
            <p className="text-sm text-ink-500">
              No custom icons yet. Drop SVGs into{' '}
              <code className="rounded bg-paper-200 px-1 py-0.5 text-xs">.zennotes/icons/</code>{' '}
              (subfolders become sections) or import one.
            </p>
          ) : (
            sections.map(([section, icons]) => {
              const query = (sectionQueries[section] ?? '').trim().toLowerCase()
              const filtered = query
                ? icons.filter((icon) => icon.name.toLowerCase().includes(query))
                : icons
              return (
                <div key={section || '__root__'} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-ink-600">
                      {section || ROOT_SECTION_LABEL}
                    </span>
                    <input
                      type="search"
                      value={sectionQueries[section] ?? ''}
                      onChange={(e) =>
                        setSectionQueries((prev) => ({ ...prev, [section]: e.target.value }))
                      }
                      placeholder="Filter…"
                      className="w-28 rounded-md border border-paper-300 bg-paper-50 px-2 py-1 text-xs text-ink-700 placeholder:text-ink-400 focus:border-accent focus:outline-none"
                    />
                  </div>
                  {filtered.length === 0 ? (
                    <p className="text-xs text-ink-400">No matching icons.</p>
                  ) : (
                    <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                      {filtered.map((icon) => {
                        const ref = `custom:${icon.id}`
                        const active = ref === currentIconRef
                        return (
                          <button
                            key={icon.id}
                            type="button"
                            onClick={() => onSelect(ref)}
                            onMouseEnter={() => setHoverRef(ref)}
                            onMouseLeave={() => setHoverRef(null)}
                            className={tileClass(active)}
                          >
                            <span className="text-ink-700">
                              <DynamicIcon iconRef={ref} customIcons={customIcons} />
                            </span>
                            <span className="truncate text-sm font-medium">{icon.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".svg,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            void handleFile(file)
          }}
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
