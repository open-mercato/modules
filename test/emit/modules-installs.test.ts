// modules.json and /m/*.json name the version a fresh app installs where a cell's receipt is of another one, as
// compat.json does (finding of 25 Oct: storage-s3, telemetry and channel-discord read `broken` on 0.8 in
// compat.lines of modules.json, from the 0.9.0 receipt, while signals.receipt said untested).
import { describe, expect, it } from 'vitest'
import { otherVersionCells } from '../../lib/core/policy.ts'
import { IndexEntry } from '../../lib/schema/published/modules.ts'
import { fixtureEntry, LOC, loadFixture } from '../core/helpers.ts'

const fx = loadFixture()

describe('modules.json installs', () => {
  it('a cell judged on another version carries the version a fresh app installs; a verdict cell does not', () => {
    const plain = fixtureEntry(fx, LOC.stripe)
    const line = Object.keys(plain.compat.lines).find((k) => plain.compat.lines[k]?.moduleVersion)!
    const judged = plain.compat.lines[line]!.moduleVersion!
    // the receipts of that line broke on a release the registry does not list, not the one a fresh app installs there
    const receipts = fx.receipts(LOC.stripe).map((r) =>
      r.om.line === line && r.module
        ? {
            ...r,
            module: { ...r.module, version: '0.9.1' },
            result: {
              ...r.result,
              status: 'broken' as const,
              failedStep: 'typecheck' as const,
              classification: 'module-fail' as const,
            },
            transition: { from: null, to: 'broken' as const, confirmed: true },
          }
        : r,
    )
    const e = fixtureEntry(fx, LOC.stripe, { receipts })
    const others = otherVersionCells(e)
    expect(Object.keys(others)).toContain(line)
    const cell = e.compat.lines[line]!
    expect(cell.moduleVersion).toBe('0.9.1')
    expect(cell.status).toBe('broken')
    expect(cell.installs).toBe(others[line]!.installs)
    expect(cell.installs).toBe(judged)
    expect(e.signals.receipt[line]).toBe('untested')
    expect(IndexEntry.parse(e)).toEqual(e)
    for (const k of Object.keys(plain.compat.lines)) expect(plain.compat.lines[k]!.installs, k).toBeUndefined()
  })
})
