import type { IconRule } from '@shared/ipc'

/**
 * Context evaluated against {@link IconRule}s for a single note or folder.
 */
export interface IconRuleContext {
  /** Subpath relative to the primary area (e.g. `Daily Notes/2026/06`). */
  subpath: string
  /** Note title or leaf folder name. */
  name: string
  /** Flat frontmatter scalars (notes only). */
  frontmatter?: Record<string, string>
}

// --- compiled-pattern caches -------------------------------------------------

const globCache = new Map<string, RegExp | null>()
const regexCache = new Map<string, RegExp | null>()

function escapeRegexLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Compile a simple glob to a RegExp, cached by source string. `**` matches any
 * run of characters including `/`; a single `*` matches any run except `/`.
 * Returns `null` for an empty/whitespace glob (treated as no matcher).
 */
function compileGlob(glob: string): RegExp | null {
  if (globCache.has(glob)) return globCache.get(glob) ?? null
  let compiled: RegExp | null = null
  const trimmed = glob.trim()
  if (trimmed) {
    let source = '^'
    let i = 0
    while (i < trimmed.length) {
      const ch = trimmed[i]
      if (ch === '*') {
        if (trimmed[i + 1] === '*') {
          source += '.*'
          i += 2
        } else {
          source += '[^/]*'
          i += 1
        }
        continue
      }
      source += escapeRegexLiteral(ch)
      i += 1
    }
    source += '$'
    try {
      compiled = new RegExp(source)
    } catch {
      compiled = null
    }
  }
  globCache.set(glob, compiled)
  return compiled
}

/** Compile a regex source to a RegExp, cached by source string. */
function compileRegex(source: string): RegExp | null {
  if (regexCache.has(source)) return regexCache.get(source) ?? null
  let compiled: RegExp | null = null
  try {
    compiled = new RegExp(source)
  } catch {
    compiled = null
  }
  regexCache.set(source, compiled)
  return compiled
}

function ruleMatches(
  rule: IconRule,
  ctx: IconRuleContext,
  target: 'note' | 'folder' | 'file'
): boolean {
  let hasMatcher = false

  if (rule.pathGlob) {
    const re = compileGlob(rule.pathGlob)
    if (!re) return false
    hasMatcher = true
    if (!re.test(ctx.subpath)) return false
  }

  if (rule.nameRegex) {
    const re = compileRegex(rule.nameRegex)
    if (!re) return false
    hasMatcher = true
    if (!re.test(ctx.name)) return false
  }

  // Frontmatter conditions apply to notes only; folder rules ignore them.
  if (target === 'note' && rule.frontmatter && rule.frontmatter.key) {
    hasMatcher = true
    const { key, equals, exists } = rule.frontmatter
    const fm = ctx.frontmatter ?? {}
    const present = Object.prototype.hasOwnProperty.call(fm, key)
    if (exists === true && !present) return false
    if (equals !== undefined && fm[key] !== equals) return false
    // An `exists: false` condition (key must be absent) is also honored.
    if (exists === false && present) return false
  }

  return hasMatcher
}

/**
 * Resolve the icon for a note/folder by scanning `rules` in order and returning
 * the {@link IconRef} of the FIRST rule (= highest priority) that matches its
 * `target` and whose present matchers all match `ctx`. Returns `null` when no
 * rule matches.
 */
export function resolveByRules(
  target: 'note' | 'folder' | 'file',
  ctx: IconRuleContext,
  rules: IconRule[] | undefined | null
): string | null {
  if (!rules || rules.length === 0) return null
  for (const rule of rules) {
    if (rule.target !== target) continue
    if (!rule.icon) continue
    if (ruleMatches(rule, ctx, target)) return rule.icon
  }
  return null
}
