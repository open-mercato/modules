// Shared setup of the sync, discover and watch commands: own flags, HTTP mode, clock, data-branch commit.
import { resolve, join } from 'node:path'
import type { CommandContext } from '../cli.ts'
import { writeDataBranch } from './data-branch.ts'
import { slimDepsDev } from './depsdev.ts'
import { githubToken, slimSearch, slimTree } from './github.ts'
import { createHttp, type Http } from './http.ts'
import { slimListing } from './jsdelivr.ts'
import { slimPackument } from './npm.ts'
import { CATALOG_REPO } from '../core/home.ts'

export interface SourceFlags {
  modulesDir: string
  policyDir: string
  dataDir: string
  outDir: string
  record: boolean
  /** `--commit <message>`: run the write through data-branch.ts on the checkout in `--data`. */
  commit: string | null
  changed: string | null
  all: boolean
  keepalive: boolean
  positional: string[]
}

export function parseSourceFlags(ctx: CommandContext): SourceFlags {
  const f: SourceFlags = {
    modulesDir: join(ctx.root, 'modules'),
    policyDir: join(ctx.root, 'policy'),
    dataDir: resolve(ctx.flags.data),
    outDir: resolve(ctx.flags.out),
    record: false,
    commit: null,
    changed: null,
    all: false,
    keepalive: false,
    positional: [],
  }
  const a = ctx.args
  for (let i = 0; i < a.length; i++) {
    const arg = a[i] as string
    const eq = arg.indexOf('=')
    const key = eq > 0 ? arg.slice(0, eq) : arg
    const inline = eq > 0 ? arg.slice(eq + 1) : undefined
    const value = () => {
      const v = inline ?? a[++i]
      if (v === undefined || v === '') throw new Error(`${key} needs a value`)
      return v
    }
    if (key === '--modules') f.modulesDir = resolve(value())
    else if (key === '--policy') f.policyDir = resolve(value())
    else if (key === '--record') f.record = true
    else if (key === '--commit') f.commit = value()
    else if (key === '--changed') f.changed = value()
    else if (key === '--all') f.all = true
    else if (key === '--keepalive') f.keepalive = true
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`)
    else f.positional.push(arg)
  }
  return f
}

/** Recordings for `--offline` and `--record`: OM_HTTP_FIXTURES or test/fixtures/http. */
export function fixturesDir(root: string): string {
  return process.env.OM_HTTP_FIXTURES ? resolve(process.env.OM_HTTP_FIXTURES) : join(root, 'test', 'fixtures', 'http')
}

export function makeHttp(ctx: CommandContext, f: SourceFlags): Http {
  return createHttp({
    offline: ctx.flags.offline,
    record: f.record,
    fixturesDir: ctx.flags.offline || f.record ? fixturesDir(ctx.root) : null,
    githubToken: ctx.flags.offline ? null : githubToken(),
    slimmers: [slimPackument, slimListing, slimDepsDev, slimTree, slimSearch],
  })
}

/** OM_NOW pins the clock (tests and replays). */
export function now(): Date {
  const env = process.env.OM_NOW
  const d = env ? new Date(env) : new Date()
  if (Number.isNaN(d.getTime())) throw new Error(`OM_NOW is not a date: ${env}`)
  return d
}

export function modulesRepo(): string {
  return process.env.GITHUB_REPOSITORY ?? CATALOG_REPO
}

/** Runs `work` directly, or through data-branch.ts when `--commit` is given (fetch, reset, work, commit, push; 3 attempts). */
export async function withData(f: SourceFlags, work: () => Promise<void>): Promise<void> {
  if (!f.commit) return work()
  const res = await writeDataBranch({ dir: f.dataDir, message: f.commit, log: (l) => console.error(l) }, () => work())
  console.error(res.committed ? `committed ${res.sha} on data` : 'data: no changes')
}
