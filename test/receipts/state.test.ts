// State machine of receipts (spec 5.3 step 4, 4.5 retention, 12.2 WP07): golden cases on the fixture matrix.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Receipt } from '../../lib/schema/data/index.ts'
import { Presets } from '../../lib/schema/data/lines.ts'
import type { BundleAttempt, CellOutcome, NightBundle } from '../../lib/receipts/from-actions.ts'
import type { Matrix, MatrixCell } from '../../lib/receipts/matrix.ts'
import { applyNight, presetFromModulesTs, retryKeys, type History } from '../../lib/receipts/state.ts'
import { decisiveReceipt, recommendedVersions } from '../../lib/core/lines.ts'
import { inPreset } from '../../lib/core/plan.ts'
import { fixtureEntry } from '../core/helpers.ts'
import {
  API_KEY_INIT,
  CONSENTS_BUILD,
  CONSENTS_TS,
  harness,
  loadFixture,
  LOC,
  MODULES_TS_09,
  NIGHT,
  outcome,
  plan,
  ROOT,
  tmp,
} from './helpers.ts'

const fx = loadFixture()
const m = plan(fx, { runner: 'ubuntu-latest' })
const cell = (loc: string | null, line = '0.9'): MatrixCell =>
  m.cells.find((c) => c.locator === loc && c.line === line && c.mode === 'realistic')!

const RETRY_AT = '2026-10-23T02:55:00Z'
function bundle(a1: CellOutcome[], a2: CellOutcome[] | null = null, matrix: Matrix = m): NightBundle {
  const attempts: BundleAttempt[] = [
    {
      attempt: 1,
      run: { id: 100, url: 'https://github.com/wojciechszyjka/modules/actions/runs/100', at: NIGHT },
      outcomes: a1,
    },
  ]
  if (a2)
    attempts.push({
      attempt: 2,
      run: { id: 200, url: 'https://github.com/wojciechszyjka/modules/actions/runs/200', at: RETRY_AT },
      outcomes: a2,
    })
  return {
    schema: 1,
    runner: 'ubuntu-latest',
    night: { id: 100, url: 'https://github.com/wojciechszyjka/modules/actions/runs/100', at: NIGHT },
    matrix,
    attempts,
    retry: [],
    notes: [],
  }
}
const empty: History = () => []
const apply = (b: NightBundle, history: History = empty) =>
  applyNight({ bundle: b, history, harness: harness(), presets: null })
const receiptOf = (res: ReturnType<typeof apply>, loc: string | null, line = '0.9') =>
  res.receipts.find((r) => r.locator === loc && r.receipt.om.line === line)?.receipt

describe('baseline', () => {
  const base09 = cell(null, '0.9')
  const ksef = cell(LOC.ksef)

  it('a green baseline with the api-keys patch: verified, patch named in the receipt, presets refreshed', () => {
    const res = apply(bundle([outcome(base09, { modulesTs: MODULES_TS_09, patches: ['api-keys'] }), outcome(ksef)]))
    const r = receiptOf(res, null)!
    expect(r.result.status).toBe('verified')
    expect(r.harness.patches.map((p) => p.id)).toEqual(['api-keys'])
    expect(r.harness.patches[0]!.ref).toBe('https://github.com/open-mercato/open-mercato/pull/7473')
    expect(r.steps.find((s) => s.name === 'add')!.status).toBe('skipped')
    expect(r.harness.yarn).toBe('4.17.1')
    expect(Presets.parse(res.presets)['0.9']!.empty!.map((x) => x.id)).toContain('search')
    expect(res.presets!['0.9']!.at).toBe(NIGHT)
    expect(receiptOf(res, LOC.ksef)!.baseline).toEqual({ status: 'verified', receipt: r.id })
  })

  it('a red baseline makes every module cell of the line harness-red and nothing else is retried', () => {
    const a1 = [
      outcome(base09, { fail: { initialize: API_KEY_INIT } }),
      outcome(ksef, { fail: { initialize: API_KEY_INIT } }),
    ]
    expect(retryKeys(m.cells, a1, empty)).toEqual([base09.key])
    const res = apply(bundle(a1, [outcome(base09, { attempt: 2, fail: { initialize: API_KEY_INIT } })]))
    const b = receiptOf(res, null)!
    expect([b.result.status, b.result.classification, b.transition.confirmed]).toEqual([
      'harness-red',
      'harness-red',
      true,
    ])
    const k = receiptOf(res, LOC.ksef)!
    expect([k.result.status, k.result.classification, k.transition.confirmed]).toEqual([
      'harness-red',
      'harness-red',
      false,
    ])
    // harness-red never decides a module's status (lib/core/lines.ts).
    expect(decisiveReceipt([k], '0.9', '0.1.8')).toBeNull()
  })

  it('a shard without the baseline reads the stored one: a red baseline spares its module cells the retry', () => {
    const a1 = [
      outcome(base09, { fail: { initialize: API_KEY_INIT } }),
      outcome(ksef, { fail: { initialize: API_KEY_INIT } }),
    ]
    const red = receiptOf(
      apply(bundle(a1, [outcome(base09, { attempt: 2, fail: { initialize: API_KEY_INIT } })])),
      null,
    )!
    // shard 2 of `cells-local --shard`: the module cell only, collected after shard 1 wrote the red baseline
    const shard = [outcome(ksef, { fail: { typecheck: CONSENTS_TS } })]
    expect(retryKeys(m.cells, shard, empty)).toEqual([ksef.key])
    expect(retryKeys(m.cells, shard, (loc) => (loc === null ? [red] : []))).toEqual([])
  })
})

