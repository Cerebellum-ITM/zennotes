import type { CustomIcon, FolderIconId, IconRule, NoteMeta, VaultSettings } from '@shared/ipc'
import { noteFolderSubpath } from './vault-layout'
import { resolveByRules } from './icon-rules'

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

/**
 * Resolve the {@link import('@shared/ipc').IconRef} to render for a note,
 * applying the full precedence chain: the note's explicit `icon` (frontmatter)
 * wins; otherwise the first matching {@link IconRule} (U06); otherwise `null`
 * so the caller falls back to the default document glyph.
 *
 * Returns the IconRef string (not a resolved icon) so callers can pass it
 * straight to {@link import('../components/DynamicIcon').DynamicIcon}, which
 * sanitizes custom SVGs. An explicit/rule ref that fails to resolve against the
 * custom registry / built-ins yields `null` (fall back to the default).
 */
export function resolveNoteIconRef(
  note: Pick<NoteMeta, 'icon' | 'folder' | 'path' | 'title' | 'frontmatter'>,
  settings: VaultSettings | null | undefined,
  customByName: Map<string, CustomIcon>,
  iconRules: IconRule[] | undefined | null
): string | null {
  // 1. Explicit frontmatter icon always wins.
  if (note.icon && resolveIcon(note.icon, customByName)) return note.icon

  // 2. First matching pattern rule.
  const ruleRef = resolveByRules(
    'note',
    {
      subpath: noteFolderSubpath(note, settings),
      name: note.title,
      frontmatter: note.frontmatter
    },
    iconRules
  )
  if (ruleRef && resolveIcon(ruleRef, customByName)) return ruleRef

  // 3. Caller falls back to the default glyph.
  return null
}

/**
 * Resolve the {@link import('@shared/ipc').IconRef} to render for a folder via
 * pattern rules. Callers handle the explicit `folderIcons` entry and the
 * default themselves; this only supplies the rule layer (returns `null` when no
 * rule matches or the matched ref can't be resolved).
 */
export function resolveFolderIconRefByRules(
  ctx: { subpath: string; name: string },
  customByName: Map<string, CustomIcon>,
  iconRules: IconRule[] | undefined | null
): string | null {
  const ruleRef = resolveByRules('folder', ctx, iconRules)
  if (ruleRef && resolveIcon(ruleRef, customByName)) return ruleRef
  return null
}
