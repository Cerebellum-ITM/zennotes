/**
 * `zen icons list` — list the icons available for the `{icon:<ref>}` body
 * directive: user SVGs under `.zennotes/icons/` (use as `{icon:<id>}`) plus the
 * built-in glyph ids (use as `{icon:builtin:<id>}`). Lets an agent/skill pick a
 * real icon instead of an emoji.
 */

import { listCustomIconRefs } from '../../mcp/vault-ops.js'
import { getBool, type ParsedArgs } from '../args.js'
import { emitJson, emitLine, pad } from '../format.js'

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
