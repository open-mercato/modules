// /modules.json (ModulesIndex), /m/<path>.json (ModuleDetail), /m/<path>/receipts.json, /m/<path>/v/<ver>/facts.json,
// /r/<id>.json, /allowlist.json and the redirect pages of renamed entries (spec 4.2, 4.6, 4.7).
// Entries come from lib/core (WP08: judgedFacts -> buildIndexEntry -> withSlotConflicts), so health, the site,
// MCP and the CLI agree. Pure: no Node APIs.
import { buildIndexEntryWithRules, anatomySummary, withSlotConflicts, type CatalogRef } from '../core/entry.ts'
import { judgedFacts, presetBackendRoutes } from '../core/health.ts'
import { lineVersion } from '../core/policy.ts'
import { cellSummary, lastReceipt, latestLine, receiptPreset, sortReceipts, type PresetId } from '../core/lines.ts'
import { compareVersions } from '../core/semver.ts'
import { receiptSource } from '../core/source.ts'
import { sha256Hex } from '../sigil/sha256.ts'
import { sigilFromCounts, sigilPhase } from '../sigil/sigil.ts'
import { locatorToPath } from '../schema/locator.ts'
import type { Facts, FitCell, Receipt } from '../schema/data/index.ts'
import type { BuiltInModule } from '../schema/published/builtin.ts'
import type {
  CellSummary,
  IndexEntry,
  ModuleDetail,
  ModuleReceipts,
  ModulesIndex,
} from '../schema/published/modules.ts'
import type { Allowlist } from './types.ts'
import type { EmitData, EmitOptions, EntryContext } from './types.ts'
import { escapeXml, lineList } from './util.ts'

/**
 * `dataVersion` (spec 4.7): `1.0.0-<YYYYMMDDHHmm>.h<6 hex>`. The `h` keeps a hash such as `001234` a valid
 * SemVer prerelease identifier (a numeric identifier with a leading zero is invalid, SemVer 2.0.0 item 9).
 */
export function dataVersion(generatedAt: string, hashHex: string): string {
  const stamp = generatedAt.replace(/[-:T]/g, '').slice(0, 12)
  return `1.0.0-${stamp}.h${hashHex.slice(0, 6).toLowerCase()}`
}

/** Six hex characters of sha256 over the index content without `generatedAt` and `dataVersion`. */
export function contentHash(index: Omit<ModulesIndex, 'generatedAt' | 'dataVersion'>): string {
  return sha256Hex(JSON.stringify(index)).slice(0, 6)
}

const maxIso = (xs: readonly (string | null | undefined)[]): string | null =>
  xs
    .filter((x): x is string => !!x)
    .sort((a, b) => Date.parse(a) - Date.parse(b))
    .at(-1) ?? null

/** Facts of the highest version below `version` (anatomy diff, D31). */
function previousFacts(all: Map<string, Facts>, version: string | null): Facts | null {
  if (!version) return null
  const lower = [...all.keys()].filter((v) => compareVersions(v, version) < 0).sort(compareVersions)
  const v = lower.at(-1)
  return v ? (all.get(v) ?? null) : null
}

