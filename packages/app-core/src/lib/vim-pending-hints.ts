/**
 * Curated which-key catalog for the LazyGit-style motion hint panel.
 *
 * The panel is **drill-down**: it reflects the keys typed so far and shows what
 * the *next* keystroke can be — exactly like which-key. Pressing `c` shows the
 * top-level choices (text object / motion / line); pressing `i` afterwards
 * (`ci…`) replaces them with the inner-object targets. Pure data — no DOM, no
 * CodeMirror — so it is unit-tested directly.
 */

export type VimPendingKind = 'operator' | 'visual' | 'prefix' | 'literal'

export type VisualKind = 'char' | 'line' | 'block'

export interface VimPendingState {
  kind: VimPendingKind
  /** Raw operator name from `vim.inputState.operator` (operator kind). */
  operator?: string
  visualKind?: VisualKind
  prefix?: 'g' | 'z'
  /** Keys typed after the trigger, e.g. '' (just `c`), 'i' (`ci`), 'a' (`ca`). */
  buffer: string
}

export interface HintItem {
  keys: string
  label: string
}

export interface HintGroup {
  title: string
  items: HintItem[]
}

export interface PendingHints {
  title: string
  groups: HintGroup[]
}

// ---------------------------------------------------------------------------
// Panel placement (pure, unit-tested)
// ---------------------------------------------------------------------------

export type VimHintsPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'left'
  | 'right'

export const VIM_HINTS_POSITIONS: VimHintsPosition[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'left',
  'right'
]

export interface PanelRect {
  left: number
  right: number
  top: number
  bottom: number
  height: number
}

export interface PanelStyle {
  left?: number
  right?: number
  top?: number
  bottom?: number
  transform?: string
  maxHeight: number
}

/**
 * Fixed-position CSS style anchoring the hint panel to one of six spots around
 * the editor rect (`rect` is the editor scroller's viewport rect). `left`/`right`
 * center vertically; the four corners pin to that corner.
 */
export function panelStyleFor(
  position: VimHintsPosition,
  rect: PanelRect,
  viewportWidth: number,
  viewportHeight: number,
  gutter = 16
): PanelStyle {
  const style: PanelStyle = { maxHeight: Math.max(120, rect.height - gutter * 2) }

  if (position === 'top-left' || position === 'bottom-left' || position === 'left') {
    style.left = Math.max(gutter, rect.left + gutter)
  } else {
    style.right = Math.max(gutter, viewportWidth - rect.right + gutter)
  }

  if (position === 'top-left' || position === 'top-right') {
    style.top = rect.top + gutter
  } else if (position === 'bottom-left' || position === 'bottom-right') {
    style.bottom = Math.max(gutter, viewportHeight - rect.bottom + gutter)
  } else {
    // left / right → vertically centered on the editor.
    style.top = rect.top + rect.height / 2
    style.transform = 'translateY(-50%)'
  }

  return style
}

const OPERATOR_LABELS: Record<string, string> = {
  change: 'Change',
  delete: 'Delete',
  yank: 'Yank',
  indent: 'Indent',
  indentAuto: 'Auto-indent',
  changeCase: 'Change case',
  hardWrap: 'Hard wrap'
}

/** Operators with a doubled "whole line" shortcut (cc/dd/yy). */
const OPERATOR_DOUBLED: Record<string, string> = {
  change: 'cc',
  delete: 'dd',
  yank: 'yy'
}

const VISUAL_TITLES: Record<VisualKind, string> = {
  char: 'Visual',
  line: 'Visual Line',
  block: 'Visual Block'
}

/** Next-key choices right after an operator or in visual mode. */
const TEXT_OBJECT_INTRO: HintItem[] = [
  { keys: 'i', label: 'inside…' },
  { keys: 'a', label: 'around…' }
]

const MOTIONS: HintItem[] = [
  { keys: 'w', label: 'word →' },
  { keys: 'b', label: 'word ←' },
  { keys: 'e', label: 'word end' },
  { keys: '$', label: 'line end' },
  { keys: '0', label: 'line start' },
  { keys: 'G', label: 'document end' },
  { keys: 'f', label: 'find char…' },
  { keys: 't', label: 'till char…' }
]

/** Inner/around text-object targets, shown after `i` or `a`. */
const TEXT_OBJECT_TARGETS: HintItem[] = [
  { keys: 'w', label: 'word' },
  { keys: 'p', label: 'paragraph' },
  { keys: 's', label: 'sentence' },
  { keys: '"', label: 'double quotes' },
  { keys: "'", label: 'single quotes' },
  { keys: '(', label: 'parens' },
  { keys: '{', label: 'braces' },
  { keys: '[', label: 'brackets' },
  { keys: '<', label: 'angles' },
  { keys: 't', label: 'tag' }
]

const VISUAL_OPERATORS: HintItem[] = [
  { keys: 'd', label: 'delete' },
  { keys: 'c', label: 'change' },
  { keys: 'y', label: 'yank' },
  { keys: '>', label: 'indent' },
  { keys: '<', label: 'outdent' },
  { keys: '=', label: 'auto-indent' },
  { keys: '~', label: 'toggle case' },
  { keys: 'J', label: 'join lines' },
  { keys: 'r', label: 'replace char' }
]

