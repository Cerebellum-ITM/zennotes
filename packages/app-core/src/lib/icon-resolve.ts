import type { CustomIcon, FolderIconId } from '@shared/ipc'

const VALID_FOLDER_ICON_IDS = new Set<FolderIconId>([
  'folder',
  'bolt',
  'tray',
  'archive',
  'trash',
  'book',
  'bookmark',
  'calendar',
  'briefcase',
  'tag',
  'document',
  'sparkle',
  'code',
  'user',
  'star',
  'heart',
  'link',
  'lightbulb',
  'flask',
  'graduation',
  'music',
  'image',
  'palette',
  'terminal',
  'wrench',
  'globe',
  'map',
  'chart',
  'home'
])

function isFolderIconId(value: string): value is FolderIconId {
  return VALID_FOLDER_ICON_IDS.has(value as FolderIconId)
}

export type ResolvedIcon =
  | { kind: 'builtin'; id: FolderIconId }
  | { kind: 'custom'; icon: CustomIcon }

/**
 * Resolve an {@link import('@shared/ipc').IconRef} to a concrete icon.
 *
 * Order (per spec):
 * 1. `custom:<name>` prefix → the matching custom icon (or `null` if missing).
 * 2. A bare name that exists in `customByName` → that custom icon (back-compat
 *    for refs stored before the `custom:` prefix existed).
 * 3. `builtin:<id>` or a bare valid built-in id → that built-in glyph.
 * 4. Anything else → `null` (caller falls back to the default icon).
 */
export function resolveIcon(
  ref: string,
  customByName: Map<string, CustomIcon>
): ResolvedIcon | null {
  if (typeof ref !== 'string' || !ref) return null

  if (ref.startsWith('custom:')) {
    const name = ref.slice('custom:'.length)
    const icon = customByName.get(name)
    return icon ? { kind: 'custom', icon } : null
  }

  if (ref.startsWith('builtin:')) {
    const id = ref.slice('builtin:'.length)
    return isFolderIconId(id) ? { kind: 'builtin', id } : null
  }

  // Bare ref: a custom icon by name shadows a same-named built-in.
  const custom = customByName.get(ref)
  if (custom) return { kind: 'custom', icon: custom }

  if (isFolderIconId(ref)) return { kind: 'builtin', id: ref }

  return null
}

/**
 * Resolve a note's icon.
 *
 * Precedence (this unit): the note's explicit `icon` (from frontmatter),
 * resolved custom-first via {@link resolveIcon} → `null`. Per-pattern rules
 * arrive in U06. Returns `null` when the note has no icon or it can't be
 * resolved, so the caller can fall back to the default document glyph.
 */
export function resolveNoteIcon(
  note: { icon?: string },
  customByName: Map<string, CustomIcon>
): ResolvedIcon | null {
  if (!note.icon) return null
  return resolveIcon(note.icon, customByName)
}
