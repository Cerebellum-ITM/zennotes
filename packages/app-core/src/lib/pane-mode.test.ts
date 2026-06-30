import { describe, expect, it } from 'vitest'
import {
  nextPaneMode,
  paneModeForPath,
  paneModesWithPathMode,
  type PaneModesByPath
} from './pane-mode'

describe('pane mode by path', () => {
  it('defaults newly opened notes to edit mode without changing remembered notes', () => {
    let modesByPath: PaneModesByPath = {}

    modesByPath = paneModesWithPathMode(modesByPath, 'inbox/One.md', 'preview')

    expect(paneModeForPath(modesByPath, 'inbox/One.md')).toBe('preview')
    expect(paneModeForPath(modesByPath, 'inbox/Two.md')).toBe('edit')

    modesByPath = paneModesWithPathMode(modesByPath, 'inbox/Two.md', 'split')

    expect(paneModeForPath(modesByPath, 'inbox/One.md')).toBe('preview')
    expect(paneModeForPath(modesByPath, 'inbox/Two.md')).toBe('split')
    expect(paneModeForPath(modesByPath, 'inbox/Three.md')).toBe('edit')
  })
})

describe('nextPaneMode', () => {
  it('cycles edit → split → preview → edit', () => {
    expect(nextPaneMode('edit')).toBe('split')
    expect(nextPaneMode('split')).toBe('preview')
    expect(nextPaneMode('preview')).toBe('edit')
  })

  it('loops back to the start in three steps', () => {
    expect(nextPaneMode(nextPaneMode(nextPaneMode('edit')))).toBe('edit')
  })
})
