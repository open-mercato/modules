// The emitter (spec 4.6, 5.4 `emit`): every published file of the site and the data the Astro pages read, as two
// file maps. Deterministic for a given input and clock; every JSON output is validated with its schema before it
// is returned (a schema failure throws: the build must not publish an invalid contract).
import type { z } from 'zod'
import { latestLine, presetsOrFallback, type LineInfo } from '../core/lines.ts'
import { coreLineOf, planInstall, type PlanContext } from '../core/plan.ts'
import { locatorToPath } from '../schema/locator.ts'
import { Facts, Receipt, type Receipt as ReceiptT } from '../schema/data/index.ts'
import { BuiltInIndex } from '../schema/published/builtin.ts'
import { CompatIndex } from '../schema/published/compat.ts'
import { AgentSkillsIndex, Allowlist, ChangesFile, McpServerCard, ShieldsBadge } from '../schema/published/misc.ts'
import { ModuleDetail, ModuleReceipts, ModulesIndex } from '../schema/published/modules.ts'
import { PickerIndex } from '../schema/published/picker.ts'
import { Radar, Surface } from '../schema/published/radar.ts'
import type { InstallPlan } from '../schema/tools.ts'
import { badgeSvg, shieldsBadge } from './badges.ts'
import { buildBuiltInIndex, buildBuiltInModules } from './builtin.ts'
import { buildFeed, recentChanges, withCurrentLevels } from './changes.ts'
import { buildCompat, peersSentence } from './compat.ts'
import { hiveCells } from './hive.ts'
import { llmsFullTxt, llmsTxt, llmsVisible, rawModulesMd } from './llms.ts'
import { publicFacts, publicReceipt } from './local-paths.ts'
import { moduleCard } from './markdown.ts'
import {
  baselineCells,
  baselineCulprits,
  buildAllowlist,
  buildEntryContexts,
  buildModulesIndex,
  coreVersionOf,
  factsPublished,
  moduleDetail,
  moduleReceipts,
  redirectPage,
  renamedRedirects,
} from './modules-json.ts'
import { buildPicker } from './picker.ts'
import { buildPublishedSurface, radarMarkdown, radarPopulation, radarRows, radarWithReceipts } from './radar.ts'
import { schemaFiles } from './schemas.ts'
import { buildPublishedSearchIndex } from './search-index.ts'
import type { SiteMeta } from './site-data.ts'
import type { EmitData, EmitOptions, FileMap } from './types.ts'
import { byteLength, lineList, toJson, toPrettyJson } from './util.ts'
import { agentSkills, originTrialFor, robotsTxt, serverCard, SERVER_CARD_PATH } from './wellknown.ts'

export interface EmitResult {
  /** Files under site/.generated/public (copied to dist/ by the Astro integration). */
  public: FileMap
  /** Files under site/.generated/data (read by the Astro pages at build time). */
  site: FileMap
  warnings: string[]
  meta: SiteMeta
}

/**
 * Plans per entry and line for a new app of that line (the classic preset, with `emptyPreset` for an app from the
 * empty preset, decision of 24 Oct), or null when no plan can be made.
 */
function plansFor(
  entries: PlanContext['entries'],
  ctx: PlanContext,
  lines: readonly LineInfo[],
): Record<string, Record<string, InstallPlan | null>> {
  const out: Record<string, Record<string, InstallPlan | null>> = {}
  for (const e of entries) {
    const per: Record<string, InstallPlan | null> = {}
    for (const l of lines) {
      try {
        per[l.key] = planInstall({ refs: [e.locator], app: { omVersion: l.version } }, ctx)
      } catch {
        per[l.key] = null
      }
    }
    out[e.locator] = per
  }
  return out
}

/**
 * What the emitter publishes from the data: receipts and facts without paths into someone's machine (round 5): a
 * preview run's local log folder becomes the receipt's page, a local link in a README keeps its text.
 */
function publicData(data: EmitData, site: string): EmitData {
  const receipt = (r: ReceiptT): ReceiptT => publicReceipt(r, site)
  return {
    ...data,
    baseline: data.baseline.map(receipt),
    receipts: new Map([...data.receipts].map(([k, list]) => [k, list.map(receipt)])),
    facts: new Map(
      [...data.facts].map(([k, byVersion]) => [k, new Map([...byVersion].map(([v, f]) => [v, publicFacts(f)]))]),
    ),
  }
}

