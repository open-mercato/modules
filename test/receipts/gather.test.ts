// collect: run checks, outcomes from Actions-shaped jobs and artifacts, the retry loop with a fake API, preview runs,
// and the command end to end on a temporary data checkout (spec 5.3 steps 1-6, 12.2 WP07).
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Receipt } from '../../lib/schema/data/index.ts'
import collect, { applyBundle } from '../../lib/commands/collect.ts'
import {
  readPresets,
  readProvisional,
  readReceiptStore,
  removeNight,
  writePresets,
  writeProvisional,
} from '../../lib/receipts/data.ts'
import type { ActionsApi } from '../../lib/receipts/actions-api.ts'
import { buildOutcomes, checkNightlyRun, runTitle, type ApiJob, type ApiRun } from '../../lib/receipts/from-actions.ts'
import {
  gatherFromActions,
  gatherFromLocal,
  RETRY_WAIT_MAX_MS,
  RETRY_WAIT_MS,
  retryMinutes,
  retryPlan,
} from '../../lib/receipts/gather.ts'
import {
  cellArtifactName,
  cellJobName,
  matrixArtifactName,
  type Matrix,
  type MatrixCell,
} from '../../lib/receipts/matrix.ts'
import { CONSENTS_BUILD, CONSENTS_TS, loadFixture, LOC, MODULES_TS_09, NIGHT, plan, ROOT, tmp } from './helpers.ts'

const fx = loadFixture()
const m = plan(fx, { runner: 'ubuntu-latest' })
const only = (keys: string[]): Matrix => ({ ...m, cells: m.cells.filter((c) => keys.includes(c.key)) })
const base09 = m.cells.find((c) => c.baseline && c.line === '0.9')!
const consents = m.cells.find((c) => c.locator === LOC.consents && c.line === '0.9')!
const ksef = m.cells.find((c) => c.locator === LOC.ksef && c.line === '0.9')!
const LADDER = ['scaffold', 'install', 'add', 'generate', 'typecheck', 'initialize', 'build', 'start', 'smoke']

function run(id: number, o: Partial<ApiRun> = {}): ApiRun {
  return {
    id,
    path: '.github/workflows/nightly.yml',
    head_branch: 'main',
    event: 'schedule',
    status: 'completed',
    conclusion: 'failure',
    html_url: `https://github.com/wojciechszyjka/modules/actions/runs/${id}`,
    created_at: NIGHT,
    run_started_at: NIGHT,
    display_title: 'nightly a1',
    head_repository: { full_name: 'wojciechszyjka/modules' },
    repository: { full_name: 'wojciechszyjka/modules' },
    ...o,
  }
}

/** API job for a cell; `fail` names the failing ladder steps (initialize still runs after a red typecheck). */
function job(cell: MatrixCell, fail: string[] = [], attempt = 1): ApiJob {
  let broken = false
  const steps = [
    { name: 'Set up job', status: 'completed', conclusion: 'success' },
    { name: 'prepare', status: 'completed', conclusion: 'success' },
    ...LADDER.map((name) => {
      let conclusion =
        broken && !(name === 'initialize' || (name === 'build' && fail.includes('build'))) ? 'skipped' : 'success'
      if (name === 'add' && cell.baseline) conclusion = 'skipped'
      if (fail.includes(name)) {
        conclusion = 'failure'
        broken = true
      }
      return {
        name,
        status: 'completed',
        conclusion,
        started_at: '2026-10-23T02:20:00Z',
        completed_at: '2026-10-23T02:21:10Z',
      }
    }),
    { name: 'pack', status: 'completed', conclusion: 'success' },
  ]
  return {
    id: 1,
    name: cellJobName(cell),
    status: 'completed',
    conclusion: fail.length ? 'failure' : 'success',
    run_attempt: 1,
    started_at: '2026-10-23T02:18:00Z',
    completed_at: '2026-10-23T02:25:00Z',
    html_url: `https://github.com/wojciechszyjka/modules/actions/runs/1/job/${cell.key12}-${attempt}`,
    steps,
  }
}

