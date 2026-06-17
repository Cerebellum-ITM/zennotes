import { useRef } from 'react'
import type { CustomIcon } from '@shared/ipc'
import { FOLDER_ICON_OPTIONS } from './FolderIcons'
import { DynamicIcon } from './DynamicIcon'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'

export function FolderIconPickerModal({
  targetLabel,
  currentIconRef,
  customIcons,
  onSelect,
  onImport,
  onCancel
}: {
  targetLabel: string
  /** The folder's currently-stored IconRef (bare id, `builtin:`/`custom:`). */
  currentIconRef: string
  customIcons: CustomIcon[]
  /** Receives an IconRef: a bare built-in id or `custom:<name>`. */
  onSelect: (iconRef: string) => void
  /** Persist an imported SVG (name derived from the file) and select it. */
  onImport?: (input: { name: string; svg: string }) => void | Promise<void>
  onCancel: () => void
}): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleFile = async (file: File | null | undefined): Promise<void> => {
    if (!file || !onImport) return
    const svg = await file.text()
    const base = file.name.replace(/\.svg$/i, '')
    const name = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'icon'
    await onImport({ name, svg })
  }

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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {FOLDER_ICON_OPTIONS.map((option) => {
            const active = option.id === currentIconRef || `builtin:${option.id}` === currentIconRef
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onSelect(option.id)}
                className={[
                  'flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
                  active
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-paper-300 bg-paper-50 text-ink-800 hover:border-paper-400 hover:bg-paper-200/70'
                ].join(' ')}
              >
                <span className={active ? 'text-accent' : 'text-ink-500'}>{option.icon}</span>
                <span className="truncate text-sm font-medium">{option.label}</span>
              </button>
            )
          })}
        </div>

        <div className="space-y-2">
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
              <code className="rounded bg-paper-200 px-1 py-0.5 text-xs">.zennotes/icons/</code> or
              import one.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {customIcons.map((icon) => {
                const ref = `custom:${icon.name}`
                const active = ref === currentIconRef
                return (
                  <button
                    key={icon.name}
                    type="button"
                    onClick={() => onSelect(ref)}
                    className={[
                      'flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
                      active
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-paper-300 bg-paper-50 text-ink-800 hover:border-paper-400 hover:bg-paper-200/70'
                    ].join(' ')}
                  >
                    <span className={active ? 'text-accent' : 'text-ink-500'}>
                      <DynamicIcon iconRef={ref} customIcons={customIcons} />
                    </span>
                    <span className="truncate text-sm font-medium">{icon.name}</span>
                  </button>
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
