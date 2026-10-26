// `triage` (D29, spec 5.4): one line per open `new-entry` pull request with the locator, a verdict and flags,
// from the checks of the PR (every job of validate.yml, REQUIRED_CHECKS) and the offline steps of validate run
// locally on the PR's descriptor.
// Merging is a separate, confirmed step: `gh pr merge --squash --match-head-commit <sha>` per ready PR, from the
// curator's own `gh` login. Nothing is merged without the confirmation.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { SCREENSHOT_FILE } from '../schema/descriptor.ts'
import type { Catalog } from './catalog.ts'
import { ghJson, type Gh } from './gh.ts'
import { checkLocal } from './local.ts'

export const PR_FIELDS = [
  'number',
  'title',
  'author',
  'headRefOid',
  'headRepository',
  'headRepositoryOwner',
  'isCrossRepository',
  'isDraft',
  'mergeable',
  'labels',
  'files',
  'statusCheckRollup',
  'url',
] as const

export interface GhPr {
  number: number
  title: string
  author: { login: string; is_bot?: boolean } | null
  headRefOid: string
  headRepository: { name: string; nameWithOwner?: string } | null
  headRepositoryOwner: { login: string } | null
  isCrossRepository: boolean
  isDraft: boolean
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' | string
  labels: { name: string }[]
  files: { path: string; changeType?: string; additions?: number; deletions?: number }[]
  statusCheckRollup: {
    __typename?: string
    name?: string
    context?: string
    status?: string
    conclusion?: string | null
    state?: string
    startedAt?: string
    completedAt?: string
  }[]
  url: string
}

export type Verdict = 'ready' | 'hold' | 'blocked'
export type CiState = 'pass' | 'fail' | 'pending' | 'none'

export interface TriageLine {
  number: number
  url: string
  headRefOid: string
  author: string | null
  locators: string[]
  verdict: Verdict
  ci: CiState
  flags: string[]
  /** Why the PR is not ready (errors of the offline checks, CI state, files). */
  reasons: string[]
  /** State of each required check; `ci` is the worst of them. */
  checks?: Record<string, CiState>
}

/**
 * The jobs of .github/workflows/validate.yml a PR needs green before a batch merge. `validate` alone let a PR with a
 * red `checks` (the unit tests) through as ready (finding of 25 Oct).
 */
export const REQUIRED_CHECKS = ['validate', 'checks', 'build'] as const

/** The worst state among the required checks, and each check's own state. */
export function requiredCiState(
  pr: Pick<GhPr, 'statusCheckRollup'>,
  checks: readonly string[] = REQUIRED_CHECKS,
): { ci: CiState; byCheck: Record<string, CiState> } {
  const byCheck = Object.fromEntries(checks.map((c) => [c, ciState(pr, c)])) as Record<string, CiState>
  const states = Object.values(byCheck)
  const ci: CiState = states.includes('fail')
    ? 'fail'
    : states.includes('pending')
      ? 'pending'
      : states.includes('none')
        ? 'none'
        : 'pass'
  return { ci, byCheck }
}

/** State of one check, `validate` by default (the newest run when the job ran more than once). */
export function ciState(pr: Pick<GhPr, 'statusCheckRollup'>, check = 'validate'): CiState {
  const runs = (pr.statusCheckRollup ?? []).filter((c) => (c.name ?? c.context) === check)
  if (runs.length === 0) return 'none'
  runs.sort((a, b) => (b.startedAt ?? b.completedAt ?? '').localeCompare(a.startedAt ?? a.completedAt ?? ''))
  const c = runs[0] as GhPr['statusCheckRollup'][number]
  const status = (c.status ?? '').toUpperCase()
  if (status && status !== 'COMPLETED') return 'pending'
  const concl = (c.conclusion ?? c.state ?? '').toUpperCase()
  if (concl === 'SUCCESS') return 'pass'
  if (concl === 'PENDING' || concl === 'EXPECTED' || concl === '') return 'pending'
  return 'fail'
}

