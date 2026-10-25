// Round 13: the classic night of 24 Oct had about 46 cells whose `install` Yarn's age gate stopped on a dependency
// (@aws-sdk/credential-provider-http 3.972.77, @ai-sdk/openai 4.0.97), an error of the environment, not of the module.
// Such a cell says one sentence everywhere: not judged, Yarn held back a dependency younger than its age gate.
import { describe, expect, it } from 'vitest'
import { checkCompat } from '../../lib/core/compat.ts'
import { heldBack, notJudgedText, QUARANTINE_TEXT, QUARANTINE_WHY } from '../../lib/core/policy.ts'
import type { Receipt } from '../../lib/schema/data/index.ts'
import { stateSentence as cellSentence } from '../../site/src/lib/compat-cells.ts'
import { cellLabel, headerResults, installBarText, stateSentence, STATUS } from '../../site/src/lib/status.ts'
import { fixtureBuiltIn, fixtureEntries, fixtureEntry, LOC, loadFixture, NOW, SITE } from './helpers.ts'

const fx = loadFixture()
const SENTENCE = 'Not judged on 0.8: on 23 Oct, Yarn held back a dependency younger than its age gate.'

/** ksef with a classic receipt on 0.8 (no receipt there before) whose install the age gate stopped, as on 24 Oct. */
function heldEntry() {
  const own = fx.receipts(LOC.ksef)
  const base = own.find((r) => r.om.line === '0.9' && r.om.preset === 'classic') as Receipt
  const held: Receipt = {
    ...structuredClone(base),
    id: 'r_20261023_aaaaaaaaaaaa',
    cellKey: 'a'.repeat(64),
    om: { line: '0.8', version: '0.8.0', createApp: 'create-mercato-app@0.8.0', preset: 'classic' },
    steps: base.steps.map((s) =>
      s.name === 'install'
        ? {
            ...s,
            status: 'fail' as const,
            excerpt:
              '➤ YN0016: │ @aws-sdk/credential-provider-http@npm:^3.972.77: All versions satisfying "^3.972.77" are quarantined',
          }
        : { ...s, status: 'skipped' as const, sec: null },
    ),
    result: {
      status: 'quarantine',
      failedStep: 'install',
      alsoFailed: [],
      classification: 'quarantine',
      quarantineUntil: null,
    },
    transition: { from: null, to: 'quarantine', confirmed: false },
    run: { ...base.run, at: '2026-10-23T02:30:00Z', attempt: 2 },
  }
  return fixtureEntry(fx, LOC.ksef, { receipts: [...own, held] })
}

describe('a run Yarn held back on a dependency', () => {
  it('one sentence, the day before the reason; the plan entry of a release in the gate is not it', () => {
    expect(QUARANTINE_TEXT).toBe(`Not judged: ${QUARANTINE_WHY}.`)
    expect(notJudgedText('0.8', 'quarantine', '2026-10-23T02:30:00Z')).toBe(SENTENCE)
    expect(heldBack({ status: 'quarantine', step: 'install' })).toBe(true)
    expect(heldBack({ status: 'quarantine', step: null })).toBe(false)
    expect(STATUS.quarantine.word).toBe('not judged (age gate)')
  })

  it('the agent policy and check_compat say it, and blame nothing on the module', () => {
    const e = heldEntry()
    expect(e.compat.lines['0.8']).toMatchObject({ status: 'quarantine', step: 'install' })
    // a verified line keeps its verdict: the age gate never takes Verified away
    expect(e.compat.lines['0.9']?.status).toBe('verified')
    const reasons = e.agentPolicy['0.8']!.reasons
    expect(reasons.map((r) => r.text)).toContain(SENTENCE)
    expect(reasons.some((r) => r.code === 'QUARANTINE' || r.code === 'BROKEN')).toBe(false)
    const entries = fixtureEntries(fx).map((x) => (x.locator === LOC.ksef ? e : x))
    const out = checkCompat(
      { refs: [LOC.ksef], omVersion: '0.8.0' },
      { entries, builtIn: fixtureBuiltIn(fx), lines: fx.lines.lines, site: SITE, now: NOW },
    )
    expect(out.results[0]!.notes).toContain(SENTENCE)
  })

  it('the strip, its label, the header, the phone bar and the /compat popover say the same', () => {
    const e = heldEntry()
    const lines = fx.lines.lines.filter((l) => l.key === '0.8')
    expect(stateSentence(e, lines)).toContain(SENTENCE)
    expect(cellLabel('0.8', 'quarantine', '2026-10-23T02:30:00Z', 'install')).toBe(
      `0.8: not judged on 23 Oct, ${QUARANTINE_WHY}`,
    )
    expect(headerResults(e, lines)).toContain('Not judged on 0.8')
    expect(installBarText([{ key: '0.8', status: 'quarantine', step: 'install' }])).toBe('not judged on 0.8')
    expect(
      cellSentence(
        { line: '0.8', status: 'quarantine', skipped: null, step: 'install', since: null, at: '2026-10-23T02:30:00Z' },
        '',
      ),
    ).toBe(SENTENCE)
  })
})
