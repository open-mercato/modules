// Two starter presets (decision of 24 Oct): `classic`, what `npx create-mercato-app` makes without --preset, gives the
// main verdict (the square, /compat, the Verified seal, the agent policy, check_compat and plan_install); `empty` is the
// signal `in isolation` and never changes it. Golden cases: the key of an empty cell does not change; a cell with an
// empty receipt only is untested with the isolation sentence; classic broken next to empty verified; an empty-only
// finding (events: GET /api/events needs workflows.view) leaves the verdict alone; one sentence in every channel.
import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { checkCompat } from '../../lib/core/compat.ts'
import { isolationReceipts, lineVerdicts, mainReceipts, newAppLines, receiptPreset } from '../../lib/core/lines.ts'
import {
  agentPolicy,
  installSentence,
  isolationLineText,
  isolationText,
  judgedLines,
  presetText,
  untestedText,
  withJudgedLines,
  type PolicyEntry,
} from '../../lib/core/policy.ts'
import { cellKey } from '../../lib/receipts/cell-key.ts'
import { Receipt, type Presets } from '../../lib/schema/data/index.ts'
import { IndexEntry } from '../../lib/schema/published/modules.ts'
import { fixtureEntry, LOC, loadFixture, NOW, SITE, type Fixture } from './helpers.ts'

const fx = loadFixture()
const STRIPE = '@open-mercato/gateway-stripe'
const empty = (rs: readonly Receipt[]) => rs.filter((r) => r.om.preset === 'empty')
const classic = (rs: readonly Receipt[]) => rs.filter((r) => r.om.preset === 'classic')

describe('the cell key of the empty preset (zgodnosc wstecz)', () => {
  const input = {
    locator: 'npm:@fastwhitecat/integration-ksef-direct',
    version: '0.1.8',
    integrity: 'sha512-x',
    omVersion: '0.9.0',
    harnessHash: 'a'.repeat(64),
    node: '24.21.0',
    mode: 'realistic' as const,
    runner: 'preview-docker' as const,
  }
  // the formula of every receipt before 24 Oct, written out
  const before = createHash('sha256')
    .update(
      [
        'npm:@fastwhitecat/integration-ksef-direct@0.1.8',
        'sha512-x',
        '0.9.0',
        'a'.repeat(64),
        '24.21.0',
        'preview-docker',
      ].join('|'),
    )
    .digest('hex')

  test('golden: an empty cell keeps the key it had, with or without the preset named', () => {
    expect(cellKey(input)).toBe(before)
    expect(cellKey({ ...input, preset: 'empty' })).toBe(before)
    // the literal, so a change of the formula shows up as a change of this line
    expect(before).toBe('eb7fa9d03b815f0caee064e208b5517821fe0d68cb219119539e7d04705f085c')
  })

  test('a classic cell is a cell of its own', () => {
    const k = cellKey({ ...input, preset: 'classic' })
    expect(k).not.toBe(before)
    expect(k).toBe('7bd59ec976951f002f1681b280f180ec264b3217780cff4f13fa7b5f08094859')
  })

  test('a receipt without the field scaffolded the empty preset', () => {
    const r = fx.receipts(LOC.ksef)[0]!
    const { preset: _p, ...om } = r.om
    expect(receiptPreset({ om: om as { preset?: string } })).toBe('empty')
    expect(Receipt.safeParse({ ...r, om }).success).toBe(true)
    expect(receiptPreset(r)).toBe('empty')
    expect(mainReceipts(fx.receipts(LOC.ksef)).every((x) => x.om.preset === 'classic')).toBe(true)
    expect(isolationReceipts(fx.receipts(LOC.ksef)).every((x) => x.om.preset === 'empty')).toBe(true)
  })
})