async function fileAt(gh: Gh, repo: string, path: string, ref: string): Promise<string | null> {
  const r = await gh(['api', `repos/${repo}/contents/${path}?ref=${ref}`])
  if (r.code !== 0) {
    if (/404|Not Found/i.test(r.stderr + r.stdout)) return null
    throw new Error(`gh api contents ${path} failed: ${(r.stderr || r.stdout).trim().split('\n')[0]}`)
  }
  const body = JSON.parse(r.stdout) as { content?: string; encoding?: string }
  if (body.encoding !== 'base64' || typeof body.content !== 'string') return null
  return Buffer.from(body.content, 'base64').toString('utf8')
}

/** Evaluates one pull request. */
export async function triagePr(pr: GhPr, ctx: { gh: Gh; catalog: Catalog }): Promise<TriageLine> {
  const labels = pr.labels.map((l) => l.name)
  const flags: string[] = []
  const reasons: string[] = []
  const locators: string[] = []
  const descriptors = pr.files.filter((f) => /^modules\/.+\.yml$/.test(f.path))
  // a screenshot the catalog hosts (modules/<folder>/screenshots/<name>) belongs to its descriptor, not an other file
  const others = pr.files.filter((f) => !/^modules\/.+\.yml$/.test(f.path) && !SCREENSHOT_FILE.test(f.path))
  if (pr.isCrossRepository) flags.push('fork')
  if (pr.isDraft) {
    flags.push('draft')
    reasons.push('draft')
  }
  if (pr.mergeable === 'CONFLICTING') {
    flags.push('conflict')
    reasons.push('merge conflict')
  }
  if (labels.includes('name-reviewed')) flags.push('name-reviewed')
  if (others.length > 0) {
    flags.push('other-files')
    reasons.push(
      `changes files outside modules/: ${others
        .slice(0, 3)
        .map((f) => f.path)
        .join(', ')}`,
    )
  }
  if (descriptors.length === 0) reasons.push('no descriptor in the pull request')
  const repo =
    pr.headRepository?.nameWithOwner ??
    (pr.headRepositoryOwner && pr.headRepository ? `${pr.headRepositoryOwner.login}/${pr.headRepository.name}` : null)
  let blocked = false
  // descriptor texts of the pull request by path, so a changed screenshot can be matched to the one that names it
  const prTexts = new Map<string, string>()
  for (const df of descriptors) {
    if (df.changeType === 'DELETED') {
      flags.push('removal')
      locators.push(df.path)
      continue
    }
    const text = repo ? await fileAt(ctx.gh, repo, df.path, pr.headRefOid) : null
    if (text === null) {
      reasons.push(`${df.path}: content not readable`)
      blocked = true
      locators.push(df.path)
      continue
    }
    prTexts.set(df.path, text)
    const basePath = join(ctx.catalog.root, df.path)
    const baseText = existsSync(basePath) ? readFileSync(basePath, 'utf8') : null
    flags.push(baseText === null ? 'new' : 'update')
    const res = checkLocal({ file: df.path, text, labels, baseText }, ctx.catalog)
    locators.push(res.locator ?? df.path)
    for (const fnd of res.findings) {
      if (fnd.severity === 'error') {
        reasons.push(`${res.locator ?? df.path}: ${fnd.message}`)
        blocked = true
      } else if (fnd.severity === 'warning' && !flags.includes(fnd.code)) {
        flags.push(fnd.code)
        // curator fields change how an entry is shown or installed: never part of a batch merge
        if (fnd.code === 'curator-fields')
          reasons.push(`${res.locator ?? df.path}: ${fnd.message}; merge it on its own`)
      }
    }
  }
  // a screenshot no descriptor names is an orphan (review of 26 Oct): neither CI nor this list would look at it
  for (const f of pr.files.filter((x) => SCREENSHOT_FILE.test(x.path) && x.changeType !== 'DELETED')) {
    const name = f.path.slice(f.path.lastIndexOf('/') + 1)
    const folder = dirname(dirname(f.path))
    const baseDir = join(ctx.catalog.root, folder)
    const texts = [
      ...[...prTexts].filter(([p]) => dirname(p) === folder).map(([, t]) => t),
      ...(existsSync(baseDir)
        ? readdirSync(baseDir)
            .filter((n) => n.endsWith('.yml') && !prTexts.has(`${folder}/${n}`))
            .map((n) => readFileSync(join(baseDir, n), 'utf8'))
        : []),
    ]
    if (!texts.some((t) => t.includes(`screenshots/${name}`))) {
      if (!flags.includes('screenshot-orphan')) flags.push('screenshot-orphan')
      reasons.push(`${f.path}: no descriptor names this screenshot`)
      blocked = true
    }
  }
  const { ci, byCheck } = requiredCiState(pr)
  const named = (state: CiState, one: string, many: string) => {
    const names = Object.keys(byCheck).filter((c) => byCheck[c] === state)
    return `${names.length > 1 ? many : one}: ${names.join(', ')}`
  }
  if (ci === 'fail') {
    reasons.push(named('fail', 'failed check', 'failed checks'))
    blocked = true
  } else if (ci === 'pending') reasons.push(named('pending', 'check still running', 'checks still running'))
  else if (ci === 'none')
    reasons.push(
      `${named('none', 'check not run', 'checks not run')} (approve the workflow run of a first-time contributor)`,
    )
  const verdict: Verdict = blocked ? 'blocked' : reasons.length > 0 ? 'hold' : 'ready'
  return {
    number: pr.number,
    url: pr.url,
    headRefOid: pr.headRefOid,
    author: pr.author?.login ?? null,
    locators: [...new Set(locators)],
    verdict,
    ci,
    flags: [...new Set(flags)],
    reasons,
    checks: byCheck,
  }
}

