// First half of `collect`: everything read from outside the data branch for one night (spec 5.3 steps 1-3 and the
// retry of step 4), stored as a NightBundle. The second half (state.ts, applied through data-branch.ts) only reads the
// bundle, so a rejected push can replay the write without calling the API or dispatching again.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Receipt } from '../schema/data/receipt.ts'
import type { ActionsApi } from './actions-api.ts'
import {
  buildOutcomes,
  checkNightlyRun,
  readMatrixArtifact,
  runTitle,
  type ApiJob,
  type ApiRun,
  type BundleAttempt,
  type CellOutcome,
  type NightBundle,
} from './from-actions.ts'
import { PRESET_IDS } from '../core/lines.ts'
import type { Matrix, MatrixCell } from './matrix.ts'
import { MINUTES_BY_PRESET, PARALLEL } from './plan.ts'
import { rawResult, retryKeys, type History } from './state.ts'

export const NIGHTLY_WORKFLOW = 'nightly.yml'
/** collect waits at least this long for the retry run (spec 5.1: up to 40 min for a retry of one wave). */
export const RETRY_WAIT_MS = 40 * 60 * 1000
/** ... and at most this long for a larger one: collect.yml `timeout-minutes: 150` keeps 30 minutes for the rest. */
export const RETRY_WAIT_MAX_MS = 120 * 60 * 1000
/** The plan job of the retry and the runner queue before its first cell starts. */
export const RETRY_START_MIN = 10
/**
 * Slack on top of the estimate while RETRY_WAIT_MAX_MS allows (the cell minutes of plan.ts are estimates and a cell
 * job may run up to 40 minutes): a retry of two waves is not lost when one of its cells runs a few minutes over.
 */
export const RETRY_MARGIN_MIN = 10
export const POLL_MS = 30 * 1000

/** Minutes a retry of these cells takes: its start, then waves of PARALLEL cells per preset (plan.ts weights). */
export function retryMinutes(cells: readonly Pick<MatrixCell, 'preset'>[]): number {
  return PRESET_IDS.reduce(
    (min, p) => min + Math.ceil(cells.filter((c) => c.preset === p).length / PARALLEL) * MINUTES_BY_PRESET[p],
    RETRY_START_MIN,
  )
}

/**
 * The retry that fits the wait (audit C18: a retry of 7 classic cells outlasted the fixed 40 minutes and was never
 * collected): the cells go in by baseline, then infra, then module-fail, in the order of the keys, while the retry
 * still ends within RETRY_WAIT_MAX_MS; the rest is left out and named in the notes. `waitMs` is how long collect waits.
 */
export function retryPlan(
  cells: readonly MatrixCell[],
  outcomes: readonly CellOutcome[],
  keys: readonly string[],
): { keys: string[]; left: string[]; waitMs: number } {
  const cellOf = new Map(cells.map((c) => [c.key, c]))
  const rank = (k: string): number => {
    const c = cellOf.get(k)
    if (c?.baseline) return 0
    const o = outcomes.find((x) => x.key === k)
    return c && o && rawResult(o, false).klass === 'infra' ? 1 : 2
  }
  const taken: MatrixCell[] = []
  const chosen = new Set<string>()
  for (const k of [...keys].sort((a, b) => rank(a) - rank(b))) {
    const c = cellOf.get(k)
    if (!c || retryMinutes([...taken, c]) * 60_000 > RETRY_WAIT_MAX_MS) continue
    taken.push(c)
    chosen.add(k)
  }
  const waitMs = Math.min(RETRY_WAIT_MAX_MS, Math.max(RETRY_WAIT_MS, (retryMinutes(taken) + RETRY_MARGIN_MIN) * 60_000))
  return { keys: keys.filter((k) => chosen.has(k)), left: keys.filter((k) => !chosen.has(k)), waitMs }
}

/** Inputs of the retry dispatch; a contract test checks they are declared in nightly.yml `on.workflow_dispatch.inputs`. */
export function retryDispatchInputs(keys: readonly string[], nightId: number): Record<string, string> {
  return { cells: keys.join(','), attempt: '2', parent: String(nightId) }
}

export type GatherResult =
  { kind: 'bundle'; bundle: NightBundle } | { kind: 'ignored'; reason: string } | { kind: 'collected'; reason: string }

