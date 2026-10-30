// /radar names the modules whose authors should check the next version (live review of 30 Oct, item 13): `Billing,
// ..., Configure, Price, Quote, Durable Work` read the CPQ module as three entries. When a title has a comma of its
// own, the list separates its items with semicolons.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listSeparators } from '../../site/src/lib/format.ts'
import { ROOT } from '../emit/helpers.ts'

const joined = (items: string[]): string => {
  const sep = listSeparators(items)
  return items.map((x, i) => `${sep[i]}${x}`).join('')
}

describe('a list of titles in a sentence', () => {
  it('commas and `and` when no title has a comma', () => {
    expect(joined(['A'])).toBe('A')
    expect(joined(['A', 'B'])).toBe('A and B')
    expect(joined(['A', 'B', 'C'])).toBe('A, B and C')
  })

  it('semicolons when a title has a comma of its own', () => {
    expect(joined(['Billing', 'Configure, Price, Quote', 'Durable Work'])).toBe(
      'Billing; Configure, Price, Quote; and Durable Work',
    )
    expect(joined(['Billing', 'Configure, Price, Quote'])).toBe('Billing and Configure, Price, Quote')
  })

  it('the radar verdict uses it', () => {
    const page = readFileSync(join(ROOT, 'site', 'src', 'pages', 'radar.astro'), 'utf8')
    expect(page).toContain('listSeparators(touchedEntries.map((e) => e.title))')
  })
})
