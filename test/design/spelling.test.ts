// American English in every text the site and the agent files print (AGENTS.md rule 7, review r9: the Hive legend
// said `COLOUR IS THE TYPE`, and check-text looks for long dashes, not for British spelling). The scan reads the
// sources of the site and of the texts the emitter writes, without comments; identifiers such as TYPE_COLOUR are one
// word with their prefix, so they never match.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOTS = ['site/src', 'lib/core', 'lib/emit', 'lib/sigil', 'lib/hive', 'lib/receipts/classify.ts']
const BRITISH = /\b(colour|behaviour|centre|licence|catalogue)(s|d|ing)?\b/gi

function files(path: string): string[] {
  if (statSync(path).isFile()) return [path]
  return readdirSync(path).flatMap((n) => files(join(path, n)))
}

/** The source without comments: block comments (JS, CSS, JSX), HTML comments and `//` line comments. */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ''))
    .split('\n')
    .map((l) => l.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n')
}

describe('American English in texts for people', () => {
  it('finds the British words it looks for', () => {
    expect('Colour is the type. Licence, behaviour, centred.'.match(BRITISH)).toEqual([
      'Colour',
      'Licence',
      'behaviour',
      'centred',
    ])
    expect('color center license catalog TYPE_COLOUR fromCentre'.match(BRITISH)).toBeNull()
    expect(withoutComments('a // the colour\nb /* centre */ c')).toBe('a \nb  c')
  })

  it('no British spelling outside comments in the site and the emitted texts', () => {
    const hits: string[] = []
    for (const root of ROOTS)
      for (const f of files(root).filter((x) => /\.(astro|tsx?|css)$/.test(x))) {
        const lines = withoutComments(readFileSync(f, 'utf8')).split('\n')
        lines.forEach((l, i) => {
          for (const m of l.matchAll(BRITISH)) hits.push(`${f}:${i + 1} ${m[0]}`)
        })
      }
    expect(hits).toEqual([])
  })
})