const PREFIX_G: HintItem[] = [
  { keys: 'g', label: 'document top (gg)' },
  { keys: 'G', label: 'document end (gG)' },
  { keys: 'd', label: 'follow link / definition' },
  { keys: 'u', label: 'lowercase' },
  { keys: 'U', label: 'uppercase' },
  { keys: '~', label: 'toggle case' },
  { keys: 'j', label: 'down (display line)' },
  { keys: 'k', label: 'up (display line)' }
]

const PREFIX_Z: HintItem[] = [
  { keys: 'c', label: 'fold heading' },
  { keys: 'o', label: 'unfold heading' },
  { keys: 'M', label: 'fold all' },
  { keys: 'R', label: 'unfold all' }
]

/**
 * Single-key commands that wait for one more literal key before acting:
 * `<character>` commands (r f F t T [ ]) flagged by `vim.expectLiteralNext`,
 * plus `<register>` mark/macro commands (m ` ' " @ q) which the library leaves
 * as a retained partial without that flag. Title + hint shown in the panel.
 */
const LITERAL_COMMANDS: Record<string, { title: string; hint: string }> = {
  r: { title: 'Replace', hint: 'type a character to replace' },
  f: { title: 'Find', hint: 'type a character to jump forward to' },
  F: { title: 'Find back', hint: 'type a character to jump back to' },
  t: { title: 'Till', hint: 'type a character to stop before' },
  T: { title: 'Till back', hint: 'type a character to stop after' },
  '[': { title: 'Jump back', hint: 'type a bracket/symbol to jump to' },
  ']': { title: 'Jump', hint: 'type a bracket/symbol to jump to' },
  m: { title: 'Set mark', hint: 'type a letter to name the mark' },
  '`': { title: 'Go to mark', hint: 'type the mark letter' },
  "'": { title: 'Go to mark line', hint: 'type the mark letter' },
  '"': { title: 'Register', hint: 'type a register letter' },
  '@': { title: 'Replay macro', hint: 'type the macro register' },
  q: { title: 'Record macro', hint: 'type a register to record into' }
}

/** Mark/macro commands that wait for a register key (no `expectLiteralNext`). */
const REGISTER_PENDING_COMMANDS = new Set(['m', '`', "'", '"', '@', 'q'])

/** True when `cmd` is a single-key command waiting for a register/mark key. */
export function isRegisterPendingCommand(cmd: string): boolean {
  return REGISTER_PENDING_COMMANDS.has(cmd)
}

function headerFor(state: VimPendingState): string {
  if (state.kind === 'operator') return OPERATOR_LABELS[state.operator ?? ''] ?? 'Operator'
  if (state.kind === 'visual') return VISUAL_TITLES[state.visualKind ?? 'char']
  return state.prefix === 'z' ? 'z' : 'g'
}

export function getPendingHints(state: VimPendingState): PendingHints {
  const header = headerFor(state)

  // A single-key command awaiting one literal/register key (r, f, m, …).
  if (state.kind === 'literal') {
    const info = LITERAL_COMMANDS[state.buffer]
    const title = info?.title ?? state.buffer
    const label = info?.hint ?? 'type a character'
    return { title, groups: [{ title: 'Input', items: [{ keys: '·', label }] }] }
  }

  // Drill-down: a pending `i`/`a` selects the text-object target next.
  if (state.kind !== 'prefix' && (state.buffer === 'i' || state.buffer === 'a')) {
    const scope = state.buffer === 'i' ? 'Inside' : 'Around'
    return {
      title: `${header} ${state.buffer}`,
      groups: [{ title: scope, items: TEXT_OBJECT_TARGETS }]
    }
  }

  // Drill-down: a pending find/till waits for any character.
  if (state.kind !== 'prefix' && /^[fFtT]$/.test(state.buffer)) {
    return {
      title: `${header} ${state.buffer}`,
      groups: [{ title: 'Find', items: [{ keys: '·', label: 'type a character' }] }]
    }
  }

  if (state.kind === 'prefix') {
    return state.prefix === 'z'
      ? { title: 'z', groups: [{ title: 'Folding', items: PREFIX_Z }] }
      : { title: 'g', groups: [{ title: 'Go', items: PREFIX_G }] }
  }

  if (state.kind === 'visual') {
    return {
      title: header,
      groups: [
        { title: 'Text object', items: TEXT_OBJECT_INTRO },
        { title: 'Operator', items: VISUAL_OPERATORS },
        { title: 'Other', items: [{ keys: 'o', label: 'other end' }, { keys: ':', label: 'ex on range' }] }
      ]
    }
  }

  // Operator, top level (nothing typed after it yet).
  const groups: HintGroup[] = [
    { title: 'Text object', items: TEXT_OBJECT_INTRO },
    { title: 'Motion', items: MOTIONS }
  ]
  const doubled = OPERATOR_DOUBLED[state.operator ?? '']
  if (doubled) {
    groups.push({ title: 'Line', items: [{ keys: doubled, label: 'whole line' }] })
  }
  return { title: header, groups }
}
