// A line's receipt as a verdict on the version a fresh app installs there (review r6, spec 6.5). The preview run
// installed events, scheduler, search and webhooks 0.9.0 on line 0.8, where a new app installs 0.8.0, and akeneo at a
// stray 1.0.1 where 0.9.0 is installed: 7 of 27 red cells judged another version. The hero, /compat, the radar, the
// strip and the agent policy now read these cells as `no receipt for <install version> yet`, with one sentence.
import { describe, expect, test } from 'vitest'
import { cellSummaries, lineVerdicts } from '../../lib/core/lines.ts'
import {
  INSTALLABLE_META_KEY,
  agentPolicy,
  brokenText,
  judgeLine,
  judgedLines,
  notJudgedText,
  otherVersionCells,
  otherVersionShort,
  otherVersionText,
  pinnedText,
  withJudgedLines,
  type JudgedEntry,
  type PolicyEntry,
} from '../../lib/core/policy.ts'
import { Receipt } from '../../lib/schema/data/index.ts'
import type { CellSummary } from '../../lib/schema/published/modules.ts'
import { LOC, SITE, fixtureEntry, loadFixture } from './helpers.ts'
import { buildInstallPrompt, promptParts } from '../../lib/core/prompt.ts'
import { checkCompat } from '../../lib/core/compat.ts'

const AT = '2026-10-23T09:27:00Z'
const cell = (status: CellSummary['status'], moduleVersion: string | null, step: CellSummary['step'] = null) =>
  ({
    status,
    step,
    omVersion: '0.9.0',
    moduleVersion,
    at: AT,
    receipt: `r_${status}_${moduleVersion}`,
    since: '2026-10-23',
    precheck: null,
    patches: [],
  }) as CellSummary

type Row = JudgedEntry & { listed: boolean }
const entry = (
  latest: string,
  installable: Record<string, string>,
  lines: Record<string, CellSummary>,
  recommended: Record<string, string | null> = { '0.8': null, '0.9': null, next: null },
): Row => ({
  listed: true,
  version: {
    latest,
    preview: null,
    publishedAt: null,
    integrity: null,
    installableFrom: null,
    gitRef: null,
    recommended,
  },
  _meta: { [INSTALLABLE_META_KEY]: installable },
  compat: { builtFor: { range: null, kind: 'missing', lines: [] }, lines, verifiedOn: [] },
})

// events (official, lockstep): 0.8 installs 0.8.0, the preview run installed 0.9.0 there
const events = entry(
  '0.9.0',
  { '0.8': '0.8.0', '0.9': '0.9.0', next: '0.9.0' },
  {
    '0.8': cell('broken', '0.9.0', 'typecheck'),
    '0.9': cell('broken', '0.9.0', 'smoke'),
    next: cell('broken', '0.9.0', 'smoke'),
  },
)
// akeneo: every line installs 0.9.0, every receipt is for the stray 1.0.1
const akeneo = entry(
  '0.9.0',
  { '0.8': '0.9.0', '0.9': '0.9.0', next: '0.9.0' },
  {
    '0.8': cell('broken', '1.0.1', 'typecheck'),
    '0.9': cell('broken', '1.0.1', 'typecheck'),
    next: cell('broken', '1.0.1', 'typecheck'),
  },
)
// stripe: broken at 0.9.0 on 0.8, and 0.9.0 is what 0.8 installs: a real verdict
const stripe = entry(
  '0.9.0',
  { '0.8': '0.9.0', '0.9': '0.9.0', next: '0.9.0' },
  {
    '0.8': cell('broken', '0.9.0', 'typecheck'),
    '0.9': cell('verified', '0.9.0'),
    next: cell('verified', '0.9.0'),
  },
  { '0.8': null, '0.9': '0.9.0', next: '0.9.0' },
)
// gmail: recommended 0.9.0 on 0.8 (verified there) wins over the installable 0.8.0 (D46)
const gmail = entry(
  '0.9.0',
  { '0.8': '0.8.0', '0.9': '0.9.0', next: '0.9.0' },
  { '0.8': cell('verified', '0.9.0'), '0.9': cell('verified', '0.9.0'), next: cell('verified', '0.9.0') },
  { '0.8': '0.9.0', '0.9': '0.9.0', next: '0.9.0' },
)

