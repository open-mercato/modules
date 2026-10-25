// Cell outcomes from a nightly run (spec 5.3 "Job collect", D11).
// Step status comes only from the Actions API (`GET /repos/{repo}/actions/runs/{id}/jobs`, mapped by `steps[].name`);
// artifacts give only log excerpts, the applied patches, notes and the scaffold metadata. The preview runner writes the
// same two shapes (jobs.json, artifacts/<name>/) so both go through this file.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Step, type Step as StepT } from '../schema/common.ts'
import { classifyStep, type AnyStep, type StepFailure } from './classify.ts'
import {
  cellArtifactName,
  Matrix,
  matrixArtifactName,
  parseCellJobName,
  type Matrix as MatrixT,
  type MatrixCell,
  type Runner,
} from './matrix.ts'

export const NIGHTLY_PATH = '.github/workflows/nightly.yml'
export const LADDER: readonly StepT[] = Step.options
export const HARNESS_STEPS = ['prepare', 'patch', 'env', 'pack'] as const

/** The fields of `GET .../actions/runs/{id}/jobs` items we read. */
export interface ApiStep {
  name: string
  number?: number
  status: string
  conclusion: string | null
  started_at?: string | null
  completed_at?: string | null
  /**
   * Processes the memory limit of the cell killed during the step, counted by the preview runner outside the cell
   * (harness/local/run-cell.sh, cgroup memory.events); absent on GitHub Actions.
   */
  oom_kills?: number
}
export interface ApiJob {
  id?: number
  run_id?: number
  run_attempt?: number
  name: string
  status: string
  conclusion: string | null
  started_at?: string | null
  completed_at?: string | null
  html_url?: string | null
  steps?: ApiStep[]
  /** The memory limit of the cell container (`8g`), written by the preview runner only (harness/local/run-cell.sh). */
  runner_memory?: string
}
/** The fields of `GET .../actions/runs/{id}` we read. */
export interface ApiRun {
  id: number
  path: string
  head_branch: string | null
  event: string
  status: string | null
  conclusion: string | null
  html_url: string
  created_at: string
  run_started_at?: string | null
  updated_at?: string | null
  display_title?: string | null
  head_repository?: { full_name: string } | null
  repository?: { full_name: string } | null
}

/** `run-name` of nightly.yml: `nightly a<attempt>` or `nightly a<attempt> p<parent run id>`. */
export function parseRunTitle(title: string | null | undefined): { attempt: number; parent: number | null } {
  const m = /^nightly a(\d+)(?: p(\d+))?$/.exec((title ?? '').trim())
  if (!m) return { attempt: 1, parent: null }
  return { attempt: Number(m[1]), parent: m[2] ? Number(m[2]) : null }
}

export function runTitle(attempt: number, parent: number | null): string {
  return parent ? `nightly a${attempt} p${parent}` : `nightly a${attempt}`
}

export type RunCheck = { ok: true; attempt: number; parent: number | null } | { ok: false; reason: string }

/**
 * Only a finished run of nightly.yml on main of this repository, started by the schedule or a dispatch, is collected
 * (spec 5.3 step 1). Pull requests, forks and other branches are ignored.
 */
export function checkNightlyRun(run: ApiRun): RunCheck {
  const path = run.path.replace(/@.*$/, '')
  if (path !== NIGHTLY_PATH) return { ok: false, reason: `run ${run.id} is ${path}, not ${NIGHTLY_PATH}` }
  if (run.head_branch !== 'main')
    return { ok: false, reason: `run ${run.id} is on ${run.head_branch ?? '?'}, not main` }
  if (run.event !== 'schedule' && run.event !== 'workflow_dispatch')
    return { ok: false, reason: `run ${run.id} was started by ${run.event}` }
  const head = run.head_repository?.full_name
  const base = run.repository?.full_name
  if (head && base && head !== base) return { ok: false, reason: `run ${run.id} comes from ${head}` }
  if (run.status !== null && run.status !== 'completed') return { ok: false, reason: `run ${run.id} is ${run.status}` }
  // a scheduled night the private-repository guard of nightly.yml skipped has no matrix to collect (finding of 25 Oct:
  // every such night failed collect with `no matrix-a1 artifact`)
  if (run.conclusion === 'skipped') return { ok: false, reason: `run ${run.id} was skipped` }
  const t = parseRunTitle(run.display_title)
  return { ok: true, ...t }
}

