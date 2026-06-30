import { describe, expect, it } from 'vitest'
import { formatVimMode, readVimStateMode } from './vim-status'

describe('formatVimMode', () => {
  it('maps the basic modes to uppercase labels + kind', () => {
    expect(formatVimMode({ mode: 'normal' })).toEqual({ label: 'NORMAL', kind: 'normal' })
    expect(formatVimMode({ mode: 'insert' })).toEqual({ label: 'INSERT', kind: 'insert' })
    expect(formatVimMode({ mode: 'replace' })).toEqual({ label: 'REPLACE', kind: 'replace' })
  })

  it('distinguishes visual sub-modes', () => {
    expect(formatVimMode({ mode: 'visual', subMode: '' })).toEqual({
      label: 'VISUAL',
      kind: 'visual'
    })
    expect(formatVimMode({ mode: 'visual', subMode: 'linewise' })).toEqual({
      label: 'V-LINE',
      kind: 'visual'
    })
    expect(formatVimMode({ mode: 'visual', subMode: 'blockwise' })).toEqual({
      label: 'V-BLOCK',
      kind: 'visual'
    })
  })

  it('returns null for empty / unknown / missing modes', () => {
    expect(formatVimMode(null)).toBeNull()
    expect(formatVimMode(undefined)).toBeNull()
    expect(formatVimMode({})).toBeNull()
    expect(formatVimMode({ mode: 'frobnicate' })).toBeNull()
  })
})

describe('readVimStateMode', () => {
  it('returns null without vim state', () => {
    expect(readVimStateMode(null)).toBeNull()
    expect(readVimStateMode(undefined)).toBeNull()
  })

  it('reads insert > visual > normal precedence', () => {
    expect(readVimStateMode({ insertMode: true })).toEqual({ label: 'INSERT', kind: 'insert' })
    expect(readVimStateMode({ visualMode: true })).toEqual({ label: 'VISUAL', kind: 'visual' })
    expect(readVimStateMode({})).toEqual({ label: 'NORMAL', kind: 'normal' })
  })

  it('derives the visual sub-mode from flags', () => {
    expect(readVimStateMode({ visualMode: true, visualLine: true })).toEqual({
      label: 'V-LINE',
      kind: 'visual'
    })
    expect(readVimStateMode({ visualMode: true, visualBlock: true })).toEqual({
      label: 'V-BLOCK',
      kind: 'visual'
    })
  })
})