describe('module cells', () => {
  const base09 = cell(null, '0.9')
  const consents = cell(LOC.consents)
  const durable = cell(LOC.durable)

  it('consents: red typecheck and build, confirmed broken by the retry, alsoFailed [build]', () => {
    const red = { typecheck: CONSENTS_TS, build: CONSENTS_BUILD }
    const a1 = [outcome(base09), outcome(consents, { fail: red }), outcome(durable)]
    expect(retryKeys(m.cells, a1, empty)).toEqual([consents.key])
    const res = apply(bundle(a1, [outcome(consents, { attempt: 2, fail: red })]))
    const r = receiptOf(res, LOC.consents)!
    expect(r.result).toMatchObject({
      status: 'broken',
      failedStep: 'typecheck',
      alsoFailed: ['build'],
      classification: 'module-fail',
    })
    expect(r.transition).toEqual({ from: null, to: 'broken', confirmed: true })
    expect(r.steps.find((s) => s.name === 'initialize')!.status).toBe('pass')
    expect(r.steps.find((s) => s.name === 'typecheck')!.file).toContain('ConsentsTable.tsx')
    expect(r.run).toMatchObject({ id: 100, attempt: 2, at: RETRY_AT })
    expect(receiptOf(res, LOC.durable)!.result.status).toBe('verified')
  })

  it('flaky: red on the first attempt, green on the retry = verified with the note flaky', () => {
    const res = apply(
      bundle(
        [outcome(base09), outcome(durable, { fail: { smoke: 'smoke: FAIL module api GET /api/x -> 500' } })],
        [outcome(durable, { attempt: 2 })],
      ),
    )
    const r = receiptOf(res, LOC.durable)!
    expect([r.result.status, r.transition.confirmed, r.notes]).toEqual(['verified', true, ['flaky']])
  })

  it('infra: one retry, then infra-error that keeps the previous state decisive', () => {
    const infra = { install: 'npm ERR! code E503\n' }
    const a1 = [outcome(base09), outcome(durable, { fail: infra })]
    expect(retryKeys(m.cells, a1, empty)).toEqual([durable.key])
    const prev = fx.receipts(LOC.durable)
    const history: History = (loc) => (loc === LOC.durable ? prev : [])
    const res = apply(bundle(a1, [outcome(durable, { attempt: 2, fail: infra })]), history)
    const r = receiptOf(res, LOC.durable)!
    expect([r.result.status, r.result.classification, r.transition.from, r.transition.confirmed]).toEqual([
      'infra-error',
      'infra',
      'verified',
      false,
    ])
    expect(decisiveReceipt([...prev, r], '0.9', '0.6.0')?.result.status).toBe('verified')
    // infra, then green on the retry: verified.
    const ok = apply(bundle(a1, [outcome(durable, { attempt: 2 })]), history)
    expect(receiptOf(ok, LOC.durable)!.result.status).toBe('verified')
    // A job that never ran counts as infra.
    expect(retryKeys(m.cells, [outcome(base09), outcome(durable, { missing: true })], empty)).toEqual([durable.key])
  })

  it('no retry for a cell already confirmed broken with the same key; the new receipt stays confirmed', () => {
    const red = { typecheck: CONSENTS_TS, build: CONSENTS_BUILD }
    const first = apply(
      bundle([outcome(base09), outcome(consents, { fail: red })], [outcome(consents, { attempt: 2, fail: red })]),
    )
    const confirmed = receiptOf(first, LOC.consents)!
    const history: History = (loc) => (loc === LOC.consents ? [confirmed] : [])
    const a1 = [outcome(base09), outcome(consents, { fail: red })]
    expect(retryKeys(m.cells, a1, history)).toEqual([])
    const res = apply(bundle(a1), history)
    // Same status, key and confirmation, younger than 7 days: retention writes nothing.
    expect(receiptOf(res, LOC.consents)).toBeUndefined()
  })

  it('an unconfirmed red when the retry is not collected', () => {
    const res = apply(bundle([outcome(base09), outcome(consents, { fail: { typecheck: CONSENTS_TS } })]))
    const r = receiptOf(res, LOC.consents)!
    expect([r.result.status, r.transition.confirmed]).toEqual(['broken', false])
  })

  it('a regression (confirmed verified -> broken with a green baseline) is a receipt-transition change', () => {
    const prev = fx.receipts(LOC.durable)
    const history: History = (loc) => (loc === LOC.durable ? prev : [])
    const red = { build: 'x.ts(1,1): error TS2304: Cannot find name y\nFailed to type check.\n' }
    const res = apply(
      bundle([outcome(base09), outcome(durable, { fail: red })], [outcome(durable, { attempt: 2, fail: red })]),
      history,
    )
    expect(res.changes).toEqual([
      {
        at: RETRY_AT,
        type: 'receipt-transition',
        locator: LOC.durable,
        line: '0.9',
        from: 'verified',
        to: 'broken',
        version: '0.6.0',
      },
    ])
  })

  it('a preview-docker receipt is never the previous state of a CI night (review round 2)', () => {
    // the empty-preset row of the fixture: the cell of this test is one of the empty preset (24 Oct)
    const ci = Receipt.parse({
      ...fx
        .receipts(LOC.durable)
        .filter((r) => r.om.preset !== 'classic')
        .at(-1)!,
      cellKey: durable.key,
    })
    const preview = Receipt.parse({
      ...ci,
      id: 'r_20261022_aaaaaaaaaaaa',
      cellKey: 'a'.repeat(64),
      harness: { ...ci.harness, runner: 'preview-docker' },
      result: { ...ci.result, status: 'broken', classification: 'module-fail', failedStep: 'build', alsoFailed: [] },
      transition: { from: 'verified', to: 'broken', confirmed: true },
      run: { ...ci.run, id: 99, at: '2026-10-22T02:17:00Z', url: 'file:///home/x/out/preview/99/' },
    })
    const history: History = (loc) => (loc === LOC.durable ? [ci, preview] : [])
    const red = { build: 'x.ts(1,1): error TS2304: Cannot find name y\nFailed to type check.\n' }
    // The CI night sees the CI receipt (verified) as prev: the confirmed red is a regression.
    const res = apply(
      bundle([outcome(base09), outcome(durable, { fail: red })], [outcome(durable, { attempt: 2, fail: red })]),
      history,
    )
    expect(receiptOf(res, LOC.durable)!.transition.from).toBe(ci.result.status)
    expect(res.changes.map((c) => c.type)).toEqual(['receipt-transition'])
    // A green CI night next to a broken preview receipt: from = the CI status, and retention sees no change.
    const green = apply(bundle([outcome(base09), outcome(durable)]), history)
    expect(green.receipts.find((r) => r.locator === LOC.durable)).toBeUndefined()
    // And the other way round: a preview night does not start from the CI receipt.
    const pv = apply({ ...bundle([outcome(base09), outcome(durable)]), runner: 'preview-docker' }, history)
    expect(receiptOf(pv, LOC.durable)!.transition.from).toBe('broken')
  })

  it('tampered files (changed scripts after add) are a confirmed module failure', () => {
    const t = { typecheck: '[harness] tampered-files: scripts \n' }
    const res = apply(
      bundle([outcome(base09), outcome(durable, { fail: t })], [outcome(durable, { attempt: 2, fail: t })]),
    )
    const r = receiptOf(res, LOC.durable)!
    expect([r.result.status, r.result.failedStep, r.steps.find((s) => s.name === 'typecheck')!.excerpt]).toEqual([
      'broken',
      'typecheck',
      '[harness] tampered-files: scripts',
    ])
  })

  it('in-preset note from the add step (D10) travels into the receipt', () => {
    const res = apply(bundle([outcome(base09), outcome(durable, { notes: ['in-preset'] })]))
    expect(receiptOf(res, LOC.durable)!.notes).toEqual(['in-preset'])
  })
})

