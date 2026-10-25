// Classification of a failed step and the error signature (spec 5.3 "Klasyfikacja", [SP pkt 9], [g1 3]).
// Runs in `collect` (trusted job), outside harnessHash: improving a regex never invalidates receipts.
import { createHash } from 'node:crypto'
import type { Step } from '../schema/common.ts'
import { DUPLICATE_ROUTE_RE } from '../core/finding.ts'
import { excerptAt, firstErrorIndex, logLines, sanitizeLogText } from './excerpts.ts'

/** Ladder steps of the Step enum plus the harness steps around them (prepare, patch, env, pack). */
export type AnyStep = Step | 'prepare' | 'patch' | 'env' | 'pack'
/** Class of one failed step before the state machine (baseline and retries) turns it into a cell status. */
export type RawClass = 'module-fail' | 'infra' | 'quarantine'

export interface StepFailure {
  step: AnyStep
  classification: RawClass
  /** sha1(step + ':' + normalized first error line). */
  signature: string
  excerpt: string | null
  file: string | null
  line: number | null
  /** Package that Yarn's age gate refused (quarantine only). */
  blockedBy: string | null
  /** Short name of the rule that matched (for reports and tests). */
  rule: string
  /**
   * The npm packages this failure names alone (review of 24 Oct): of a smoke step whose every failed check is the route
   * of a package a new app registers (`smoke: FAIL preset <npm> api`, the server log check aside), or of a typecheck or
   * build whose every TS error is in a file under node_modules/<npm>/. [] when anything else failed (the platform, the
   * app's own files). collect holds a red baseline of the classic preset against these packages (state.ts).
   */
  packages: string[]
}