function artifacts(dir: string, matrix: Matrix, attempt: number, logs: Record<string, Record<string, string>> = {}) {
  mkdirSync(join(dir, matrixArtifactName(attempt)), { recursive: true })
  writeFileSync(join(dir, matrixArtifactName(attempt), 'matrix.json'), JSON.stringify({ ...matrix, attempt }))
  for (const c of matrix.cells) {
    const d = join(dir, cellArtifactName(c, attempt))
    mkdirSync(d, { recursive: true })
    writeFileSync(
      join(d, 'app-meta.json'),
      JSON.stringify({ packageManager: 'yarn@4.17.1', modulesTs: MODULES_TS_09, yarn: '4.17.1' }),
    )
    writeFileSync(join(d, 'patches.json'), JSON.stringify(c.patches))
    writeFileSync(join(d, 'notes.json'), '[]')
    for (const [step, text] of Object.entries(logs[c.key] ?? {})) writeFileSync(join(d, `${step}.log`), text)
  }
}

const RED = { typecheck: CONSENTS_TS, build: CONSENTS_BUILD }

describe('run checks', () => {
  it('collects only nightly.yml on main of this repository from schedule or dispatch', () => {
    expect(checkNightlyRun(run(1)).ok).toBe(true)
    expect(checkNightlyRun(run(1, { head_branch: 'feature' }))).toMatchObject({ ok: false })
    expect(checkNightlyRun(run(1, { event: 'pull_request' }))).toMatchObject({ ok: false })
    // a scheduled night the private-repository guard skipped: nothing to collect, no red collect run
    expect(checkNightlyRun(run(1, { conclusion: 'skipped' }))).toMatchObject({ ok: false, reason: 'run 1 was skipped' })
    expect(checkNightlyRun(run(1, { path: '.github/workflows/spike.yml' }))).toMatchObject({ ok: false })
    expect(checkNightlyRun(run(1, { head_repository: { full_name: 'evil/modules' } }))).toMatchObject({ ok: false })
    expect(checkNightlyRun(run(2, { display_title: runTitle(2, 1) }))).toEqual({ ok: true, attempt: 2, parent: 1 })
  })
})

describe('outcomes from the API', () => {
  it('maps steps by name and reads the excerpt from the artifact; status never comes from the artifact', () => {
    const dir = tmp('out')
    const mm = only([base09.key, consents.key])
    artifacts(dir, mm, 1, { [consents.key]: { ...RED, typecheck: RED.typecheck } })
    // The artifact claims success in its own job.json; only the API jobs count.
    writeFileSync(join(dir, cellArtifactName(consents, 1), 'job.json'), '{"conclusion":"success"}')
    const out = buildOutcomes(mm, {
      jobs: [job(base09), job(consents, ['typecheck', 'build'])],
      artifactsDir: dir,
      attempt: 1,
      runUrl: 'https://x.test/run',
    })
    const c = out.find((o) => o.key === consents.key)!
    expect(c.ladder.typecheck.conclusion).toBe('failure')
    expect(c.ladder.initialize.conclusion).toBe('success')
    expect(c.ladder.build.conclusion).toBe('failure')
    expect(c.ladder.typecheck.sec).toBe(70)
    expect(c.failures.map((f) => [f.step, f.classification])).toEqual([
      ['typecheck', 'module-fail'],
      ['build', 'module-fail'],
    ])
    expect(out.find((o) => o.key === base09.key)!.modulesTs).toContain("id: 'search'")
  })

  it('a step is cell-oom only when the job counts oom_kills, never from a marker line in the log (finding of 25 Oct)', () => {
    const forged = `${CONSENTS_TS}[harness] cell out of memory: the 8g limit of the preview runner killed 1 process(es)\n`
    const at = (oomKills: number | undefined) => {
      const dir = tmp('out')
      const mm = only([consents.key])
      artifacts(dir, mm, 1, { [consents.key]: { typecheck: forged } })
      const j = job(consents, ['typecheck'])
      if (oomKills !== undefined)
        j.steps = j.steps?.map((s) => (s.name === 'typecheck' ? { ...s, oom_kills: oomKills } : s))
      const out = buildOutcomes(mm, { jobs: [j], artifactsDir: dir, attempt: 1, runUrl: 'https://x.test/run' })
      return out[0]!.failures.map((f) => [f.step, f.classification, f.rule])
    }
    expect(at(undefined)).toEqual([['typecheck', 'module-fail', 'ts-error']])
    expect(at(0)).toEqual([['typecheck', 'module-fail', 'ts-error']])
    expect(at(1)).toEqual([['typecheck', 'infra', 'cell-oom']])
  })

  it('a cell without a job is an outcome with jobFound false', () => {
    const dir = tmp('out')
    const out = buildOutcomes(only([ksef.key]), {
      jobs: [],
      artifactsDir: dir,
      attempt: 1,
      runUrl: 'https://x.test/run',
    })
    expect(out[0]!.jobFound).toBe(false)
  })
})

