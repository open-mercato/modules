// `yarn om cells-local` (preview mode, WP07 adaptation): run cells of out/matrix.json in Docker, locally or on any host
// with Docker over ssh, through harness/local/run-cell.sh (same ladder, steps.sh, conditions and timeouts as the
// `cell` job). The result is a preview run directory in the shape `collect` reads from GitHub:
//   <out>/preview/<run id>/run.json            like GET /actions/runs/{id} (runner: preview-docker)
//   <out>/preview/<run id>/jobs.json           like GET /actions/runs/{id}/jobs (step conclusions from exit codes)
//   <out>/preview/<run id>/artifacts/<name>/   matrix-a<n>/matrix.json and cell-<key12>-<line>-a<n>/ (logs, JSON)
// then: yarn om collect --local <run dir> [--local <retry run dir>]
//
//   yarn om cells-local [--matrix out/matrix.json] [--cells <keys>] [--host <ssh target>|local] [--attempt <n>]
//     [--parent <run id>] [--remote-dir om-cells] [--yarn-cache <volume>|none] [--min-free-gb 8] [--until <step>]
//     [--shard <i>/<n>] [--memory <n>g] [--keep] [--keep-generated] [--dry-run]
// `--shard i/n` runs every n-th cell of the selection (the baselines all in shard 1, first), so n processes started
// together share one matrix: each has its own run id and remote directory. The run id is the start second plus i - 1,
// claimed with an exclusive mkdir of <out>/preview/<id> (and of <remote-dir>/<id> on the host): a process that finds it
// taken takes the next id, so two retries started in the same second never share a run (review of 24 Oct). A cell of the
// classic preset takes about 15 minutes and needs its 10 GB (`--memory`, default 10g: at 8g the build of a classic
// baseline lost its type check to the limit, 24 Oct); start the shards a few minutes apart (scripts/preview-night.sh),
// as many as the host has 10 GB of free memory for.
// Only shard 1 has the baselines: collect it first, so the other shards' retry keys read today's baseline.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK } from '../cli.ts'
import { runTitle, NIGHTLY_PATH, type ApiJob, type ApiRun } from '../receipts/from-actions.ts'
import { cellArtifactName, cellJobName, Matrix, matrixArtifactName, type MatrixCell } from '../receipts/matrix.ts'

export const description = 'preview: run matrix cells in Docker (local or ssh host) for collect --local'

interface Options {
  matrix: string
  cells: string[]
  host: string
  attempt: number
  parent: number | null
  remoteDir: string
  yarnCache: string
  minFreeGb: number
  until: string | null
  shard: { i: number; n: number } | null
  /** Memory limit of one cell container (`docker run --memory`), e.g. `10g`. */
  memory: string
  keep: boolean
  keepGenerated: boolean
  dryRun: boolean
}

export function parseArgs(args: string[], out: string): Options | string {
  const o: Options = {
    matrix: join(out, 'matrix.json'),
    cells: [],
    host: 'local',
    attempt: 1,
    parent: null,
    remoteDir: 'om-cells',
    yarnCache: 'om-preview-yarn-cache',
    minFreeGb: 8,
    until: null,
    shard: null,
    memory: '10g',
    keep: false,
    keepGenerated: false,
    dryRun: false,
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (a === '--keep') o.keep = true
    else if (a === '--keep-generated') o.keepGenerated = true
    else if (a === '--dry-run') o.dryRun = true
    else {
      const v = args[++i]
      if (v === undefined) return `${a} needs a value`
      if (a === '--matrix') o.matrix = resolve(v)
      else if (a === '--cells') o.cells = v.split(/[\s,]+/).filter(Boolean)
      else if (a === '--host') o.host = v
      else if (a === '--attempt') o.attempt = Number(v)
      else if (a === '--parent') o.parent = Number(v)
      else if (a === '--remote-dir') o.remoteDir = v
      else if (a === '--yarn-cache') o.yarnCache = v
      else if (a === '--min-free-gb') o.minFreeGb = Number(v)
      else if (a === '--until') o.until = v
      else if (a === '--memory') o.memory = v
      else if (a === '--shard') {
        const m = /^(\d+)\/(\d+)$/.exec(v)
        if (!m || Number(m[1]) < 1 || Number(m[1]) > Number(m[2])) return '--shard: <i>/<n> with 1 <= i <= n'
        o.shard = { i: Number(m[1]), n: Number(m[2]) }
      } else return `unknown argument: ${a}`
    }
  }
  if (!Number.isInteger(o.attempt) || o.attempt < 1) return '--attempt: a positive integer'
  if (o.attempt > 1 && !o.parent) return '--attempt > 1 needs --parent <run id of the night>'
  if (!/^[A-Za-z0-9_.@-]+$/.test(o.host)) return '--host: an ssh target or local'
  if (!/^[A-Za-z0-9_.\/-]+$/.test(o.remoteDir)) return '--remote-dir: a relative path'
  if (!/^([a-z0-9][a-z0-9_.-]*|none)$/.test(o.yarnCache)) return '--yarn-cache: a volume name or none'
  if (o.until && !/^[a-z]+$/.test(o.until)) return '--until: a step name'
  if (!/^[1-9][0-9]?g$/.test(o.memory)) return '--memory: gigabytes, e.g. 8g'
  return o
}

