// Round 13: on 0.8 the command of an app from the empty preset installs checkout 0.8.0 (the version a new 0.8 app
// ships, `emptyPresetVersion`), while the night of the empty preset tested 0.9.0. The sentence under the command says
// there is no receipt for 0.8.0 instead of standing silent or speaking of 0.9.0 alone.
import { describe, expect, it } from 'vitest'
import { emptyCommandCaution, type JudgedEntry } from '../../lib/core/policy.ts'

const checkout = {
  compat: {
    ships: { '0.8': '0.8.0' },
    isolation: {
      '0.8': {
        status: 'broken',
        step: 'typecheck',
        at: '2026-10-23T15:39:42Z',
        moduleVersion: '0.9.0',
        receipt: 'r_x',
      },
    },
  },
} as unknown as JudgedEntry

describe('the command of an app from the empty preset', () => {
  it('names a version the night in isolation did not test', () => {
    expect(emptyCommandCaution(checkout, '0.8', '0.8.0')).toBe(
      'In isolation (empty preset): no receipt for 0.8.0 yet; 0.9.0 broken at typecheck on 23 Oct.',
    )
  })
  it('keeps the receipt sentence when the command installs the version that broke there', () => {
    expect(emptyCommandCaution(checkout, '0.8', '0.9.0')).toMatch(
      /^In isolation \(empty preset\): 0\.9\.0 broken at typecheck/,
    )
  })
})

// Round 14: check_compat said `In isolation (empty preset): 0.9.0 broken at typecheck ...` after the command of an
// app from the empty preset that installs 0.8.0, while the plan, the install box and the card said `no receipt for
// 0.8.0 yet`. One state, one sentence: the note of the empty preset's command.
describe('check_compat on a line a new app ships (checkout on 0.8)', () => {
  it('says the note of the empty preset command, not the bare isolation line', async () => {
    const { checkCompat } = await import('../../lib/core/compat.ts')
    const { installVersion } = await import('../../lib/core/policy.ts')
    const { fixtureBuiltIn, fixtureEntries, LOC, loadFixture, NOW, SITE } = await import('./helpers.ts')
    const fx = loadFixture()
    const entries = fixtureEntries(fx)
    const e = structuredClone(entries.find((x) => x.locator === LOC.stripe)!)
    const v = installVersion(e, '0.8')!
    e.compat.inPresets = ['0.8']
    e.compat.ships = { '0.8': '0.8.0' }
    e.version.recommended['0.8'] = null
    e.compat.isolation = {
      '0.8': { status: 'broken', step: 'typecheck', at: '2026-10-23T15:39:42Z', moduleVersion: v, receipt: 'r_x' },
    }
    const out = checkCompat(
      { refs: [LOC.stripe], omVersion: '0.8.0' },
      {
        entries: entries.map((x) => (x.locator === LOC.stripe ? e : x)),
        builtIn: fixtureBuiltIn(fx),
        lines: fx.lines.lines,
        site: SITE,
        now: NOW,
      },
    )
    const notes = out.results[0]!.notes
    expect(notes).toContain(
      `In isolation (empty preset): no receipt for 0.8.0 yet; ${v} broken at typecheck on 23 Oct.`,
    )
    expect(notes.some((n) => n.startsWith(`In isolation (empty preset): ${v} broken`))).toBe(false)
  })
})