function fakeApi(o: {
  runs: ApiRun[]
  jobs: Record<number, ApiJob[]>
  files: Record<number, (dir: string) => void>
  onDispatch?: () => void
}) {
  const dispatched: Record<string, string>[] = []
  let clock = 0
  const api: ActionsApi = {
    getRun: async (id) => {
      const r = o.runs.find((x) => x.id === id)
      if (!r) throw new Error(`no run ${id}`)
      return r
    },
    listJobs: async (id) => o.jobs[id] ?? [],
    downloadArtifacts: async (id, dir) => o.files[id]?.(dir),
    dispatch: async (_w, _r, inputs) => {
      dispatched.push(inputs)
      o.onDispatch?.()
    },
    listWorkflowRuns: async () => o.runs.filter((r) => r.display_title?.startsWith('nightly a2')),
  }
  return { api, dispatched, now: () => clock, sleep: async (ms: number) => void (clock += ms) }
}

describe('gather with a fake Actions API', () => {
  const mm = only([base09.key, consents.key, ksef.key])
  const nightFiles = (dir: string) => artifacts(dir, mm, 1, { [consents.key]: RED })
  const nightJobs = [job(base09), job(consents, ['typecheck', 'build']), job(ksef)]

  it('dispatches one retry for the unconfirmed red cell, waits for it and collects it in the same job', async () => {
    const retry = run(200, { event: 'workflow_dispatch', display_title: runTitle(2, 100), status: 'in_progress' })
    const runs = [run(100)]
    const f = fakeApi({
      runs,
      jobs: { 100: nightJobs, 200: [job(consents, ['typecheck', 'build'], 2)] },
      files: { 100: nightFiles, 200: (dir) => artifacts(dir, only([consents.key]), 2, { [consents.key]: RED }) },
      onDispatch: () => runs.push(retry),
    })
    let polls = 0
    const api = {
      ...f.api,
      getRun: async (id: number) => (id === 200 && ++polls > 2 ? { ...retry, status: 'completed' } : f.api.getRun(id)),
    }
    const res = await gatherFromActions(100, {
      api,
      history: () => [],
      allReceipts: [],
      artifactsRoot: tmp('art'),
      waitRetry: true,
      now: f.now,
      sleep: f.sleep,
    })
    expect(res.kind).toBe('bundle')
    if (res.kind !== 'bundle') return
    expect(f.dispatched).toEqual([{ cells: consents.key, attempt: '2', parent: '100' }])
    expect(res.bundle.attempts.map((a) => a.attempt)).toEqual([1, 2])
    expect(res.bundle.retry).toEqual([consents.key])
  })

  it('does not dispatch again when the retry run exists, and gives up after 40 minutes', async () => {
    const stuck = run(200, { event: 'workflow_dispatch', display_title: runTitle(2, 100), status: 'queued' })
    const f = fakeApi({ runs: [run(100), stuck], jobs: { 100: nightJobs }, files: { 100: nightFiles } })
    const res = await gatherFromActions(100, {
      api: f.api,
      history: () => [],
      allReceipts: [],
      artifactsRoot: tmp('art'),
      waitRetry: true,
      now: f.now,
      sleep: f.sleep,
    })
    expect(f.dispatched).toEqual([])
    expect(f.now()).toBeGreaterThanOrEqual(RETRY_WAIT_MS)
    if (res.kind === 'bundle') {
      expect(res.bundle.attempts.length).toBe(1)
      expect(res.bundle.notes[0]).toContain('not collected')
    } else throw new Error('expected a bundle')
  })

  it('waits as long as a retry larger than one wave takes, within the collect job (audit C18)', async () => {
    const many = (n: number, preset: 'classic' | 'empty', tag = preset): MatrixCell[] =>
      Array.from({ length: n }, (_, i) => ({ ...consents, key: `${tag}-${i}`, preset, baseline: false }))
    // the retry's plan, then waves of 6 cells: 20 min per classic wave, 7.5 per empty wave
    expect(retryMinutes(many(1, 'empty'))).toBe(17.5)
    expect(retryMinutes(many(7, 'classic'))).toBe(50)
    expect(retryMinutes([...many(6, 'classic'), ...many(1, 'empty')])).toBe(37.5)
    const small = retryPlan(many(2, 'empty'), [], ['empty-0', 'empty-1'])
    expect(small).toEqual({ keys: ['empty-0', 'empty-1'], left: [], waitMs: RETRY_WAIT_MS })
    const seven = retryPlan(
      many(7, 'classic'),
      [],
      many(7, 'classic').map((c) => c.key),
    )
    // 50 minutes of estimate plus the margin
    expect(seven.waitMs).toBe(60 * 60 * 1000)

    // more than fits: the baseline first, then infra, then the rest, in the order of the keys
    const cells = [...many(40, 'classic'), { ...base09, key: 'base', preset: 'classic' as const }]
    const keys = cells.map((c) => c.key)
    const infra = buildOutcomes(
      { ...m, cells: cells.filter((c) => c.key.endsWith('9')) },
      { jobs: [], artifactsDir: tmp('none'), attempt: 1, runUrl: 'https://x.test/run' },
    )
    const big = retryPlan(cells, infra, keys)
    expect(big.waitMs).toBeLessThanOrEqual(RETRY_WAIT_MAX_MS)
    expect(big.keys).toHaveLength(30)
    expect(big.keys).toContain('base')
    for (const k of ['classic-9', 'classic-19', 'classic-29', 'classic-39']) expect(big.keys).toContain(k)
    expect(big.left).toHaveLength(11)
    expect([...big.keys, ...big.left].sort()).toEqual([...keys].sort())
    expect(big.keys).toEqual(keys.filter((k) => big.keys.includes(k)))
  })

  it('names the cells a retry leaves out in the notes and dispatches only the rest (audit C18)', async () => {
    const hex = (i: number) => (i + 1).toString(16).padStart(64, 'a')
    const reds = Array.from({ length: 31 }, (_, i) => ({
      ...consents,
      key: hex(i),
      key12: hex(i).slice(-12),
      preset: 'classic' as const,
    }))
    const big: Matrix = { ...m, cells: [base09, ...reds] }
    const f = fakeApi({
      runs: [run(100)],
      jobs: { 100: [job(base09)] },
      files: { 100: (dir) => artifacts(dir, big, 1, {}) },
    })
    const res = await gatherFromActions(100, {
      api: f.api,
      history: () => [],
      allReceipts: [],
      artifactsRoot: tmp('art'),
      waitRetry: true,
      now: f.now,
      sleep: f.sleep,
    })
    if (res.kind !== 'bundle') throw new Error('expected a bundle')
    expect(f.dispatched[0]?.cells?.split(',')).toHaveLength(30)
    expect(res.bundle.retry).toHaveLength(30)
    expect(res.bundle.notes[0]).toBe(
      `retry left out 1 cell(s) that do not fit the wait: ${consents.label}; those cells stay unconfirmed`,
    )
    expect(f.now()).toBeGreaterThanOrEqual(110 * 60 * 1000)
  })

  it('ignores runs outside main and ends without changes for a night already in the receipts', async () => {
    const f = fakeApi({ runs: [run(100, { head_branch: 'feature' })], jobs: {}, files: {} })
    expect(
      (
        await gatherFromActions(100, {
          api: f.api,
          history: () => [],
          allReceipts: [],
          artifactsRoot: tmp('a'),
          waitRetry: false,
        })
      ).kind,
    ).toBe('ignored')
    const g = fakeApi({ runs: [run(100)], jobs: { 100: nightJobs }, files: { 100: nightFiles } })
    const done = Receipt.parse({ ...fx.receipts(LOC.ksef)[0]!, run: { ...fx.receipts(LOC.ksef)[0]!.run, id: 100 } })
    expect(
      (
        await gatherFromActions(100, {
          api: g.api,
          history: () => [],
          allReceipts: [done],
          artifactsRoot: tmp('a'),
          waitRetry: true,
        })
      ).kind,
    ).toBe('collected')
    // The retry run of a collected night is collected too.
    const h = fakeApi({
      runs: [run(100), run(200, { event: 'workflow_dispatch', display_title: runTitle(2, 100) })],
      jobs: {},
      files: {},
    })
    expect(
      (
        await gatherFromActions(200, {
          api: h.api,
          history: () => [],
          allReceipts: [done],
          artifactsRoot: tmp('a'),
          waitRetry: true,
        })
      ).kind,
    ).toBe('collected')
  })
})

