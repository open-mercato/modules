// `yarn om collect` (spec 5.3 "Job collect", 5.4). Three ways in, one state machine:
//   collect --run <id> [--wait-retry] [--no-apply] [--repo <owner/name>]   GitHub: Actions API + artifacts (+ retry)
//   collect --local <run dir> [--local <retry run dir>] [--no-apply]       preview runs from `yarn om cells-local`
//   collect --bundle <file>                                               apply a gathered night (data-branch replay)
// Gathering writes out/night.json and out/retry.json; applying appends receipts to .data/receipts/**, rewrites
// .data/presets.json and appends regressions to .data/changes/<yyyy-mm>.jsonl. A night whose run id is already in the
// receipts ends without changes.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK } from '../cli.ts'
import { HarnessLinesFile } from '../schema/policy.ts'
import { githubActionsApi } from '../receipts/actions-api.ts'
import { appendChanges, appendReceipts, readPresets, readReceiptStore, writePresets } from '../receipts/data.ts'
import type { NightBundle } from '../receipts/from-actions.ts'
import { gatherFromActions, gatherFromLocal, nightCollected, type GatherResult } from '../receipts/gather.ts'
import { applyNight } from '../receipts/state.ts'

export const description = 'receipts from a nightly run; .data/receipts'

interface Options {
  run: number | null
  local: string[]
  bundle: string | null
  waitRetry: boolean
  apply: boolean
  repo: string | null
}

export function parseArgs(args: string[]): Options | string {
  const o: Options = { run: null, local: [], bundle: null, waitRetry: false, apply: true, repo: null }
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    const eq = a.indexOf('=')
    const key = eq > 0 ? a.slice(0, eq) : a
    const value = (): string | undefined => (eq > 0 ? a.slice(eq + 1) : args[++i])
    if (key === '--wait-retry') o.waitRetry = true
    else if (key === '--no-apply') o.apply = false
    else if (key === '--attempt')
      value() // accepted for spec 5.4 compatibility; the attempt is read from the run title
    else if (key === '--run' || key === '--local' || key === '--bundle' || key === '--repo') {
      const v = value()
      if (!v) return `${key} needs a value`
      if (key === '--run') {
        if (!/^\d+$/.test(v)) return '--run: a run id'
        o.run = Number(v)
      } else if (key === '--local') o.local.push(resolve(v))
      else if (key === '--bundle') o.bundle = resolve(v)
      else o.repo = v
    } else return `unknown argument: ${a}`
  }
  const modes = [o.run !== null, o.local.length > 0, o.bundle !== null].filter(Boolean).length
  if (modes !== 1) return 'give exactly one of --run, --local, --bundle'
  return o
}

function summary(lines: string[]): void {
  for (const l of lines) console.log(l)
  const file = process.env.GITHUB_STEP_SUMMARY
  if (file) appendFileSync(file, lines.map((l) => `- ${l}\n`).join(''))
}

export function applyBundle(root: string, data: string, bundle: NightBundle): string[] {
  const store = readReceiptStore(data)
  if (nightCollected(store.all, bundle.night.id))
    return [`night ${bundle.night.id} is already in the receipts; no changes`]
  const harness = HarnessLinesFile.parse(parseYaml(readFileSync(join(root, 'harness', 'lines.yml'), 'utf8')))
  const res = applyNight({ bundle, history: store.history, harness, presets: readPresets(data) })
  appendReceipts(data, res.receipts)
  if (res.presets) writePresets(data, res.presets)
  appendChanges(data, res.changes)
  return [
    `night ${bundle.night.id}: ${res.receipts.length} receipt line(s) written, ${res.changes.length} regression(s)`,
    ...res.report,
    ...bundle.notes,
  ]
}

export default async function collect(ctx: CommandContext): Promise<number> {
  const o = parseArgs(ctx.args)
  if (typeof o === 'string') {
    console.error(`om collect: ${o}`)
    return EXIT_ENV
  }
  const data = resolve(ctx.flags.data)
  const out = resolve(ctx.flags.out)
  mkdirSync(out, { recursive: true })
  mkdirSync(data, { recursive: true })

  let bundle: NightBundle
  if (o.bundle) {
    if (!existsSync(o.bundle)) {
      console.error(`om collect: no ${o.bundle}`)
      return EXIT_ENV
    }
    bundle = JSON.parse(readFileSync(o.bundle, 'utf8')) as NightBundle
  } else {
    const store = readReceiptStore(data)
    let res: GatherResult
    if (o.local.length > 0) {
      res = gatherFromLocal(o.local, { history: store.history, allReceipts: store.all })
    } else {
      const repo = o.repo ?? process.env.GITHUB_REPOSITORY
      const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN
      if (!repo || !token) {
        console.error('om collect: --run needs GITHUB_REPOSITORY (or --repo) and GH_TOKEN')
        return EXIT_ENV
      }
      res = await gatherFromActions(o.run as number, {
        api: githubActionsApi({ repo, token }),
        history: store.history,
        allReceipts: store.all,
        artifactsRoot: join(out, 'artifacts'),
        waitRetry: o.waitRetry,
        log: (l) => console.error(`om collect: ${l}`),
      })
    }
    if (res.kind !== 'bundle') {
      summary([`collect: ${res.reason}; no changes`])
      writeFileSync(join(out, 'retry.json'), `${JSON.stringify({ keys: [], skipped: res.reason }, null, 2)}\n`)
      return EXIT_OK
    }
    bundle = res.bundle
    writeFileSync(join(out, 'night.json'), `${JSON.stringify(bundle)}\n`)
    writeFileSync(
      join(out, 'retry.json'),
      `${JSON.stringify({ night: bundle.night.id, keys: bundle.retry, collected: bundle.attempts.length > 1 }, null, 2)}\n`,
    )
  }
  // Preview receipts (runner preview-docker, from Cezar or another Docker host) never go to the real data branch: the
  // CI collect refuses them (docs/RUNBOOK.md). applyNight also reads only history of the bundle's runner.
  if (bundle.runner === 'preview-docker' && process.env.GITHUB_ACTIONS === 'true') {
    console.error('om collect: a preview-docker night is not written to the data branch on GitHub Actions')
    return EXIT_ENV
  }
  if (!o.apply) {
    summary([`collect: gathered night ${bundle.night.id} (${bundle.attempts.length} attempt(s)), not applied`])
    return EXIT_OK
  }
  summary(applyBundle(ctx.root, data, bundle))
  return EXIT_OK
}