// ---------------------------------------------------------------------------------------------------------------
// Artifacts

export interface CellArtifact {
  dir: string
  logs: Partial<Record<AnyStep, string>>
  patches: string[]
  notes: string[]
  yarn: string | null
  modulesTs: string | null
}

const MAX_LOG = 8 * 1024 * 1024

function readText(file: string, max = MAX_LOG): string | null {
  if (!existsSync(file)) return null
  const size = statSync(file).size
  const buf = readFileSync(file)
  // Keep the head and the tail of a huge log: the first error is usually near one of them.
  if (size <= max) return buf.toString('utf8')
  return `${buf.subarray(0, max / 2).toString('utf8')}\n[...]\n${buf.subarray(size - max / 2).toString('utf8')}`
}

function readJsonFile(file: string): unknown {
  const t = readText(file, 1024 * 1024)
  if (t === null) return null
  try {
    return JSON.parse(t) as unknown
  } catch {
    return null
  }
}

const strings = (v: unknown, re: RegExp): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && re.test(x)).slice(0, 10) : []

/** One cell artifact directory (`cell-<key12>-<line>-a<n>`), or null when it does not exist. */
export function readCellArtifact(dir: string): CellArtifact | null {
  if (!existsSync(dir)) return null
  const logs: Partial<Record<AnyStep, string>> = {}
  for (const s of [...LADDER, ...HARNESS_STEPS]) {
    const t = readText(join(dir, `${s}.log`))
    if (t !== null) logs[s] = t
  }
  const meta = readJsonFile(join(dir, 'app-meta.json')) as Record<string, unknown> | null
  const yarn = typeof meta?.yarn === 'string' && /^\d+\.\d+\.\d+/.test(meta.yarn) ? meta.yarn.slice(0, 40) : null
  const modulesTs = typeof meta?.modulesTs === 'string' ? meta.modulesTs.slice(0, 20000) : null
  return {
    dir,
    logs,
    patches: strings(readJsonFile(join(dir, 'patches.json')), /^[a-z0-9-]{2,40}$/),
    notes: strings(readJsonFile(join(dir, 'notes.json')), /^(in-preset|flaky)$/),
    yarn,
    modulesTs,
  }
}

/** `matrix-a<n>/matrix.json` in a directory of downloaded artifacts. */
export function readMatrixArtifact(artifactsDir: string, attempt: number): MatrixT | null {
  const file = join(artifactsDir, matrixArtifactName(attempt), 'matrix.json')
  const raw = readJsonFile(file)
  if (raw === null) return null
  return Matrix.parse(raw)
}

export function listArtifactDirs(artifactsDir: string): string[] {
  return existsSync(artifactsDir) ? readdirSync(artifactsDir).sort() : []
}

// ---------------------------------------------------------------------------------------------------------------
// Outcomes

export type Conclusion = 'success' | 'failure' | 'cancelled' | 'skipped' | null

export interface CellOutcome {
  key: string
  key12: string
  line: string
  attempt: number
  jobFound: boolean
  jobConclusion: Conclusion
  url: string
  startedAt: string | null
  durationSec: number
  ladder: Record<StepT, { conclusion: Conclusion; sec: number | null }>
  harnessSteps: Partial<Record<(typeof HARNESS_STEPS)[number], Conclusion>>
  failures: StepFailure[]
  patches: string[]
  notes: string[]
  yarn: string | null
  modulesTs: string | null
  /** The memory limit of the preview cell (`ApiJob.runner_memory`), or null (CI, or a job without it). */
  memory: string | null
}

function conclusionOf(s: string | null | undefined): Conclusion {
  if (s === 'success' || s === 'failure' || s === 'cancelled' || s === 'skipped') return s
  if (s === 'timed_out') return 'failure'
  return null
}

function seconds(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null
  const d = Math.round((Date.parse(b) - Date.parse(a)) / 1000)
  return Number.isFinite(d) && d >= 0 ? d : null
}

