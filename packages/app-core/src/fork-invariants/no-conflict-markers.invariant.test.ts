/**
 * FORK INVARIANT — no unresolved merge-conflict markers reach the tree.
 *
 * Why this exists: twice during the v2.13.2 → v2.24.0 sync a conflict hunk was
 * resolved by its sides but the opening `<<<<<<<` line survived, once in a
 * `.css` file that was already staged. Neither typecheck nor the 1400+ unit
 * tests can see it, and the build only degrades it to
 * `▲ [WARNING] Unexpected "<" [css-syntax-error]` — easy to scroll past.
 *
 * If this test disappears, a half-resolved conflict can ship with every gate
 * green. See `context/personal-fork-features.md` §4c.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Built by concatenation on purpose: written literally, this file would match
// its own scan.
const OPEN = '<'.repeat(7) + ' '
const CLOSE = '>'.repeat(7) + ' '
const BASE = '|'.repeat(7) + ' '

const SCANNED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.css',
  '.json',
  '.go',
  '.mjs',
  '.js',
  '.md'
])

const SKIPPED_DIRS = new Set([
  'node_modules',
  'dist',
  'out',
  '.git',
  '.turbo',
  'coverage',
  'build'
])

/** Repo root, from `packages/app-core/src/fork-invariants/`. */
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..'
)

const SCANNED_ROOTS = ['packages', 'apps', 'tooling']

function* walk(dir: string): Generator<string> {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return // unreadable dir (permissions, race) — nothing to assert about it
  }
  for (const entry of entries) {
    if (entry.startsWith('.') && entry !== '.github') continue
    if (SKIPPED_DIRS.has(entry)) continue
    const full = path.join(dir, entry)
    let stat: ReturnType<typeof statSync>
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      yield* walk(full)
    } else if (SCANNED_EXTENSIONS.has(path.extname(entry))) {
      yield full
    }
  }
}

describe('fork invariant: no merge-conflict markers', () => {
  it('leaves no conflict marker anywhere under packages/, apps/ or tooling/', () => {
    const offenders: string[] = []

    for (const root of SCANNED_ROOTS) {
      for (const file of walk(path.join(REPO_ROOT, root))) {
        const lines = readFileSync(file, 'utf8').split('\n')
        lines.forEach((line, idx) => {
          if (line.startsWith(OPEN) || line.startsWith(CLOSE) || line.startsWith(BASE)) {
            offenders.push(`${path.relative(REPO_ROOT, file)}:${idx + 1}: ${line.slice(0, 40)}`)
          }
        })
      }
    }

    expect(
      offenders,
      `Unresolved merge-conflict markers found. Resolve the hunk and delete the ` +
        `marker lines:\n  ${offenders.join('\n  ')}`
    ).toEqual([])
  })

  it('actually scans a meaningful number of files (guards against a broken walk)', () => {
    // A silently-empty walk would make the check above pass forever.
    const count = SCANNED_ROOTS.reduce(
      (acc, root) => acc + [...walk(path.join(REPO_ROOT, root))].length,
      0
    )
    expect(count, `expected to scan the repo, only saw ${count} files`).toBeGreaterThan(500)
  })
})
