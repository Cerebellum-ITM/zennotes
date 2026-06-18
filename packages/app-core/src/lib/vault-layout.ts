import {
  DEFAULT_DAILY_NOTES_DIRECTORY,
  DEFAULT_WEEKLY_NOTES_DIRECTORY,
  DEFAULT_VAULT_SETTINGS,
  type AssetMeta,
  type FolderIconId,
  type IconRule,
  type NoteFolder,
  type NoteMeta,
  type VaultSettings
} from '@shared/ipc'
import { formatDate, getISOWeek, getISOWeekYear, mondayOfISOWeek } from './template-render'

const SYSTEM_FOLDERS = new Set<NoteFolder>(['inbox', 'quick', 'archive', 'trash'])
const RESERVED_ROOT_NAMES = new Set<string>([
  'inbox',
  'quick',
  'archive',
  'trash',
  'attachements',
  '_assets',
  '.zennotes'
])
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

function isFolderIconId(value: unknown): value is FolderIconId {
  return typeof value === 'string' && VALID_FOLDER_ICON_IDS.has(value as FolderIconId)
}

const CUSTOM_ICON_NAME_RE = /^[A-Za-z0-9._-]+$/

/**
 * Whether a stored `folderIcons` value is a valid IconRef: a bare built-in id,
 * a `builtin:<id>` ref, or a `custom:<id>` ref (where `<id>` is a POSIX relpath
 * whose segments are each a safe stem, e.g. `star` or `work/star`). Validates
 * the format only — the renderer falls back to the default when missing.
 */
function isIconRef(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.startsWith('custom:')) {
    return value
      .slice('custom:'.length)
      .split('/')
      .every((seg) => CUSTOM_ICON_NAME_RE.test(seg))
  }
  if (value.startsWith('builtin:')) {
    return isFolderIconId(value.slice('builtin:'.length))
  }
  return isFolderIconId(value)
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

export function normalizeDailyNotesDirectory(directory: string | null | undefined): string {
  const trimmed = (directory ?? '').trim().replace(/^\/+|\/+$/g, '')
  return trimmed || DEFAULT_DAILY_NOTES_DIRECTORY
}

export function normalizeWeeklyNotesDirectory(directory: string | null | undefined): string {
  const trimmed = (directory ?? '').trim().replace(/^\/+|\/+$/g, '')
  return trimmed || DEFAULT_WEEKLY_NOTES_DIRECTORY
}

function normalizeTemplateId(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? '').trim()
  return trimmed || undefined
}

/**
 * Normalize a daily-note path pattern: trim, strip leading/trailing slashes and
 * a trailing `.md`. Empty -> undefined (= legacy flat ISO behavior).
 */
export function normalizeDailyPathFormat(
  value: string | null | undefined
): string | undefined {
  const trimmed = (value ?? '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.md$/i, '')
  return trimmed || undefined
}

/** Normalize a BCP-47 locale string. Empty -> undefined (= system locale). */
export function normalizeLocale(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? '').trim()
  return trimmed || undefined
}

function isValidRegexSource(source: string): boolean {
  try {
    new RegExp(source)
    return true
  } catch {
    return false
  }
}

/**
 * Validate and normalize the `iconRules` list: drop rules without a valid
 * `target`, an empty/invalid `icon` IconRef, or any matcher; drop rules whose
 * `nameRegex` fails to compile or whose `pathGlob` is empty/whitespace.
 */
export function normalizeIconRules(value: unknown): IconRule[] {
  if (!Array.isArray(value)) return []
  const rules: IconRule[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const candidate = raw as Partial<IconRule>
    const target = candidate.target
    if (target !== 'note' && target !== 'folder' && target !== 'file') continue
    if (!isIconRef(candidate.icon)) continue

    const pathGlob =
      typeof candidate.pathGlob === 'string' ? candidate.pathGlob.trim() : ''
    const nameRegex =
      typeof candidate.nameRegex === 'string' ? candidate.nameRegex.trim() : ''
    if (nameRegex && !isValidRegexSource(nameRegex)) continue

    let frontmatter: IconRule['frontmatter']
    if (
      target === 'note' &&
      candidate.frontmatter &&
      typeof candidate.frontmatter === 'object' &&
      typeof candidate.frontmatter.key === 'string' &&
      candidate.frontmatter.key.trim()
    ) {
      const key = candidate.frontmatter.key.trim()
      const equals =
        typeof candidate.frontmatter.equals === 'string'
          ? candidate.frontmatter.equals
          : undefined
      const exists =
        typeof candidate.frontmatter.exists === 'boolean'
          ? candidate.frontmatter.exists
          : undefined
      if (equals !== undefined || exists !== undefined) {
        frontmatter = { key, ...(equals !== undefined ? { equals } : {}), ...(exists !== undefined ? { exists } : {}) }
      }
    }

    const hasMatcher = !!pathGlob || !!nameRegex || !!frontmatter
    if (!hasMatcher) continue

    const id =
      typeof candidate.id === 'string' && candidate.id
        ? candidate.id
        : `rule-${rules.length}-${Math.random().toString(36).slice(2, 9)}`

    rules.push({
      id,
      target,
      ...(pathGlob ? { pathGlob } : {}),
      ...(nameRegex ? { nameRegex } : {}),
      ...(frontmatter ? { frontmatter } : {}),
      icon: candidate.icon as string
    })
  }
  return rules
}