/**
 * Open PRs that add or change an entry: labelled `new-entry`, or touching `modules/**` (finding of 25 Oct: nothing
 * puts the label on a PR, a fork or the /submit flow cannot set it, so a label-only list was always empty).
 */
export async function listNewEntryPrs(gh: Gh, repo: string, label = 'new-entry'): Promise<GhPr[]> {
  const prs = await ghJson<GhPr[]>(gh, [
    'pr',
    'list',
    '--repo',
    repo,
    '--state',
    'open',
    '--limit',
    '200',
    '--json',
    PR_FIELDS.join(','),
  ])
  return prs.filter(
    (pr) => pr.labels.some((l) => l.name === label) || pr.files.some((f) => f.path.startsWith('modules/')),
  )
}

export async function triage(gh: Gh, repo: string, catalog: Catalog): Promise<TriageLine[]> {
  const prs = await listNewEntryPrs(gh, repo)
  const out: TriageLine[] = []
  for (const pr of [...prs].sort((a, b) => a.number - b.number)) out.push(await triagePr(pr, { gh, catalog }))
  return out
}

/** One line per PR: number, verdict, CI, locator(s), flags; reasons on the following indented lines. */
export function renderLines(lines: readonly TriageLine[], withReasons = true): string {
  if (lines.length === 0) return 'No open pull requests that add or change an entry.'
  const w = Math.max(...lines.map((l) => String(l.number).length))
  const out: string[] = []
  for (const l of lines) {
    const loc = l.locators.join(', ') || '(no descriptor)'
    out.push(
      `#${String(l.number).padEnd(w)}  ${l.verdict.padEnd(7)}  ci:${l.ci.padEnd(7)}  ${loc}${l.flags.length ? `  [${l.flags.join(', ')}]` : ''}`,
    )
    if (withReasons) for (const r of l.reasons) out.push(`${' '.repeat(w + 3)}- ${r}`)
  }
  const ready = lines.filter((l) => l.verdict === 'ready').length
  out.push(`${lines.length} open, ${ready} ready to merge.`)
  return out.join('\n')
}

export interface MergeOutcome {
  number: number
  ok: boolean
  message: string
}

/** Squash-merges the ready PRs, each pinned to the head commit that was triaged. */
export async function mergeReady(gh: Gh, repo: string, lines: readonly TriageLine[]): Promise<MergeOutcome[]> {
  const out: MergeOutcome[] = []
  for (const l of lines.filter((x) => x.verdict === 'ready')) {
    const r = await gh([
      'pr',
      'merge',
      String(l.number),
      '--repo',
      repo,
      '--squash',
      '--match-head-commit',
      l.headRefOid,
    ])
    out.push({
      number: l.number,
      ok: r.code === 0,
      message: (r.code === 0 ? r.stdout : r.stderr || r.stdout).trim().split('\n')[0] ?? '',
    })
  }
  return out
}