describe('retention and quarantine', () => {
  const base09 = cell(null, '0.9')

  it('writes a line only on change or after 7 days', () => {
    const b1 = bundle([outcome(base09)])
    const first = receiptOf(apply(b1), null)!
    const history: History = (loc) => (loc === null ? [first] : [])
    expect(receiptOf(apply(b1, history), null)).toBeUndefined()
    const week = { ...b1, night: { ...b1.night, id: 101, at: '2026-10-30T02:17:00Z' } }
    week.attempts = [{ ...b1.attempts[0]!, run: { ...b1.attempts[0]!.run, id: 101, at: '2026-10-30T02:17:00Z' } }]
    expect(receiptOf(apply(week, history), null)?.run.at).toBe('2026-10-30T02:17:00Z')
  })

  it('a release in the age gate gets a quarantine receipt and keeps tier and install.cli (D46)', () => {
    // durable-work 0.7.0 published 21 Oct (until 26 Oct); 0.6.0 verified on 0.9 in the fixture.
    const sync = structuredClone(fx.sync(LOC.durable)!)
    sync.npm!.previousStable = '0.6.0'
    sync.npm!.latestStable = '0.7.0'
    sync.npm!.distTags = { latest: '0.7.0' }
    sync.npm!.publishedAt['0.7.0'] = '2026-10-21T10:00:00Z'
    const f6 = fx.facts(LOC.durable, '0.6.0')!
    const entries = m.cells.length // keep m untouched
    expect(entries).toBeGreaterThan(0)
    const gated = plan(fx, {
      runner: 'ubuntu-latest',
      entries: [...fx.descriptors.entries()].map(([locator, d]) => ({
        locator,
        d,
        sync: locator === LOC.durable ? sync : fx.sync(locator),
        facts: (v: string) =>
          locator === LOC.durable && v === '0.7.0'
            ? { ...f6, package: { ...f6.package, version: '0.7.0' } }
            : fx.facts(locator, v),
        receipts: fx.receipts(locator),
      })),
    })
    const res = apply(
      bundle(
        gated.cells.filter((c) => c.baseline).map((c) => outcome(c)),
        null,
        gated,
      ),
      (loc) => (loc ? fx.receipts(loc) : []),
    )
    const q = res.receipts.find((r) => r.locator === LOC.durable && r.receipt.result.status === 'quarantine')!.receipt
    expect([q.module?.version, q.result.quarantineUntil, q.om.line]).toEqual(['0.7.0', '2026-10-26', '0.9'])
    const receipts = [...fx.receipts(LOC.durable), q]
    const before = fixtureEntry(fx, LOC.durable, { sync, receipts: fx.receipts(LOC.durable) })
    const after = fixtureEntry(fx, LOC.durable, { sync, receipts })
    expect(after.tier).toBe(before.tier)
    expect(after.tier).toBe('verified')
    expect(after.install.cli).toBe(before.install.cli)
    expect(after.install.cli).toContain('@0.6.0')
    expect(
      recommendedVersions({
        lines: fx.lines.lines,
        receipts,
        npm: sync.npm!.name,
        publishedAt: sync.npm!.publishedAt,
        now: NIGHT,
      })['0.9'],
    ).toBe('0.6.0')
  })

  it('every written receipt validates (Receipt schema, ubuntu-latest runner)', () => {
    const res = apply(bundle(m.cells.map((c) => outcome(c))))
    for (const { receipt } of res.receipts) {
      expect(Receipt.safeParse(receipt).success).toBe(true)
      expect(receipt.harness.runner).toBe('ubuntu-latest')
    }
    expect(res.receipts.length).toBe(m.cells.length)
  })
})

