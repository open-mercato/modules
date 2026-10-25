// The registry props (review r4): rows travel packed (no field the locator gives, no null or default value) and come
// back as the same RegistryEntry, so the server list and the hydrated list never differ, and they are smaller.
import { describe, expect, test } from 'vitest'
import { registryCandidates, toRegistryEntry } from '../../site/src/islands/Registry.tsx'
import { packEntry, unpackEntry } from '../../site/src/lib/registry-pack.ts'
import { corpusEntries, fixtureEntries, loadFixture } from '../core/helpers.ts'

const fx = loadFixture()
const lines = fx.lines.lines
const keys = lines.map((l) => l.key)

describe('packed registry rows', () => {
  test.each([
    ['fixture', fixtureEntries(fx)],
    ['corpus of 59 entries', corpusEntries()],
  ])('round trip on the %s', (_name, entries) => {
    for (const e of registryCandidates(entries)) {
      const row = toRegistryEntry(e, lines)
      expect(unpackEntry(JSON.parse(JSON.stringify(packEntry(row))), keys)).toEqual(row)
    }
  })

  test('packed rows are at most half the JSON of the rows', () => {
    const rows = registryCandidates(corpusEntries()).map((e) => toRegistryEntry(e, lines))
    const full = JSON.stringify(rows).length
    const packed = JSON.stringify(rows.map(packEntry)).length
    expect(packed).toBeLessThan(full / 2)
  })
})
