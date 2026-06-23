import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// Git history stores its repo under app.getPath('userData'); point it at a temp
// dir so the test never touches the real userData and stays self-contained.
let userDataDir = ''
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return userDataDir
      throw new Error(`unexpected app.getPath(${name})`)
    }
  }
}))

import {
  listNoteSnapshots,
  noteWorkingState,
  readSnapshotContent,
  snapshotNote
} from './vault-history'

const tempDirs: string[] = []

async function makeVault(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zen-history-'))
  tempDirs.push(root)
  await mkdir(path.join(root, 'inbox'), { recursive: true })
  return root
}

beforeAll(async () => {
  userDataDir = await mkdtemp(path.join(os.tmpdir(), 'zen-history-userdata-'))
  tempDirs.push(userDataDir)
})

afterEach(async () => {
  while (tempDirs.length) {
    const dir = tempDirs.pop()
    if (dir) await rm(dir, { recursive: true, force: true })
  }
  userDataDir = await mkdtemp(path.join(os.tmpdir(), 'zen-history-userdata-'))
  tempDirs.push(userDataDir)
})

describe('vault-history', () => {
  it('snapshots, lists, and reads content across a linear history', async () => {
    const root = await makeVault()
    const rel = 'inbox/Note.md'
    const abs = path.join(root, rel)

    await writeFile(abs, 'v1\n', 'utf8')
    expect((await noteWorkingState(root, rel)).dirty).toBe(true)

    const first = await snapshotNote(root, rel, 'first')
    expect(first).not.toBeNull()
    expect(first?.message).toBe('first')
    expect(first?.author).not.toBeNull()
    expect((await noteWorkingState(root, rel)).dirty).toBe(false)

    // No changes → no empty commit.
    expect(await snapshotNote(root, rel, 'noop')).toBeNull()

    await writeFile(abs, 'v2\n', 'utf8')
    const second = await snapshotNote(root, rel, 'second')
    expect(second).not.toBeNull()

    const log = await listNoteSnapshots(root, rel)
    expect(log.map((s) => s.message)).toEqual(['second', 'first'])
    expect(log[1].parentOid).toBeNull()
    expect(log[0].parentOid).toBe(log[1].oid)

    expect(await readSnapshotContent(root, rel, log[1].oid)).toBe('v1\n')
    expect(await readSnapshotContent(root, rel, log[0].oid)).toBe('v2\n')
  })

  it('keeps each note independent in its own log', async () => {
    const root = await makeVault()
    await writeFile(path.join(root, 'inbox/A.md'), 'alpha\n', 'utf8')
    await writeFile(path.join(root, 'inbox/B.md'), 'beta\n', 'utf8')
    await snapshotNote(root, 'inbox/A.md', 'A1')
    await snapshotNote(root, 'inbox/B.md', 'B1')

    const logA = await listNoteSnapshots(root, 'inbox/A.md')
    const logB = await listNoteSnapshots(root, 'inbox/B.md')
    expect(logA.map((s) => s.message)).toEqual(['A1'])
    expect(logB.map((s) => s.message)).toEqual(['B1'])
  })

  it('returns no snapshots for an untracked note', async () => {
    const root = await makeVault()
    expect(await listNoteSnapshots(root, 'inbox/Untracked.md')).toEqual([])
  })
})
