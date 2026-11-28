// `yarn om www-content plan|read|apply` (Strapi CMS spec 2026-11-27-www-strapi-cms.md, API Contracts, `pages`
// workflow; Step 4.1): the steps of the `pages` build that decide which content the main site is built from, by
// lib/www-cms/source.ts.
//
// - `plan` (step Choose www content, no secret): from WWW_CONTENT_SOURCE and the inputs WWW_CONTENT_INPUT and
//   WWW_SNAPSHOT_INPUT alone. It writes `pull` (none, compare or replace) to GITHUB_OUTPUT and, when the build pulls
//   nothing, `use` (files or snapshot) and `commit`; a value outside its enum ends with exit 1. It reads no other
//   variable, so with WWW_CONTENT_SOURCE unset the build reads no secret and no Strapi.
// - `read --work <dir> [--snapshot-dir <dir> --snapshot-sha <sha> --snapshot-date <date>]` (step Read www content, the
//   only step with STRAPI_URL and STRAPI_READ_TOKEN): pulls the published content into <dir>/pulled, then decides.
//   `compare` (shadow) counts the files that differ from www/ and changes nothing; `replace` (strapi) lays the pull
//   over www/. A failed or invalid pull gives the snapshot or a failure as source.ts says. It writes `use`, `commit`,
//   `snapshot` (true when the snapshot job is to write <dir>/snapshot), `newest` and `issue`; a failure ends with exit 1.
//   For the issue of A9 (lib/www-cms/issue.ts, Step 4.2) it writes <dir>/issue/issue.md when the decision updates the
//   issue, and <dir>/issue/issue-failed.md when it would close it (the text for a publish build that fails later).
// - `apply --from <dir>` (step Use www snapshot, no secret): lays a snapshot tree over www/.
//
// `--www <dir>` (default `www`) is the site tree, for tests. Summary lines go to GITHUB_STEP_SUMMARY when it is set.
// Exit 0 done, 1 the build must stop (a failure of source.ts, a tree that is not one), 2 environment.
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK, EXIT_VALIDATION } from '../cli.ts'
import { differences, pull, PullEnvError, type PullReport } from '../www-cms/pull.ts'
import { createClient, StrapiError, tokenProblem } from '../www-cms/rest.ts'
import { buildFailedBody, issueBody, pullResultOf } from '../www-cms/issue.ts'
import { applyTree, snapshotTree } from '../www-cms/snapshot.ts'
import { decideContent, planContent, pullMode, type Decision, type PullResult } from '../www-cms/source.ts'
import { reportLines } from './www-pull.ts'

export const description = 'decide and read the content of the main site build (WWW_CONTENT_SOURCE); pages.yml steps'

type Env = Readonly<Record<string, string | undefined>>
interface Out {
  log: (s: string) => void
  error: (s: string) => void
}

/** The most files of a shadow difference listed in the summary; the count is always whole. */
const LIST_MAX = 50

interface Args {
  action: 'plan' | 'read' | 'apply'
  www: string
  work?: string
  from?: string
  snapshotDir?: string
  snapshotSha?: string
  snapshotDate?: string
}

const VALUED = ['--www', '--work', '--from', '--snapshot-dir', '--snapshot-sha', '--snapshot-date'] as const

export function parseArgs(argv: readonly string[]): Args {
  const [action, ...rest] = argv
  if (action !== 'plan' && action !== 'read' && action !== 'apply')
    throw new Error('the first argument is plan, read or apply')
  const a: Args = { action, www: 'www' }
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!
    const eq = arg.indexOf('=')
    const key = eq > 0 ? arg.slice(0, eq) : arg
    if (!(VALUED as readonly string[]).includes(key)) throw new Error(`unknown argument ${arg}`)
    const v = eq > 0 ? arg.slice(eq + 1) : rest[++i]
    if (v === undefined || v === '') throw new Error(`${key} needs a value`)
    if (key === '--www') a.www = v
    else if (key === '--work') a.work = v
    else if (key === '--from') a.from = v
    else if (key === '--snapshot-dir') a.snapshotDir = v
    else if (key === '--snapshot-sha') a.snapshotSha = v
    else a.snapshotDate = v
  }
  if (action === 'read' && !a.work) throw new Error('read needs --work <dir>')
  if (action === 'apply' && !a.from) throw new Error('apply needs --from <dir>')
  const snap = [a.snapshotDir, a.snapshotSha, a.snapshotDate].filter((x) => x !== undefined).length
  if (snap !== 0 && snap !== 3) throw new Error('--snapshot-dir, --snapshot-sha and --snapshot-date go together')
  return a
}