/** One context per valid descriptor, entries with slot conflicts filled. Invalid descriptors are left out. */
export function buildEntryContexts(data: EmitData, opts: EmitOptions, warn: (m: string) => void): EntryContext[] {
  const lines = data.lines?.lines ?? []
  const catalog: CatalogRef[] = data.descriptors
    .filter((d) => d.descriptor)
    .map((d) => ({ locator: d.locator, npm: d.descriptor!.npm ?? null, kind: d.descriptor!.kind }))
  const out: EntryContext[] = []
  const backendRoutesOf = presetBackendRoutes(data.builtin, (npm, v) => data.facts.get(`npm:${npm}`)?.get(v) ?? null)
  for (const d of data.descriptors) {
    if (!d.descriptor) {
      warn(`${d.file}: invalid descriptor, left out of the index (${d.issues[0] ?? 'invalid'})`)
      continue
    }
    const locator = d.locator
    const sync = data.sync.get(locator) ?? null
    const receipts = data.receipts.get(locator) ?? []
    const allFacts = data.facts.get(locator) ?? new Map<string, Facts>()
    // Fit of any version on a line: each line is judged on its own install version (E5)
    const fitOf = (v: string, lineKey: string): FitCell | null => {
      const l = lines.find((x) => x.key === lineKey)
      return l ? (data.fit.get(l.version)?.cells[`${locator}@${v}`] ?? null) : null
    }
    const judged = judgedFacts(
      { locator, sync, receipts, lines, now: opts.now, fitOf, presets: data.presets },
      (v) => allFacts.get(v) ?? null,
    )
    const fit: Record<string, FitCell | null> = {}
    for (const l of lines)
      fit[l.key] = judged.version ? (data.fit.get(l.version)?.cells[`${locator}@${judged.version}`] ?? null) : null
    const health = data.health.get(locator) ?? null
    const enterprise = locator === 'npm:@open-mercato/enterprise'
    const facts = judged.facts
    // sigil from the anatomy counts (spec 7.4, WP11 lib/sigil), with custom entities that the summary leaves out
    const anatomy = anatomySummary(facts, enterprise)
    const customEntities = (facts?.modules ?? []).reduce((n, m) => n + m.data.customEntities, 0)
    const sigil = anatomy
      ? sigilFromCounts(locator, { ...anatomy.counts, customEntities })
      : { glyph: '0000000', phase: sigilPhase(locator), publicRoutes: false }
    const { entry, rules } = buildIndexEntryWithRules({
      locator,
      descriptor: d.descriptor,
      descriptorIssues: d.issues,
      sync,
      facts,
      fit,
      fitOf,
      receipts,
      lines,
      claims: data.claims,
      // OM Quality: health validated the review against quality/ and revocations; it needs Verified (spec 6.3)
      quality: health && health.tier === 'verified' ? health.quality : null,
      now: opts.now,
      previousFacts: previousFacts(allFacts, judged.version),
      presets: data.presets,
      stats: data.stats,
      site: opts.site,
      sigil,
      catalog,
      routesOf: (v) => allFacts.get(v)?.modules.flatMap((m) => m.http.routes),
      // lint `backend-route-collision` (round 14): the backend routes of a new app's modules, as `yarn om health` reads them
      backendRoutesOf,
    })
    // updatedAt from the data (sync, receipts, health), not the build clock, so the content hash is stable
    entry.updatedAt =
      maxIso([
        sync?.checkedAt,
        receipts
          .map((r) => r.run.at)
          .sort()
          .at(-1),
        health?.computedAt,
      ]) ??
      data.lines?.resolvedAt ??
      opts.now
    if (entry.quality && !(entry.tier === 'verified')) entry.quality = null
    // enterprise anatomy is not published, so there is no facts file to link (factsPublished)
    if (entry.enterprise) entry.links.facts = null
    // Fit per line of the version each line is judged on (E5, `lineVersion`: the one a new app ships there, else the
    // one it installs), as in entry.signals.fit
    const lineFit: Record<string, FitCell | null> = {}
    for (const l of lines) {
      const v = lineVersion(entry, l.key)
      lineFit[l.key] = v ? fitOf(v, l.key) : null
    }
    out.push({
      entry,
      descriptor: d.descriptor,
      sync,
      facts,
      judgedVersion: judged.version,
      fit: lineFit,
      receipts,
      allFacts,
      rules,
    })
  }
  const withConflicts = withSlotConflicts(out.map((c) => c.entry))
  return out.map((c, i) => ({ ...c, entry: withConflicts[i] as IndexEntry }))
}

/**
 * Baseline summary per line key, the Open Mercato itself row: of a new app (the classic preset, the main verdict), or
 * with `empty`, of an app from the empty preset (the row of the signal `in isolation`).
 */
export function baselineCells(data: EmitData, preset: PresetId = 'classic'): Record<string, CellSummary> {
  const out: Record<string, CellSummary> = {}
  const own = data.baseline.filter((r) => receiptPreset(r) === preset)
  for (const l of lineList(data.lines)) {
    const c = cellSummary(own, l.key)
    if (c) out[l.key] = c
  }
  return out
}

