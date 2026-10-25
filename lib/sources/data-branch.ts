// Writes to the `data` branch (spec 5.1): `git fetch origin data` -> `git reset --hard origin/data` -> run the write
// again on the fresh tree (the write is idempotent with respect to its inputs: npm, APIs, artifacts) -> commit -> push;
// 3 attempts. Jobs writing to `data` have no shared concurrency group, so a rejected push is expected and the whole
// write is replayed from the new head instead of being rebased (health/**, changes/**, radar/** have several writers).
//
// CLI (for workflows that chain several commands):
//   node lib/sources/data-branch.ts --dir .data --message "chore(data): watch <iso>" [--attempts 3]
//     [--remote origin] [--branch data] [--no-push] -- <command> [args...]
// The command runs from the current directory with the data checkout in `--dir`; a non-zero exit aborts without a commit.
import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export interface DataBranchOptions {
  /** The checkout of the data branch (a clone or a `git worktree`), e.g. `.data`. */
  dir: string
  message: string
  remote?: string
  branch?: string
  attempts?: number
  push?: boolean
  /** Commit identity; default: the repository's git config, else github-actions[bot]. */
  author?: { name: string; email: string }
  log?: (line: string) => void
}

export interface DataBranchResult {
  committed: boolean
  attempts: number
  sha: string | null
}

export class DataBranchError extends Error {}

const BOT = { name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' }

async function git(dir: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', ['-C', dir, ...args], {
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  return stdout.trim()
}

async function gitOk(dir: string, args: string[]): Promise<boolean> {
  try {
    await git(dir, args)
    return true
  } catch {
    return false
  }
}

async function identity(
  dir: string,
  given?: { name: string; email: string },
): Promise<{ name: string; email: string }> {
  if (given) return given
  const name = await git(dir, ['config', 'user.name']).catch(() => '')
  const email = await git(dir, ['config', 'user.email']).catch(() => '')
  return name && email ? { name, email } : BOT
}

/** Resets `dir` to the remote head of the branch, or to an empty orphan tree when the branch does not exist yet. */
export async function resetToRemote(dir: string, remote = 'origin', branch = 'data'): Promise<'existing' | 'orphan'> {
  const exists = await gitOk(dir, ['ls-remote', '--exit-code', '--heads', remote, branch])
  if (exists) {
    await git(dir, ['fetch', '--quiet', remote, `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`])
    await git(dir, ['checkout', '--quiet', '--detach', '--force', `${remote}/${branch}`])
    await git(dir, ['reset', '--quiet', '--hard', `${remote}/${branch}`])
    await git(dir, ['clean', '-fdq'])
    return 'existing'
  }
  await git(dir, ['checkout', '--quiet', '--force', '--orphan', `om-data-${process.pid}-${Date.now()}`])
  await git(dir, ['rm', '-rfq', '--cached', '--ignore-unmatch', '.'])
  await git(dir, ['clean', '-fdq'])
  return 'orphan'
}

/**
 * Runs `write(dir)` on a fresh copy of the data branch, commits and pushes, replaying everything after a rejected
 * push. Returns `committed: false` when the write changed nothing.
 */
export async function writeDataBranch(
  opts: DataBranchOptions,
  write: (dir: string) => Promise<void> | void,
): Promise<DataBranchResult> {
  const dir = resolve(opts.dir)
  const remote = opts.remote ?? 'origin'
  const branch = opts.branch ?? 'data'
  const attempts = opts.attempts ?? 3
  const log = opts.log ?? (() => {})
  if (!existsSync(dir)) throw new DataBranchError(`data checkout ${dir} does not exist`)
  const who = await identity(dir, opts.author)
  let lastErr: unknown = null
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const state = await resetToRemote(dir, remote, branch)
    log(
      `data-branch: attempt ${attempt}, ${state === 'existing' ? `based on ${remote}/${branch}` : 'new orphan branch'}`,
    )
    await write(dir)
    await git(dir, ['add', '-A'])
    if (await gitOk(dir, ['diff', '--cached', '--quiet'])) {
      log('data-branch: nothing to commit')
      return { committed: false, attempts: attempt, sha: null }
    }
    await git(dir, [
      '-c',
      `user.name=${who.name}`,
      '-c',
      `user.email=${who.email}`,
      'commit',
      '--quiet',
      '--no-verify',
      '-m',
      opts.message,
    ])
    const sha = await git(dir, ['rev-parse', 'HEAD'])
    if (opts.push === false) return { committed: true, attempts: attempt, sha }
    try {
      await git(dir, ['push', '--quiet', remote, `HEAD:refs/heads/${branch}`])
      log(`data-branch: pushed ${sha.slice(0, 12)}`)
      return { committed: true, attempts: attempt, sha }
    } catch (err) {
      lastErr = err
      log(`data-branch: push rejected (attempt ${attempt}), replaying the write on the new head`)
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message.split('\n')[0] : String(lastErr)
  throw new DataBranchError(`push to ${remote}/${branch} failed after ${attempts} attempts: ${msg}`)
}

/** Runs a command and resolves with its exit code. */
export function runCommand(cmd: string, args: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { stdio: 'inherit', env })
    child.on('error', rej)
    child.on('close', (code) => res(code ?? 1))
  })
}

interface CliArgs {
  dir: string
  message: string
  remote: string
  branch: string
  attempts: number
  push: boolean
  command: string[]
}

export function parseCliArgs(argv: string[]): CliArgs {
  const sep = argv.indexOf('--')
  const own = sep >= 0 ? argv.slice(0, sep) : argv
  const command = sep >= 0 ? argv.slice(sep + 1) : []
  const out: CliArgs = { dir: '.data', message: '', remote: 'origin', branch: 'data', attempts: 3, push: true, command }
  for (let i = 0; i < own.length; i++) {
    const a = own[i] as string
    const next = () => {
      const v = own[++i]
      if (v === undefined) throw new Error(`${a} needs a value`)
      return v
    }
    if (a === '--dir') out.dir = next()
    else if (a === '--message' || a === '-m') out.message = next()
    else if (a === '--remote') out.remote = next()
    else if (a === '--branch') out.branch = next()
    else if (a === '--attempts') out.attempts = Number(next())
    else if (a === '--no-push') out.push = false
    else throw new Error(`unknown option ${a}`)
  }
  if (!out.message) throw new Error('--message is required')
  if (out.command.length === 0) throw new Error('a command after -- is required')
  if (!Number.isInteger(out.attempts) || out.attempts < 1) throw new Error('--attempts must be a positive integer')
  return out
}

async function cli(argv: string[]): Promise<number> {
  let args: CliArgs
  try {
    args = parseCliArgs(argv)
  } catch (err) {
    console.error(`data-branch: ${(err as Error).message}`)
    return 2
  }
  const [cmd, ...rest] = args.command as [string, ...string[]]
  try {
    const res = await writeDataBranch(
      {
        dir: args.dir,
        message: args.message,
        remote: args.remote,
        branch: args.branch,
        attempts: args.attempts,
        push: args.push,
        log: (l) => console.error(l),
      },
      async () => {
        const code = await runCommand(cmd, rest)
        if (code !== 0) throw new DataBranchError(`command exited with ${code}`)
      },
    )
    console.error(
      res.committed ? `data-branch: committed ${res.sha} after ${res.attempts} attempt(s)` : 'data-branch: no changes',
    )
    return 0
  } catch (err) {
    console.error(`data-branch: ${(err as Error).message}`)
    return err instanceof DataBranchError && /command exited/.test((err as Error).message) ? 1 : 2
  }
}

if (import.meta.main) {
  cli(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
