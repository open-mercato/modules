// compat.json names the version a fresh app installs where a cell's receipt is of another one (finding of 25 Oct:
// storage-s3 on 0.8 read `broken` in compat.json while the page and modules.json said untested).
import { describe, expect, it } from 'vitest'
import { otherVersionCells } from '../../lib/core/policy.ts'
import { buildCompat } from '../../lib/emit/compat.ts'
import type { EntryContext } from '../../lib/emit/types.ts'
import { CompatCell } from '../../lib/schema/published/compat.ts'
import { fixtureEntry, LOC, loadFixture, NOW } from '../core/helpers.ts'

const fx = loadFixture()

describe('compat.json installs', () => {
  it('a cell judged on another version carries the version a fresh app installs; a verdict cell does not', () => {
    const e = fixtureEntry(fx, LOC.stripe)
    const key = Object.keys(e.compat.lines)[0]!
    const other = {
      ...e,
      compat: { ...e.compat, lines: { ...e.compat.lines, [key]: { ...e.compat.lines[key]!, moduleVersion: '0.0.1' } } },
    }
    expect(Object.keys(otherVersionCells(other))).toContain(key)
    const ctx = (entry: typeof e) => ({ entry, fit: {} }) as unknown as EntryContext
    const out = buildCompat([ctx(other)], fx.lines.lines as never, {}, NOW)
    const cell = out.rows[0]!.cells[key]!
    expect(CompatCell.parse(cell)).toEqual(cell)
    expect(cell.moduleVersion).toBe('0.0.1')
    expect(cell.installs).toBe(otherVersionCells(other)[key]!.installs)
    const plain = buildCompat([ctx(e)], fx.lines.lines as never, {}, NOW)
    expect(plain.rows[0]!.cells[key]!.installs).toBeUndefined()
  })
})