export function normalizeVaultSettings(
  settings: VaultSettings | null | undefined
): VaultSettings {
  const folderIcons = settings?.folderIcons
  const normalizedFolderIcons: Record<string, string> = {}
  if (folderIcons && typeof folderIcons === 'object') {
    for (const [key, value] of Object.entries(folderIcons)) {
      if (!key || !isIconRef(value)) continue
      normalizedFolderIcons[key] = value
    }
  }
  return {
    primaryNotesLocation:
      settings?.primaryNotesLocation === 'root'
        ? 'root'
        : DEFAULT_VAULT_SETTINGS.primaryNotesLocation,
    dailyNotes: {
      enabled: !!settings?.dailyNotes?.enabled,
      directory: normalizeDailyNotesDirectory(settings?.dailyNotes?.directory),
      templateId: normalizeTemplateId(settings?.dailyNotes?.templateId),
      pathFormat: normalizeDailyPathFormat(settings?.dailyNotes?.pathFormat),
      locale: normalizeLocale(settings?.dailyNotes?.locale)
    },
    weeklyNotes: {
      enabled: !!settings?.weeklyNotes?.enabled,
      directory: normalizeWeeklyNotesDirectory(settings?.weeklyNotes?.directory),
      templateId: normalizeTemplateId(settings?.weeklyNotes?.templateId)
    },
    folderIcons: normalizedFolderIcons,
    iconRules: normalizeIconRules(settings?.iconRules)
  }
}

export function folderIconKey(folder: NoteFolder, subpath: string): string {
  return `${folder}:${subpath}`
}

export function rewriteFolderIconsForRename(
  folderIcons: Record<string, string>,
  folder: NoteFolder,
  oldSubpath: string,
  newSubpath: string
): Record<string, string> {
  const next: Record<string, string> = {}
  const exactKey = folderIconKey(folder, oldSubpath)
  const prefix = `${exactKey}/`
  for (const [key, value] of Object.entries(folderIcons)) {
    if (key === exactKey) {
      next[folderIconKey(folder, newSubpath)] = value
      continue
    }
    if (key.startsWith(prefix)) {
      next[folderIconKey(folder, newSubpath) + key.slice(exactKey.length)] = value
      continue
    }
    next[key] = value
  }
  return next
}

export function removeFolderIcons(
  folderIcons: Record<string, string>,
  folder: NoteFolder,
  subpath: string
): Record<string, string> {
  const next: Record<string, string> = {}
  const exactKey = folderIconKey(folder, subpath)
  const prefix = `${exactKey}/`
  for (const [key, value] of Object.entries(folderIcons)) {
    if (key === exactKey || key.startsWith(prefix)) continue
    next[key] = value
  }
  return next
}

export function duplicateFolderIcons(
  folderIcons: Record<string, string>,
  folder: NoteFolder,
  sourceSubpath: string,
  targetSubpath: string
): Record<string, string> {
  const next: Record<string, string> = { ...folderIcons }
  const exactKey = folderIconKey(folder, sourceSubpath)
  const prefix = `${exactKey}/`
  for (const [key, value] of Object.entries(folderIcons)) {
    if (key === exactKey) {
      next[folderIconKey(folder, targetSubpath)] = value
      continue
    }
    if (key.startsWith(prefix)) {
      next[folderIconKey(folder, targetSubpath) + key.slice(exactKey.length)] = value
    }
  }
  return next
}

export function isPrimaryNotesAtRoot(
  settings: VaultSettings | null | undefined
): boolean {
  return normalizeVaultSettings(settings).primaryNotesLocation === 'root'
}