describe('a line with a receipt of the empty preset only', () => {
  const e = fixtureEntry(fx, LOC.ksef, { receipts: empty(fx.receipts(LOC.ksef)) })
  const SENTENCE = 'Not yet tested in a new app on 0.9. In isolation (empty preset): verified on 23 Oct.'

  test('golden: the main verdict is untested, the empty receipt is the signal in isolation', () => {
    expect(IndexEntry.safeParse(e).success).toBe(true)
    expect(e.compat.lines['0.9']).toBeUndefined()
    expect(e.compat.verifiedOn).toEqual([])
    expect(e.version.recommended['0.9']).toBeNull()
    expect(e.signals.receipt['0.9']).toBe('untested')
    expect(e.tier).toBe('listed')
    expect(e.compat.isolation?.['0.9']).toMatchObject({ status: 'verified', moduleVersion: '0.1.8' })
    expect(lineVerdicts([withJudgedLines(e)], '0.9').verified).toBe(0)
  })

  test('golden: one sentence, the agent policy, check_compat and the site helpers say it', () => {
    expect(untestedText('0.9', e.compat.isolation!['0.9'], '0.1.8')).toBe(SENTENCE)
    expect(isolationLineText(e, '0.9')).toBe(SENTENCE)
    const p = e.agentPolicy['0.9']!
    expect(p.decision).toBe('ask')
    expect(p.reasons.find((r) => r.code === 'NOT_VERIFIED')?.text).toBe(SENTENCE)
    const out = checkCompat(
      { omVersion: '0.9.0', refs: [LOC.ksef] },
      { entries: [e], builtIn: [], lines: fx.lines.lines, site: SITE, now: NOW },
    )
    expect(out.results[0]!.status).toBe('untested')
    expect(out.results[0]!.notes).toContain(SENTENCE)
    // VER-1 says it too
    const ver1 = fixtureEntry(fx, LOC.ksef, { receipts: empty(fx.receipts(LOC.ksef)) })
    expect(ver1.tier).toBe('listed')
  })
})

describe('classic broken next to empty verified', () => {
  const brokenClassic = (): Receipt[] => {
    const own = fx.receipts(LOC.ksef)
    return own.map((r) =>
      r.om.preset === 'classic' && r.om.line === '0.9'
        ? Receipt.parse({
            ...r,
            result: {
              status: 'broken',
              failedStep: 'typecheck',
              alsoFailed: [],
              classification: 'module-fail',
              quarantineUntil: null,
            },
            steps: r.steps.map((s) =>
              s.name === 'typecheck'
                ? { ...s, status: 'fail', excerpt: 'x.ts(1,1): error TS2307: Cannot find module y' }
                : s.name === 'initialize' || s.name === 'build' || s.name === 'start' || s.name === 'smoke'
                  ? { ...s, status: 'skipped', sec: null }
                  : s,
            ),
            transition: { from: null, to: 'broken', confirmed: true },
          })
        : r,
    )
  }
  const e = fixtureEntry(fx, LOC.ksef, { receipts: brokenClassic() })

  test('golden: the verdict is the broken classic receipt; isolation stays verified beside it', () => {
    expect(e.compat.lines['0.9']?.status).toBe('broken')
    expect(e.compat.isolation?.['0.9']?.status).toBe('verified')
    expect(e.compat.verifiedOn).toEqual(['next'])
    expect(e.version.recommended['0.9']).toBeNull()
    expect(e.agentPolicy['0.9']?.decision).toBe('refuse')
    expect(e.agentPolicy['0.9']?.reasons[0]).toEqual({
      code: 'BROKEN',
      text: 'Broken at typecheck on 0.9 since 23 Oct.',
    })
    expect(isolationLineText(e, '0.9')).toBe('In isolation (empty preset): verified on 23 Oct.')
    const out = checkCompat(
      { omVersion: '0.9.0', refs: [LOC.ksef] },
      { entries: [e], builtIn: [], lines: fx.lines.lines, site: SITE, now: NOW },
    )
    expect(out.results[0]!.status).toBe('broken')
    expect(out.results[0]!.notes).toContain('In isolation (empty preset): verified on 23 Oct.')
  })
})

