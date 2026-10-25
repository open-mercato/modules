// /radar/next.json (copy of data/radar/next.json), /radar/next.md (the same as markdown for release notes) and
// /surface.json (load-bearing API map, spec 1.1 item 3, 4.6). The surface is computed from the facts of the judged
// versions with WP06 `buildSurface`; the data branch has no surface file. Pure.
import { buildSurface, externalModules, type SurfaceModule } from '../fit/surface.ts'
import { mergeImports } from '../fit/static.ts'
import { lineVerdicts, type VerdictRow } from '../core/lines.ts'
import { withJudgedLines } from '../core/policy.ts'
import type { IndexEntry } from '../schema/published/modules.ts'
import type { Radar, Surface } from '../schema/published/radar.ts'
import type { EntryContext } from './types.ts'
import { byteLength, toJson } from './util.ts'

export const SURFACE_MAX_BYTES = 60 * 1024

const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
const short = (loc: string): string => loc.replace(/^(npm|github):/, '')

/** `/surface.json` within its 60 KB budget: symbols used by a single module are dropped first, then pairs, ... */
export function buildPublishedSurface(
  ctxs: readonly EntryContext[],
  base: string,
  generatedAt: string,
): { surface: Surface; minModules: number } {
  const mods: SurfaceModule[] = ctxs
    .filter((c) => c.facts)
    .map((c) => ({ locator: c.entry.locator, imports: mergeImports(c.facts!.modules.map((m) => m.omImports)) }))
  let minModules = 1
  let surface = buildSurface(mods, base, generatedAt)
  while (byteLength(toJson(surface)) > SURFACE_MAX_BYTES && surface.symbols.length > 0) {
    minModules++
    surface = buildSurface(mods, base, generatedAt, { minModules })
  }
  return { surface, minModules }
}

/**
 * The radar's population, as `yarn om radar` counts it (`externalModules`): modules outside the @open-mercato scope
 * that import Open Mercato APIs. The receipts on next are counted over the same modules (review r6: the tile said 16
 * modules and counted the official ones too).
 */
export function radarPopulation(ctxs: readonly EntryContext[]): Set<string> {
  const mods: SurfaceModule[] = ctxs
    .filter((c) => c.facts)
    .map((c) => ({ locator: c.entry.locator, imports: mergeImports(c.facts!.modules.map((m) => m.omImports)) }))
  return new Set(externalModules(mods).map((m) => m.locator))
}

/** Rows of the radar tile: the population, each line read as a verdict on its install version (review r6). */
export function radarRows(entries: readonly IndexEntry[], population: ReadonlySet<string>): VerdictRow[] {
  return entries.filter((e) => population.has(e.locator)).map((e) => withJudgedLines(e))
}

/** The receipts sentence of the radar summary, the same words as `lib/fit/radar.ts` writes. */
const RECEIPTS_SENTENCE = /Receipts on next: \d+ verified, \d+ broken\.$/

/**
 * The radar with `receiptsOnNext` counted at emit time from the cells of the listed entries on the `next` line
 * (`lineVerdicts`; the caller passes the radar's population, `radarRows`). `data/radar/next.json` is computed by `watch` before the night
 * is collected, so between two steps it said `queued` while / showed the night (review r3); the radar file stays the
 * source of the API changes only.
 */
export function radarWithReceipts(r: Radar, rows: readonly VerdictRow[], nextKey = 'next'): Radar {
  const v = lineVerdicts(rows, nextKey)
  const receiptsOnNext = { verified: v.verified, broken: v.broken }
  const sentence = `Receipts on next: ${receiptsOnNext.verified} verified, ${receiptsOnNext.broken} broken.`
  return {
    ...r,
    receiptsOnNext,
    // a summary without the receipts sentence stays as it is (the markdown prints its own receipts line)
    summary: r.summary.replace(RECEIPTS_SENTENCE, sentence),
  }
}

/** `/radar/next.md`: the radar as markdown (spec 7.7 E `Copy as markdown`). */
export function radarMarkdown(r: Radar, titles: ReadonlyMap<string, string>): string {
  const name = (loc: string): string => titles.get(loc) ?? short(loc)
  const out: string[] = [
    `# Release radar: next = ${r.next}`,
    '',
    `Compared with ${r.base}. Generated ${r.generatedAt}.`,
    '',
    r.summary,
    '',
    '## Changed APIs in use',
    '',
  ]
  if (r.changedApis.length === 0) out.push('None.')
  else {
    out.push('| Symbol | Change | Used by |', '|---|---|---|')
    for (const c of r.changedApis)
      out.push(`| \`${cell(c.symbol)}\` | ${c.change} | ${cell(c.modules.map(name).join('; '))} |`)
  }
  out.push('', '## Static breaks', '')
  if (r.staticBreaks.length === 0) out.push('None.')
  else {
    out.push('| Module | Missing |', '|---|---|')
    for (const b of r.staticBreaks)
      out.push(`| ${cell(name(b.locator))} | ${cell(b.missing.map((m) => `\`${m}\``).join(', '))} |`)
  }
  out.push('', '## Same failure in several modules', '')
  if (r.sameFailure.length === 0) out.push('None.')
  else {
    out.push('| Step | Signature | Modules |', '|---|---|---|')
    for (const f of r.sameFailure)
      out.push(`| ${f.step} | \`${cell(f.signature)}\` | ${cell(f.modules.map(name).join('; '))} |`)
  }
  out.push(
    '',
    r.receiptsOnNext.verified + r.receiptsOnNext.broken === 0
      ? "Receipts on next: queued for tonight's run."
      : `Receipts on next: ${r.receiptsOnNext.verified} verified, ${r.receiptsOnNext.broken} broken.`,
    '',
    '## Load-bearing APIs',
    '',
  )
  if (r.loadBearing.length === 0) out.push('None.')
  else {
    out.push('| Symbol | Used by |', '|---|---|')
    for (const l of r.loadBearing) out.push(`| \`${cell(l.symbol)}\` | ${l.modules} of ${l.of} |`)
    out.push('', 'Changing these breaks the ecosystem. Consider them frozen.')
  }
  out.push('')
  return out.join('\n')
}
