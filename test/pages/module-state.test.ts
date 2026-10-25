// The state of a module page in words (review r4): the sentence under the strip and the header group the lines that
// say the same thing, and the Quality tab says `Verified on` only for a Verified entry.
import { describe, expect, test } from 'vitest'
import type { CellStatus, IndexEntry } from '../../lib/schema/index.ts'
import { rulesHeading, verifiedTestNote } from '../../site/src/lib/chips.ts'
import { headerResults, installBarText, noRecommendedNote, stateSentence } from '../../site/src/lib/status.ts'
import { brokenText, notJudgedText, otherVersionText } from '../../lib/core/policy.ts'

const LINES = [
  { key: '0.8', source: 'previous' },
  { key: '0.9', source: 'latest' },
  { key: 'next', source: 'develop' },
] as const

type Cell = { status: string; step?: string | null; since?: string | null; at?: string | null }
const entry = (cells: Record<string, Cell>) =>
  ({
    compat: {
      lines: Object.fromEntries(
        Object.entries(cells).map(([k, c]) => [k, { step: null, since: null, at: null, ...c }]),
      ),
    },
  }) as unknown as Pick<IndexEntry, 'compat'>
const broken = { status: 'broken', step: 'typecheck', since: '2026-10-23' }

describe('state sentence and header (golden)', () => {
  test('three identical breaks are one phrase, under the strip and in the header', () => {
    const e = entry({ '0.8': broken, '0.9': broken, next: broken })
    expect(stateSentence(e, [...LINES])).toBe('Broken at typecheck on 0.8, 0.9 and next since 23 Oct.')
    expect(headerResults(e, [...LINES])).toEqual(['Broken on 0.8, 0.9 and next'])
  })

  test('verified lines join with `and`; a different break keeps its own phrase', () => {
    const e = entry({
      '0.8': { status: 'verified' },
      '0.9': { status: 'verified' },
      next: { status: 'broken', step: 'build', since: '2026-10-22' },
    })
    expect(stateSentence(e, [...LINES])).toBe('Verified on 0.8 and 0.9. Broken at build on next since 22 Oct.')
    expect(headerResults(e, [...LINES])).toEqual(['Verified on 0.8 and 0.9', 'Broken on next'])
  })

  test('a night that did not finish says so with its day, calmly (round 5)', () => {
    const e = entry({
      '0.8': { status: 'infra-error', at: '2026-10-23T09:27:00Z' },
      '0.9': { status: 'infra-error', at: '2026-10-23T11:02:00Z' },
      next: { status: 'infra-error', at: '2026-10-23T15:39:00Z' },
    })
    expect(stateSentence(e, [...LINES])).toBe('Not judged on 0.8, 0.9 and next: the run did not finish on 23 Oct.')
    expect(stateSentence(e, [...LINES])).not.toMatch(/fail|error|broken/i)
  })

  test('not judged lines are grouped too, queued lines come last', () => {
    const e = entry({ '0.8': { status: 'infra-error' }, '0.9': { status: 'infra-error' } })
    expect(stateSentence(e, [...LINES])).toBe('Not judged on 0.8 and 0.9: the run did not finish. Queued on next.')
    expect(headerResults(e, [...LINES])).toEqual(['Not judged on 0.8 and 0.9'])
  })
})

describe('Quality tab of a Listed entry with VER-1 pending', () => {
  test('the rule list is not titled `Verified on`', () => {
    expect(rulesHeading('listed', '0.9', 4, 5)).toBe('Rules for Verified · 0.9 · 4 of 5 pass')
    expect(rulesHeading('listed', '0.9', 4, 5)).not.toMatch(/^Verified on/)
    expect(rulesHeading('verified', '0.9', 5, 5)).toBe('Verified on 0.9 · 5 of 5 rules pass')
  })

  test('the test note says what the run does until a verified receipt, then when it passed', () => {
    const queued = verifiedTestNote({ installs: true, last: null, omVersion: '0.9.0' })
    expect(queued).toMatch(/^The nightly run installs it in a new Open Mercato 0\.9\.0 app: /)
    // review r12: a preview run is no nightly CI run
    expect(verifiedTestNote({ installs: true, last: null, omVersion: '0.9.0', preview: true })).toMatch(
      /^Each run installs it in a new Open Mercato 0\.9\.0 app: /,
    )
    expect(queued).not.toMatch(/^Installed/)
    const red = verifiedTestNote({
      installs: true,
      last: { status: 'broken', at: '2026-10-23T09:27:00Z' },
      omVersion: '0.9.0',
    })
    expect(red).toMatch(/^The nightly run installs it/)
    expect(
      verifiedTestNote({
        installs: true,
        last: { status: 'verified', at: '2026-10-23T09:27:00Z' },
        omVersion: '0.9.0',
      }),
    ).toMatch(/^Installed in a new Open Mercato 0\.9\.0 app on 23 Oct: /)
    expect(verifiedTestNote({ installs: false, last: null, omVersion: '0.9.0' })).toBeNull()
  })
})