export interface OutcomeSource {
  jobs: readonly ApiJob[]
  /** Directory with one sub-directory per artifact (`gh run download` layout). */
  artifactsDir: string
  attempt: number
  /** Fallback URL when a job has no html_url. */
  runUrl: string
}

/** Join the matrix with the jobs (by job name) and the artifacts; classify every failed step from its log. */
export function buildOutcomes(matrix: MatrixT, src: OutcomeSource): CellOutcome[] {
  const byName = new Map<string, ApiJob>()
  for (const j of src.jobs) {
    const p = parseCellJobName(j.name)
    if (!p) continue
    const k = `${p.key12} ${p.line}`
    const prev = byName.get(k)
    // A re-run of the same job keeps the latest attempt.
    if (!prev || (j.run_attempt ?? 1) >= (prev.run_attempt ?? 1)) byName.set(k, j)
  }
  return matrix.cells.map((cell) => outcomeOf(cell, byName.get(`${cell.key12} ${cell.line}`) ?? null, src))
}

function outcomeOf(cell: MatrixCell, job: ApiJob | null, src: OutcomeSource): CellOutcome {
  const art = readCellArtifact(join(src.artifactsDir, cellArtifactName(cell, src.attempt)))
  const steps = new Map((job?.steps ?? []).map((s) => [s.name, s]))
  const ladder = Object.fromEntries(
    LADDER.map((name) => {
      const s = steps.get(name)
      const conclusion = conclusionOf(s?.conclusion)
      return [name, { conclusion, sec: conclusion === 'skipped' ? null : seconds(s?.started_at, s?.completed_at) }]
    }),
  ) as CellOutcome['ladder']
  const harnessSteps: CellOutcome['harnessSteps'] = {}
  for (const h of HARNESS_STEPS) {
    const s = steps.get(h)
    if (s) harnessSteps[h] = conclusionOf(s.conclusion)
  }
  const failures: StepFailure[] = []
  const failed = (c: Conclusion) => c === 'failure' || c === 'cancelled'
  for (const name of [...HARNESS_STEPS.filter((h) => h !== 'pack'), ...LADDER] as AnyStep[]) {
    const c = (LADDER as readonly string[]).includes(name)
      ? ladder[name as StepT].conclusion
      : harnessSteps[name as (typeof HARNESS_STEPS)[number]]
    if (!failed(c ?? null)) continue
    const oom = (steps.get(name)?.oom_kills ?? 0) > 0
    failures.push(
      classifyStep(name, art?.logs[name] ?? '', { attempt: src.attempt, cancelled: c === 'cancelled', oom }),
    )
  }
  return {
    key: cell.key,
    key12: cell.key12,
    line: cell.line,
    attempt: src.attempt,
    jobFound: job !== null,
    jobConclusion: conclusionOf(job?.conclusion),
    url: job?.html_url ?? src.runUrl,
    startedAt: job?.started_at ?? null,
    durationSec: seconds(job?.started_at, job?.completed_at) ?? 0,
    ladder,
    harnessSteps,
    failures,
    patches: art?.patches ?? [],
    notes: art?.notes ?? [],
    yarn: art?.yarn ?? null,
    modulesTs: cell.baseline ? (art?.modulesTs ?? null) : null,
    memory:
      typeof job?.runner_memory === 'string' && /^[1-9][0-9]?g$/.test(job.runner_memory) ? job.runner_memory : null,
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Night bundle: everything `collect` gathered (API, artifacts, retry), applied to the data branch in a second step that
// can be replayed by data-branch.ts without calling the API again.

export interface BundleAttempt {
  attempt: number
  run: { id: number; url: string; at: string }
  outcomes: CellOutcome[]
}

export interface NightBundle {
  schema: 1
  runner: Runner
  /** Run id of the night (attempt 1); receipts carry it as `run.id`. */
  night: { id: number; url: string; at: string }
  matrix: MatrixT
  attempts: BundleAttempt[]
  /** Cell keys whose retry was asked for (out/retry.json). */
  retry: string[]
  notes: string[]
}
