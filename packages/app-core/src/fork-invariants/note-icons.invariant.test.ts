/**
 * FORK INVARIANT — a note's icon comes from the note, never from `folderIcons`.
 *
 * Upstream stores a note's icon in `vaultSettings.folderIcons[<note path>]`.
 * This fork does NOT: a note carries its icon in its own frontmatter `icon:`
 * (then pattern rules), resolved by `resolveNoteIconRef`, so the same icon
 * shows in the sidebar, next to every [[wikilink]] and on tabs. `folderIcons`
 * is only ever keyed by `folderIconKey(folder, subpath)` — for FOLDERS.
 * See the note at `Sidebar.tsx` ~2394 and `personal-fork-features.md` §3 (U03–U12).
 *
 * Why this exists: in the v2.24.0 sync upstream added "a favourited note keeps
 * its icon", reading it from `folderIcons`. It auto-merged with no conflict.
 * Typecheck only complained because the fork's value type also differs, and the
 * FIRST fix was still wrong — it changed the rendering but kept upstream's data
 * source, so favourites silently showed the generic glyph. Only running the app
 * revealed it.
 *
 * A divergent data model produces no conflict and not always a type error. This
 * test makes that class of bug fail in the gates instead.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { CustomIcon, IconRule, NoteMeta } from '@shared/ipc'
import { buildCustomIconIndex, resolveNoteIconRef } from '../lib/icon-resolve'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** Surfaces that render a note's icon. Add any new one here. */
const ICON_SURFACES = [
  '../components/Sidebar.tsx',
  '../components/EditorPane.tsx',
  '../components/PinnedReferencePane.tsx',
  '../components/Preview.tsx'
]

/** Strip line and block comments so prose about the rule never trips it. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

function noteFixture(over: Partial<NoteMeta> = {}): Pick<
  NoteMeta,
  'icon' | 'folder' | 'path' | 'title' | 'frontmatter'
> {
  return {
    icon: undefined,
    folder: 'inbox',
    path: 'inbox/Idea.md',
    title: 'Idea',
    frontmatter: undefined,
    ...over
  } as Pick<NoteMeta, 'icon' | 'folder' | 'path' | 'title' | 'frontmatter'>
}

const NO_CUSTOM = buildCustomIconIndex([] as CustomIcon[])

describe('fork invariant: note icons resolve from the note', () => {
  describe('resolution chain', () => {
    it('lets an explicit frontmatter icon win', () => {
      const ref = resolveNoteIconRef(
        noteFixture({ icon: 'builtin:star' }),
        null,
        NO_CUSTOM,
        []
      )
      expect(ref).toBe('builtin:star')
    })

    it('falls back to the first matching rule when there is no frontmatter icon', () => {
      const rules: IconRule[] = [
        { id: 'r1', target: 'note', nameRegex: '^Nope$', icon: 'builtin:trash' },
        { id: 'r2', target: 'note', nameRegex: '^Idea$', icon: 'builtin:bolt' }
      ]
      const ref = resolveNoteIconRef(noteFixture(), null, NO_CUSTOM, rules)
      expect(ref, 'the first rule that matches should win').toBe('builtin:bolt')
    })

    it('keeps frontmatter above rules', () => {
      const rules: IconRule[] = [
        { id: 'r1', target: 'note', nameRegex: '^Idea$', icon: 'builtin:bolt' }
      ]
      const ref = resolveNoteIconRef(
        noteFixture({ icon: 'builtin:star' }),
        null,
        NO_CUSTOM,
        rules
      )
      expect(ref, 'an explicit icon: must outrank any rule').toBe('builtin:star')
    })

    it('returns null when nothing applies, so the caller draws its default', () => {
      expect(resolveNoteIconRef(noteFixture(), null, NO_CUSTOM, [])).toBeNull()
    })

    it('ignores an unresolvable ref rather than passing it through', () => {
      const ref = resolveNoteIconRef(
        noteFixture({ icon: 'builtin:not-a-real-icon' }),
        null,
        NO_CUSTOM,
        []
      )
      expect(ref, 'a ref that resolves to nothing must fall through to null').toBeNull()
    })
  })

  describe('no surface reads a note icon out of folderIcons', () => {
    it.each(ICON_SURFACES)('%s keys folderIcons only by folderIconKey()', (rel) => {
      const src = stripComments(readFileSync(path.resolve(HERE, rel), 'utf8'))
      const offenders: string[] = []

      for (const match of src.matchAll(/folderIcons\s*\[/g)) {
        // Whatever follows the bracket, whitespace and newlines skipped.
        const after = src.slice(match.index + match[0].length).trimStart()
        if (!after.startsWith('folderIconKey(')) {
          offenders.push(after.slice(0, 60).split('\n')[0])
        }
      }

      expect(
        offenders,
        `${rel} indexes \`folderIcons\` with something other than ` +
          `\`folderIconKey(folder, subpath)\`. In this fork folderIcons holds FOLDER ` +
          `icons only; a note's icon is its frontmatter \`icon:\` — resolve it with ` +
          `resolveNoteIconRef(note, settings, customByName, iconRules). ` +
          `Offending keys:\n  ${offenders.join('\n  ')}`
      ).toEqual([])
    })
  })
})