/** A failed smoke check of a package of a new app (harness/smoke.sh SMOKE_PRESET). */
export const PRESET_SMOKE_FAIL_RE = /^smoke: FAIL preset ((?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*) api /
const SERVER_LOG_FAIL_RE = /^smoke: FAIL server log has errors/
const NODE_MODULES_PKG_RE =
  /(?:^|[/\\])node_modules[/\\]((?:@[a-z0-9-~][a-z0-9-._~]*[/\\])?[a-z0-9-~][a-z0-9-._~]*)[/\\]/

/** `packages` of a failed step (see StepFailure): only what the failure names and nothing else. */
export function failurePackages(step: AnyStep, lines: readonly string[]): string[] {
  const out: string[] = []
  const add = (p: string) => {
    if (!out.includes(p)) out.push(p)
  }
  if (step === 'smoke') {
    const fails = lines.filter((l) => SMOKE_FAIL_RE.test(l.trim()))
    for (const l of fails) {
      const m = PRESET_SMOKE_FAIL_RE.exec(l.trim())
      if (m) add(m[1] as string)
      else if (!SERVER_LOG_FAIL_RE.test(l.trim())) return []
    }
    return out
  }
  if (step === 'typecheck' || step === 'build') {
    for (const l of lines) {
      const ts = TS_ERROR_RE.exec(l.trim())
      if (!ts) continue
      const m = NODE_MODULES_PKG_RE.exec(ts[1] as string)
      if (!m) return []
      add((m[1] as string).replace(/\\/g, '/'))
    }
    return out
  }
  return []
}

interface Rule {
  name: string
  re: RegExp
  steps: readonly AnyStep[] | 'any'
  classify: RawClass | ((attempt: number, step: AnyStep) => RawClass)
}

const ANY = 'any' as const
export const INFRA_RE =
  /ENOSPC|EAI_AGAIN|ETIMEDOUT|ECONNRESET|npm ERR! code E5\d\d|503 Service Unavailable|The operation was canceled/
export const TS_ERROR_RE = /^(.+?)\((\d+),(\d+)\): error TS(\d+)/
/** Written by harness/steps.sh itself when a step (or `timeout 600 yarn build`) runs out of time, on both runners. */
export const STEP_TIMEOUT_RE = /^\[harness\] step timed out/
/** A failed check of harness/smoke.sh. */
export const SMOKE_FAIL_RE = /^smoke: FAIL /
/**
 * Written by the preview runner (harness/local/run-cell.sh) when the memory limit of the cell killed a process during a
 * failed step (review of 24 Oct): the limit is the runner's, not the module's (a CI runner has 16 GB). Only the place
 * of the excerpt: the step log carries the module's own output, so the class comes from `oom_kills` the runner counts
 * outside the cell (ClassifyContext.oom, finding of 25 Oct: one printed marker made every real failure infra).
 */
export const CELL_OOM_RE = /^\[harness\] cell out of memory/

/** Steps before the module is involved: an unexplained failure there is the harness or the network, not the module. */
const BEFORE_MODULE: readonly AnyStep[] = ['prepare', 'scaffold', 'patch', 'env', 'install', 'pack']

/**
 * Order matters: the first rule whose pattern occurs in the step log wins. Every rule that blames the module comes
 * before `infra`: a step with a TypeScript error, a missing entity or relation fails the module even when some line of
 * the log (module output, or a type quoted in a TS message) carries an infra token. Infra is only what is left.
 */
export const RULES: readonly Rule[] = [
  // add included (review round 2): module code runs in add (generators import its sources), and add may change only
  // dependencies (spec 5.3).
  {
    name: 'tampered-files',
    re: /tampered-files/,
    steps: ['add', 'typecheck', 'build', 'start'],
    classify: 'module-fail',
  },
  { name: 'quarantine', re: /YN0016|quarantined/, steps: ['install', 'add'], classify: 'quarantine' },
  { name: 'missing-entity', re: /Metadata for entity (\w+) not found/, steps: ['initialize'], classify: 'module-fail' },
  // `yarn mercato generate` refuses a backend page URL another module of the app already has (round 13: freighttech
  // shipment-tracking and the webhooks module of a new app, /backend/webhooks). Without the rule the excerpt started at
  // Yarn's first `YN0000` line, 1200 characters before the error.
  { name: 'duplicate-route', re: DUPLICATE_ROUTE_RE, steps: ['add', 'typecheck', 'build'], classify: 'module-fail' },
  { name: 'ts-error', re: /^(?:.+?)\(\d+,\d+\): error TS\d+/, steps: ['typecheck', 'build'], classify: 'module-fail' },
  { name: 'type-check', re: /Failed to type check/, steps: ['build'], classify: 'module-fail' },
  {
    name: 'missing-relation',
    re: /relation "(.+?)" does not exist/,
    steps: ['initialize', 'start'],
    classify: 'module-fail',
  },
  {
    name: 'heap',
    re: /JavaScript heap out of memory/,
    steps: ['build'],
    classify: (attempt) => (attempt > 1 ? 'module-fail' : 'infra'),
  },
  // Same rule on both runners (the marker comes from steps.sh, not from the runner): like the heap rule, infra the
  // first time and module-fail on the retry, except before the module is involved.
  {
    name: 'step-timeout',
    re: STEP_TIMEOUT_RE,
    steps: ANY,
    classify: (attempt, step) => (attempt > 1 && !BEFORE_MODULE.includes(step) ? 'module-fail' : 'infra'),
  },
  // harness/smoke.sh names the failed check (`smoke: FAIL module api GET /api/events -> 403 (expected ...)`) and then
  // prints the response body: the excerpt starts at the check, so the route and the body stay together (round 5).
  { name: 'smoke-check', re: SMOKE_FAIL_RE, steps: ['smoke'], classify: 'module-fail' },
  { name: 'infra', re: INFRA_RE, steps: ANY, classify: 'infra' },
]

/**
 * The preview runner's memory limit cut the step short: infra on every attempt, so a retry under the same limit never
 * confirms `broken` (review of 24 Oct; at `--memory 8g` the build of a classic baseline lost its type check to the limit
 * on Cezar, which the rule `type-check` would have made a red baseline). Applies only when the runner counted a kill
 * (ClassifyContext.oom), never because a log line says so; `tampered-files` still comes first.
 */
const CELL_OOM: Rule = { name: 'cell-oom', re: CELL_OOM_RE, steps: ANY, classify: 'infra' }

function applies(rule: Rule, step: AnyStep): boolean {
  return rule.steps === ANY || rule.steps.includes(step)
}

/** First error line normalized: paths to file names, hex runs to `h`, numbers to `#`. */
export function normalizeErrorLine(line: string): string {
  return line
    .trim()
    .replace(/(?:[A-Za-z]:)?(?:[\w.@~+-]*[/\\])+([\w.@+-]+)/g, '$1')
    .replace(/\b(?:0x)?(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{6,}\b/gi, 'h')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
}

export function errorSignature(step: AnyStep, firstErrorLine: string): string {
  return createHash('sha1')
    .update(`${step}:${normalizeErrorLine(firstErrorLine)}`)
    .digest('hex')
}

function blockedPackage(text: string): string | null {
  const m = /((?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*)@npm:/.exec(text)
  return m ? (m[1] ?? null) : null
}

export interface ClassifyContext {
  /** Retry number of the cell (1 = first run). */
  attempt: number
  /**
   * The step's conclusion is `cancelled` (job timeout, a cancelled run, or the backstop timeout of the preview runner):
   * without a matching rule that is infra, never module-fail.
   */
  cancelled?: boolean
  /** The preview runner counted an oom_kill of the cell during this step (job.json `oom_kills`, outside the cell). */
  oom?: boolean
}

/** Classify one failed step from its log. */
export function classifyStep(step: AnyStep, log: string, ctx: ClassifyContext): StepFailure {
  const lines = logLines(log)
  const matches = (r: Rule) => applies(r, step) && lines.some((l) => r.re.test(l))
  const tampered = RULES.find((r) => r.name === 'tampered-files' && matches(r)) ?? null
  const rule = tampered ?? (ctx.oom ? CELL_OOM : null) ?? RULES.find(matches) ?? null
  const index = firstErrorIndex(lines, rule ? [rule.re] : [])
  const errorLine = lines[index] ?? ''
  let classification: RawClass
  if (rule) classification = typeof rule.classify === 'function' ? rule.classify(ctx.attempt, step) : rule.classify
  else classification = BEFORE_MODULE.includes(step) || ctx.cancelled ? 'infra' : 'module-fail'
  let file: string | null = null
  let line: number | null = null
  const ts = TS_ERROR_RE.exec(errorLine.trim())
  if (ts) {
    file = sanitizeLogText(ts[1] as string).slice(0, 300)
    line = Number(ts[2])
  }
  return {
    step,
    classification,
    signature: errorSignature(step, errorLine),
    excerpt: excerptAt(lines, index),
    file,
    line,
    blockedBy: classification === 'quarantine' ? blockedPackage(errorLine) : null,
    rule: rule?.name ?? (ctx.cancelled ? 'cancelled' : classification === 'infra' ? 'harness-step' : 'unmatched'),
    packages: classification === 'module-fail' ? failurePackages(step, lines) : [],
  }
}

// The explanation of a failed step lives in lib/core/finding.ts (review r9): the site, the agent card and
// `check_compat` read the same sentence, and lib/core runs in the MCP Worker, which has no node:crypto.
export { explainFailure, forbiddenRoute, type ExplainContext, type ForbiddenRoute } from '../core/finding.ts'