/** True when receipts already carry this night's run id (spec 5.3 step 1: then the job ends without changes). */
export function nightCollected(all: readonly Receipt[], nightId: number): boolean {
  return all.some((r) => r.run.id === nightId)
}

export interface GatherDeps {
  api: ActionsApi
  history: History
  /** Every receipt on the data branch (for the "already collected" check). */
  allReceipts: readonly Receipt[]
  /** Where artifacts are downloaded: `<dir>/<run id>/<artifact name>/`. */
  artifactsRoot: string
  waitRetry: boolean
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  log?: (line: string) => void
}

function runAt(run: ApiRun): string {
  return (run.run_started_at ?? run.created_at).replace(/\.\d{3}Z$/, 'Z')
}

async function attemptOf(
  api: ActionsApi,
  run: ApiRun,
  attempt: number,
  dir: string,
  fallback: Matrix | null,
): Promise<{ attempt: BundleAttempt; matrix: Matrix }> {
  await api.downloadArtifacts(run.id, dir)
  const matrix = readMatrixArtifact(dir, attempt) ?? fallback
  if (!matrix) throw new Error(`run ${run.id} has no matrix-a${attempt} artifact`)
  const jobs: ApiJob[] = await api.listJobs(run.id)
  const outcomes = buildOutcomes(matrix, { jobs, artifactsDir: dir, attempt, runUrl: run.html_url })
  return { attempt: { attempt, run: { id: run.id, url: run.html_url, at: runAt(run) }, outcomes }, matrix }
}

export async function gatherFromActions(runId: number, deps: GatherDeps): Promise<GatherResult> {
  const { api } = deps
  const log = deps.log ?? (() => {})
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const run = await api.getRun(runId)
  const check = checkNightlyRun(run)
  if (!check.ok) return { kind: 'ignored', reason: check.reason }
  if (check.attempt > 1 && !check.parent)
    return { kind: 'ignored', reason: `run ${run.id} is a retry without a parent` }
  const night = check.attempt === 1 ? run : await api.getRun(check.parent as number)
  const nightCheck = checkNightlyRun(night)
  if (!nightCheck.ok) return { kind: 'ignored', reason: nightCheck.reason }
  if (nightCollected(deps.allReceipts, night.id))
    return { kind: 'collected', reason: `run ${night.id} is already in the receipts` }

  const first = await attemptOf(api, night, 1, join(deps.artifactsRoot, String(night.id)), null)
  const matrix = first.matrix
  const planned = retryPlan(
    matrix.cells,
    first.attempt.outcomes,
    retryKeys(matrix.cells, first.attempt.outcomes, deps.history),
  )
  const keys = planned.keys
  const attempts: BundleAttempt[] = [first.attempt]
  const notes: string[] = []
  if (planned.left.length > 0) {
    const labels = planned.left.map((k) => matrix.cells.find((c) => c.key === k)?.label ?? k)
    notes.push(
      `retry left out ${planned.left.length} cell(s) that do not fit the wait: ${labels.join(', ')}; those cells stay unconfirmed`,
    )
    log(notes[notes.length - 1] as string)
  }
  if (keys.length > 0) {
    const title = runTitle(2, night.id)
    const findRetry = async (): Promise<ApiRun | null> => {
      if (check.attempt === 2 && run.display_title === title) return run
      const runs = await api.listWorkflowRuns(NIGHTLY_WORKFLOW, {
        event: 'workflow_dispatch',
        branch: 'main',
        since: night.created_at,
      })
      return runs.find((r) => r.display_title === title) ?? null
    }
    let retry = await findRetry()
    if (!retry && deps.waitRetry) {
      log(`dispatching retry of ${keys.length} cell(s) for night ${night.id}`)
      await api.dispatch(NIGHTLY_WORKFLOW, 'main', retryDispatchInputs(keys, night.id))
    }
    const deadline = now() + planned.waitMs
    while (deps.waitRetry && now() < deadline) {
      retry = retry ? await api.getRun(retry.id) : await findRetry()
      if (retry && retry.status === 'completed') break
      await sleep(POLL_MS)
    }
    if (retry && retry.status === 'completed') {
      const second = await attemptOf(api, retry, 2, join(deps.artifactsRoot, String(retry.id)), {
        ...matrix,
        cells: matrix.cells.filter((c) => keys.includes(c.key)),
      })
      attempts.push(second.attempt)
      log(`collected retry run ${retry.id}`)
    } else {
      notes.push(`retry of ${keys.length} cell(s) not collected; those cells stay unconfirmed`)
      log(notes[notes.length - 1] as string)
    }
  }
  return {
    kind: 'bundle',
    bundle: {
      schema: 1,
      runner: matrix.runner,
      night: { id: night.id, url: night.html_url, at: runAt(night) },
      matrix,
      attempts,
      retry: keys,
      notes,
    },
  }
}

