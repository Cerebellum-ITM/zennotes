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
 * Index custom icons by their unique `id` (the section-aware key,
 * e.g. `star` or `work/star`). This is the map every resolver expects.
 */
export function buildCustomIconIndex(icons: CustomIcon[]): Map<string, CustomIcon> {
  return new Map(icons.map((icon) => [icon.id, icon]))
}

/**
 * Resolve a bare frontmatter stem (no section, e.g. `icon: star`) against the
 * custom registry — but only when the stem is **unique** across all icons.
 * Ambiguous stems (the same filename in two sections) resolve to `null` so the
 * caller falls back rather than picking one arbitrarily.
 */
function resolveCustomByUniqueStem(
  stem: string,
  customByName: Map<string, CustomIcon>
): CustomIcon | null {
  // A root icon's id equals its stem — that's the unambiguous fast path and
  // also preserves back-compat for flat `custom:<name>` / bare-name refs.
  const root = customByName.get(stem)
  if (root) return root
  let found: CustomIcon | null = null
  for (const icon of customByName.values()) {
    if (icon.name !== stem) continue
    if (found) return null // ambiguous: same stem in multiple sections
    found = icon
  }
  return found
}

/**
 * Resolve an {@link import('@shared/ipc').IconRef} to a concrete icon.
 *
 * Order (per spec):
 * 1. `custom:<id>` prefix → the matching custom icon by `id` (the section-aware
 *    key, may contain `/`); if no exact id match, fall back to a unique stem.
 * 2. A bare name that resolves to a custom icon by unique stem → that icon
 *    (back-compat for refs stored before the `custom:` prefix existed, and for
 *    Obsidian-style `icon: <stem>` frontmatter).
 * 3. `builtin:<id>` or a bare valid built-in id → that built-in glyph.
 * 4. Anything else → `null` (caller falls back to the default icon).
 */
export function resolveIcon(
  ref: string,
  customByName: Map<string, CustomIcon>
): ResolvedIcon | null {
  if (typeof ref !== 'string' || !ref) return null

  if (ref.startsWith('custom:')) {
    const key = ref.slice('custom:'.length)
    // Exact id match (covers `custom:work/star` and root `custom:star`).
    const exact = customByName.get(key)
    if (exact) return { kind: 'custom', icon: exact }
    // No section in the ref: try a unique stem (Obsidian-style bare names).
    const byStem = resolveCustomByUniqueStem(key, customByName)
    return byStem ? { kind: 'custom', icon: byStem } : null
  }

  if (ref.startsWith('builtin:')) {
    const id = ref.slice('builtin:'.length)
    return isFolderIconId(id) ? { kind: 'builtin', id } : null
  }

  // Bare ref: a custom icon (by unique stem / id) shadows a same-named built-in.
  const custom = resolveCustomByUniqueStem(ref, customByName)
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