/** Appends `key=value` lines to the file of GITHUB_OUTPUT (or prints them without one); values are one line each. */
function outputs(env: Env, out: Out, values: Record<string, string>): void {
  const text = Object.entries(values)
    .map(([k, v]) => `${k}=${v.replace(/[\r\n]+/g, ' ')}\n`)
    .join('')
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, text)
  else for (const l of text.trimEnd().split('\n')) out.log(`output ${l}`)
}

/** Appends lines to the run summary when there is one. */
function summary(env: Env, lines: readonly string[]): void {
  if (env.GITHUB_STEP_SUMMARY && lines.length > 0) appendFileSync(env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n\n`)
}

/** A failure of the build, as an Actions error annotation (first line) and in full. */
function fail(out: Out, reason: string): number {
  const [first, ...rest] = reason.split('\n')
  out.error(`::error title=www content::${first}`)
  for (const l of rest) out.error(l)
  return EXIT_VALIDATION
}

/** The outputs of a decision for the later steps and jobs. */
function decisionOutputs(d: Decision, newest: string | null): Record<string, string> {
  return {
    use: d.use,
    commit: d.use === 'snapshot' ? d.commit : '',
    snapshot: d.use !== 'fail' && d.writeSnapshot ? 'true' : 'false',
    newest: newest ?? '',
    issue: d.issue,
  }
}

function plan(env: Env, out: Out): number {
  // only these three: the plan must not read a secret or the address of Strapi
  const variable = env.WWW_CONTENT_SOURCE
  const input = env.WWW_CONTENT_INPUT
  const snapshotCommit = env.WWW_SNAPSHOT_INPUT
  const p = planContent({ variable, input, snapshotCommit })
  if (p.pull !== 'none') {
    outputs(env, out, { pull: p.pull })
    out.log(`www content: Strapi is read (${p.pull === 'compare' ? 'shadow, compared only' : 'strapi'})`)
    return EXIT_OK
  }
  const d = p.decision
  if (d.use === 'fail') {
    outputs(env, out, { pull: 'none', use: 'fail', commit: '' })
    return fail(out, d.reason)
  }
  outputs(env, out, { pull: 'none', use: d.use, commit: d.use === 'snapshot' ? d.commit : '' })
  summary(env, d.summary)
  out.log(d.use === 'snapshot' ? `www content: snapshot ${d.commit}` : 'www content: the files of the commit')
  return EXIT_OK
}

/** What a pull gave, for source.ts: an environment failure is `unreachable` with its message. */
async function readStrapi(
  env: Env,
  root: string,
  www: string,
  pulled: string,
  snapshotDir: string | undefined,
): Promise<{ result: PullResult; report?: PullReport }> {
  const url = env.STRAPI_URL?.trim()
  const token = env.STRAPI_READ_TOKEN
  if (!url) return { result: { kind: 'unreachable', status: 'the variable STRAPI_URL is not set' } }
  if (!token) return { result: { kind: 'unreachable', status: 'the secret STRAPI_READ_TOKEN is not set' } }
  const bad = tokenProblem('STRAPI_READ_TOKEN', token)
  if (bad) return { result: { kind: 'unreachable', status: bad } }
  let report: PullReport
  try {
    report = await pull({
      client: createClient({ url, token }),
      root,
      out: pulled,
      // the removed-URL rule and the media cache read the last good snapshot, else the files of the checkout
      snapshot: snapshotDir ?? www,
      status: 'published',
      drafts: false,
      check: false,
    })
  } catch (err) {
    if (err instanceof StrapiError || err instanceof PullEnvError)
      return { result: { kind: 'unreachable', status: err.message } }
    if (err instanceof Error && err.message.startsWith('Invalid URL'))
      return { result: { kind: 'unreachable', status: 'STRAPI_URL is not an address' } }
    throw err
  }
  return { result: pullResultOf(report), report }
}

async function read(args: Args, env: Env, root: string, at: (p: string) => string, out: Out): Promise<number> {
  const mode = pullMode(env.WWW_CONTENT_SOURCE, env.WWW_CONTENT_INPUT)
  if (mode === 'none') {
    out.error('www-content: read runs only when the plan pulls Strapi')
    return EXIT_ENV
  }
  const www = at(args.www)
  const work = at(args.work!)
  const pulled = join(work, 'pulled')
  rmSync(pulled, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  const snapshotDir = args.snapshotDir === undefined ? undefined : at(args.snapshotDir)
  const { result, report } = await readStrapi(env, root, www, pulled, snapshotDir)

  let differ: string[] | undefined
  if (result.kind === 'good' && mode === 'compare') {
    differ = differences(pulled, www)
    result.differs = differ.length
  }
  const d = decideContent({
    variable: env.WWW_CONTENT_SOURCE,
    input: env.WWW_CONTENT_INPUT,
    snapshotCommit: env.WWW_SNAPSHOT_INPUT,
    pull: result,
    snapshot: args.snapshotSha ? { sha: args.snapshotSha, date: args.snapshotDate! } : undefined,
  })

  if (report) for (const l of reportLines(report)) out.log(l)
  else if (result.kind === 'unreachable') out.log(`www-pull: Strapi unreachable: ${result.status}`)
  const lines = d.use === 'fail' ? [`**Main site content: the build stops.** ${d.reason.split('\n')[0]}`] : d.summary
  const list =
    differ && differ.length > 0
      ? [
          '',
          ...differ.slice(0, LIST_MAX).map((p) => `- \`${p}\``),
          ...(differ.length > LIST_MAX ? [`- and ${differ.length - LIST_MAX} more`] : []),
        ]
      : []
  const problems = d.use === 'fail' ? d.reason.split('\n').slice(1) : []
  summary(env, [...lines, ...problems, ...list])

  outputs(env, out, decisionOutputs(d, report?.newest ?? null))
  const runUrl =
    env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
      : 'the run'
  const issueDir = join(work, 'issue')
  rmSync(issueDir, { recursive: true, force: true })
  if (d.issue !== 'none') mkdirSync(issueDir, { recursive: true })
  if (d.issue === 'update')
    writeFileSync(
      join(issueDir, 'issue.md'),
      issueBody({ decision: d, pull: result, input: env.WWW_CONTENT_INPUT ?? '', runUrl }),
    )
  if (d.issue === 'close') writeFileSync(join(issueDir, 'issue-failed.md'), buildFailedBody(runUrl))
  if (d.use === 'fail') return fail(out, d.reason)
  if (d.use === 'pull') {
    const n = applyTree(pulled, www)
    out.log(`www content: from Strapi, ${n.content} content files and ${n.media} media files`)
  }
  if (d.use !== 'snapshot' && d.writeSnapshot) snapshotTree(pulled, join(work, 'snapshot'))
  if (d.use === 'snapshot') out.log(`www content: snapshot ${d.commit}`)
  else if (d.use === 'files') out.log('www content: the files of the commit')
  return EXIT_OK
}

/** The command with its environment given: the tests pass their own. */
export async function runWwwContent(
  ctx: Pick<CommandContext, 'args' | 'root'>,
  env: Env,
  out: Out = console,
): Promise<number> {
  let args: Args
  try {
    args = parseArgs(ctx.args)
  } catch (err) {
    out.error(`www-content: ${(err as Error).message}`)
    return EXIT_ENV
  }
  const at = (p: string) => (isAbsolute(p) ? p : resolve(ctx.root, p))
  if (args.action === 'plan') return plan(env, out)
  if (args.action === 'read') return read(args, env, ctx.root, at, out)
  try {
    const n = applyTree(at(args.from!), at(args.www))
    out.log(`www content: snapshot laid over ${args.www}, ${n.content} content files and ${n.media} media files`)
    return EXIT_OK
  } catch (err) {
    return fail(out, (err as Error).message)
  }
}

export default function run(ctx: CommandContext): Promise<number> {
  return runWwwContent(ctx, process.env)
}