export function buildEmit(input: EmitData, opts: EmitOptions): EmitResult {
  const pub0 = publicData(input, opts.site)
  // day 0 (review r9): before the first night writes data/presets.json, a new app still ships events and search
  const data: EmitData = pub0.lines
    ? { ...pub0, presets: presetsOrFallback(pub0.presets, lineList(pub0.lines), pub0.lines.resolvedAt) }
    : pub0
  const warnings: string[] = [...data.warnings]
  const warn = (m: string): void => {
    warnings.push(m)
  }
  const pub: FileMap = new Map()
  const put = <T extends z.ZodType>(path: string, schema: T, value: z.input<T>): void => {
    const r = schema.safeParse(value)
    if (!r.success) {
      const i = r.error.issues[0]
      throw new Error(`emit: ${path} fails its schema at ${i?.path.join('.') || '(root)'}: ${i?.message ?? 'invalid'}`)
    }
    pub.set(path, toJson(value))
  }

  const lines = lineList(data.lines)
  const latest = latestLine(lines)
  const ctxs = buildEntryContexts(data, opts, warn)
  const entries = ctxs.map((c) => c.entry)
  const builtIn = buildBuiltInModules(data, warn)
  const coreVersion = data.builtin?.coreVersion ?? coreVersionOf(data)

  // index
  const index = buildModulesIndex(data, ctxs, builtIn, opts)
  put('modules.json', ModulesIndex, index)
  put('built-in.json', BuiltInIndex, buildBuiltInIndex(coreVersion, builtIn, opts.now))
  put('picker.json', PickerIndex, buildPicker(entries, builtIn, lines, data.presets, opts.now))
  const compat = buildCompat(
    ctxs,
    index.lines,
    baselineCells(data),
    opts.now,
    index.dataAsOf,
    baselineCells(data, 'empty'),
  )
  // the packages a red baseline is held against, beside the Open Mercato itself row (review of 24 Oct)
  const culprits = baselineCulprits(data)
  put('compat.json', CompatIndex, Object.keys(culprits).length ? { ...compat, baselineCulprits: culprits } : compat)
  put('allowlist.json', Allowlist, buildAllowlist(entries, latest?.key ?? null, opts.now))

  // changes
  const recent = recentChanges(withCurrentLevels(data.changes, entries), opts.now)
  if (recent.truncated) warn('changes.json: trimmed to the 60 KB budget')
  put('changes.json', ChangesFile, recent.changes)
  pub.set('feed.xml', buildFeed(recent.changes, entries, opts.site, opts.now, index.dataAsOf.source === 'preview'))

  // radar and surface
  const titles = new Map(entries.map((e) => [e.locator, e.title]))
  // receipts on next from the cells of this build (the radar file only brings the API changes), over the radar's own
  // population: the modules outside the @open-mercato scope its summary counts (review r6)
  const radarPop = radarPopulation(ctxs)
  const radarNextRows = radarRows(entries, radarPop)
  const radar = data.radar ? radarWithReceipts(data.radar, radarNextRows) : null
  if (radar) {
    put('radar/next.json', Radar, radar)
    pub.set('radar/next.md', radarMarkdown(radar, titles))
  }
  if (latest && /^\d+\.\d+\.\d+$/.test(latest.version)) {
    const s = buildPublishedSurface(
      ctxs.filter((c) => c.entry.listed),
      latest.version,
      opts.now,
    )
    if (s.minModules > 1) warn(`surface.json: symbols used by fewer than ${s.minModules} modules left out (60 KB)`)
    put('surface.json', Surface, s.surface)
  }

  // plans (cards and pages)
  const planCtx: PlanContext = {
    entries,
    builtIn,
    lines,
    presets: data.presets,
    coreLine: coreLineOf(coreVersion, lines) ?? undefined,
    now: opts.now,
  }
  const plans = plansFor(entries, planCtx, lines)

  // per entry
  const lineKeys = lines.map((l) => l.key)
  const cards: string[] = []
  for (const c of ctxs) {
    const e = c.entry
    const p = e.path
    put(`m/${p}.json`, ModuleDetail, moduleDetail(c))
    put(`m/${p}/receipts.json`, ModuleReceipts, moduleReceipts(c, lineKeys))
    if (factsPublished(c)) for (const [v, f] of c.allFacts) put(`m/${p}/v/${v}/facts.json`, Facts, f)
    const card = moduleCard({
      ctx: c,
      lines,
      site: opts.site,
      dataVersion: index.dataVersion,
      plan: latest ? (plans[e.locator]?.[latest.key] ?? null) : null,
      // every card of a preview build carries the preview line (review r10), not only those with receipts of their own
      preview: index.dataAsOf.source === 'preview',
    })
    pub.set(`m/${p}.md`, card)
    if (llmsVisible(e)) cards.push(card)
    // a preview run never reads as nightly CI on an author's README either (review r8)
    const source = index.dataAsOf.source ?? null
    pub.set(`badge/${p}.svg`, badgeSvg(e, lines, source))
    put(`badge/${p}.json`, ShieldsBadge, shieldsBadge(e, lines, source))
  }
  for (const r of renamedRedirects(entries)) pub.set(`m/${r.path}.html`, redirectPage(r.target, r.title, r.relative))

  // receipts
  const allReceipts: ReceiptT[] = [...data.baseline, ...ctxs.flatMap((c) => c.receipts)].sort(
    (a, b) => Date.parse(a.run.at) - Date.parse(b.run.at) || a.id.localeCompare(b.id),
  )
  for (const r of allReceipts) put(`r/${r.id}.json`, Receipt, r)

  // search and agents
  const listedEntries = entries.filter((e) => e.listed)
  pub.set(
    'search-index.json',
    toJson(
      buildPublishedSearchIndex(
        listedEntries,
        builtIn,
        lines,
        index.dataVersion,
        opts.now,
        opts.site,
        index.dataAsOf.source ?? null,
      ),
    ),
  )
  const refreshedAt = index.dataAsOf.nightly ?? index.dataAsOf.npm ?? opts.now
  // one condition for every text channel for agents (review r10): the source of modules.json `dataAsOf`
  const previewReceipts = index.dataAsOf.source === 'preview'
  pub.set(
    'llms.txt',
    llmsTxt({ entries, builtIn, lines, site: opts.site, mcpUrl: opts.mcpUrl, refreshedAt, previewReceipts }),
  )
  pub.set('llms-full.txt', llmsFullTxt(cards, builtIn, opts.site, previewReceipts, latest?.key ?? null))
  pub.set('raw/modules.md', rawModulesMd(entries, data.categories, lines, opts.site, previewReceipts))
  for (const [path, text] of schemaFiles(opts.site)) pub.set(path, text)

  // discovery
  const mcpUrl = opts.mcpUrl ?? `${opts.site}/mcp`
  if (!opts.mcpUrl)
    warn(`MCP_URL is not set; the server card points at ${mcpUrl}, which serves nothing until /mcp runs`)
  put(SERVER_CARD_PATH, McpServerCard, serverCard(mcpUrl))
  const skills = agentSkills(data.skills, opts.site, warn)
  put('.well-known/agent-skills/index.json', AgentSkillsIndex, skills.index)
  for (const [path, bytes] of skills.files) pub.set(path, bytes)
  pub.set('robots.txt', robotsTxt(opts.site))

  // site data
  const originTrial = originTrialFor(opts.originTrialTokens, opts.site, opts.now, warn)
  const meta: SiteMeta = {
    schemaVersion: 1,
    site: opts.site,
    base: opts.base,
    generatedAt: opts.now,
    dataVersion: index.dataVersion,
    dataAsOf: index.dataAsOf,
    features: index.features,
    mcpUrl: opts.mcpUrl,
    originTrial: originTrial ? { token: originTrial.token, expires: originTrial.expires } : null,
    counts: index.counts,
    coreVersion,
    peersSentence: peersSentence(compat.peersRejectFitting),
    firstNight: index.dataAsOf.nightly === null,
    ...(radar ? { radarNext: radarTile(radarNextRows, radarPop.size) } : {}),
  }
  const site: FileMap = new Map()
  site.set('site.json', toPrettyJson(meta))
  site.set('hive.json', toPrettyJson(hiveCells(data, ctxs, builtIn, latest?.key ?? null, opts.now.slice(0, 10), warn)))
  site.set('plans.json', toJson(plans))
  site.set('receipts.json', toJson(allReceipts))
  site.set(
    'files.json',
    toPrettyJson(
      [...pub.keys()].sort().map((path) => ({ path, bytes: byteLength(pub.get(path) as string | Uint8Array) })),
    ),
  )
  return { public: pub, site, warnings, meta }
}