/**
 * Per line, the packages of a new app its red baseline is held against (`result.culprits` of the receipt behind the
 * Open Mercato itself cell, review of 24 Oct); lines without them are left out.
 */
export function baselineCulprits(data: EmitData): Record<string, string[]> {
  const cells = baselineCells(data)
  const out: Record<string, string[]> = {}
  for (const [k, c] of Object.entries(cells)) {
    const r = c.receipt ? data.baseline.find((x) => x.id === c.receipt) : undefined
    if (c.status === 'harness-red' && r?.result.culprits?.length) out[k] = [...r.result.culprits]
  }
  return out
}

/** Core version of the built-in modules: latest line, else the built-in data, else the pinned CLI. */
export function coreVersionOf(data: EmitData): string {
  return data.lines?.coreLatest ?? data.builtin?.coreVersion ?? data.pinnedCoreVersion ?? '0.0.0'
}

const stableLess = (a: string, b: string): boolean => compareVersions(a, b) < 0

export function buildModulesIndex(
  data: EmitData,
  ctxs: readonly EntryContext[],
  builtIn: readonly BuiltInModule[],
  opts: EmitOptions,
): ModulesIndex {
  const entries = ctxs.map((c) => c.entry)
  const lines = lineList(data.lines)
  const latest = latestLine(lines)
  const baseline = baselineCells(data)
  const isolationBaseline = baselineCells(data, 'empty')
  const listed = entries.filter((e) => e.listed)
  const coreVersion = coreVersionOf(data)
  const allReceipts = [...data.baseline, ...[...data.receipts.values()].flat()]
  const official = entries.filter((e) => e.type === 'official')
  const coverage = data.coverage
    ? { listed: data.coverage.listed, missing: data.coverage.missing.slice(0, 50) }
    : { listed: official.length, missing: [] }
  const body: Omit<ModulesIndex, 'generatedAt' | 'dataVersion'> = {
    $schema: `${opts.site}/schema/modules-1.json`,
    schemaVersion: 1,
    site: opts.site,
    dataAsOf: {
      nightly: maxIso(allReceipts.map((r) => r.run.at)),
      npm: data.lines?.resolvedAt ?? null,
      // review r6: a preview run is named as one in the machine contract too, not only on the pages
      source: receiptSource(allReceipts),
    },
    features: {
      cliSearch: !!(data.cliSearchSince && latest && !stableLess(latest.version, data.cliSearchSince)),
    },
    officialCoverage: coverage,
    lines: lines.map((l) => ({
      key: l.key,
      version: l.version,
      source: l.source,
      cadence: l.cadence,
      baseline: baseline[l.key] ?? null,
      isolationBaseline: isolationBaseline[l.key] ?? null,
      // the preset of a new app (classic) when the catalog knows its modules (data/presets.json, else lines.json
      // `defaultPreset`, else the lists read by hand), else null
      defaultPreset: data.presets?.[l.key]?.classic ? 'classic' : null,
      presets: { classic: data.presets?.[l.key]?.classic ?? null, empty: data.presets?.[l.key]?.empty ?? [] },
    })),
    categories: data.categories.map((c) => ({
      id: c.id,
      title: c.title,
      wedge: c.wedge,
      count: listed.filter((e) => e.category === c.id && !e.tags.includes('example')).length,
    })),
    counts: {
      entries: entries.length,
      listed: listed.length,
      modules: listed.filter((e) => e.kind === 'module').length,
      verifiedOnLatest: latest ? listed.filter((e) => e.compat.verifiedOn.includes(latest.key)).length : 0,
      omQuality: entries.filter((e) => e.quality !== null).length,
      builtIn: builtIn.length,
    },
    builtIn: { coreVersion, count: builtIn.length, href: `${opts.site}/built-in.json` },
    entries,
  }
  const hash = contentHash(body)
  const { $schema, schemaVersion, ...rest } = body
  return { $schema, schemaVersion, generatedAt: opts.now, dataVersion: dataVersion(opts.now, hash), ...rest }
}