describe('a finding of the empty preset only (events: GET /api/events needs workflows.view)', () => {
  /** gateway-stripe registered by both presets on 0.9 and next, as events and search are. */
  function withStripeEverywhere(base: Fixture): Fixture {
    const presets = structuredClone(base.presets) as Presets
    for (const k of ['0.9', 'next']) {
      const p = presets[k]!
      presets[k] = {
        ...p,
        empty: [...(p.empty ?? []), { id: 'gateway_stripe', from: STRIPE }],
        classic: [
          ...(p.empty ?? []),
          { id: 'gateway_stripe', from: STRIPE },
          { id: 'workflows', from: '@open-mercato/core' },
        ],
      }
    }
    return { ...base, presets }
  }
  /** stripe's empty receipt on 0.9 fails its smoke check with a 403 for workflows.view. */
  const isoFinding = (): Receipt[] =>
    fx.receipts(LOC.stripe).map((r) =>
      r.om.preset === 'empty' && r.om.line === '0.9'
        ? Receipt.parse({
            ...r,
            result: {
              status: 'broken',
              failedStep: 'smoke',
              alsoFailed: [],
              classification: 'module-fail',
              quarantineUntil: null,
            },
            steps: r.steps.map((s) =>
              s.name === 'smoke'
                ? {
                    ...s,
                    status: 'fail',
                    excerpt:
                      'smoke: FAIL module api GET /api/events -> 403 (expected 2[0-9][0-9])\n{"error":"Forbidden","requiredFeatures":["workflows.view"]}',
                  }
                : s,
            ),
            transition: { from: null, to: 'broken', confirmed: true },
          })
        : r,
    )
  const pfx = withStripeEverywhere(fx)
  const e = fixtureEntry(pfx, LOC.stripe, { receipts: isoFinding() })
  const FINDING =
    'GET /api/events needs the workflows.view feature, and the empty preset does not enable the workflows module.'

  test('golden: the main verdict stays verified, the agent policy allows it, the finding is the isolation signal', () => {
    expect(newAppLines(pfx.presets, fx.lines.lines, STRIPE)).toEqual(['0.9', 'next'])
    expect(e.compat.inPresets).toEqual(['0.9', 'next'])
    expect(e.compat.inEmptyPreset).toEqual(['0.9', 'next'])
    expect(e.compat.ships).toEqual({ '0.9': '0.9.0', next: '0.10.1-develop.7583.1.0c886d0a14' })
    expect(e.compat.lines['0.9']?.status).toBe('verified')
    expect(e.compat.verifiedOn).toEqual(['0.9'])
    expect(Object.keys(judgedLines(e))).toEqual(['0.9'])
    expect(e.agentPolicy['0.9']).toEqual({
      decision: 'allow',
      reasons: [
        { code: 'OFFICIAL_VERIFIED', text: 'Official, verified on 0.9.' },
        {
          code: 'IN_PRESET',
          text: 'Nothing to install: a new app already registers gateway_stripe in src/modules.ts.',
        },
      ],
    })
    expect(agentPolicy(e as PolicyEntry, '0.9', undefined, { now: NOW }).decision).toBe('allow')
    expect(e.compat.isolation?.['0.9']).toMatchObject({ status: 'broken', step: 'smoke', finding: FINDING })
  })

  test('golden: one sentence for the finding, and the install sentence names no command', () => {
    const iso = e.compat.isolation!['0.9']!
    const text = `In isolation (empty preset): broken at smoke on 23 Oct. ${FINDING}`
    expect(isolationText(iso, '0.9.0')).toBe(text)
    expect(isolationLineText(e, '0.9')).toBe(text)
    expect(presetText(['0.9', 'next'])).toBe('Already on in a new app on 0.9 and next.')
    expect(installSentence(e, '0.9', e.install.cli)).toBe(
      'Nothing to install: a new app already registers gateway_stripe in src/modules.ts.',
    )
    const out = checkCompat(
      { omVersion: '0.9.0', refs: [STRIPE] },
      { entries: [e], builtIn: [], lines: fx.lines.lines, site: SITE, now: NOW },
    )
    expect(out.results[0]!.status).toBe('verified')
    expect(out.results[0]!.agentPolicy.decision).toBe('allow')
    expect(out.results[0]!.notes.slice(0, 2)).toEqual([
      'Nothing to install: a new app already registers gateway_stripe in src/modules.ts.',
      text.slice(0, 200),
    ])
  })

  test('a package only a new app registers: the command of an app from the empty preset follows the sentence', () => {
    const presets = structuredClone(fx.presets) as Presets
    presets['0.9'] = { ...presets['0.9']!, classic: [{ id: 'gateway_stripe', from: STRIPE }] }
    const only = fixtureEntry({ ...fx, presets }, LOC.stripe)
    expect(only.compat.inPresets).toEqual(['0.9'])
    expect(only.compat.inEmptyPreset).toBeUndefined()
    expect(installSentence(only, '0.9', only.install.cli)).toBe(
      'Nothing to install: a new app already registers gateway_stripe in src/modules.ts. In an app from the empty preset: yarn mercato module add @open-mercato/gateway-stripe@0.9.0',
    )
  })
})

describe('the fixture receipts', () => {
  test('every measured row of the empty preset has its classic copy', () => {
    for (const loc of [LOC.ksef, LOC.consents, LOC.durable, LOC.stripe]) {
      const rs = fx.receipts(loc)
      expect(classic(rs).length, loc).toBe(empty(rs).length)
    }
  })
})