/**
 * The `Receipts on next` tile of /radar over the radar's population (review r9: `7 verified · 8 broken of 16` did not
 * sum up): every module of the population in one state, read as a verdict on its install version (`radarRows`).
 */
export function radarTile(
  rows: readonly { listed: boolean; compat: { lines: Readonly<Record<string, { status: string } | undefined>> } }[],
  population: number,
  nextKey = 'next',
): NonNullable<SiteMeta['radarNext']> {
  const out = { population, verified: 0, broken: 0, quarantine: 0, notJudged: 0, queued: 0, skipped: 0 }
  for (const r of rows) {
    const st = r.listed ? r.compat.lines[nextKey]?.status : 'skipped'
    if (st === 'verified') out.verified += 1
    else if (st === 'broken') out.broken += 1
    else if (st === 'quarantine') out.quarantine += 1
    else if (st === 'harness-red' || st === 'infra-error') out.notJudged += 1
    else if (st === 'skipped') out.skipped += 1
    else out.queued += 1
  }
  // a module of the population without an entry row (never in the index) still counts, as queued
  out.queued += Math.max(0, population - rows.length)
  return out
}

/** Locator to the published card path (`/m/<path>.md`), for callers that only have a locator. */
export const cardPath = (locator: string): string => `m/${locatorToPath(locator)}.md`
