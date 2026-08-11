import { describe, expect, it } from 'vitest'
import { setTaskCancelledAtIndex, TASK_LINE_RE } from './tasklists'
import { parseTasksFromBody, groupTasks, parseTaskFile, type ParseTasksContext } from './tasks'
import { setTaskFileCancelled } from './frontmatter'

const ctx: ParseTasksContext = { path: 'inbox/t.md', title: 't', folder: 'inbox' }

describe('task cancelling primitives (#450)', () => {
  it('recognizes [-] as a task state', () => {
    expect(TASK_LINE_RE.test('- [-] cancelled')).toBe(true)
    expect(TASK_LINE_RE.exec('- [-] x')?.[2]).toBe('-')
    // A list marker `-` with an ordinary open box is still just open.
    expect(TASK_LINE_RE.exec('- [ ] x')?.[2]).toBe(' ')
  })

  it('setTaskCancelledAtIndex flips the state to [-] and back to [ ]', () => {
    expect(setTaskCancelledAtIndex('- [ ] Task 1', 0, true)).toBe('- [-] Task 1')
    expect(setTaskCancelledAtIndex('- [x] Task 1', 0, true)).toBe('- [-] Task 1')
    expect(setTaskCancelledAtIndex('- [-] Task 1', 0, false)).toBe('- [ ] Task 1')
  })

  it('parses [-] as cancelled (not checked or forwarded)', () => {
    const t = parseTasksFromBody('- [-] Task 1', ctx)[0]
    expect(t.cancelled).toBe(true)
    expect(t.checked).toBe(false)
    expect(t.forwarded).toBe(false)
  })

  it('groups cancelled tasks into the cancelled bucket, out of today/done/forwarded', () => {
    const tasks = parseTasksFromBody('- [ ] open\n- [x] done\n- [>] gone [[X]]\n- [-] scrapped', ctx)
    const g = groupTasks(tasks, new Date(2026, 0, 1))
    expect(g.cancelled.map((t) => t.content)).toEqual(['scrapped'])
    expect(g.today.map((t) => t.content)).toEqual(['open'])
    expect(g.done.map((t) => t.content)).toEqual(['done'])
    expect(g.forwarded.map((t) => t.content)).toEqual(['gone [[X]]'])
  })

  it('reads a file-task `status: cancelled` as cancelled, and writes it', () => {
    const body = '---\ntags: [task]\ntitle: Rewrite\nstatus: cancelled\n---\n\nAbandoned.'
    const t = parseTaskFile(body, ctx)
    expect(t?.cancelled).toBe(true)
    expect(t?.checked).toBe(false)

    const cancelled = setTaskFileCancelled('---\ntags: [task]\nstatus: open\n---\n', true)
    expect(cancelled).toContain('status: cancelled')
    const reopened = setTaskFileCancelled(cancelled, false)
    expect(reopened).toContain('status: open')
  })
})