describe('judgeLine (review r6)', () => {
  test('a receipt of another version is moved to `other`; the install version keeps no verdict', () => {
    expect(judgeLine(events, '0.8')).toEqual({ installs: '0.8.0', cell: null, other: events.compat.lines['0.8'] })
    expect(judgeLine(events, '0.9').cell).toBe(events.compat.lines['0.9'])
    for (const k of ['0.8', '0.9', 'next']) expect(judgeLine(akeneo, k).other?.moduleVersion).toBe('1.0.1')
    expect(judgeLine(stripe, '0.8').other).toBeNull()
    expect(judgeLine(gmail, '0.8').other).toBeNull()
  })

  test('quarantine, untested and skipped cells are never re-read as another version', () => {
    const q = entry('1.4.3', { '0.9': '1.4.2' }, { '0.9': cell('quarantine', '1.4.3') })
    expect(judgeLine(q, '0.9').other).toBeNull()
  })

  test('judgedLines and withJudgedLines leave the other-version cells out', () => {
    expect(Object.keys(judgedLines(events))).toEqual(['0.9', 'next'])
    expect(Object.keys(judgedLines(akeneo))).toEqual([])
    expect(withJudgedLines(stripe)).toBe(stripe)
    expect(Object.keys(otherVersionCells(events))).toEqual(['0.8'])
  })

  test('golden counts: broken drops by 5 on 0.8 (four lockstep modules and akeneo), by 1 on 0.9 and next', () => {
    const lockstep = [events, entry('0.9.0', { '0.8': '0.8.0' }, { '0.8': cell('broken', '0.9.0', 'typecheck') })]
    const scheduler = lockstep[1]!
    const rows: Row[] = [events, scheduler, scheduler, scheduler, akeneo, stripe, gmail]
    const raw = (k: string) => lineVerdicts(rows, k).broken
    const judged = (k: string) => lineVerdicts(rows.map(withJudgedLines), k).broken
    expect(raw('0.8') - judged('0.8')).toBe(5)
    expect(raw('0.9') - judged('0.9')).toBe(1)
    expect(raw('next') - judged('next')).toBe(1)
    expect(judged('0.8')).toBe(1) // stripe: a real break of the version 0.8 installs
  })
})

describe('one sentence per state (review r6)', () => {
  test('another version', () => {
    const o = events.compat.lines['0.8']!
    expect(otherVersionText('0.8', '0.8.0', o)).toBe(
      'No receipt for 0.8.0 on 0.8 yet; the receipt is for 0.9.0 (broken at typecheck, 23 Oct).',
    )
    expect(otherVersionText(['0.8', '0.9', 'next'], '0.9.0', akeneo.compat.lines['0.9']!)).toBe(
      'No receipt for 0.9.0 on 0.8, 0.9 and next yet; the receipts are for 1.0.1 (broken at typecheck, 23 Oct).',
    )
    expect(otherVersionShort('0.8', '0.8.0')).toBe('No receipt for 0.8.0 on 0.8 yet')
  })

  test('a break and a night that judged nothing', () => {
    expect(brokenText('0.9', 'typecheck', '2026-10-23')).toBe('Broken at typecheck on 0.9 since 23 Oct.')
    expect(brokenText(['0.8', '0.9', 'next'], 'typecheck', '2026-10-23')).toBe(
      'Broken at typecheck on 0.8, 0.9 and next since 23 Oct.',
    )
    expect(notJudgedText('0.9', 'infra-error', AT)).toBe('Not judged on 0.9: the run did not finish on 23 Oct.')
  })

  test('the agent policy says the same: NOT_VERIFIED names the other version, BROKEN uses the dictionary word', () => {
    const base = {
      locator: 'npm:@open-mercato/events',
      npm: '@open-mercato/events',
      kind: 'module',
      type: 'official',
      status: 'active',
      license: { spdx: 'MIT', kind: 'osi', mismatch: false },
      replaces: [],
      moduleIds: ['events'],
      identity: { builtFrom: 'none', claimed: false, source: 'npm' },
      signals: { supplyChain: { status: 'ok', reasons: [] } },
    } as unknown as PolicyEntry
    const p = (e: Row, line: string) => agentPolicy({ ...base, ...e } as PolicyEntry, line, undefined, { now: AT })
    expect(p(events, '0.8')).toEqual({
      decision: 'ask',
      reasons: [
        {
          code: 'NOT_VERIFIED',
          text: 'No receipt for 0.8.0 on 0.8 yet; the receipt is for 0.9.0 (broken at typecheck, 23 Oct).',
        },
      ],
      consentText: 'Install @open-mercato/events@0.8.0',
    })
    expect(p(events, '0.9').reasons[0]).toEqual({ code: 'BROKEN', text: 'Broken at smoke on 0.9 since 23 Oct.' })
  })
})