describe('a retry that ends after collect stopped waiting (audit R5)', () => {
  const mm = only([base09.key, consents.key, ksef.key])
  const nightFiles = (dir: string) => artifacts(dir, mm, 1, { [consents.key]: RED })
  const redJobs = [job(base09), job(consents, ['typecheck', 'build']), job(ksef)]
  const EARLIER = '2026-10-22T02:17:00Z'
  const retryRun = (status: string) =>
    run(200, { event: 'workflow_dispatch', display_title: runTitle(2, 100), status, conclusion: 'success' })
  const consentsFile = (data: string) => join(data, 'receipts', '@piotrkarwatka', 'marketing-consents.jsonl')
  const nightReceipts = (data: string) =>
    readFileSync(consentsFile(data), 'utf8')
      .trim()
      .split('\n')
      .map((l) => Receipt.parse(JSON.parse(l)))
      .filter((r) => r.run.id === 100)
  const changes = (data: string) => {
    const f = join(data, 'changes', '2026-10.jsonl')
    return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean) : []
  }
  const gatherOn = (data: string, id: number, f: ReturnType<typeof fakeApi>) => {
    const store = readReceiptStore(data)
    return gatherFromActions(id, {
      api: f.api,
      history: store.history,
      allReceipts: store.all,
      provisional: readProvisional(data),
      artifactsRoot: tmp('art'),
      waitRetry: true,
      now: f.now,
      sleep: f.sleep,
    })
  }

  /** Night 99 verifies every cell; night 100 turns consents red and its retry outlasts the wait. */
  async function provisionalNight(): Promise<string> {
    const data = tmp('late')
    const early = run(99, { created_at: EARLIER, run_started_at: EARLIER, conclusion: 'success' })
    const g99 = fakeApi({
      runs: [early],
      jobs: { 99: [job(base09), job(consents), job(ksef)] },
      files: { 99: (dir) => artifacts(dir, mm, 1) },
    })
    const n99 = await gatherOn(data, 99, g99)
    if (n99.kind !== 'bundle') throw new Error('expected a bundle')
    applyBundle(ROOT, data, n99.bundle)

    const g100 = fakeApi({
      runs: [run(100), retryRun('queued')],
      jobs: { 100: redJobs },
      files: { 100: nightFiles },
    })
    const n100 = await gatherOn(data, 100, g100)
    if (n100.kind !== 'bundle') throw new Error('expected a bundle')
    expect(n100.bundle.attempts).toHaveLength(1)
    expect(n100.bundle.retry).toEqual([consents.key])
    const report = applyBundle(ROOT, data, n100.bundle)
    expect(report.join('\n')).toContain('provisional')
    expect(readProvisional(data).map((p) => [p.night, p.retry])).toEqual([[100, [consents.key]]])
    const [r] = nightReceipts(data)
    expect([r?.result.status, r?.transition.confirmed, r?.run.attempt]).toEqual(['broken', false, 1])
    expect(changes(data)).toEqual([])
    return data
  }

  const lateRetry = (fail: string[]) =>
    fakeApi({
      runs: [run(100), retryRun('completed')],
      jobs: { 100: redJobs, 200: [job(consents, fail, 2)] },
      files: {
        100: nightFiles,
        200: (dir) => artifacts(dir, only([consents.key]), 2, fail.length ? { [consents.key]: RED } : {}),
      },
    })

  it('the completed retry is merged into the night once and confirms the regression', async () => {
    const data = await provisionalNight()
    const late = await gatherOn(data, 200, lateRetry(['typecheck', 'build']))
    if (late.kind !== 'bundle') throw new Error(`expected a bundle, got ${late.kind}`)
    expect(late.bundle.attempts.map((a) => a.attempt)).toEqual([1, 2])
    applyBundle(ROOT, data, late.bundle)
    const rs = nightReceipts(data)
    expect(rs.map((r) => [r.result.status, r.transition.from, r.transition.confirmed, r.run.attempt])).toEqual([
      ['broken', 'verified', true, 2],
    ])
    expect(changes(data).map((c) => JSON.parse(c) as { type: string; locator: string })).toMatchObject([
      { type: 'receipt-transition', locator: LOC.consents, from: 'verified', to: 'broken' },
    ])
    expect(readProvisional(data)).toEqual([])

    // a replay of the same bundle (data-branch retry) and a third collect change nothing
    const before = [readFileSync(consentsFile(data), 'utf8'), changes(data)]
    expect(applyBundle(ROOT, data, late.bundle)[0]).toContain('already in the receipts')
    expect((await gatherOn(data, 200, lateRetry(['typecheck', 'build']))).kind).toBe('collected')
    expect([readFileSync(consentsFile(data), 'utf8'), changes(data)]).toEqual(before)
  })

  const LATER = '2026-10-24T02:17:00Z'
  /** Night 101, completed and newer than night 100, measures `omVersion` on line 0.9. */
  async function newerNight(data: string, omVersion: string): Promise<void> {
    const newer: Matrix = { ...mm, cells: mm.cells.map((c) => (c.line === '0.9' ? { ...c, omVersion } : c)) }
    const g101 = fakeApi({
      runs: [run(101, { created_at: LATER, run_started_at: LATER, conclusion: 'success' })],
      jobs: { 101: [job(base09), job(consents), job(ksef)] },
      files: { 101: (dir) => artifacts(dir, newer, 1) },
    })
    const n101 = await gatherOn(data, 101, g101)
    if (n101.kind !== 'bundle') throw new Error('expected a bundle')
    applyBundle(ROOT, data, n101.bundle)
    expect(readPresets(data)?.['0.9']).toMatchObject({ omVersion, measuredAt: LATER, at: LATER })
  }
  /**
   * Night 100's retry lands only now. The bundle is applied twice: the second time with night 100 still listed as
   * provisional, as after a collect that wrote presets.json and stopped before _provisional.json, so applyNight runs
   * again on the entry the first apply wrote (a plain second apply ends at "already in the receipts").
   */
  async function lateRetryTwice(data: string) {
    const late = await gatherOn(data, 200, lateRetry(['typecheck', 'build']))
    if (late.kind !== 'bundle') throw new Error(`expected a bundle, got ${late.kind}`)
    const pending = readProvisional(data)
    applyBundle(ROOT, data, late.bundle)
    const once = readFileSync(join(data, 'presets.json'), 'utf8')
    writeProvisional(data, pending)
    expect(applyBundle(ROOT, data, late.bundle).join('\n')).toContain(
      'its late retry replaces the provisional receipts',
    )
    expect(readFileSync(join(data, 'presets.json'), 'utf8')).toBe(once)
    return readPresets(data)?.['0.9']
  }

  it('a provisional night records when it measured the preset entry (review round 4)', async () => {
    const data = await provisionalNight()
    expect(readPresets(data)?.['0.9']?.measuredAt).toBe(NIGHT)
  })

  it('a late retry never replaces the preset entry a newer night measured (review round 3)', async () => {
    const data = await provisionalNight()
    await newerNight(data, '0.9.1')
    const afterB = readPresets(data)?.['0.9']
    expect(await lateRetryTwice(data)).toEqual(afterB)
    expect(nightReceipts(data).map((r) => [r.result.status, r.transition.confirmed, r.run.attempt])).toEqual([
      ['broken', true, 2],
    ])
    expect(readProvisional(data)).toEqual([])
  })

  it('a late retry never replaces the entry a newer night measured after a tag rollback (review round 4)', async () => {
    const data = await provisionalNight()
    // night 101 measures an older version than night 100 did: the line's tag was rolled back (lib/sources/lines.ts)
    await newerNight(data, '0.9.0-rc.2')
    const afterB = readPresets(data)?.['0.9']
    expect(await lateRetryTwice(data)).toEqual(afterB)
  })

  it('an entry without measuredAt keeps the old rule: a later night with a newer version stays (review round 4)', async () => {
    const data = await provisionalNight()
    await newerNight(data, '0.9.1')
    const { measuredAt: _, ...legacy } = readPresets(data)!['0.9']!
    writePresets(data, { ...readPresets(data), '0.9': legacy })
    expect(await lateRetryTwice(data)).toEqual(legacy)
  })

  it('a late retry still writes its measurement over an older version a newer night only stamped (review of round 3)', async () => {
    const data = await provisionalNight()
    // a later night that ran no baseline on 0.9 only moves `at`; the entry it leaves is of an older version
    const own = readPresets(data)!['0.9']!
    expect(own.omVersion).toBe(base09.omVersion)
    writePresets(data, { ...readPresets(data), '0.9': { ...own, omVersion: '0.9.0-rc.1', at: LATER } })

    const entry = await lateRetryTwice(data)
    expect(entry?.omVersion).toBe(base09.omVersion)
    expect(entry?.[base09.preset]).toEqual(own[base09.preset])
    expect(entry?.measuredAt).toBe(NIGHT)
    expect(entry?.at).toBe(LATER)
  })

  it('a late retry writes its measurement over an entry measured earlier that a newer night only stamped (review round 4)', async () => {
    const data = await provisionalNight()
    // the entry was measured by night 99 (another version, another list), and a later night without a baseline on 0.9
    // stamped `at`; the same version and preset would have stopped the old rule
    const own = readPresets(data)!['0.9']!
    const stale = [{ id: 'auth', from: '@open-mercato/core' }]
    writePresets(data, {
      ...readPresets(data),
      '0.9': { omVersion: base09.omVersion, [base09.preset]: stale, measuredAt: EARLIER, at: LATER },
    })

    const entry = await lateRetryTwice(data)
    expect(entry).toEqual({ ...own, at: LATER })
  })

  it('a late retry fills the preset list a newer night of the same version left out, keeping its measuredAt (review round 4)', async () => {
    const data = await provisionalNight()
    // night 101 measured the same version but only the other preset; this preset's list of night 100 is the only one
    const own = readPresets(data)!['0.9']!
    const other = base09.preset === 'classic' ? 'empty' : 'classic'
    const theirs = [{ id: 'auth', from: '@open-mercato/core' }]
    writePresets(data, {
      ...readPresets(data),
      '0.9': { omVersion: base09.omVersion, [other]: theirs, measuredAt: LATER, at: LATER },
    })

    const entry = await lateRetryTwice(data)
    expect(entry).toEqual({
      omVersion: base09.omVersion,
      [other]: theirs,
      [base09.preset]: own[base09.preset],
      measuredAt: LATER,
      at: LATER,
    })
  })

  it('filling a list into an entry without measuredAt that a newer night stamped keeps that night as its measurement (review round 4)', async () => {
    const data = await provisionalNight()
    // an entry written before measuredAt, of the same version, with only the other preset and a newer `at`: dating it
    // by night 100 would let a replay of night 100 with both baselines overwrite the newer list
    const own = readPresets(data)!['0.9']!
    const other = base09.preset === 'classic' ? 'empty' : 'classic'
    const theirs = [{ id: 'auth', from: '@open-mercato/core' }]
    writePresets(data, { ...readPresets(data), '0.9': { omVersion: base09.omVersion, [other]: theirs, at: LATER } })

    const entry = await lateRetryTwice(data)
    expect(entry).toEqual({
      omVersion: base09.omVersion,
      [other]: theirs,
      [base09.preset]: own[base09.preset],
      measuredAt: LATER,
      at: LATER,
    })
  })

  it('a late retry that passes records the recovery: verified, flaky, no regression', async () => {
    const data = await provisionalNight()
    const late = await gatherOn(data, 200, lateRetry([]))
    if (late.kind !== 'bundle') throw new Error(`expected a bundle, got ${late.kind}`)
    applyBundle(ROOT, data, late.bundle)
    const rs = nightReceipts(data)
    expect(rs.map((r) => [r.result.status, r.transition.confirmed, r.run.attempt, r.notes])).toEqual([
      ['verified', true, 2, ['flaky']],
    ])
    expect(changes(data)).toEqual([])
    expect(readProvisional(data)).toEqual([])
  })

  it('taking a night back removes its receipts and only the change lines it added', () => {
    const data = tmp('take-back')
    const change = {
      at: NIGHT,
      type: 'receipt-transition' as const,
      locator: LOC.ksef,
      line: '0.9',
      from: 'verified',
      to: 'broken',
    }
    const rc = fx.receipts(LOC.ksef)[0]!
    mkdirSync(join(data, 'changes'), { recursive: true })
    mkdirSync(join(data, 'receipts', '@x'), { recursive: true })
    writeFileSync(join(data, 'changes', '2026-10.jsonl'), `${JSON.stringify(change)}\n${JSON.stringify(change)}\n`)
    writeFileSync(
      join(data, 'receipts', '@x', 'y.jsonl'),
      [rc, { ...rc, run: { ...rc.run, id: 100 } }].map((r) => `${JSON.stringify(r)}\n`).join(''),
    )
    removeNight(data, 100, [change])
    expect(readFileSync(join(data, 'changes', '2026-10.jsonl'), 'utf8')).toBe(`${JSON.stringify(change)}\n`)
    expect(readFileSync(join(data, 'receipts', '@x', 'y.jsonl'), 'utf8')).toBe(`${JSON.stringify(rc)}\n`)
  })

  it('a provisional night whose retry is still running stays as it is', async () => {
    const data = await provisionalNight()
    const before = readFileSync(consentsFile(data), 'utf8')
    const f = fakeApi({ runs: [run(100), retryRun('in_progress')], jobs: { 100: redJobs }, files: { 100: nightFiles } })
    expect((await gatherOn(data, 100, f)).kind).toBe('collected')
    expect(f.dispatched).toEqual([])
    expect(readFileSync(consentsFile(data), 'utf8')).toBe(before)
    expect(readProvisional(data)).toHaveLength(1)
  })
})

