// collect: run checks, outcomes from Actions-shaped jobs and artifacts, the retry loop with a fake API, preview runs,
// and the command end to end on a temporary data checkout (spec 5.3 steps 1-6, 12.2 WP07).
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Receipt } from '../../lib/schema/data/index.ts'
import collect from '../../lib/commands/collect.ts'
import type { ActionsApi } from '../../lib/receipts/actions-api.ts'
import { buildOutcomes, checkNightlyRun, runTitle, type ApiJob, type ApiRun } from '../../lib/receipts/from-actions.ts'
import { gatherFromActions, gatherFromLocal, RETRY_WAIT_MS } from '../../lib/receipts/gather.ts'
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
