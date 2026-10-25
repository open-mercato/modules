// `yarn om triage [--merge [--yes]] [--repo <owner/name>]` (D29, spec 5.4): one line per open `new-entry` PR
// (number, verdict, validate check, locator, flags), then optionally a batch squash merge of the ready ones after
// a typed confirmation, from the curator's `gh` login. `--replay <session.json>` answers gh from a recording,
// `--record <session.json>` saves the live answers. Exit 0 ok, 1 a merge failed, 2 environment.
import { createInterface } from 'node:readline/promises'
import { resolve } from 'node:path'
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK, EXIT_VALIDATION } from '../cli.ts'
import { loadCatalog } from '../validate/catalog.ts'
import { liveGh, recordingGh, replayGh, type Gh } from '../validate/gh.ts'
import { mergeReady, renderLines, triage } from '../validate/triage.ts'
import { CATALOG_REPO } from '../core/home.ts'

export const description = 'one line per open new-entry PR; batch merge after confirmation'

interface Flags {
  repo: string
  merge: boolean
  yes: boolean
  replay: string | null
  record: string | null
}

function parse(args: readonly string[]): Flags {
  const f: Flags = {
    repo: process.env.GITHUB_REPOSITORY ?? CATALOG_REPO,
    merge: false,
    yes: false,
    replay: null,
    record: null,
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    const eq = a.indexOf('=')
    const key = eq > 0 ? a.slice(0, eq) : a
    const value = (): string => {
      const v = eq > 0 ? a.slice(eq + 1) : args[++i]
      if (!v) throw new Error(`${key} needs a value`)
      return v
    }
    if (key === '--repo') f.repo = value()
    else if (key === '--merge') f.merge = true
    else if (key === '--yes') f.yes = true
    else if (key === '--replay') f.replay = resolve(value())
    else if (key === '--record') f.record = resolve(value())
    else throw new Error(`unknown argument ${a}`)
  }
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(f.repo)) throw new Error(`--repo must be owner/name, got ${f.repo}`)
  return f
}

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await rl.question(question)).trim().toLowerCase() === 'yes'
  } finally {
    rl.close()
  }
}

export default async function triageCommand(ctx: CommandContext): Promise<number> {
  let f: Flags
  try {
    f = parse(ctx.args)
  } catch (err) {
    console.error(`triage: ${(err as Error).message}`)
    return EXIT_ENV
  }
  let gh: Gh = f.replay ? replayGh(f.replay) : liveGh()
  if (f.record && !f.replay) gh = recordingGh(gh, f.record)
  const catalog = await loadCatalog(ctx.root, resolve(ctx.flags.data))
  let lines
  try {
    lines = await triage(gh, f.repo, catalog)
  } catch (err) {
    console.error(`triage: ${(err as Error).message}`)
    return EXIT_ENV
  }
  const ready = lines.filter((l) => l.verdict === 'ready')
  if (ctx.flags.json && !f.merge) {
    console.log(JSON.stringify(lines, null, 2))
    return EXIT_OK
  }
  console.log(renderLines(lines))
  if (!f.merge || ready.length === 0) return EXIT_OK
  const list = ready.map((l) => `#${l.number}`).join(', ')
  const ok = f.yes || (await confirm(`Squash-merge ${ready.length} pull request(s) ${list} into ${f.repo}? Type yes: `))
  if (!ok) {
    console.log('Nothing merged.')
    return EXIT_OK
  }
  const results = await mergeReady(gh, f.repo, lines)
  for (const r of results) console.log(`#${r.number} ${r.ok ? 'merged' : `not merged: ${r.message}`}`)
  return results.every((r) => r.ok) ? EXIT_OK : EXIT_VALIDATION
}