export function notePathWithinFolder(
  path: string,
  folder: NoteFolder,
  settings: VaultSettings | null | undefined
): string {
  if (folder === 'inbox' && isPrimaryNotesAtRoot(settings)) return path
  const prefix = `${folder}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

export function noteFolderSubpath(
  note: Pick<NoteMeta, 'folder' | 'path'>,
  settings: VaultSettings | null | undefined
): string {
  const within = notePathWithinFolder(note.path, note.folder, settings)
  const parts = within.split('/').filter(Boolean)
  return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
}

export function noteBelongsToFolderView(
  note: Pick<NoteMeta, 'folder' | 'path'>,
  folder: NoteFolder,
  subpath: string,
  settings: VaultSettings | null | undefined
): boolean {
  if (note.folder !== folder) return false
  if (!subpath) return true
  const parent = noteFolderSubpath(note, settings)
  return parent === subpath || parent.startsWith(`${subpath}/`)
}

export function noteTitleForDate(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Build the subfolder path (relative to the vault primary area) and filename
 * title for a daily note on `date`. When `dailyNotes.pathFormat` is set, the
 * pattern is rendered (locale-aware) and split on `/` into nested folders + the
 * final filename; otherwise the legacy flat ISO scheme is used.
 */
export function dailyNoteRelPathForDate(
  date: Date,
  settings: VaultSettings | null | undefined
): { subpath: string; title: string } {
  const normalized = normalizeVaultSettings(settings)
  const dir = normalized.dailyNotes.directory
  const fmt = normalized.dailyNotes.pathFormat
  if (!fmt) return { subpath: dir, title: noteTitleForDate(date) }
  const rendered = formatDate(date, fmt, normalized.dailyNotes.locale)
  const segs = rendered
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
  const title = segs.pop() || noteTitleForDate(date)
  const subpath = [dir, ...segs].join('/')
  return { subpath, title }
}

// --- daily path-pattern parsing (reverse of dailyNoteRelPathForDate) --------

const DAILY_PATTERN_TOKEN_RE = /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D/g

interface CompiledDailyPattern {
  regex: RegExp
  tokens: string[]
  longMonths: Map<string, number>
  shortMonths: Map<string, number>
}

const dailyPatternCache = new Map<string, CompiledDailyPattern>()

function escapeRegexLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function monthNameIndex(locale: string | undefined, width: 'long' | 'short'): Map<string, number> {
  const map = new Map<string, number>()
  for (let i = 0; i < 12; i++) {
    const name = new Date(2021, i, 1).toLocaleDateString(locale || undefined, { month: width })
    map.set(name.toLowerCase(), i)
  }
  return map
}

function compileDailyPattern(format: string, locale: string | undefined): CompiledDailyPattern {
  const key = `${locale ?? ''} ${format}`
  const cached = dailyPatternCache.get(key)
  if (cached) return cached

  const tokens: string[] = []
  let source = '^'
  let last = 0
  for (const m of format.matchAll(DAILY_PATTERN_TOKEN_RE)) {
    const idx = m.index ?? 0
    if (idx > last) source += escapeRegexLiteral(format.slice(last, idx))
    last = idx + m[0].length
    if (m[1] !== undefined) {
      source += escapeRegexLiteral(m[1])
      continue
    }
    const tok = m[0]
    tokens.push(tok)
    switch (tok) {
      case 'YYYY':
        source += '(\\d{4})'
        break
      case 'YY':
      case 'MM':
      case 'DD':
        source += '(\\d{2})'
        break
      case 'M':
      case 'D':
        source += '(\\d{1,2})'
        break
      case 'MMMM':
      case 'MMM':
        source += '(\\p{L}+)'
        break
    }
  }
  if (last < format.length) source += escapeRegexLiteral(format.slice(last))
  source += '$'

  const compiled: CompiledDailyPattern = {
    regex: new RegExp(source, 'u'),
    tokens,
    longMonths: monthNameIndex(locale, 'long'),
    shortMonths: monthNameIndex(locale, 'short')
  }
  dailyPatternCache.set(key, compiled)
  return compiled
}

/**
 * Parse a date out of a daily-note candidate string (subfolders + filename,
 * relative to the daily directory) using `format`. Returns null when it does
 * not match. Numeric month tokens take precedence over localized name tokens.
 */
export function parseDailyPattern(
  candidate: string,
  format: string,
  locale: string | undefined
): Date | null {
  const compiled = compileDailyPattern(format, locale)
  const match = compiled.regex.exec(candidate)
  if (!match) return null
  let year: number | null = null
  let month: number | null = null
  let day: number | null = null
  compiled.tokens.forEach((tok, i) => {
    const raw = match[i + 1]
    if (raw == null) return
    switch (tok) {
      case 'YYYY':
        year = Number(raw)
        break
      case 'YY':
        year = 2000 + Number(raw)
        break
      case 'MM':
      case 'M':
        month = Number(raw) - 1
        break
      case 'MMMM':
        if (month == null) {
          const idx = compiled.longMonths.get(raw.toLowerCase())
          if (idx != null) month = idx
        }
        break
      case 'MMM':
        if (month == null) {
          const idx = compiled.shortMonths.get(raw.toLowerCase())
          if (idx != null) month = idx
        }
        break
      case 'DD':
      case 'D':
        day = Number(raw)
        break
    }
  })
  if (year == null || month == null || day == null) return null
  if (month < 0 || month > 11 || day < 1 || day > 31) return null
  const date = new Date(year, month, day)
  // Reject impossible dates that JS would roll over (e.g. 31-02).
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null
  }
  return date
}

export function weeklyNoteTitle(date = new Date()): string {
  return `${getISOWeekYear(date)}-W${pad(getISOWeek(date))}`
}

const DAILY_TITLE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const WEEKLY_TITLE_RE = /^(\d{4})-W(\d{2})$/

export interface DateNoteInfo {
  kind: 'daily' | 'weekly'
  /** Daily: that calendar day. Weekly: the Monday of that ISO week. */
  date: Date
}

/**
 * Classify a note as a daily or weekly note, or `null` if it is neither.
 * A note qualifies only when its title matches the date/week format, it lives
 * in the configured daily/weekly directory, and that feature is enabled — so a
 * stray note titled `2026-06-08` outside the daily folder is not treated as one.
 */
export function classifyDateNote(
  note: Pick<NoteMeta, 'folder' | 'path' | 'title'>,
  settings: VaultSettings | null | undefined
): DateNoteInfo | null {
  const normalized = normalizeVaultSettings(settings)
  const subpath = noteFolderSubpath(note, settings)

  if (normalized.dailyNotes.enabled) {
    const dir = normalized.dailyNotes.directory
    const fmt = normalized.dailyNotes.pathFormat
    if (!fmt) {
      // Legacy: flat ISO title directly inside the daily directory.
      if (subpath === dir) {
        const m = DAILY_TITLE_RE.exec(note.title)
        if (m) {
          const [, y, mo, d] = m
          return { kind: 'daily', date: new Date(Number(y), Number(mo) - 1, Number(d)) }
        }
      }
    } else if (subpath === dir || subpath.startsWith(`${dir}/`)) {
      // Configured pattern: match nested folders + filename against the format.
      const within = subpath === dir ? '' : subpath.slice(dir.length + 1)
      const candidate = within ? `${within}/${note.title}` : note.title
      const date = parseDailyPattern(candidate, fmt, normalized.dailyNotes.locale)
      if (date) return { kind: 'daily', date }
    }
  }

  if (normalized.weeklyNotes.enabled && subpath === normalized.weeklyNotes.directory) {
    const m = WEEKLY_TITLE_RE.exec(note.title)
    if (m) {
      const [, y, w] = m
      return { kind: 'weekly', date: mondayOfISOWeek(Number(y), Number(w)) }
    }
  }

  return null
}

export function folderForVaultRelativePath(
  relPath: string,
  settings: VaultSettings | null | undefined
): NoteFolder | null {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
  const top = normalized.split('/')[0] ?? ''
  if (!top || top.startsWith('.')) return null
  if (SYSTEM_FOLDERS.has(top as NoteFolder)) return top as NoteFolder
  if (isPrimaryNotesAtRoot(settings) && !RESERVED_ROOT_NAMES.has(top)) return 'inbox'
  return null
}

export function assetPathWithinFolder(
  assetPath: string,
  folder: NoteFolder,
  settings: VaultSettings | null | undefined
): string {
  const normalized = assetPath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (folder === 'inbox' && isPrimaryNotesAtRoot(settings)) return normalized
  const prefix = `${folder}/`
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized
}

export function assetFolderSubpath(
  asset: Pick<AssetMeta, 'path'>,
  settings: VaultSettings | null | undefined
): string {
  const folder = folderForVaultRelativePath(asset.path, settings)
  if (!folder) return ''
  const within = assetPathWithinFolder(asset.path, folder, settings)
  const parts = within.split('/').filter(Boolean)
  return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
}

export function assetBelongsToFolderView(
  asset: Pick<AssetMeta, 'path'>,
  folder: NoteFolder,
  subpath: string,
  settings: VaultSettings | null | undefined
): boolean {
  const assetFolder = folderForVaultRelativePath(asset.path, settings)
  if (assetFolder !== folder) return false
  if (!subpath) return true
  const parent = assetFolderSubpath(asset, settings)
  return parent === subpath || parent.startsWith(`${subpath}/`)
}