describe('presets from src/modules.ts', () => {
  // src/modules.ts of `create-mercato-app@0.9.0 --preset empty` as scaffolded in the preview run of 23 Oct (0.8.0 is
  // the same file): enterprise modules are pushed in `if (enterpriseModulesEnabled)` blocks after the literal.
  const GOLDEN_09 = readFileSync(join(ROOT, 'test', 'receipts', 'golden', 'modules-0.9.0.ts.txt'), 'utf8')
  const ENTERPRISE = {
    npm: '@open-mercato/enterprise',
    moduleIds: ['record_locks', 'system_status_overlays', 'sso', 'security', 'agent_orchestrator'],
  }

  it('reads id/from pairs, skips comments', () => {
    const p = presetFromModulesTs(MODULES_TS_09)
    expect(p.length).toBe(12)
    expect(p.find((x) => x.id === 'events')).toEqual({ id: 'events', from: '@open-mercato/events' })
    expect(p.some((x) => x.id === 'example')).toBe(false)
  })

  it('golden 0.9.0 scaffold: only the enabledModules literal, no conditional enterprise modules', () => {
    expect(GOLDEN_09).toContain("{ id: 'record_locks', from: '@open-mercato/enterprise' }")
    const p = presetFromModulesTs(GOLDEN_09)
    expect(p.map((x) => x.id)).toEqual([
      'auth',
      'directory',
      'configs',
      'entities',
      'query_index',
      'api_docs',
      'audit_logs',
      'notifications',
      'dashboards',
      'events',
      'search',
      'attachments',
    ])
    expect(p.some((x) => x.from === '@open-mercato/enterprise')).toBe(false)
    // lib/core then keeps `yarn mercato module add` for enterprise, and `yarn add` for search (in the preset).
    expect(inPreset(ENTERPRISE, p)).toBe(false)
    expect(inPreset({ npm: '@open-mercato/search', moduleIds: ['search'] }, p)).toBe(true)
  })

  it('a collected night writes presets.json without the enterprise modules', () => {
    const base = m.cells.find((c) => c.baseline && c.line === '0.9')!
    const res = apply(bundle([outcome(base, { modulesTs: GOLDEN_09 })]))
    const empty09 = Presets.parse(res.presets)['0.9']!.empty!
    expect(empty09.some((x) => x.from === '@open-mercato/enterprise')).toBe(false)
    expect(empty09.length).toBe(12)
  })

  it('a night without a baseline cell still moves presets[*].at to its newest run (review round 2)', () => {
    const base = m.cells.find((c) => c.baseline && c.line === '0.9')!
    const first = apply(bundle([outcome(base, { modulesTs: GOLDEN_09 })]))
    const presets = { ...first.presets!, next: { ...first.presets!['0.9']!, at: '2026-10-20T03:05:00Z' } }
    const durable = cell(LOC.durable)
    const later = '2026-10-24T02:17:00Z'
    const b = bundle([outcome(durable)])
    b.night = { ...b.night, id: 300, at: later }
    b.attempts = [{ ...b.attempts[0]!, run: { ...b.attempts[0]!.run, id: 300, at: later } }]
    const res = applyNight({ bundle: b, history: empty, harness: harness(), presets })
    expect(Object.values(res.presets!).map((x) => x.at)).toEqual([later, later])
    expect(res.presets!['0.9']!.empty).toEqual(first.presets!['0.9']!.empty)
    // With a retry the newest run of the night counts.
    const r = applyNight({
      bundle: bundle([outcome(durable)], [outcome(durable, { attempt: 2 })]),
      history: empty,
      harness: harness(),
      presets,
    })
    expect(r.presets!['0.9']!.at).toBe(RETRY_AT)
  })

  it('steps.sh (add step, PRESET_JS) reads the same entries as presetFromModulesTs', () => {
    const steps = readFileSync(join(ROOT, 'harness', 'steps.sh'), 'utf8')
    const js = /\nPRESET_JS='([^']*)'\n/.exec(steps)?.[1]
    expect(js).toBeTruthy()
    const dir = tmp('preset')
    const cases = [GOLDEN_09, MODULES_TS_09]
    for (const [i, text] of cases.entries()) {
      const file = join(dir, `modules-${i}.ts`)
      writeFileSync(file, text)
      const out = execFileSync(process.execPath, ['-e', js as string, file], { encoding: 'utf8' })
      const fromShell = out
        .trim()
        .split('\n')
        .map((l) => {
          const [id, from] = l.split(' ')
          return { id: id as string, from: from as string }
        })
      expect(fromShell).toEqual(presetFromModulesTs(text))
    }
  })
})
