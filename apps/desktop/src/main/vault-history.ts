// Per-note git history (desktop only). Backed by `isomorphic-git` running in
// the Electron main process. The git-dir lives OUTSIDE the vault (under the
// app's userData) with the vault root as the work-tree, so the vault itself
// never gains a `.git` folder — iCloud/Obsidian see only the plain `.md` files.
//
// One repo per vault. Opt-in per note is tracked in `VaultSettings`
// (`enabledHistoryPaths`); this module only performs git operations on the
// paths it is asked about. Snapshots stage a single note path each, so every
// note keeps an independent, clean log (`git log -- <path>`).

import { promises as fs } from 'node:fs'
import nodeFs from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import git from 'isomorphic-git'
import type { HistoryAuthor, HistorySnapshot, HistoryWorkingState } from '@shared/ipc'

const decoder = new TextDecoder('utf-8')

/** Root folder holding every vault's history repo, outside any vault. */
function historyRootDir(): string {
  return path.join(app.getPath('userData'), 'history')
}

/** Stable per-vault id derived from the absolute vault path. */
function hashVaultRoot(root: string): string {
  return createHash('sha1').update(path.resolve(root)).digest('hex').slice(0, 16)
}

/** Absolute git-dir for a vault's history repo (outside the vault). */
export function historyGitDir(root: string): string {
  return path.join(historyRootDir(), hashVaultRoot(root))
}

/** Create the repo on first use. Idempotent. */
async function ensureRepo(root: string): Promise<string> {
  const gitdir = historyGitDir(root)
  try {
    await fs.access(path.join(gitdir, 'HEAD'))
    return gitdir
  } catch {
    await fs.mkdir(gitdir, { recursive: true })
    await git.init({ fs: nodeFs, dir: root, gitdir, defaultBranch: 'main' })
    return gitdir
  }
}

let cachedAuthor: HistoryAuthor | null = null

/**
 * Resolve the snapshot author from the system git identity (`~/.gitconfig`
 * `[user]` block), then `GIT_AUTHOR_*` env vars, falling back to a local
 * placeholder. Cached for the process lifetime.
 */
async function resolveAuthor(): Promise<HistoryAuthor> {
  if (cachedAuthor) return cachedAuthor
  let name = ''
  let email = ''
  try {
    const raw = await fs.readFile(path.join(os.homedir(), '.gitconfig'), 'utf8')
    let inUser = false
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('[')) {
        inUser = /^\[\s*user\b/.test(trimmed)
        continue
      }
      if (!inUser) continue
      const m = trimmed.match(/^(name|email)\s*=\s*(.+)$/)
      if (!m) continue
      const value = m[2].trim().replace(/^["']|["']$/g, '')
      if (m[1] === 'name') name = value
      else email = value
    }
  } catch {
    // no gitconfig — fall through to env/placeholder
  }
  name = name || process.env['GIT_AUTHOR_NAME'] || 'ZenNotes'
  email = email || process.env['GIT_AUTHOR_EMAIL'] || 'zennotes@localhost'
  cachedAuthor = { name, email }
  return cachedAuthor
}

interface IsoCommit {
  message: string
  parent: string[]
  author: { name: string; email: string; timestamp: number }
}

function toSnapshot(oid: string, commit: IsoCommit): HistorySnapshot {
  return {
    oid,
    shortOid: oid.slice(0, 7),
    message: commit.message.trim(),
    author: { name: commit.author.name, email: commit.author.email },
    timestamp: commit.author.timestamp,
    parentOid: commit.parent[0] ?? null
  }
}

/** HEAD oid, or null when the repo has no commits yet. */
async function headOid(gitdir: string, root: string): Promise<string | null> {
  try {
    return await git.resolveRef({ fs: nodeFs, dir: root, gitdir, ref: 'HEAD' })
  } catch {
    return null
  }
}

async function readBlobAt(
  gitdir: string,
  root: string,
  oid: string,
  filepath: string
): Promise<string | null> {
  try {
    const { blob } = await git.readBlob({ fs: nodeFs, dir: root, gitdir, oid, filepath })
    return decoder.decode(blob)
  } catch {
    return null
  }
}

/** Whether the note's file on disk differs from its latest snapshot. */
export async function noteWorkingState(
  root: string,
  relPath: string
): Promise<HistoryWorkingState> {
  let diskText: string
  try {
    diskText = await fs.readFile(path.join(root, relPath), 'utf8')
  } catch {
    return { dirty: false }
  }
  const gitdir = historyGitDir(root)
  const head = await headOid(gitdir, root)
  if (!head) return { dirty: diskText.length > 0 }
  const snapText = await readBlobAt(gitdir, root, head, relPath)
  if (snapText == null) return { dirty: true }
  return { dirty: snapText !== diskText }
}

/**
 * Commit the note's current content. Returns null when there is nothing to
 * snapshot (the file already matches its latest snapshot), so no empty commit
 * is ever created.
 */
export async function snapshotNote(
  root: string,
  relPath: string,
  message: string
): Promise<HistorySnapshot | null> {
  const gitdir = await ensureRepo(root)
  const { dirty } = await noteWorkingState(root, relPath)
  if (!dirty) return null
  const author = await resolveAuthor()
  await git.add({ fs: nodeFs, dir: root, gitdir, filepath: relPath })
  const oid = await git.commit({
    fs: nodeFs,
    dir: root,
    gitdir,
    message: message.trim() || 'Snapshot',
    author
  })
  const { commit } = await git.readCommit({ fs: nodeFs, dir: root, gitdir, oid })
  return toSnapshot(oid, commit as IsoCommit)
}

/** Linear history for a note, newest snapshot first. `[]` when untracked. */
export async function listNoteSnapshots(
  root: string,
  relPath: string
): Promise<HistorySnapshot[]> {
  const gitdir = historyGitDir(root)
  const head = await headOid(gitdir, root)
  if (!head) return []
  try {
    const entries = await git.log({
      fs: nodeFs,
      dir: root,
      gitdir,
      ref: 'HEAD',
      filepath: relPath
    })
    return entries.map((e) => toSnapshot(e.oid, e.commit as IsoCommit))
  } catch {
    return []
  }
}

/** Raw note body stored in snapshot `oid`. */
export async function readSnapshotContent(
  root: string,
  relPath: string,
  oid: string
): Promise<string> {
  const gitdir = historyGitDir(root)
  const text = await readBlobAt(gitdir, root, oid, relPath)
  if (text == null) throw new Error(`Snapshot ${oid.slice(0, 7)} has no content for ${relPath}`)
  return text
}
