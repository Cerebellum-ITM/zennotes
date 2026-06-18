import { useMemo, useRef, useState } from 'react'
import type { CustomIcon } from '@shared/ipc'
import { FOLDER_ICON_OPTIONS } from './FolderIcons'
import { DynamicIcon } from './DynamicIcon'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { promptApp } from '../lib/prompt-requests'

/** Section header shown for root-level custom icons. */
const ROOT_SECTION_LABEL = 'General'

/** Each `/`-segment of a section folder name must be a safe stem. */
const SECTION_SEGMENT_RE = /^[A-Za-z0-9._-]+$/

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
  perSectionFilter = false,
  onSelect,
  onImport,
  onCancel
}: {
  targetLabel: string
  /** The target's currently-stored IconRef (bare id, `builtin:`/`custom:`). */
  currentIconRef: string
  customIcons: CustomIcon[]
  /**
   * When true, restore the per-section filter inputs (one search box per custom
   * section). When false (the default) a single general filter searches every
   * built-in and custom icon at once.
   */
  perSectionFilter?: boolean
  /** Receives an IconRef: a bare built-in id or `custom:<id>`. */
  onSelect: (iconRef: string) => void
  /**
   * Persist an imported SVG (name derived from the file) and select it.
   * `section` (optional) targets a subfolder under `.zennotes/icons/`.
   */
  onImport?: (input: { name: string; svg: string; section?: string }) => void | Promise<void>
  onCancel: () => void
}): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // The section the next file-chooser result should import into (null = root).
  const pendingSectionRef = useRef<string | null>(null)
  // The ref currently hovered (drives the preview) — falls back to the selected.
  const [hoverRef, setHoverRef] = useState<string | null>(null)
  const [previewBg, setPreviewBg] = useState<PreviewBg>('app')
  // A single general search box (default): filters built-ins by label and all
  // custom icons by name across every section.
  const [generalQuery, setGeneralQuery] = useState('')
  // One search box per custom section, keyed by section id ('' = root). Only used
  // when `perSectionFilter` is on.
  const [sectionQueries, setSectionQueries] = useState<Record<string, string>>({})
  // Collapsed custom sections, keyed by section id ('' = root). Default expanded.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const previewRef = hoverRef ?? currentIconRef
  const general = generalQuery.trim().toLowerCase()

  const handleFile = async (file: File | null | undefined): Promise<void> => {
    const section = pendingSectionRef.current
    pendingSectionRef.current = null
    if (!file || !onImport) return
    const svg = await file.text()
    const base = file.name.replace(/\.svg$/i, '')
    const name = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'icon'
    await onImport({ name, svg, ...(section ? { section } : {}) })
  }

  // Open the OS file chooser; the chosen file imports into `section` ('' = root).
  const pickFileFor = (section: string): void => {
    pendingSectionRef.current = section || null
    fileInputRef.current?.click()
  }

  // Prompt for a new folder name, then import the chosen SVG into it.
  const importIntoNewFolder = async (): Promise<void> => {
    const entered = await promptApp({
      title: 'New icon folder',
      description: 'Subfolder under .zennotes/icons/. Letters, numbers, ., _ and - only.',
      placeholder: 'work',
      okLabel: 'Choose SVG…',
      validate: (value) => {
        const trimmed = value.trim().replace(/^\/+|\/+$/g, '')
        if (!trimmed) return 'Enter a folder name.'
        if (!trimmed.split('/').every((seg) => SECTION_SEGMENT_RE.test(seg))) {
          return 'Use only letters, numbers, ., _ and - (slashes allowed between folders).'
        }
        return null
      }
    })
    if (entered == null) return
    const section = entered.trim().replace(/^\/+|\/+$/g, '')
    if (!section) return
    pickFileFor(section)
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

  // Built-ins filtered by the general search (only when general filtering).
  const visibleBuiltins = useMemo(() => {
    if (perSectionFilter || !general) return FOLDER_ICON_OPTIONS
    return FOLDER_ICON_OPTIONS.filter(
      (option) =>
        option.label.toLowerCase().includes(general) ||
        option.id.toLowerCase().includes(general)
    )
  }, [perSectionFilter, general])

  // The whole row sits on the app surface; the glyph lives in a chip whose
  // background follows the preview-bg toggle so users can judge contrast.
  const tileClass = (active: boolean): string =>
    [
      'flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
      active
        ? 'border-accent bg-accent/10 text-ink-900 ring-1 ring-accent'
        : 'border-paper-300 bg-paper-50 text-ink-900 hover:border-accent/60 hover:bg-paper-100'
    ].join(' ')

  // The small rounded chip the glyph is painted on — its surface mirrors the
  // preview-bg toggle so every grid option previews on the chosen background.
  const chipClass = [
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-paper-300',
    previewSurfaceClass(previewBg)
  ].join(' ')

  return (
    <Modal size="md" layer="modal" onClose={onCancel}>
      <Modal.Body className="space-y-4">
        {/* Header card in the "Shortcut editor" style: title, description, and a
            row with the general filter + the background toggle, divided from the
            list below. */}
        <div className="overflow-hidden rounded-xl border border-paper-300/70 bg-paper-50/50">
          <div className="px-4 pb-3 pt-4">
            <div className="text-sm font-semibold text-ink-900">Choose icon</div>
            <p className="mt-0.5 text-xs leading-5 text-ink-500">
              Select a sidebar icon for{' '}
              <span className="font-medium text-ink-700">{targetLabel}</span>.{' '}
              {perSectionFilter
                ? 'Filter each section below.'
                : 'Search built-in and custom icons, or import your own.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-paper-300/60 px-4 py-3">
            {!perSectionFilter && (
              <input
                type="search"
                value={generalQuery}
                onChange={(e) => setGeneralQuery(e.target.value)}
                placeholder="Search icons…"
                className="min-w-0 flex-1 rounded-lg border border-paper-300 bg-paper-50 px-3 py-1.5 text-sm text-ink-800 placeholder:text-ink-400 focus:border-accent focus:outline-none"
              />
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-500">Preview on</span>
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
          </div>
        </div>

        {/* Preview strip: the target's ORIGINAL icon ("Current") next to the
            hovered/selected one ("Preview"), both on the chosen surface. */}
        <div className="flex items-center gap-6 rounded-xl border border-paper-300 px-3 py-2">
          <div className="flex items-center gap-3">
            <span
              className={[
                'flex h-12 w-12 items-center justify-center rounded-lg border border-paper-300',
                previewSurfaceClass(previewBg)
              ].join(' ')}
            >
              {currentIconRef ? (
                <DynamicIcon iconRef={currentIconRef} customIcons={customIcons} size={32} />
              ) : (
                <span className="text-xs text-ink-400">—</span>
              )}
            </span>
            <span className="text-xs text-ink-500">Current</span>
          </div>
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
            <span className="text-xs text-ink-500">Preview</span>
          </div>
        </div>

        {/* Built-in glyphs. */}
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Built-in
          </span>
          {visibleBuiltins.length === 0 ? (
            <p className="text-xs text-ink-400">No matching built-in icons.</p>
          ) : (
            <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
              {visibleBuiltins.map((option) => {
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
                    <span className={chipClass}>{option.icon}</span>
                    <span className="truncate text-sm font-medium">{option.label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Custom icons, grouped by collapsible section. */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Custom
            </span>
            {onImport && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => pickFileFor('')}
                  className="rounded-lg border border-paper-300 bg-paper-50 px-2 py-1 text-xs font-medium text-ink-700 transition-colors hover:border-paper-400 hover:bg-paper-200/70"
                >
                  Import SVG…
                </button>
                <button
                  type="button"
                  onClick={() => void importIntoNewFolder()}
                  className="rounded-lg border border-paper-300 bg-paper-50 px-2 py-1 text-xs font-medium text-ink-700 transition-colors hover:border-paper-400 hover:bg-paper-200/70"
                >
                  New folder…
                </button>
              </div>
            )}
          </div>
          {customIcons.length === 0 ? (
            <p className="text-sm text-ink-500">
              No custom icons yet. Drop SVGs into{' '}
              <code className="rounded bg-paper-200 px-1 py-0.5 text-xs">.zennotes/icons/</code>{' '}
              (subfolders become sections) or import one.
            </p>
          ) : (
            // General scroll: all sections share one scroll area, with each
            // section also being independently collapsible.
            <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
              {sections.map(([section, icons]) => {
                const isCollapsed = collapsed[section] ?? false
                // Per-section mode uses the section's own search box; general
                // mode applies the single general query to every section.
                const query = perSectionFilter
                  ? (sectionQueries[section] ?? '').trim().toLowerCase()
                  : general
                const filtered = query
                  ? icons.filter((icon) => icon.name.toLowerCase().includes(query))
                  : icons
                // In general mode, hide whole sections that have no match so the
                // single query reads like one flat result list.
                if (!perSectionFilter && general && filtered.length === 0) return null
                return (
                  <div key={section || '__root__'} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsed((prev) => ({ ...prev, [section]: !isCollapsed }))
                        }
                        className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-ink-600 transition-colors hover:text-ink-900"
                        aria-expanded={!isCollapsed}
                      >
                        <span
                          className={[
                            'inline-block text-ink-400 transition-transform',
                            isCollapsed ? '' : 'rotate-90'
                          ].join(' ')}
                          aria-hidden
                        >
                          ▶
                        </span>
                        <span className="truncate">{section || ROOT_SECTION_LABEL}</span>
                        <span className="text-ink-400">({icons.length})</span>
                      </button>
                      <div className="flex items-center gap-2">
                        {perSectionFilter && !isCollapsed && (
                          <input
                            type="search"
                            value={sectionQueries[section] ?? ''}
                            onChange={(e) =>
                              setSectionQueries((prev) => ({
                                ...prev,
                                [section]: e.target.value
                              }))
                            }
                            placeholder="Filter…"
                            className="w-24 rounded-md border border-paper-300 bg-paper-50 px-2 py-1 text-xs text-ink-700 placeholder:text-ink-400 focus:border-accent focus:outline-none"
                          />
                        )}
                        {onImport && (
                          <button
                            type="button"
                            onClick={() => pickFileFor(section)}
                            className="shrink-0 rounded-md border border-paper-300 bg-paper-50 px-2 py-1 text-xs font-medium text-ink-600 transition-colors hover:border-paper-400 hover:bg-paper-200/70"
                            title={`Import an SVG into ${section || ROOT_SECTION_LABEL}`}
                          >
                            Import here
                          </button>
                        )}
                      </div>
                    </div>
                    {!isCollapsed &&
                      (filtered.length === 0 ? (
                        <p className="text-xs text-ink-400">No matching icons.</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                                <span className={chipClass}>
                                  <DynamicIcon iconRef={ref} customIcons={customIcons} size={20} />
                                </span>
                                <span className="truncate text-sm font-medium">{icon.name}</span>
                              </button>
                            )
                          })}
                        </div>
                      ))}
                  </div>
                )
              })}
            </div>
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