/** A preview run directory written by `yarn om cells-local` (run.json, jobs.json, artifacts/). */
export interface LocalRun {
  run: ApiRun
  jobs: ApiJob[]
  artifactsDir: string
}

export function readLocalRun(dir: string): LocalRun {
  const runFile = join(dir, 'run.json')
  const jobsFile = join(dir, 'jobs.json')
  if (!existsSync(runFile) || !existsSync(jobsFile))
    throw new Error(`${dir} is not a preview run (run.json, jobs.json)`)
  const run = JSON.parse(readFileSync(runFile, 'utf8')) as ApiRun
  const jobs = (JSON.parse(readFileSync(jobsFile, 'utf8')) as { jobs: ApiJob[] }).jobs
  return { run, jobs, artifactsDir: join(dir, 'artifacts') }
}

/** Bundle from preview runs: the first is the night, an optional second is its retry (attempt 2). */
export function gatherFromLocal(
  dirs: readonly string[],
  deps: Pick<GatherDeps, 'history' | 'allReceipts'>,
): GatherResult {
  if (dirs.length === 0) throw new Error('no preview run directory')
  const night = readLocalRun(dirs[0] as string)
  const check = checkNightlyRun(night.run)
  if (!check.ok) return { kind: 'ignored', reason: check.reason }
  if (nightCollected(deps.allReceipts, night.run.id))
    return { kind: 'collected', reason: `run ${night.run.id} is already in the receipts` }
  const matrix = readMatrixArtifact(night.artifactsDir, 1)
  if (!matrix) throw new Error(`${dirs[0]} has no artifacts/matrix-a1/matrix.json`)
  const outcomes = buildOutcomes(matrix, {
    jobs: night.jobs,
    artifactsDir: night.artifactsDir,
    attempt: 1,
    runUrl: night.run.html_url,
  })
  const attempts: BundleAttempt[] = [
    { attempt: 1, run: { id: night.run.id, url: night.run.html_url, at: runAt(night.run) }, outcomes },
  ]
  const keys = retryKeys(matrix.cells, outcomes, deps.history)
  const notes: string[] = []
  if (dirs[1]) {
    const retry = readLocalRun(dirs[1])
    const t = checkNightlyRun(retry.run)
    if (!t.ok || t.attempt !== 2 || t.parent !== night.run.id)
      throw new Error(`${dirs[1]} is not the retry (attempt 2) of run ${night.run.id}`)
    const m2 = readMatrixArtifact(retry.artifactsDir, 2) ?? {
      ...matrix,
      cells: matrix.cells.filter((c) => keys.includes(c.key)),
    }
    attempts.push({
      attempt: 2,
      run: { id: retry.run.id, url: retry.run.html_url, at: runAt(retry.run) },
      outcomes: buildOutcomes(m2, {
        jobs: retry.jobs,
        artifactsDir: retry.artifactsDir,
        attempt: 2,
        runUrl: retry.run.html_url,
      }),
    })
  } else if (keys.length > 0) {
    notes.push(
      `retry needed for ${keys.length} cell(s): yarn om cells-local --attempt 2 --parent ${night.run.id} --cells ${keys.map((k) => k.slice(0, 12)).join(',')}`,
    )
  }
  return {
    kind: 'bundle',
    bundle: {
      schema: 1,
      runner: 'preview-docker',
      night: { id: night.run.id, url: night.run.html_url, at: runAt(night.run) },
      matrix,
      attempts,
      retry: keys,
      notes,
    },
  }
}
