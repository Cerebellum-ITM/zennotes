import { describe, expect, it } from 'vitest'
import { parseLangIconDirective, parseInlineLangDirective } from './code-lang-icon'

describe('parseInlineLangDirective', () => {
  it('parses a leading {lang}code highlight directive', () => {
    expect(parseInlineLangDirective('{js}arr.map(x => x)')).toEqual({
      lang: 'js',
      rest: 'arr.map(x => x)'
    })
  })

  it('does not collide with the {lang icon} directive', () => {
    // `{lua icon}…` has a space before `}`, so it must NOT match the highlight
    // directive (it belongs to the icon pass instead).
    expect(parseInlineLangDirective('{lua icon}options.lua')).toBeNull()
    expect(parseLangIconDirective('{lua icon}options.lua')).not.toBeNull()
  })

  it('returns null for plain inline code or an empty body', () => {
    expect(parseInlineLangDirective('just some code')).toBeNull()
    expect(parseInlineLangDirective('{js}')).toBeNull()
  })

  it('supports language tokens with symbols (c++, c#, objective-c)', () => {
    expect(parseInlineLangDirective('{c++}std::cout')).toEqual({
      lang: 'c++',
      rest: 'std::cout'
    })
  })
})
