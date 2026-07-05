import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNote, readNote, setNoteIcon } from '../../mcp/vault-ops.js'
import { parse } from '../args.js'
import { cmdIconsClear, cmdIconsSet } from './icons.js'

const tempDirs: string[] = []
async function makeVault(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'zen-icons-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

describe('vault-ops setNoteIcon — canonical frontmatter note icon', () => {
  it('writes then clears the frontmatter icon key', async () => {
    const vault = await makeVault()
    const note = await createNote(vault, 'inbox', 'Foo', '', '# Foo\n\nbody\n')

    await setNoteIcon(vault, note.path, 'custom:evil')
    let body = (await readNote(vault, note.path)).body
    // The value carries a colon, so setFrontmatterKey quotes it (valid YAML).
    expect(body).toMatch(/^---\n[\s\S]*\bicon:\s*"?custom:evil"?[\s\S]*\n---\n/)

    await setNoteIcon(vault, note.path, null)
    body = (await readNote(vault, note.path)).body
    expect(body).not.toContain('icon:')
    expect(body).toContain('# Foo')
  })
})

describe('cmd icons set — ref validation', () => {
  it('rejects an unknown custom ref before writing', async () => {
    const vault = await makeVault()
    const note = await createNote(vault, 'inbox', 'Bar', '', '# Bar\n')
    await expect(
      cmdIconsSet(vault, parse([note.path, 'custom:does-not-exist']))
    ).rejects.toThrow(/Unknown custom icon/)
    // Untouched: no frontmatter written.
    expect((await readNote(vault, note.path)).body).not.toContain('icon:')
  })

  it('accepts a real custom ref and clears it', async () => {
    const vault = await makeVault()
    await mkdir(path.join(vault, '.zennotes', 'icons'), { recursive: true })
    await writeFile(
      path.join(vault, '.zennotes', 'icons', 'evil.svg'),
      '<svg viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>'
    )
    const note = await createNote(vault, 'inbox', 'Baz', '', '# Baz\n')
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await cmdIconsSet(vault, parse([note.path, 'custom:evil']))
    expect((await readNote(vault, note.path)).body).toMatch(/icon:\s*"?custom:evil"?/)

    await cmdIconsClear(vault, parse([note.path]))
    expect((await readNote(vault, note.path)).body).not.toContain('icon:')
  })

  it('rejects an unknown builtin ref', async () => {
    const vault = await makeVault()
    const note = await createNote(vault, 'inbox', 'Qux', '', '# Qux\n')
    await expect(
      cmdIconsSet(vault, parse([note.path, 'builtin:nope']))
    ).rejects.toThrow(/Unknown built-in icon/)
  })
})