/** Cells of shard i of n: the baselines all in shard 1 (first, as in the matrix), the rest round-robin in matrix order. */
export function shardOf(cells: readonly MatrixCell[], i: number, n: number): MatrixCell[] {
  const base = cells.filter((c) => c.baseline)
  const rest = cells.filter((c) => !c.baseline)
  return [...(i === 1 ? base : []), ...rest.filter((_, k) => k % n === i - 1)]
}

/** Shell-safe env file for run-cell.sh: every value matches the matrix schema, so none contains a quote. */
export function cellEnv(c: MatrixCell): string {
  const v: Record<string, string> = {
    KEY12: c.key12,
    LINE: c.line,
    BASELINE: c.baseline ? '1' : '0',
    OM_VERSION: c.omVersion,
    PRESET: c.preset,
    MODULE_SPEC: c.moduleSpec ?? '',
    MODULE_NPM: c.moduleNpm ?? '',
    MODULE_IDS: c.moduleIds.join(' '),
    MODULE_FLAG: c.moduleFlag ?? '',
    THIRD_PARTY: c.thirdParty ? '1' : '0',
    REQUIRES_SPECS: c.requiresSpecs.join(' '),
    REPLACES: c.replaces.join(' '),
    PATCHES: c.patches.join(' '),
    MODE: c.mode,
    SMOKE_API: c.smokeApi ?? '',
    BACKEND_PAGE: c.backendPage ?? '',
    SMOKE_PATHS: c.smokePaths.join(' '),
    SMOKE_PRESET: c.presetSmoke.join(' '),
  }
  return Object.entries(v)
    .map(([k, x]) => {
      if (/['\n]/.test(x)) throw new Error(`unsafe value for ${k}`)
      return `${k}='${x}'`
    })
    .join('\n')
    .concat('\n')
}

function sh(cmd: string, args: string[], opts: { capture?: boolean } = {}): { code: number; out: string } {
  const r = spawnSync(cmd, args, { stdio: opts.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', encoding: 'utf8' })
  return { code: r.status ?? 2, out: typeof r.stdout === 'string' ? r.stdout : '' }
}

/** Run ids tried before `claimRunId` gives up (a directory of every id taken means something else is wrong). */
export const RUN_ID_TRIES = 100

/**
 * The first free run id from `base` up: `<out>/preview/<id>` made with an exclusive mkdir (no `recursive`), so of two
 * processes that start in the same second only one gets an id; the other takes the next. `remote(id)` claims the same
 * id on the host the same way: true when claimed, false when taken (the local directory is then given back and the next
 * id tried), or a message to stop with. Null after RUN_ID_TRIES ids.
 */
export function claimRunId(
  out: string,
  base: number,
  remote: (id: number) => true | false | string = () => true,
): number | null | string {
  const parent = join(out, 'preview')
  mkdirSync(parent, { recursive: true })
  for (let id = base; id < base + RUN_ID_TRIES; id++) {
    const dir = join(parent, String(id))
    try {
      mkdirSync(dir)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') continue
      throw e
    }
    const r = remote(id)
    if (r === true) return id
    rmdirSync(dir)
    if (typeof r === 'string') return r
  }
  return null
}

function iso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export default function cellsLocal(ctx: CommandContext): number {
  const out = resolve(ctx.flags.out)
  const o = parseArgs(ctx.args, out)
  if (typeof o === 'string') {
    console.error(`om cells-local: ${o}`)
    return EXIT_ENV
  }
  if (!existsSync(o.matrix)) {
    console.error(`om cells-local: no ${o.matrix}; run yarn om plan-matrix --runner preview-docker first`)
    return EXIT_ENV
  }
  const source = Matrix.parse(JSON.parse(readFileSync(o.matrix, 'utf8')))
  if (source.runner !== 'preview-docker') {
    // Preview cells have keys of their own (cell-key.ts); a CI plan would give preview receipts the ids of CI ones.
    console.error(
      `om cells-local: ${o.matrix} was planned for ${source.runner}; run yarn om plan-matrix --runner preview-docker`,
    )
    return EXIT_ENV
  }
  const pick = (c: MatrixCell) =>
    o.cells.length === 0 || o.cells.some((s) => s === c.key || s === c.key12 || s === c.locator)
  const selected = source.cells.filter(pick)
  const cells = o.shard ? shardOf(selected, o.shard.i, o.shard.n) : selected
  if (cells.length === 0) {
    console.error('om cells-local: no cell selected')
    return EXIT_ENV
  }
  // one run id per process, also for streams and retries started in the same second (review of 24 Oct: two retries
  // got one id, wrote one run directory and removed each other's remote directory)
  const claimed = claimRunId(
    out,
    Math.floor(Date.now() / 1000) + (o.shard ? o.shard.i - 1 : 0),
    o.host === 'local' || o.dryRun
      ? undefined
      : (id) => {
          // mkdir without -p on the last level: exit 10 when another process holds the id there
          const d = `${o.remoteDir}/${id}`
          const r = sh('ssh', [
            o.host,
            `mkdir -p ${o.remoteDir} && if mkdir ${d} 2>/dev/null; then exit 0; elif [ -e ${d} ]; then exit 10; else exit 2; fi`,
          ])
          return r.code === 0 ? true : r.code === 10 ? false : `ssh ${o.host}: cannot make ${d} (exit ${r.code})`
        },
  )
  if (typeof claimed !== 'number') {
    console.error(`om cells-local: no run id: ${claimed ?? `${RUN_ID_TRIES} ids taken in ${join(out, 'preview')}`}`)
    return EXIT_ENV
  }
  const runId = claimed
  const runDir = join(out, 'preview', String(runId))
  const artifacts = join(runDir, 'artifacts')
  const matrix: Matrix = { ...source, attempt: o.attempt, cells }
  mkdirSync(join(artifacts, matrixArtifactName(o.attempt)), { recursive: true })
  writeFileSync(join(artifacts, matrixArtifactName(o.attempt), 'matrix.json'), `${JSON.stringify(matrix, null, 2)}\n`)
  console.error(`om cells-local: run ${runId}, ${cells.length} cell(s) on ${o.host}, attempt ${o.attempt}`)
  if (o.dryRun) {
    for (const c of cells) console.log(`${cellJobName(c)}  ${c.label}`)
    console.log(`dry run: ${runDir}`)
    return EXIT_OK
  }

  const harness = join(ctx.root, 'harness')
  const remote = `${o.remoteDir}/${runId}`
  if (o.host !== 'local') {
    if (sh('ssh', [o.host, `mkdir -p ${remote}/env ${remote}/artifacts`]).code !== 0) return EXIT_ENV
    if (sh('rsync', ['-a', '--delete', `${harness}/`, `${o.host}:${remote}/harness/`]).code !== 0) return EXIT_ENV
  }
  const started = iso()
  // run-cell.sh exits 3 when the cell network cannot be fenced or the isolation probe finds the host reachable. The
  // cells that ran before (each behind its own probe) are still assembled below, so collect reads them (review of 24
  // Oct: a stream that stopped early printed no run directory and its cells were never collected).
  let fenceFailed = false
  let stopped: string | null = null
  for (const c of cells) {
    const name = cellArtifactName(c, o.attempt)
    const envText = cellEnv(c)
    const extra = [
      `HARNESS_KEEP_GENERATED=${o.keepGenerated ? 1 : 0}`,
      `HARNESS_RO_NODE_MODULES=${process.env.HARNESS_RO_NODE_MODULES === '0' ? 0 : 1}`,
    ]
    const flags = ['--attempt', String(o.attempt), '--yarn-cache', o.yarnCache, '--memory', o.memory]
    if (o.until) flags.push('--until', o.until)
    if (o.keep) flags.push('--keep')
    console.error(`om cells-local: ${c.label} (${name})`)
    if (o.host === 'local') {
      const envFile = join(runDir, 'env', `${name}.env`)
      mkdirSync(join(runDir, 'env'), { recursive: true })
      writeFileSync(envFile, envText)
      const r = sh('env', [
        ...extra,
        'bash',
        join(harness, 'local', 'run-cell.sh'),
        '--env',
        envFile,
        '--out',
        join(artifacts, name),
        ...flags,
      ])
      if (r.code === 3) {
        fenceFailed = true
        break
      }
      continue
    }
    const free = sh('ssh', [o.host, "df -Pk / | awk 'NR==2 {print $4}'"], { capture: true })
    const freeGb = Number(free.out.trim()) / 1024 / 1024
    if (!(freeGb >= o.minFreeGb)) {
      stopped = `${o.host} has ${freeGb.toFixed(1)} GB free (< ${o.minFreeGb}); stopped before ${c.label}`
      break
    }
    const put = spawnSync('ssh', [o.host, `cat > ${remote}/env/${name}.env`], {
      input: envText,
      stdio: ['pipe', 'inherit', 'inherit'],
    })
    if (put.status !== 0) {
      stopped = `ssh ${o.host} failed before ${c.label}`
      break
    }
    const r = sh('ssh', [
      o.host,
      `env ${extra.join(' ')} bash ${remote}/harness/local/run-cell.sh --env ${remote}/env/${name}.env --out ${remote}/artifacts/${name} ${flags.join(' ')}`,
    ])
    mkdirSync(join(artifacts, name), { recursive: true })
    sh('rsync', ['-a', `${o.host}:${remote}/artifacts/${name}/`, `${join(artifacts, name)}/`])
    if (r.code === 3) {
      fenceFailed = true
      break
    }
  }
  if (o.host !== 'local' && !o.keep) sh('ssh', [o.host, `rm -rf ${remote}`])
  if (fenceFailed)
    console.error(
      'om cells-local: the cell network could not be isolated from the host (see _runner.log); no cell was run after that. Fix the host or use a throwaway VM (docs/RUNBOOK.md). The cells that ran before are assembled.',
    )
  if (stopped) console.error(`om cells-local: ${stopped}; the cells that ran before are assembled.`)

  // Assemble the Actions-shaped files.
  const jobs: ApiJob[] = []
  let n = 0
  for (const dir of readdirSync(artifacts).sort()) {
    const f = join(artifacts, dir, 'job.json')
    if (!existsSync(f)) continue
    const j = JSON.parse(readFileSync(f, 'utf8')) as ApiJob
    n++
    jobs.push({ ...j, id: runId * 1000 + n, run_id: runId, html_url: pathToFileURL(join(artifacts, dir)).href + '/' })
  }
  // after an early stop the matrix of the run holds the cells that ran only: a cell never started is no job that went
  // missing (collect would write it `infra-error`), it waits for the next run
  if (fenceFailed || stopped) {
    const ran = cells.filter((c) => existsSync(join(artifacts, cellArtifactName(c, o.attempt), 'job.json')))
    writeFileSync(
      join(artifacts, matrixArtifactName(o.attempt), 'matrix.json'),
      `${JSON.stringify({ ...matrix, cells: ran }, null, 2)}\n`,
    )
    console.error(`om cells-local: ${ran.length} of ${cells.length} cell(s) ran; the matrix of the run holds those`)
  }
  const failed = jobs.some((j) => j.conclusion !== 'success')
  const run: ApiRun & { runner: string; run_attempt: number } = {
    id: runId,
    path: NIGHTLY_PATH,
    head_branch: 'main',
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: failed ? 'failure' : 'success',
    html_url: pathToFileURL(runDir).href + '/',
    created_at: started,
    run_started_at: started,
    updated_at: iso(),
    display_title: runTitle(o.attempt, o.parent),
    runner: 'preview-docker',
    run_attempt: 1,
  }
  writeFileSync(join(runDir, 'jobs.json'), `${JSON.stringify({ total_count: jobs.length, jobs }, null, 2)}\n`)
  writeFileSync(join(runDir, 'run.json'), `${JSON.stringify(run, null, 2)}\n`)
  for (const j of jobs) console.log(`${j.name}: ${j.conclusion}`)
  console.log(`preview run: ${runDir}`)
  console.log(
    o.parent
      ? `next: yarn om collect --local <run dir of night ${o.parent}> --local ${runDir}`
      : `next: yarn om collect --local ${runDir}`,
  )
  return fenceFailed || stopped ? EXIT_ENV : EXIT_OK
}