/** A preview run directory as cells-local writes it. */
function previewRun(
  root: string,
  id: number,
  attempt: number,
  parent: number | null,
  mm: Matrix,
  fail: Record<string, string[]>,
  logs: Record<string, Record<string, string>> = {},
): string {
  const dir = join(root, String(id))
  artifacts(join(dir, 'artifacts'), { ...mm, runner: 'preview-docker' }, attempt, logs)
  const jobs = mm.cells.map((c) => ({
    ...job(c, fail[c.key] ?? [], attempt),
    html_url: `file://${join(dir, 'artifacts', cellArtifactName(c, attempt))}/`,
  }))
  writeFileSync(join(dir, 'jobs.json'), JSON.stringify({ total_count: jobs.length, jobs }))
  writeFileSync(
    join(dir, 'run.json'),
    JSON.stringify(
      run(id, {
        event: 'workflow_dispatch',
        display_title: runTitle(attempt, parent),
        html_url: `file://${dir}/`,
        runner: 'preview-docker',
      } as Partial<ApiRun>),
    ),
  )
  return dir
}

describe('preview runs (cells-local shape) and the collect command', () => {
  // collect refuses preview-docker nights on GitHub Actions (lib/commands/collect.ts), and the `checks` job runs this
  // suite there, so every case states the variable it depends on (finding of 25 Oct: red `checks` on every PR).
  beforeEach(() => {
    vi.stubEnv('GITHUB_ACTIONS', '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('collect --local refuses a preview-docker night on GitHub Actions and writes nothing', async () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true')
    const root = tmp('preview-ci')
    const data = join(root, 'data')
    cpSync(join(ROOT, 'test', 'fixtures', 'data', 'lines.json'), join(data, 'lines.json'))
    const night = previewRun(root, 1000, 1, null, only([base09.key, consents.key]), {}, {})
    const rc = await collect({
      args: ['--local', night],
      flags: { data, out: join(root, 'out'), offline: true, json: false },
      root: ROOT,
    })
    expect(rc).toBe(2)
    expect(existsSync(join(data, 'receipts'))).toBe(false)
  })

  it('collect --local writes preview-docker receipts, a retry run confirms, a second collect changes nothing', async () => {
    const root = tmp('preview')
    const data = join(root, 'data')
    cpSync(join(ROOT, 'test', 'fixtures', 'data', 'lines.json'), join(data, 'lines.json'))
    const mm = only([base09.key, consents.key, ksef.key])
    const night = previewRun(
      root,
      1000,
      1,
      null,
      mm,
      { [consents.key]: ['typecheck', 'build'] },
      { [consents.key]: RED },
    )
    const first = gatherFromLocal([night], { history: () => [], allReceipts: [] })
    expect(first.kind === 'bundle' && first.bundle.retry).toEqual([consents.key])
    const retry = previewRun(
      root,
      1001,
      2,
      1000,
      only([consents.key]),
      { [consents.key]: ['typecheck', 'build'] },
      { [consents.key]: RED },
    )
    const ctx = (args: string[]) => ({
      args,
      flags: { data, out: join(root, 'out'), offline: true, json: false },
      root: ROOT,
    })
    expect(await collect(ctx(['--local', night, '--local', retry]))).toBe(0)
    const lines = readFileSync(join(data, 'receipts', '@piotrkarwatka', 'marketing-consents.jsonl'), 'utf8')
      .trim()
      .split('\n')
    const r = Receipt.parse(JSON.parse(lines[0]!))
    expect([r.result.status, r.transition.confirmed, r.harness.runner, r.run.id, r.run.attempt]).toEqual([
      'broken',
      true,
      'preview-docker',
      1000,
      2,
    ])
    expect(r.run.url.startsWith('file://')).toBe(true)
    expect(existsSync(join(data, 'receipts', '_baseline.jsonl'))).toBe(true)
    expect(existsSync(join(data, 'presets.json'))).toBe(true)
    // Second collect of the same night: no changes.
    const before = readFileSync(join(data, 'receipts', '@piotrkarwatka', 'marketing-consents.jsonl'), 'utf8')
    expect(await collect(ctx(['--local', night]))).toBe(0)
    expect(readFileSync(join(data, 'receipts', '@piotrkarwatka', 'marketing-consents.jsonl'), 'utf8')).toBe(before)
    // Replaying the bundle (data-branch retry) on the written tree is a no-op as well.
    expect(await collect(ctx(['--bundle', join(root, 'out', 'night.json')]))).toBe(0)
    expect(readFileSync(join(data, 'receipts', '@piotrkarwatka', 'marketing-consents.jsonl'), 'utf8')).toBe(before)
  })
})
