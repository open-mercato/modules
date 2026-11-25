import { describe, expect, it } from 'vitest'
import { COUNT_TOKENS } from '../../lib/import-webflow/text.ts'
import {
  COUNT_TOKEN_NAMES,
  fillCounts,
  formatCount,
  hasCountToken,
  moduleCountOf,
  tokenParts,
} from '../../lib/core/www-tokens.ts'

describe('lib/core/www-tokens.ts (www site migration, A6)', () => {
  it('knows the tokens the importer writes', () => {
    expect(COUNT_TOKEN_NAMES.map((n) => `{${n}}`)).toEqual([...COUNT_TOKENS])
  })

  it('fills the tokens with the counts of the build, grouped as the navbar prints them', () => {
    expect(formatCount(1928)).toBe('1,928')
    expect(fillCounts('{githubStars} stars on GitHub', { githubStars: 1928 })).toBe('1,928 stars on GitHub')
    expect(fillCounts('{moduleCount} plugins', { moduleCount: 84 })).toBe('84 plugins')
    expect(fillCounts('No token here.', {})).toBe('No token here.')
  })

  it('prints no number for a token without a value, and no double space', () => {
    expect(fillCounts('{githubStars} stars on GitHub', {})).toBe('stars on GitHub')
    expect(fillCounts('Over {moduleCount} plugins.', {})).toBe('Over plugins.')
    expect(fillCounts('{moduleCount}', { moduleCount: -1 })).toBe('')
    expect(fillCounts('{moduleCount} plugins', { moduleCount: 1.5 })).toBe('plugins')
  })

  it('splits a text into plain runs and tokens', () => {
    expect(tokenParts('{githubStars} stars on GitHub', { githubStars: 7 })).toEqual([
      { token: 'githubStars', value: '7' },
      { text: ' stars on GitHub' },
    ])
    expect(tokenParts('a {moduleCount} b', {})).toEqual([
      { text: 'a ' },
      { token: 'moduleCount', value: null },
      { text: 'b' },
    ])
    expect(hasCountToken('{moduleCount} plugins')).toBe(true)
    expect(hasCountToken('50+ plugins')).toBe(false)
  })

  it('reads {moduleCount} from modules.json: listed modules plus the built-in ones', () => {
    expect(moduleCountOf({ counts: { modules: 38, builtIn: 46 } })).toBe(84)
    expect(moduleCountOf({ counts: { modules: 38 } })).toBeUndefined()
    expect(moduleCountOf(null)).toBeUndefined()
  })
})
