/**
 * `zen icons` — discover and assign icons.
 *   • `list`  lists the icons available for the `{icon:<ref>}` body directive:
 *     user SVGs under `.zennotes/icons/` (use as `{icon:<id>}`) plus the
 *     built-in glyph ids (use as `{icon:builtin:<id>}`).
 *   • `set`   writes a note's frontmatter `icon:` — the canonical note icon that
 *     shows in the sidebar AND next to every `[[wikilink]]` to the note.
 *   • `clear` removes that frontmatter key.
 * Lets an agent/skill pick a real icon instead of an emoji.
 */

import { listCustomIconRefs, setNoteIcon } from '../../mcp/vault-ops.js'
import { getBool, getString, type ParsedArgs } from '../args.js'
import { emitJson, emitLine, emitOk, pad } from '../format.js'

// Built-in glyph ids — mirror of `FolderIconId` in bridge-contract/ipc.ts. Used
// as `{icon:builtin:<id>}`. Keep in sync if the union changes.
const BUILTIN_ICON_IDS = [
  'folder', 'bolt', 'tray', 'archive', 'trash', 'book', 'bookmark', 'calendar',
  'briefcase', 'tag', 'document', 'sparkle', 'code', 'user', 'star', 'heart',
  'link', 'lightbulb', 'flask', 'graduation', 'music', 'image', 'palette',
  'terminal', 'wrench', 'globe', 'map', 'chart', 'home'
]

export async function cmdIconsList(vault: string, args: ParsedArgs): Promise<void> {
  const custom = await listCustomIconRefs(vault)

  if (getBool(args, 'json')) {
    emitJson({
      custom: custom.map((c) => ({
        ref: c.id,
        name: c.name,
        section: c.section,
        directive: `{icon:${c.id}}`
      })),
      builtin: BUILTIN_ICON_IDS.map((id) => ({
        ref: `builtin:${id}`,
        directive: `{icon:builtin:${id}}`
      }))
    })
    return
  }

  emitLine('Custom icons (use as {icon:<ref>}):')
  if (custom.length === 0) {
    emitLine('  (none — add SVGs in Settings → Icons)')
  } else {
    const widest = custom.reduce((w, c) => Math.max(w, c.id.length), 0)
    for (const c of custom) emitLine(`  ${pad(c.id, widest)}  {icon:${c.id}}`)
  }
  emitLine('')
  emitLine('Built-in icons (use as {icon:builtin:<id>}):')
  emitLine(`  ${BUILTIN_ICON_IDS.join(', ')}`)
}

/**
 * Validate an icon ref before writing it to frontmatter, so a typo doesn't
 * silently persist a ref that resolves to nothing. `custom:<id>` must match a
 * real SVG, `builtin:<id>` a known glyph. `lang:<token>` and bare tokens pass
 * (many valid tokens; resolveIcon falls back gracefully at render time).
 */
async function validateIconRef(vault: string, ref: string): Promise<void> {
  if (ref.startsWith('custom:')) {
    const id = ref.slice('custom:'.length)
    const custom = await listCustomIconRefs(vault)
    if (!custom.some((c) => c.id === id)) {
      throw new Error(
        `Unknown custom icon "${id}". Run \`zn icons list\` to see valid ids.`
      )
    }
    return
  }
  if (ref.startsWith('builtin:')) {
    const id = ref.slice('builtin:'.length)
    if (!BUILTIN_ICON_IDS.includes(id)) {
      throw new Error(
        `Unknown built-in icon "${id}". Valid ids: ${BUILTIN_ICON_IDS.join(', ')}.`
      )
    }
  }
}

function requireIconPath(args: ParsedArgs): string {
  const value = getString(args, 'path') ?? args.positionals[0]
  if (!value) throw new Error('A note path is required.')
  return value
}

export async function cmdIconsSet(vault: string, args: ParsedArgs): Promise<void> {
  const rel = requireIconPath(args)
  const ref = getString(args, 'icon') ?? args.positionals[1]
  if (!ref) {
    throw new Error(
      'zn icons set requires an icon ref (custom:<id> | builtin:<id> | lang:<token>). Run `zn icons list`.'
    )
  }
  await validateIconRef(vault, ref)
  const meta = await setNoteIcon(vault, rel, ref)
  if (getBool(args, 'json')) {
    emitJson(meta)
    return
  }
  emitOk(`Set icon ${ref} on ${meta.path}`)
}

export async function cmdIconsClear(vault: string, args: ParsedArgs): Promise<void> {
  const rel = requireIconPath(args)
  const meta = await setNoteIcon(vault, rel, null)
  if (getBool(args, 'json')) {
    emitJson(meta)
    return
  }
  emitOk(`Cleared icon on ${meta.path}`)
}