/** Receipt history of the detail file: the last 10 state transitions, newest first. */
export function transitions(receipts: readonly Receipt[], max = 10): Receipt[] {
  return sortReceipts(receipts)
    .filter((r) => r.transition.from !== r.transition.to)
    .reverse()
    .slice(0, max)
}

/** Enterprise anatomy is not published (spec 11.1, i1 §5): no facts in the detail and no facts files. */
export const factsPublished = (c: EntryContext): boolean => !c.entry.enterprise

export function moduleDetail(c: EntryContext): ModuleDetail {
  return {
    ...c.entry,
    facts: factsPublished(c) ? c.facts : null,
    receipts: transitions(c.receipts),
    ...(c.rules ? { rules: c.rules } : {}),
  }
}

/** The last receipt per line of a new app (classic), and of an app from the empty preset under `isolation` (24 Oct). */
export function moduleReceipts(c: EntryContext, lineKeys: readonly string[]): ModuleReceipts {
  const of = (preset: PresetId): Record<string, Receipt> => {
    const own = c.receipts.filter((r) => receiptPreset(r) === preset)
    const out: Record<string, Receipt> = {}
    for (const k of lineKeys) {
      const r = lastReceipt(own, k)
      if (r) out[k] = r
    }
    return out
  }
  const isolation = of('empty')
  return {
    schemaVersion: 1,
    locator: c.entry.locator,
    lines: of('classic'),
    ...(Object.keys(isolation).length > 0 ? { isolation } : {}),
  }
}

/** `/allowlist.json`: active, with a level, agent policy on the latest line not `refuse` (spec 4.6). */
export function buildAllowlist(entries: readonly IndexEntry[], latestKey: string | null, now: string): Allowlist {
  return {
    schemaVersion: 1,
    generatedAt: now,
    locators: entries
      .filter(
        (e) =>
          e.status === 'active' &&
          e.listed &&
          e.tier !== null &&
          latestKey !== null &&
          e.agentPolicy[latestKey] !== undefined &&
          e.agentPolicy[latestKey]?.decision !== 'refuse',
      )
      .map((e) => e.locator)
      .sort(),
  }
}

/** Redirect page under the old path of a renamed entry (spec 4.2): meta refresh plus canonical. */
export function redirectPage(target: string, title: string, relative?: string): string {
  const t = escapeXml(target)
  // the refresh and the link stay on the host that serves the stub (review r4: an absolute SITE_URL sent a local
  // preview, or any other host, to production); the canonical keeps the absolute address
  const go = escapeXml(relative ?? target)
  return (
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="robots" content="noindex">` +
    `<meta http-equiv="refresh" content="0; url=${go}">` +
    `<link rel="canonical" href="${t}">` +
    `<title>${escapeXml(title)} moved</title>` +
    `<style>body{margin:0 auto;padding:48px 16px;max-width:40rem;font:16px/1.5 Geist,ui-sans-serif,system-ui,sans-serif;` +
    `color:#0c0c0c;background:#fff}a{color:inherit;text-underline-offset:3px}` +
    `@media (prefers-color-scheme:dark){body{color:#fafafa;background:#0c0c0c}}</style></head>` +
    `<body><p>This module was renamed. Its page is <a href="${go}">${escapeXml(title)}</a>.</p></body></html>\n`
  )
}

/** Path from the stub of an old module path (`m/<old>`) to the page of the new one (`m/<new>`), relative. */
export function relativeModuleHref(fromPath: string, toPath: string): string {
  const depth = `m/${fromPath}`.split('/').length - 1
  return `${'../'.repeat(depth)}m/${toPath}`
}

/** Old paths of renamed entries -> new page URL. A path that is itself a current entry is skipped. */
export function renamedRedirects(
  entries: readonly IndexEntry[],
): { path: string; target: string; title: string; relative: string }[] {
  const current = new Set(entries.map((e) => e.path))
  const out: { path: string; target: string; title: string; relative: string }[] = []
  for (const e of entries)
    for (const old of e.renamedFrom) {
      const path = locatorToPath(old)
      if (!current.has(path))
        out.push({ path, target: e.links.page, title: e.title, relative: relativeModuleHref(path, e.path) })
    }
  return out
}
