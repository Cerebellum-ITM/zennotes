/**
 * FORK INVARIANT — the Settings catalog stays internally consistent.
 *
 * Why this exists: porting an upstream setting into this fork's SettingsModal
 * takes FOUR pieces, not one (see `context/personal-fork-features.md` §4c):
 *   1. the `useStore` selector      → already covered by typecheck
 *   2. the rendered row             → covered here
 *   3. the `searchItems` entry      → covered here
 *   4. the id in its page `searchIds` → covered here
 * Forgetting #3 or #4 compiles, renders, and ships a setting the user cannot
 * find by searching. That omission happened in all three sync batches of the
 * v2.13.2 → v2.24.0 catch-up and nothing detected it.
 *
 * This is a static check on purpose: rendering every Settings page would mean
 * driving the whole modal, and the property we care about is textual — three
 * sets of ids agreeing with each other.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SETTINGS_MODAL = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../components/SettingsModal.tsx'
)

/**
 * Settings that render without a `searchItems` entry, inherited from before
 * this suite existed. They are NOT allowed to grow: a new id here means someone
 * ported a setting and skipped the search index. Fix the setting instead —
 * removing an entry from this list is always welcome.
 */
const KNOWN_UNINDEXED = new Set([
  'code-background-color',
  'daily-notes-obsidian-preset',
  'daily-notes-rollover',
  'daily-notes-tasks-due-on-date',
  'pdf-export-use-theme'
])

/** Extract the text of every `key: [ … ]` array literal, brackets balanced. */
function arrayBlocks(src: string, key: string): string[] {
  const out: string[] = []
  const opener = new RegExp(`${key}:\\s*\\[`, 'g')
  let match: RegExpExecArray | null
  while ((match = opener.exec(src)) !== null) {
    let i = match.index + match[0].length - 1
    let depth = 0
    const start = i + 1
    for (; i < src.length; i++) {
      if (src[i] === '[') depth++
      else if (src[i] === ']') {
        depth--
        if (depth === 0) break
      }
    }
    out.push(src.slice(start, i))
  }
  return out
}

function collect(re: RegExp, src: string): Set<string> {
  return new Set(Array.from(src.matchAll(re), (m) => m[1]))
}

const src = readFileSync(SETTINGS_MODAL, 'utf8')

/** Rows rendered with `settingId="…"`. */
const rendered = collect(/settingId=["']([a-z0-9-]+)["']/g, src)
/** Blocks that are search targets without being a row (tutorial buttons, lists). */
const targets = collect(/settingsSearchTargetProps\(\s*['"]([a-z0-9-]+)['"]/g, src)
/** Everything reachable in the UI. */
const reachable = new Set([...rendered, ...targets])

const indexed = new Set(
  arrayBlocks(src, 'searchItems').flatMap((block) =>
    Array.from(block.matchAll(/\bid:\s*['"]([a-z0-9-]+)['"]/g), (m) => m[1])
  )
)

const referenced = new Set(
  arrayBlocks(src, 'searchIds').flatMap((block) =>
    Array.from(block.matchAll(/['"]([a-z0-9-]+)['"]/g), (m) => m[1])
  )
)

/**
 * A conditional folder input (`drawings-folder`) sitting under an indexed
 * location row (`drawings-location`) is reachable through its parent, so it
 * does not need its own entry.
 */
function hasIndexedLocationParent(id: string): boolean {
  return id.endsWith('-folder') && indexed.has(`${id.slice(0, -'-folder'.length)}-location`)
}

describe('fork invariant: Settings catalog integrity', () => {
  it('parses the catalog at all (guards against the regexes silently going stale)', () => {
    expect(rendered.size, 'no settingId rows parsed from SettingsModal.tsx').toBeGreaterThan(80)
    expect(indexed.size, 'no searchItems entries parsed').toBeGreaterThan(80)
    expect(referenced.size, 'no searchIds entries parsed').toBeGreaterThan(40)
  })

  it('indexes every setting it renders', () => {
    const missing = [...reachable]
      .filter((id) => !indexed.has(id))
      .filter((id) => !hasIndexedLocationParent(id))
      .filter((id) => !KNOWN_UNINDEXED.has(id))
      .sort()

    expect(
      missing,
      `These settings render but have no \`searchItems\` entry, so Settings search ` +
        `cannot find them. Add one (id, title, description, keywords) next to its ` +
        `siblings — see personal-fork-features.md §4c:\n  ${missing.join('\n  ')}`
    ).toEqual([])
  })

  it('has no orphan id in any page `searchIds`', () => {
    const orphans = [...referenced].filter((id) => !indexed.has(id)).sort()

    expect(
      orphans,
      `These ids are listed in a page's \`searchIds\` but have no \`searchItems\` ` +
        `entry, so the page claims a setting that the index does not describe:\n  ${orphans.join('\n  ')}`
    ).toEqual([])
  })

  it('has no dead `searchItems` entry', () => {
    const dead = [...indexed]
      .filter((id) => !reachable.has(id) && !referenced.has(id))
      .sort()

    expect(
      dead,
      `These \`searchItems\` entries are neither rendered nor referenced by any ` +
        `page, so searching finds an entry that leads nowhere (usually a setting ` +
        `that was removed, or a row placed on the wrong page):\n  ${dead.join('\n  ')}`
    ).toEqual([])
  })

  it('keeps the inherited-debt allowlist honest', () => {
    // An entry that got fixed (or removed) must leave this list, or the list
    // slowly becomes a place where real omissions can hide.
    const stale = [...KNOWN_UNINDEXED]
      .filter((id) => indexed.has(id) || !reachable.has(id))
      .sort()

    expect(
      stale,
      `KNOWN_UNINDEXED is out of date — these ids are now indexed or no longer ` +
        `rendered. Delete them from the allowlist:\n  ${stale.join('\n  ')}`
    ).toEqual([])
  })
})