// Review r7: webhooks and scheduler on 0.8. The preview run verified 0.8.0 there at 14:47, then installed 0.9.0 on
// the same line at 15:39 and broke at typecheck. A new app on 0.8 installs 0.8.0 (recommended), so the line's verdict
// is 0.8.0's: a green square, Allow, and two fewer breaks in the 0.8 counter. The newer receipt is no verdict.
describe('a line judged on its install version (review r7)', () => {
  const fx = loadFixture()
  const NOW_R7 = '2026-10-23T18:00:00Z'
  const template = fx.receipts(LOC.stripe).find((r) => r.om.line === '0.9' && r.om.preset === 'classic') as Receipt
  const on08 = (id: string, version: string, at: string, status: 'verified' | 'broken'): Receipt => {
    const r = structuredClone(template)
    r.id = id
    r.om = { ...r.om, line: '0.8', version: '0.8.0', createApp: 'create-mercato-app@0.8.0' }
    r.module = { ...r.module!, version }
    r.run = { ...r.run, at }
    r.baseline = null
    if (status === 'broken') {
      r.result = { ...r.result, status, failedStep: 'typecheck', alsoFailed: [], classification: 'module-fail' }
      r.steps = r.steps.map((s) =>
        s.name === 'typecheck'
          ? { ...s, status: 'fail' }
          : s.name === 'build' || s.name === 'start' || s.name === 'smoke'
            ? { ...s, status: 'skipped' }
            : s,
      )
    }
    r.transition = { from: null, to: status, confirmed: true }
    return Receipt.parse(r)
  }
  const receipts = [
    ...fx.receipts(LOC.stripe),
    on08('r_20261023_0000000000a1', '0.8.0', '2026-10-23T14:47:00Z', 'verified'),
    on08('r_20261023_0000000000a2', '0.9.0', '2026-10-23T15:39:00Z', 'broken'),
  ]
  const e = fixtureEntry(fx, LOC.stripe, { receipts, now: NOW_R7 })

  test('the cell of 0.8 is the receipt of 0.8.0, the version a new app installs there', () => {
    expect(e.version.recommended['0.8']).toBe('0.8.0')
    expect(e.compat.lines['0.8']).toMatchObject({
      status: 'verified',
      moduleVersion: '0.8.0',
      receipt: 'r_20261023_0000000000a1',
    })
    expect(judgeLine(e, '0.8')).toMatchObject({ installs: '0.8.0', other: null })
    expect(e.compat.verifiedOn).toContain('0.8')
    // the last receipt of the line alone is the 0.9.0 break
    expect(cellSummaries(receipts, fx.lines.lines)['0.8']).toMatchObject({ status: 'broken', moduleVersion: '0.9.0' })
  })

  test('green square, Allow in the JSON and on the page, two fewer breaks on 0.8', () => {
    const allow = { decision: 'allow', reasons: [{ code: 'OFFICIAL_VERIFIED', text: 'Official, verified on 0.8.' }] }
    expect(e.agentPolicy['0.8']).toEqual(allow)
    // the site and the MCP Worker read the bare IndexEntry
    expect(agentPolicy(e as PolicyEntry, '0.8', undefined, { now: NOW_R7 })).toEqual(allow)
    const lastOnly = { ...e, compat: { ...e.compat, lines: cellSummaries(receipts, fx.lines.lines) } }
    const before = lineVerdicts([lastOnly, lastOnly], '0.8')
    const after = lineVerdicts([e, e].map(withJudgedLines), '0.8')
    expect(before.broken - after.broken).toBe(2)
    expect(after.verified - before.verified).toBe(2)
  })

  // review r8 (P1): the prompt promised `verified on 0.9, 0.8, next` for webhooks 0.9.0, which broke on 0.8
  test('golden: the install prompt names only the lines that verified its own version, in reading order', () => {
    const p09 = promptParts(e, { site: SITE, line: '0.9' })
    const p08 = promptParts(e, { site: SITE, line: '0.8' })
    expect(p09.version).toBe('0.9.0')
    expect(p09.verifiedOn).toEqual(['0.9'])
    expect(p08.version).toBe('0.8.0')
    expect(p08.verifiedOn).toEqual(['0.8'])
    expect(buildInstallPrompt(e, { site: SITE, line: '0.9' })).toContain(
      'The catalog verified this version on: 0.9. If this app is on another line',
    )
    expect(buildInstallPrompt(e, { site: SITE, line: '0.9' })).not.toMatch(/verified this version on: [^.]*0\.8/)
    expect(buildInstallPrompt(e, { site: SITE, line: '0.8' })).toContain('The catalog verified this version on: 0.8.')
    // the entry's verifiedOn mixes the versions of the lines; it is in reading order now
    expect(e.compat.verifiedOn).toEqual(['0.8', '0.9'])
  })

  test('golden: the newer break is in the data, for the page, the card and check_compat', () => {
    expect(e.compat.newerBreaks).toEqual({
      '0.8': {
        moduleVersion: '0.9.0',
        step: 'typecheck',
        at: '2026-10-23T15:39:00Z',
        receipt: 'r_20261023_0000000000a2',
      },
    })
    const out = checkCompat(
      { omVersion: '0.8.0', refs: [e.locator] },
      { entries: [e], builtIn: [], lines: fx.lines.lines, site: SITE, now: NOW_R7 },
    )
    expect(out.results[0]!.version).toBe('0.8.0')
    expect(out.results[0]!.notes).toContain(
      '0.9.0 is broken at typecheck on 0.8 (23 Oct), so the install command for 0.8 pins 0.8.0.',
    )
  })

  test('a line whose install version has no receipt keeps its last receipt, for readers to show as `other`', () => {
    const only = receipts.filter((r) => r.id !== 'r_20261023_0000000000a1')
    const cells = cellSummaries(only, fx.lines.lines, { '0.8': '0.8.0', '0.9': '0.9.0', next: '0.9.0' })
    expect(cells['0.8']).toMatchObject({ status: 'broken', moduleVersion: '0.9.0' })
    // when the last receipt is the install version's own, it stays the cell
    expect(cellSummaries(receipts, fx.lines.lines, { '0.8': '0.9.0' })['0.8']).toMatchObject({ moduleVersion: '0.9.0' })
  })
})

describe('a receipt of a release the npm data does not list yet (review r7, akeneo 1.0.1)', () => {
  test('the other-version sentence says so', () => {
    const j = judgeLine(akeneo, '0.9')
    expect(j.other?.ahead).toBe(true)
    expect(otherVersionText('0.9', '0.9.0', j.other!)).toBe(
      'No receipt for 0.9.0 on 0.9 yet; the receipt is for 1.0.1 (broken at typecheck, 23 Oct), a version above the latest tag on npm.',
    )
    // an older version on a line (events 0.9.0 on 0.8) is not ahead
    expect(judgeLine(events, '0.8').other?.ahead).toBeUndefined()
  })
})

describe('the pin sentence (review r7)', () => {
  test('a newer break of another version names the version the command pins', () => {
    expect(pinnedText('0.8', '0.8.0', { moduleVersion: '0.9.0', step: 'typecheck', at: '2026-10-23T15:39:00Z' })).toBe(
      '0.9.0 is broken at typecheck on 0.8 (23 Oct), so the install command for 0.8 pins 0.8.0.',
    )
  })
})
