// scripts/migrate-preset-model.ts (review of 24 Oct): level changes from receipts of the empty preset leave the feed,
// a level Verified under the new model is dated by its first receipt of a new app, and a second run changes nothing.
import { describe, expect, it } from 'vitest'
import { migratePresetModel } from '../../scripts/migrate-preset-model.ts'
import { recentChanges } from '../../lib/emit/changes.ts'
import { Change } from '../../lib/schema/data/changes.ts'
import { LOC, loadFixture } from './helpers.ts'

const fx = loadFixture()

describe('the migration of 24 Oct', () => {
  // the fixture's first classic receipts are of 2026-10-23T02:17:00Z; the old model wrote its level changes before
  const receipts = [...fx.receipts(LOC.ksef), ...fx.receipts(LOC.stripe)]
  const old = (locator: string): Change =>
    Change.parse({ at: '2026-10-22T17:51:31Z', type: 'tier-change', locator, from: 'listed', to: 'verified' })
  const model = Change.parse({
    at: '2026-10-24T07:46:44Z',
    type: 'tier-change',
    locator: LOC.consents,
    from: 'verified',
    to: 'listed',
    reason: 'preset-model',
  })
  const input = {
    changes: [old(LOC.ksef), old(LOC.consents), model],
    receipts,
    verified: [LOC.ksef],
    latestLine: '0.9',
  }

  it('golden: marks the old changes, dates the Verified level by the first classic receipt, and is idempotent', () => {
    const r = migratePresetModel(input)
    expect(r.since).toBe('2026-10-23T02:17:00Z')
    expect(r.marked).toBe(2)
    expect(r.changes.every((c) => c.reason === 'preset-model')).toBe(true)
    expect(r.added).toEqual([
      { at: '2026-10-23T02:17:00Z', type: 'tier-change', locator: LOC.ksef, from: 'listed', to: 'verified' },
    ])
    const again = migratePresetModel({ ...input, changes: [...r.changes, ...r.added] })
    expect([again.marked, again.added.length]).toEqual([0, 0])
    // the feed shows the dated level only
    const feed = recentChanges([...r.changes, ...r.added], '2026-10-24T08:00:00Z').changes
    expect(feed).toEqual(r.added)
  })

  it('nothing to do before the first receipt of a new app', () => {
    const empty = receipts.filter((x) => x.om.preset !== 'classic')
    expect(migratePresetModel({ ...input, receipts: empty })).toMatchObject({ since: null, marked: 0, added: [] })
  })
})
