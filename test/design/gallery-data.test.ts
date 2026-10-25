// The design gallery renders fixture data through the published shapes; this keeps that stand-in honest.
import { describe, expect, it } from 'vitest'
import { galleryData } from '../../site/src/lib/dev/fixtures.ts'
import { BuiltInModule, CompatIndex, IndexEntry, InstallPlan, Line } from '../../lib/schema/index.ts'

describe('gallery data from test/fixtures', () => {
  const g = galleryData('fixture')
  it('builds a valid IndexEntry for each of the 8 fixture entries', () => {
    expect(g.entries).toHaveLength(8)
    for (const e of g.entries) IndexEntry.parse(e)
  })
  it('keeps the fixture facts: ksef verified on 0.9 and next, consents broken at typecheck on 0.9', () => {
    const ksef = g.entries.find((e) => e.path === '@fastwhitecat/integration-ksef-direct')!
    expect(ksef.compat.verifiedOn.sort()).toEqual(['0.9', 'next'])
    expect(ksef.install.cli).toBe(
      'yarn mercato module add @fastwhitecat/integration-ksef-direct@0.1.8 --allow-third-party',
    )
    const consents = g.entries.find((e) => e.path === '@piotrkarwatka/marketing-consents')!
    expect(consents.compat.lines['0.9']).toMatchObject({ status: 'broken', step: 'typecheck' })
    const ent = g.entries.find((e) => e.path === '@open-mercato/enterprise')!
    expect(ent.anatomy).toBeNull()
  })
  it('builds valid lines, compat, built-in and install plan', () => {
    for (const l of g.lines) Line.parse(l)
    CompatIndex.parse(g.compat)
    for (const b of g.builtIn) BuiltInModule.parse(b)
    InstallPlan.parse(g.plan)
  })
  it('lays out 46 core cells and 47 listed modules and providers in the Hive', () => {
    expect(g.hive.filter((c) => c.group === 'core')).toHaveLength(46)
    expect(g.hive.filter((c) => c.group !== 'core')).toHaveLength(47)
  })
})
