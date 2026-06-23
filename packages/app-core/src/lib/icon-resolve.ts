import type { CustomIcon, FolderIconId, IconRule, NoteMeta, VaultSettings } from '@shared/ipc'
import { noteFolderSubpath } from './vault-layout'
import { resolveByRules } from './icon-rules'
import {
  DEFAULT_LANG_ICONS,
  LANG_ICON_PREFIX,
  langIconSvg,
  normalizeLangToken
} from './lang-icons'

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
  | { kind: 'lang'; token: string; svg: string }

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
 * Obsidian Iconize stores frontmatter icons as `<PackPrefix><IconName>`, e.g.
 * `Cu` (its "custom" pack) + `PendingTaskPage`, `Fab` + `Github`. When a ref
 * doesn't match any icon directly, retry after stripping a leading pack prefix
 * (one capital followed by lowercase/digits, before the next capital) and
 * resolve the remainder by unique stem. The uniqueness guard makes a wrong
 * strip a no-op (it just returns `null` and the caller falls back), so this is
 * safe to attempt only as a last resort.
 */
function resolveIconizePrefixed(
  ref: string,
  customByName: Map<string, CustomIcon>
): CustomIcon | null {
  const match = /^[A-Z][a-z0-9]*([A-Z][A-Za-z0-9]*)$/.exec(ref)
  if (!match) return null
  return resolveCustomByUniqueStem(match[1], customByName)
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
 * 4. An Obsidian Iconize pack-prefixed name (e.g. `CuPendingTaskPage`) whose
 *    stem (`PendingTaskPage`) resolves uniquely → that custom icon.
 * 5. Anything else → `null` (caller falls back to the default icon).
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
    // No section in the ref: try a unique stem (Obsidian-style bare names),
    // then an Iconize pack-prefixed stem (e.g. `custom:CuPendingTaskPage`).
    const byStem = resolveCustomByUniqueStem(key, customByName)
    if (byStem) return { kind: 'custom', icon: byStem }
    const byPrefix = resolveIconizePrefixed(key, customByName)
    return byPrefix ? { kind: 'custom', icon: byPrefix } : null
  }

  if (ref.startsWith('builtin:')) {
    const id = ref.slice('builtin:'.length)
    return isFolderIconId(id) ? { kind: 'builtin', id } : null
  }

  if (ref.startsWith(LANG_ICON_PREFIX)) {
    const token = normalizeLangToken(ref.slice(LANG_ICON_PREFIX.length))
    const svg = langIconSvg(token)
    return svg ? { kind: 'lang', token, svg } : null
  }

  // Bare ref: a custom icon (by unique stem / id) shadows a same-named built-in.
  const custom = resolveCustomByUniqueStem(ref, customByName)
  if (custom) return { kind: 'custom', icon: custom }

  if (isFolderIconId(ref)) return { kind: 'builtin', id: ref }

  // Last resort: an Obsidian Iconize pack-prefixed name (`CuPendingTaskPage`).
  const prefixed = resolveIconizePrefixed(ref, customByName)
  if (prefixed) return { kind: 'custom', icon: prefixed }

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

/**
 * Resolve the {@link import('@shared/ipc').IconRef} to render for a file/asset
 * leaf via pattern rules (`target: 'file'`). Matchers are `pathGlob`/`nameRegex`
 * only — files have no frontmatter. Returns `null` when no rule matches or the
 * matched ref can't be resolved, so the caller falls back to the default file
 * glyph.
 */
export function resolveFileIconRefByRules(
  ctx: { subpath: string; name: string },
  customByName: Map<string, CustomIcon>,
  iconRules: IconRule[] | undefined | null
): string | null {
  const ruleRef = resolveByRules('file', ctx, iconRules)
  if (ruleRef && resolveIcon(ruleRef, customByName)) return ruleRef
  return null
}

/**
 * Resolve the {@link import('@shared/ipc').IconRef} for an inline `{lang icon}`
 * code directive via pattern rules (`target: 'lang'`). The language token is
 * matched against each rule's `nameRegex`. Returns `null` when no rule matches
 * or the matched ref can't be resolved (caller leaves the directive as text).
 */
/**
 * Resolve the icon ref for a `{lang icon}` directive. Order:
 *   1. user override in `langIcons[token]` (Settings → Code language icons),
 *   2. an existing `target:'lang'` icon rule (manual, unchanged behavior),
 *   3. the bundled `lang:<token>` default logo,
 *   4. else `null` (the directive stays literal — unknown language).
 * Tokens are canonicalized via {@link normalizeLangToken} so aliases (js, py,
 * c++…) match overrides and defaults.
 */
export function resolveLangIconRef(
  lang: string,
  customByName: Map<string, CustomIcon>,
  iconRules: IconRule[] | undefined | null,
  langIcons?: Record<string, string> | null
): string | null {
  const token = normalizeLangToken(lang)

  const override = langIcons?.[token]
  if (override && resolveIcon(override, customByName)) return override

  const ruleRef = resolveByRules('lang', { subpath: '', name: lang }, iconRules)
  if (ruleRef && resolveIcon(ruleRef, customByName)) return ruleRef

  const fallback = DEFAULT_LANG_ICONS[token]
  if (fallback && resolveIcon(fallback, customByName)) return fallback

  return null
}
