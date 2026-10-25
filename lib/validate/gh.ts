// `gh` CLI runner for `triage`, with recording and replay (tests run on recorded answers, never on the network).
// A session file is a JSON array of `{ args, code, stdout, stderr }`; replay matches `args` exactly.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface GhResult {
  code: number
  stdout: string
  stderr: string
}

export type Gh = (args: readonly string[]) => Promise<GhResult>

export interface GhRecording extends GhResult {
  args: string[]
}

export class GhReplayMiss extends Error {}

/** Runs the real `gh` (needs `gh auth login` with the curator account for merges). */
export function liveGh(bin = 'gh'): Gh {
  return (args) =>
    new Promise((res, rej) => {
      const child = spawn(bin, [...args], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, GH_PROMPT_DISABLED: '1' },
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (b: Buffer) => (stdout += b.toString('utf8')))
      child.stderr.on('data', (b: Buffer) => (stderr += b.toString('utf8')))
      child.on('error', rej)
      child.on('close', (code) => res({ code: code ?? 1, stdout, stderr }))
    })
}

/** Replays a recorded session. `calls` collects every invocation (tests assert on merges). */
export function replayGh(file: string, calls: string[][] = []): Gh {
  const session = JSON.parse(readFileSync(file, 'utf8')) as GhRecording[]
  return async (args) => {
    calls.push([...args])
    const hit = session.find((r) => r.args.length === args.length && r.args.every((a, i) => a === args[i]))
    if (!hit) throw new GhReplayMiss(`no recorded gh answer for: gh ${args.join(' ')}`)
    return { code: hit.code, stdout: hit.stdout, stderr: hit.stderr }
  }
}

/** Wraps a runner and appends every answer to a session file. */
export function recordingGh(inner: Gh, file: string): Gh {
  const session: GhRecording[] = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as GhRecording[]) : []
  return async (args) => {
    const res = await inner(args)
    const i = session.findIndex((r) => r.args.join('\0') === args.join('\0'))
    const rec = { args: [...args], ...res }
    if (i >= 0) session[i] = rec
    else session.push(rec)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify(session, null, 2)}\n`)
    return res
  }
}

/** Runs gh and parses JSON stdout; throws with gh's own message on a non-zero exit. */
export async function ghJson<T>(gh: Gh, args: readonly string[]): Promise<T> {
  const r = await gh(args)
  if (r.code !== 0)
    throw new Error(`gh ${args.slice(0, 3).join(' ')} failed: ${(r.stderr || r.stdout).trim().split('\n')[0]}`)
  return JSON.parse(r.stdout) as T
}
