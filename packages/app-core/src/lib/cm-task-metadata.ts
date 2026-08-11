/**
 * #454: highlights task metadata on task lines in the WYSIWYG editor so it's as
 * scannable in a source note as it is in the Tasks view:
 *   - priority   `!high` / `!med` / `!low` (+ `!h`/`!m`/`!l`/`!medium`) — colored
 *   - due date   `due:YYYY-MM-DD` — a chip; overdue (past + still open) turns red
 *   - `@fields`  `@waiting`, `@key:value` — a secondary (purple) chip
 *
 * These are `Decoration.mark`s: the source text stays fully editable, we only
 * tint it. Only lines that parse as tasks (`TASK_LINE_RE`, outside code) are
 * scanned. Inline `#tags` are left to `cm-hashtags` (which runs document-wide).
 *
 * WYSIWYG-only: registered via `wysiwygExtensions()`.
 */
import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate
} from '@codemirror/view'
import { TASK_LINE_RE } from '@shared/tasklists'
import { isTagSkippedContext } from './cm-hashtags'

// Token shapes mirror the parser in `@shared/tasks` (tasks.ts:168-179). Anchored
// on `(^|\s)` so `!`, `due:` or `@` glued to a preceding word don't match.
const PRIORITY_RE = /(^|\s)(!(?:high|medium|med|low|h|m|l))\b/gi
// Only a valid ISO date is treated as a due date (matching `isValidIsoDate`).
const DUE_RE = /(^|\s)(due:\s*(\d{4}-\d{2}-\d{2}))\b/gi
const FIELD_RE = /(^|\s)(@waiting\b|@[a-z][a-z0-9_-]*:[\p{L}\d][\p{L}\d/_-]*)/giu

function priorityLevel(token: string): 'high' | 'med' | 'low' {
  const word = token.slice(1).toLowerCase() // drop the leading `!`
  if (word === 'high' || word === 'h') return 'high'
  if (word === 'low' || word === 'l') return 'low'
  return 'med'
}

/** Local `YYYY-MM-DD` for today, matching how the parser compares due dates. */
function todayIso(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

type Pending = { from: number; to: number; cls: string }

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view
  const today = todayIso()
  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    const firstLine = state.doc.lineAt(from).number
    const lastLine = state.doc.lineAt(Math.max(from, to - 1)).number
    for (let n = firstLine; n <= lastLine; n++) {
      const line = state.doc.line(n)
      const task = TASK_LINE_RE.exec(line.text)
      if (!task) continue
      // Skip task-looking lines inside a code fence — they aren't real tasks.
      if (isTagSkippedContext(state, line.from)) continue

      const stateChar = task[2]
      const closed = stateChar === 'x' || stateChar === 'X' || stateChar === '-'
      // Scan only the content after the `[ ]` marker (task[1] + state char + `]`).
      const contentStart = task[1].length + task[2].length + 1
      const content = line.text.slice(contentStart)
      const base = line.from + contentStart

      const pending: Pending[] = []
      let m: RegExpExecArray | null

      PRIORITY_RE.lastIndex = 0
      while ((m = PRIORITY_RE.exec(content)) !== null) {
        const s = base + m.index + m[1].length
        pending.push({ from: s, to: s + m[2].length, cls: `cm-task-prio cm-task-prio-${priorityLevel(m[2])}` })
      }
      DUE_RE.lastIndex = 0
      while ((m = DUE_RE.exec(content)) !== null) {
        const s = base + m.index + m[1].length
        const overdue = !closed && m[3] < today
        pending.push({ from: s, to: s + m[2].length, cls: overdue ? 'cm-task-meta cm-task-due-overdue' : 'cm-task-meta cm-task-due' })
      }
      FIELD_RE.lastIndex = 0
      while ((m = FIELD_RE.exec(content)) !== null) {
        const s = base + m.index + m[1].length
        pending.push({ from: s, to: s + m[2].length, cls: 'cm-task-meta cm-task-field' })
      }

      // RangeSetBuilder needs ascending, non-overlapping ranges; the token types
      // never overlap on a line, so sorting by start is enough.
      pending.sort((a, b) => a.from - b.from)
      for (const p of pending) builder.add(p.from, p.to, Decoration.mark({ class: p.cls }))
    }
  }
  return builder.finish()
}

const taskMetadataPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }
    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (p) => p.decorations }
)

export const taskMetadataExtension = [taskMetadataPlugin]
