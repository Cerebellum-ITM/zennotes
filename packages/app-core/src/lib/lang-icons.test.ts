import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LANG_ICONS,
  LANG_ICON_LIST,
  hasLangIcon,
  langIconSvg,
  normalizeLangToken
} from './lang-icons'
import { resolveIcon, resolveLangIconRef } from './icon-resolve'
import type { CustomIcon, IconRule } from '@shared/ipc'

const noCustom = new Map<string, CustomIcon>()

describe('normalizeLangToken', () => {
  it('lowercases and canonicalizes aliases', () => {
    expect(normalizeLangToken('JS')).toBe('javascript')
    expect(normalizeLangToken('py')).toBe('python')
    expect(normalizeLangToken('c++')).toBe('cpp')
    expect(normalizeLangToken('C#')).toBe('csharp')
    expect(normalizeLangToken('golang')).toBe('go')
  })
  it('passes through an unknown token lowercased', () => {
    expect(normalizeLangToken('Cobol')).toBe('cobol')
  })
})

describe('bundled language logos', () => {
  it('ships a non-empty SVG for every listed language', () => {
    expect(LANG_ICON_LIST.length).toBeGreaterThan(20)
    for (const entry of LANG_ICON_LIST) {
      expect(hasLangIcon(entry.token)).toBe(true)
      expect(langIconSvg(entry.token) ?? '').toContain('<svg')
    }
  })
  it('every DEFAULT_LANG_ICONS ref resolves to a lang icon', () => {
    for (const [token, ref] of Object.entries(DEFAULT_LANG_ICONS)) {
      const resolved = resolveIcon(ref, noCustom)
      expect(resolved?.kind).toBe('lang')
      if (resolved?.kind === 'lang') expect(resolved.token).toBe(token)
    }
  })
})

describe('resolveLangIconRef resolution order', () => {
  const langRule: IconRule[] = [
    { id: 'r1', target: 'lang', nameRegex: '^python$', icon: 'builtin:star' }
  ]

  it('falls back to the bundled default (alias-aware) when nothing else matches', () => {
    expect(resolveLangIconRef('py', noCustom, null, {})).toBe('lang:python')
  })

  it('a target:lang rule beats the default', () => {
    expect(resolveLangIconRef('python', noCustom, langRule, {})).toBe('builtin:star')
  })

  it('a Settings override beats both the rule and the default', () => {
    expect(resolveLangIconRef('python', noCustom, langRule, { python: 'builtin:code' })).toBe(
      'builtin:code'
    )
  })

  it('matches overrides through aliases', () => {
    expect(resolveLangIconRef('JS', noCustom, null, { javascript: 'builtin:code' })).toBe(
      'builtin:code'
    )
  })

  it('returns null for an unknown language with no rule/override', () => {
    expect(resolveLangIconRef('cobol', noCustom, null, {})).toBeNull()
  })
})
