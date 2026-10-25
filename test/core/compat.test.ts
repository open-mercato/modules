// check_compat (spec 8.2) on fixture entries.
import { describe, expect, it } from 'vitest'
import { checkCompat, type CompatContext } from '../../lib/core/compat.ts'
import { CheckCompatOutput } from '../../lib/schema/tools.ts'
import {
  consentsBrokenThenGated,
  fixtureBuiltIn,
  fixtureEntries,
  fixtureEntry,
  LOC,
  loadFixture,
  NOW,
  SITE,
} from './helpers.ts'

const fx = loadFixture()
const ctx: CompatContext = {
  entries: fixtureEntries(fx),
  builtIn: fixtureBuiltIn(fx),
  lines: fx.lines.lines,
  site: SITE,
  now: NOW,
}

describe('checkCompat', () => {
  it('ksef on 0.9.0: verified receipt, recommended version, peers do not cover the line', () => {
    const out = CheckCompatOutput.parse(checkCompat({ refs: ['ksef', LOC.ksef], omVersion: '0.9.0' }, ctx))
    expect(out.line).toBe('0.9')
    const r = out.results[1]!
    expect(r).toMatchObject({
      locator: LOC.ksef,
      version: '0.1.8',
      builtFor: { range: '>=0.7.0 <0.8.0', kind: 'bounded', satisfied: false },
      fitsStatically: 'ok',
      status: 'verified',
      recommendedVersion: '0.1.8',
      installableFrom: '2026-10-20',
      agentPolicy: { decision: 'ask' },
      receiptUrl: `${SITE}/r/r_20261023_eb0bba415853`,
    })
    expect(r.notes).toContain('Built for 0.7 (peers >=0.7.0 <0.8.0). A declaration, not a test.')
    // 'ksef' is not a locator, npm name or module ID: the loose match offers candidates
    expect(out.results[0]?.locator).toBeNull()
    expect(out.results[0]?.notes[0]).toContain(LOC.ksef)
  })

  it('consents on 0.9 is broken and refused; stripe is allowed', () => {
    const out = checkCompat(
      { refs: ['@piotrkarwatka/marketing-consents', '@open-mercato/gateway-stripe'], omVersion: '0.9' },
      ctx,
    )
    expect(out.results[0]).toMatchObject({
      status: 'broken',
      agentPolicy: { decision: 'refuse' },
      recommendedVersion: null,
    })
    expect(out.results[0]?.receipt?.step).toBe('typecheck')
    expect(out.results[1]).toMatchObject({
      status: 'verified',
      agentPolicy: { decision: 'allow' },
      builtFor: { satisfied: true },
    })
  })

  it('consents broken on 0.1.0 with 0.1.1 in the age gate: status and policy follow the install version', () => {
    const consents = fixtureEntry(fx, LOC.consents, consentsBrokenThenGated(fx))
    const c2: CompatContext = { ...ctx, entries: ctx.entries.map((e) => (e.locator === LOC.consents ? consents : e)) }
    const out = CheckCompatOutput.parse(checkCompat({ refs: [LOC.consents], omVersion: '0.9.0' }, c2))
    const r = out.results[0]!
    expect(r).toMatchObject({ version: '0.1.0', status: 'broken', recommendedVersion: null })
    expect(r.agentPolicy.decision).toBe('refuse')
    expect(r.agentPolicy.reasons[0]?.code).toBe('BROKEN')
    expect(r.notes).toContain('0.1.1 is quarantine on 0.9. This result is for 0.1.0.')
  })

  it('next prerelease resolves to next; a line outside the catalog is null with a note', () => {
    expect(checkCompat({ refs: [LOC.ksef], omVersion: '0.10.1-develop.7583.1.0c886d0a14' }, ctx).line).toBe('next')
    const old = checkCompat({ refs: [LOC.ksef], omVersion: '0.7.2' }, ctx)
    expect(old.line).toBeNull()
    expect(old.results[0]).toMatchObject({ status: null, receipt: null, fitsStatically: null })
    expect(old.results[0]?.notes[0]).toBe('Line 0.7 is not tested by the catalog.')
  })

  it('a built-in module ID answers with module enable; an unknown ref is refused', () => {
    const out = CheckCompatOutput.parse(checkCompat({ refs: ['data_sync', 'nothing-here'], omVersion: '0.9.0' }, ctx))
    expect(out.results[0]?.agentPolicy.decision).toBe('allow')
    expect(out.results[0]?.notes[0]).toBe(
      'Built into Open Mercato core as data_sync. Enable it: yarn mercato module enable @open-mercato/core --module data_sync',
    )
    expect(out.results[0]?.notes[1]).toContain(LOC.datasync)
    expect(out.results[1]).toMatchObject({
      locator: null,
      agentPolicy: { decision: 'refuse', reasons: [{ code: 'UNKNOWN' }] },
    })
  })
})
