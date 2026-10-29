// `yarn om fit [--om <ver,...>] [--modules <loc[@ver],...>] [--latest <ver>] [--cache <dir>] [--as-of <iso>]`
// Static fit of every package version in `.data/facts` against OM versions (default: all lines of
// `.data/lines.json`), written to `.data/fit/<om>.json` (spec 5.4). Existing cells of other modules are kept.
import { join, resolve } from 'node:path'
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK, EXIT_VALIDATION } from '../cli.ts'
import { FitResult } from '../schema/index.ts'
import type { FitCell } from '../schema/index.ts'
import { computeFit } from '../fit/compute.ts'
import {
  argValue,
  fitModuleOf,
  lineVersion,
  readAllFacts,
  readFit,
  readLines,
  unknownArgs,
  writeJson,
} from '../fit/data.ts'
import { createStore, StoreError } from '../fit/om-tarballs.ts'
import { SemVer } from '../schema/index.ts'

export const description = 'static fit of modules against Open Mercato versions'

const FLAGS = ['--om', '--modules', '--latest', '--cache', '--as-of']

/** `npm:@x/y@1.2.3` -> [`npm:@x/y`, `1.2.3`]; `npm:@x/y` -> [`npm:@x/y`, null]. */
export function splitModuleArg(s: string): [string, string | null] {
  const m = /^(.+?)@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(s)
  return m ? [m[1] as string, m[2] as string] : [s, null]
}

const list = (v: string | null): string[] =>
  v === null
    ? []
    : v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

export function countStatuses(cells: Readonly<Record<string, FitCell>>): Record<FitCell['status'], number> {
  const out = { ok: 0, drift: 0, 'no-fit': 0, unknown: 0 }
  for (const c of Object.values(cells)) out[c.status]++
  return out
}

export default async function fit(ctx: CommandContext): Promise<number> {
  const extra = unknownArgs(ctx.args, FLAGS)
  if (extra.length > 0) {
    console.error(`om fit: unknown arguments: ${extra.join(' ')}`)
    return EXIT_ENV
  }
  const data = resolve(ctx.flags.data)
  const lines = readLines(data)
  const versions = list(argValue(ctx.args, '--om'))
  if (versions.length === 0) versions.push(...(lines?.lines.map((l) => l.version) ?? []))
  if (versions.length === 0) {
    console.error(`om fit: no OM version. Pass --om <version> or provide ${join(ctx.flags.data, 'lines.json')}.`)
    return EXIT_ENV
  }
  const bad = versions.filter((v) => !SemVer.safeParse(v).success)
  if (bad.length > 0) {
    console.error(`om fit: not a version: ${bad.join(', ')}`)
    return EXIT_ENV
  }
  const latest = argValue(ctx.args, '--latest') ?? lineVersion(lines, 'latest')
  const asOfArg = argValue(ctx.args, '--as-of')
  const asOf = asOfArg ? new Date(asOfArg) : new Date()
  if (Number.isNaN(asOf.getTime())) {
    console.error(`om fit: --as-of is not a date: ${asOfArg}`)
    return EXIT_ENV
  }

  const filters = list(argValue(ctx.args, '--modules')).map(splitModuleArg)
  const facts = readAllFacts(data, (m) => console.error(`om fit: ${m}`)).filter(
    ({ facts: f }) =>
      filters.length === 0 ||
      filters.some(([loc, ver]) => loc === f.package.locator && (ver === null || ver === f.package.version)),
  )
  if (facts.length === 0) {
    console.error(`om fit: no facts in ${join(ctx.flags.data, 'facts')}${filters.length ? ' for --modules' : ''}.`)
    return filters.length ? EXIT_VALIDATION : EXIT_OK
  }
  const modules = facts.map(({ facts: f }) => fitModuleOf(f))
  const cache = resolve(argValue(ctx.args, '--cache') ?? join(ctx.flags.out, 'om-tarballs'))
  const store = createStore(cache, { offline: ctx.flags.offline })

  let byVersion: Map<string, Record<string, FitCell>>
  try {
    byVersion = await computeFit(store, {
      versions,
      latest,
      modules,
      asOf,
      log: (m) => console.error(m),
    })
  } catch (err) {
    if (err instanceof StoreError || err instanceof TypeError) {
      console.error(`om fit: ${err.message}`)
      return EXIT_ENV
    }
    throw err
  }

  const report: Record<string, { file: string; counts: Record<string, number> }> = {}
  const computedAt = new Date().toISOString()
  for (const [om, cells] of byVersion) {
    const prev = readFit(data, om)
    const all = { ...(prev?.cells ?? {}), ...cells }
    const sorted = Object.fromEntries(
      Object.keys(all)
        .sort()
        .map((k) => [k, all[k]]),
    )
    // a run that refits only some modules keeps the comparison of the file unless it refit every cell of it, or the
    // file already compared with the same latest: the cells left as they were still compare with the old one. A run
    // without --modules refits every version in facts; a cell it leaves has no facts any more, so nothing refits it.
    const covered = filters.length === 0 || Object.keys(prev?.cells ?? {}).every((k) => k in cells)
    const against = covered || prev?.driftAgainst === latest ? latest : prev?.driftAgainst
    const merged = FitResult.parse({
      om,
      computedAt,
      ...(against === undefined ? {} : { driftAgainst: against }),
      cells: sorted,
    })
    const file = join(data, 'fit', `${om}.json`)
    writeJson(file, merged)
    const counts = countStatuses(cells)
    report[om] = { file: join(ctx.flags.data, 'fit', `${om}.json`), counts }
    if (!ctx.flags.json)
      console.log(
        `fit ${om}: ${Object.keys(cells).length} cells (${counts.ok} ok, ${counts.drift} drift, ${counts['no-fit']} no-fit, ${counts.unknown} unknown) -> ${report[om].file}`,
      )
  }
  if (ctx.flags.json) console.log(JSON.stringify({ latest, versions: report }, null, 2))
  return EXIT_OK
}
