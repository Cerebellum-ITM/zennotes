/**
 * FORK INVARIANT — vault text search skips trash and attachment roots, and
 * honours custom system-folder paths.
 *
 * This fork wraps upstream's folder classifier in `searchableFolderForRelPath`
 * so the built-in search never returns notes living in `trash/`, `assets/`,
 * `_assets/` or `.zennotes/`. In the v2.20.2 sync upstream changed the
 * classifier's signature to take vault settings (custom on-disk folder paths,
 * #115); the wrapper had to thread that argument through, or a vault whose
 * `archive` lives at `Archivo` would classify those notes as "not searchable"
 * and silently drop them from every search.
 *
 * The exclusions and the remapping pull in opposite directions — one hides
 * folders, the other renames them — so they are tested together on purpose.
 *
 * Runs against the builtin backend explicitly: ripgrep/fzf may or may not exist
 * on the machine, and it is our candidate walk that carries the guard.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  invalidateVaultSettingsCache,
  invalidateVaultTextSearchCache,
  searchVaultText
} from '../main/vault'

/** Unlikely to collide with anything the fixtures contain incidentally. */
const NEEDLE = 'zqxinvariantneedle'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function seedVault(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zennotes-search-invariant-'))
  tempDirs.push(root)

  const note = async (rel: string) => {
    const abs = path.join(root, rel)
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, `# ${path.basename(rel)}\n\n${NEEDLE}\n`, 'utf8')
  }

  await mkdir(path.join(root, '.zennotes'), { recursive: true })
  await writeFile(
    path.join(root, '.zennotes', 'vault.json'),
    // `archive` moved on disk; its notes must still be searchable (#115).
    JSON.stringify({ primaryNotesLocation: 'root', systemFolderPaths: { archive: 'Archivo' } }),
    'utf8'
  )

  await note('Normal.md')
  await note('Archivo/Archivada.md')
  await note('trash/Borrada.md')
  await note('assets/no-buscar.md')
  await note('_assets/legacy.md')
  await note('.zennotes/interno.md')

  invalidateVaultSettingsCache(root)
  invalidateVaultTextSearchCache(root)
  return root
}

describe('fork invariant: vault text search exclusions', () => {
  it('returns normal and remapped-system-folder notes, and nothing else', async () => {
    const root = await seedVault()

    const matches = await searchVaultText(root, NEEDLE, 'builtin')
    const paths = matches.map((m) => m.path).sort()

    expect(
      paths,
      'Search must cover ordinary notes AND notes in a system folder with a ' +
        'custom on-disk path (#115): `searchableFolderForRelPath` has to receive ' +
        'the vault settings and pass them to the classifier. Got:\n  ' +
        paths.join('\n  ')
    ).toEqual(['Archivo/Archivada.md', 'Normal.md'])
  })

  it.each([
    ['trash/Borrada.md', 'the trash'],
    ['assets/no-buscar.md', 'the attachments dir'],
    ['_assets/legacy.md', 'the legacy attachments dir'],
    ['.zennotes/interno.md', 'the internal vault dir']
  ])('never returns %s (%s)', async (excluded) => {
    const root = await seedVault()

    const matches = await searchVaultText(root, NEEDLE, 'builtin')

    expect(
      matches.map((m) => m.path),
      `${excluded} must stay out of search results — that is what the ` +
        '`searchableFolderForRelPath` guard is for.'
    ).not.toContain(excluded)
  })

  it('classifies a remapped system folder as its folder id, not as a user folder', async () => {
    const root = await seedVault()

    const match = (await searchVaultText(root, NEEDLE, 'builtin')).find(
      (m) => m.path === 'Archivo/Archivada.md'
    )

    expect(match, 'the remapped archive note should be found at all').toBeTruthy()
    expect(
      match?.folder,
      'a note under the remapped archive path still belongs to the `archive` folder'
    ).toBe('archive')
  })
})
