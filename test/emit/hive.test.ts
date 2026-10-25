// The Hive in emit (spec 7.5 amendment, review r2): a data/hive.json from before the disc rules is never drawn. The
// whole map is laid out again in memory, reported, and the cells that reach the site follow the disc rules.
import { describe, expect, test } from 'vitest'
import { discViolations, type HiveSlotsFile } from '../../lib/hive/layout.ts'
import type { HiveCell } from '../../lib/hive/render.ts'
import { buildEmit } from '../../lib/emit/index.ts'
import { fixtureData, OPTS } from './helpers.ts'

const cellsOf = (site: ReadonlyMap<string, unknown>): HiveCell[] =>
  JSON.parse(String(site.get('hive.json'))) as HiveCell[]
const rules = (cells: HiveCell[]): string[] =>
  discViolations(Object.fromEntries(cells.map((c) => [c.key, c])), (k) => {
    const c = cells.find((x) => x.key === k)
    return c ? { wedge: c.wedge, official: c.group === 'official' } : null
  })

describe('emit and data/hive.json', () => {
  const fresh = buildEmit(fixtureData(), OPTS)
  const disc = cellsOf(fresh.site)

  test('an empty slot file gives a disc and no hive warning about rules', () => {
    expect(disc.length).toBe(11)
    expect(rules(disc)).toEqual([])
    expect(fresh.warnings.filter((w) => w.includes('disc'))).toEqual([])
  })

  test('a slot file from before the disc rules is laid out again, not drawn', () => {
    const data = fixtureData()
    // the crescent: catalog cells in the middle, core cells pushed out to one side
    const legacy: HiveSlotsFile = {
      version: 1,
      slots: Object.fromEntries(
        disc.map((c, i) => [c.key, { q: c.key.startsWith('core:') ? 4 + i : i - 4, r: 0, at: '2026-10-22' }]),
      ),
    }
    data.hive = legacy
    const r = buildEmit(data, OPTS)
    const cells = cellsOf(r.site)
    expect(r.warnings).toContain(
      'hive: data/hive.json predates the disc layout; laid out again for this build only (run yarn om hive)',
    )
    expect(rules(cells)).toEqual([])
    expect(cells.map((c) => [c.key, c.q, c.r])).toEqual(disc.map((c) => [c.key, c.q, c.r]))
  })

  test('a stored disc that breaks a rule is reported by emit', () => {
    const data = fixtureData()
    data.hive = {
      version: 1,
      layout: 'disc',
      slots: Object.fromEntries(
        disc.map((c, i) => [c.key, { q: c.key.startsWith('core:') ? 4 + i : i - 4, r: 0, at: '2026-10-22' }]),
      ),
    }
    const r = buildEmit(data, OPTS)
    expect(r.warnings.some((w) => w.startsWith('hive: disc rule broken: '))).toBe(true)
  })
})