describe('phone install bar (review r4, P1): what the receipts say, never `queued` under a receipt', () => {
  const cells = (st: Record<string, string>) =>
    Object.entries(st).map(([key, status]) => ({ key, status }) as { key: string; status: CellStatus })

  test('a module broken on every line whose agent policy refuses (marketing-consents, golden)', () => {
    expect(installBarText(cells({ '0.8': 'broken', '0.9': 'broken', next: 'broken' }), { refuse: true })).toBe(
      'broken on 0.8, 0.9 and next · agent refuses',
    )
  })

  test('a night that did not finish (infra-error on every line, golden)', () => {
    expect(installBarText(cells({ '0.8': 'infra-error', '0.9': 'infra-error', next: 'infra-error' }))).toBe(
      'not judged on 0.8, 0.9 and next',
    )
  })

  test('mixed lines keep the strip order of states; queued only where a line has no receipt', () => {
    expect(installBarText(cells({ '0.8': 'untested', '0.9': 'verified', next: 'broken' }))).toBe(
      'verified on 0.9 · broken on next · queued on 0.8',
    )
    expect(installBarText(cells({ '0.8': 'untested', '0.9': 'untested', next: 'untested' }))).toBe('queued')
    expect(installBarText(cells({ '0.8': 'skipped', '0.9': 'skipped', next: 'skipped' }))).toBe(
      'not tested by the catalog',
    )
  })

  test('hold and packages the catalog cannot install say so instead', () => {
    expect(installBarText(cells({ '0.9': 'broken' }), { blocked: 'hold' })).toBe('on hold, do not install')
    expect(installBarText(cells({ '0.9': 'untested' }), { blocked: 'not-installable' })).toBe('not installable')
  })
})

describe('a break with one red night is named one way everywhere (review r4)', () => {
  test('`since` only after a second night confirms it', () => {
    const e = entry({ '0.8': { status: 'verified' }, '0.9': broken, next: broken })
    expect(stateSentence(e, [...LINES], { unconfirmed: { '0.9': '2026-10-23' } })).toBe(
      'Verified on 0.8. Broken at typecheck on 0.9, one red night (23 Oct). Broken at typecheck on next since 23 Oct.',
    )
    expect(stateSentence(e, [...LINES])).toBe('Verified on 0.8. Broken at typecheck on 0.9 and next since 23 Oct.')
  })
})

// Review r7: the nameplate's Recommended row said `No receipt on 0.9 yet.` on 23 cards, also under a red strip
// (events: `Broken at smoke on 0.8, 0.9 and next since 23 Oct.`). The note is the strip's sentence for the line.
describe('Recommended row without a recommended version (review r7)', () => {
  const latest = { key: '0.9', source: 'latest' } as const
  test('a broken line never reads `No receipt on 0.9 yet`', () => {
    const note = noRecommendedNote(entry({ '0.9': { status: 'broken', step: 'smoke', since: '2026-10-23' } }), latest)
    expect(note).toBe(brokenText('0.9', 'smoke', '2026-10-23'))
    expect(note).not.toContain('No receipt on 0.9 yet')
  })
  test('a night that judged nothing and a receipt of another version use their own sentences', () => {
    const at = '2026-10-23T09:27:00Z'
    expect(noRecommendedNote(entry({ '0.9': { status: 'infra-error', at } }), latest)).toBe(
      notJudgedText('0.9', 'infra-error', at),
    )
    const other = { moduleVersion: '1.0.1', status: 'broken', step: 'typecheck', at } as const
    expect(noRecommendedNote(entry({}), latest, { others: { '0.9': { installs: '0.9.0', other } } })).toBe(
      otherVersionText('0.9', '0.9.0', other),
    )
  })
  test('only a line without any receipt says `Not yet tested in a new app on 0.9.`', () => {
    expect(noRecommendedNote(entry({}), latest)).toBe('Not yet tested in a new app on 0.9.')
  })
})
