export type PaneMode = 'edit' | 'preview' | 'split'

export const ZEN_SET_PANE_MODE_EVENT = 'zen:set-pane-mode'
export const ZEN_CYCLE_PANE_MODE_EVENT = 'zen:cycle-pane-mode'
export const DEFAULT_PANE_MODE: PaneMode = 'edit'

// Order the single-key view cycle steps through: edit → split → preview → edit.
const PANE_MODE_CYCLE: PaneMode[] = ['edit', 'split', 'preview']

export function nextPaneMode(mode: PaneMode): PaneMode {
  const i = PANE_MODE_CYCLE.indexOf(mode)
  return PANE_MODE_CYCLE[(i + 1) % PANE_MODE_CYCLE.length]
}

export type PaneModesByPath = Record<string, PaneMode>

export function isPaneMode(value: unknown): value is PaneMode {
  return value === 'edit' || value === 'preview' || value === 'split'
}

export function paneModeForPath(
  modesByPath: PaneModesByPath,
  path: string | null,
  // A note the user has not put in a mode yet opens in this; the "Default
  // view mode" preference feeds it so readers can land in Preview. (#543)
  fallback: PaneMode = DEFAULT_PANE_MODE
): PaneMode {
  return path ? modesByPath[path] ?? fallback : fallback
}

export function paneModesWithPathMode(
  modesByPath: PaneModesByPath,
  path: string | null,
  mode: PaneMode
): PaneModesByPath {
  if (!path || modesByPath[path] === mode) return modesByPath
  return { ...modesByPath, [path]: mode }
}

export function requestPaneMode(mode: PaneMode): void {
  window.dispatchEvent(
    new CustomEvent<{ mode: PaneMode }>(ZEN_SET_PANE_MODE_EVENT, {
      detail: { mode }
    })
  )
}

// Cycle the active pane's view to the next mode. The current mode lives in the
// pane (modesByPath), so we just notify it — the active pane computes the next.
export function requestPaneModeCycle(): void {
  window.dispatchEvent(new CustomEvent(ZEN_CYCLE_PANE_MODE_EVENT))
}
