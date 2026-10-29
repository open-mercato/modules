// `yarn om radar [--base <ver>] [--next <ver>] [--surface <file>]`
// Release radar of the `next` snapshot against `latest` (spec 5.4): `.data/radar/next.json` from fit on next and
// latest, current facts and receipts on next; the load-bearing API map goes to `out/surface.json` (input of
// `/surface.json`, which emit publishes).
import { join, resolve } from 'node:path'
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK } from '../cli.ts'
import { Radar, StableSemVer, SemVer, Surface } from '../schema/index.ts'
import type { RadarModule } from '../fit/radar.ts'
import { buildRadar } from '../fit/radar.ts'
import {
  argValue,
  currentFacts,
  fitModuleOf,
  lineVersion,
  readAllFacts,
  readFit,
  readLines,
  readReceipts,
  unknownArgs,
  writeJson,
} from '../fit/data.ts'
import { buildSurface, externalModules } from '../fit/surface.ts'

export const description = 'next-snapshot radar; .data/radar/next.json'

const FLAGS = ['--base', '--next', '--surface']

export default function radar(ctx: CommandContext): number {
  const extra = unknownArgs(ctx.args, FLAGS)
  if (extra.length > 0) {
    console.error(`om radar: unknown arguments: ${extra.join(' ')}`)
    return EXIT_ENV
  }
  const data = resolve(ctx.flags.data)
  const lines = readLines(data)
  const base = argValue(ctx.args, '--base') ?? lineVersion(lines, 'latest')
  const next = argValue(ctx.args, '--next') ?? lineVersion(lines, 'develop')
  if (!base || !StableSemVer.safeParse(base).success || !next || !SemVer.safeParse(next).success) {
    console.error('om radar: need a stable --base and a --next version (or lines.json with latest and develop).')
    return EXIT_ENV
  }
  const fitNext = readFit(data, next)
  if (!fitNext) {
    console.error(`om radar: no fit for ${next}. Run yarn om fit --om ${next} first.`)
    return EXIT_ENV
  }
  const fitBase = readFit(data, base)
  const warn = (m: string): void => console.error(`om radar: ${m}`)
  const facts = currentFacts(readAllFacts(data, warn))
  const fitMods = facts.map(fitModuleOf)
  const external = new Set(externalModules(fitMods).map((m) => m.locator))
  const modules: RadarModule[] = []
  for (const m of fitMods) {
    if (!external.has(m.locator)) continue
    const cell = fitNext.cells[m.key]
    if (!cell) {
      warn(`no fit cell for ${m.key} on ${next}, left out`)
      continue
    }
    // the version of the facts and fit cells: only its receipts count on next (audit R8)
    modules.push({ locator: m.locator, version: m.version, next: cell, latest: fitBase?.cells[m.key] ?? null })
  }
  const generatedAt = new Date().toISOString()
  const surface = Surface.parse(
    buildSurface(
      fitMods.filter((m) => modules.some((r) => r.locator === m.locator)),
      base,
      generatedAt,
    ),
  )
  const result = Radar.parse(
    buildRadar({ generatedAt, base, next, modules, surface, receipts: readReceipts(data, warn) }),
  )
  writeJson(join(data, 'radar', 'next.json'), result)
  const surfaceFile = resolve(argValue(ctx.args, '--surface') ?? join(ctx.flags.out, 'surface.json'))
  writeJson(surfaceFile, surface)
  if (ctx.flags.json) console.log(JSON.stringify(result, null, 2))
  else {
    console.log(result.summary)
    for (const l of result.loadBearing.slice(0, 3)) console.log(`  ${l.symbol} · ${l.modules} of ${l.of}`)
    console.log(`-> ${join(ctx.flags.data, 'radar', 'next.json')}, ${surfaceFile}`)
  }
  return EXIT_OK
}
