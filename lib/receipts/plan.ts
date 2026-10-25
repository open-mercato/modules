// Plan of one nightly run (spec 5.3 "Plan macierzy", D6, D10, D46). Pure: the command reads the files and passes them in.
import type { Descriptor } from '../schema/descriptor.ts'
import type { Facts, ModuleFacts } from '../schema/data/facts.ts'
import type { Lines, Presets } from '../schema/data/lines.ts'
import type { Receipt } from '../schema/data/receipt.ts'
import type { SyncRecord } from '../schema/data/sync.ts'
import type { HarnessLinesFile } from '../schema/policy.ts'
import { catalogPeerRequires, type CatalogRef } from '../core/entry.ts'
import {
  daysBetween,
  decisiveReceipt,
  installableFrom,
  isInstallable,
  isPreapproved,
  MAIN_PRESET,
  PRESET_IDS,
  presetCellsWeekly,
  presetsOrFallback,
  receiptPreset,
  recommendedVersions,
  registeredIn,
  shippedVersion,
  type LineInfo,
  type PresetId,
} from '../core/lines.ts'
import { compareVersions, isVersion, satisfiesRange } from '../core/semver.ts'
import { newestInstallable, type FitOn } from '../core/tier.ts'
import { cellKey, harnessVersion, key12 } from './cell-key.ts'
import { Matrix, type CellMode, type MatrixCell, type NotRunCell, type Runner } from './matrix.ts'

export const MAX_CELLS = 256
export const PARALLEL = 6
/** A cold row on ubuntu-latest (spike: about 7.5 min), an app from the empty preset. */
export const MINUTES_PER_CELL = 7.5
/**
 * Minutes of one cell per starter preset: an app from the classic preset registers about 60 modules and took 2.7 times
 * as long as the empty one in the preview trial of 24 Oct (about 15 against 5.5 min on Cezar, with a warm Yarn cache).
 * CI has no cache (empty: 7.5 min there against 5.5 on Cezar), so a classic cell is weighed at an estimated 20 minutes
 * until the first CI night measures it (docs/RUNBOOK.md); a night holds fewer of them.
 */
export const MINUTES_BY_PRESET: Readonly<Record<PresetId, number>> = { empty: MINUTES_PER_CELL, classic: 20 }
/**
 * The share of a night held for the empty preset when both presets have cells (review of 24 Oct: 27 classic cells
 * filled the night and the signal `in isolation` starved): one wave of PARALLEL empty cells.
 */
export const EMPTY_RESERVE_MIN = MINUTES_PER_CELL
/** Budget of a regular night (acceptance: window <= 70 min) and of the weekly night with the previous line. */
export const BUDGET_NIGHT_MIN = 70
export const BUDGET_WEEKLY_MIN = 150
export const MEMO_DAYS = 7
export const NODE_VERSION = '24.21.0'

export interface PlanEntry {
  locator: string
  d: Descriptor
  sync: SyncRecord | null
  /** Facts of one version of this entry, or null when not scanned. */
  facts: (version: string) => Facts | null
  receipts: readonly Receipt[]
  /**
   * Static Fit status of one version on a line key (data/fit). With it, a line installs the newest stable version
   * that fits it before any receipt (E5): the 0.8 night installs the lockstep official 0.8.0, not 0.9.0.
   */
  fit?: (version: string, line: string) => ReturnType<FitOn>
}

/** Newest installable stable version of an entry on a line, Fit-aware when the entry has Fit (E5). */
function installableOnLine(e: PlanEntry, line: LineInfo, now: string): string | null {
  const fit = e.fit
  return newestInstallable(e.sync, line, now, fit ? (v) => fit(v, line.key) : undefined)
}

export interface PlanInput {
  entries: readonly PlanEntry[]
  lines: Lines
  presets: Presets | null
  /** IDs of the modules of @open-mercato/core (data/builtin/<coreLatest>.json). */
  builtinIds: ReadonlySet<string>
  baselineReceipts: readonly Receipt[]
  harness: HarnessLinesFile
  harnessHash: string
  node?: string
  now: string
  event: 'schedule' | 'workflow_dispatch'
  /** Only these lines (default: the lines due tonight; a cell selection looks at every line). */
  onlyLines?: readonly string[] | null
  /**
   * Only these starter presets (default both, classic first): `classic` gives the main verdict, `empty` the signal
   * `in isolation` (decision of 24 Oct). `yarn om plan-matrix --preset classic` plans a classic night only.
   */
  onlyPresets?: readonly PresetId[] | null
  /** Run exactly these cells: full keys, 12-character keys or locators. Memo and due lines are ignored. */
  cells?: readonly string[] | null
  mode?: CellMode | null
  attempt?: number
  runner?: Runner
  budgetMin?: number | null
}

interface Candidate {
  cell: MatrixCell
  /**
   * Why the cell is memoized: `key`, a confirmed receipt with the same key under MEMO_DAYS; `isolation`, a fresh
   * confirmed receipt of the same version in an app from the empty preset under any harness (`freshIsolation`), with
   * the time that receipt ran; false to run it.
   */
  memo: false | 'key' | { isolation: string }
}

const STEP_LINES: Record<LineInfo['source'], 'latest' | 'previous' | 'next'> = {
  latest: 'latest',
  previous: 'previous',
  develop: 'next',
}

function lineInfo(l: Lines['lines'][number]): LineInfo {
  return { key: l.key, version: l.version, source: l.source, preapproved: l.preapproved }
}

/** Lines due tonight: cadence from harness/lines.yml; weekly lines on `weeklyDay` or on a manual dispatch. */
export function dueLines(input: Pick<PlanInput, 'lines' | 'harness' | 'now' | 'event'>): Set<string> {
  const weekday = new Date(input.now).getUTCDay()
  const out = new Set<string>()
  for (const l of input.lines.lines) {
    const cadence = input.harness.cadence[STEP_LINES[l.source]]
    if (cadence === 'nightly' || input.event === 'workflow_dispatch' || weekday === input.harness.weeklyDay)
      out.add(l.key)
  }
  return out
}

/** Harness patches whose range covers the create-mercato-app version of the line. */
export function patchesFor(harness: HarnessLinesFile, omVersion: string): string[] {
  return harness.patches.filter((p) => satisfiesRange(omVersion, p.applies)).map((p) => p.id)
}

function npmLocatorName(locator: string): string | null {
  return locator.startsWith('npm:') ? locator.slice(4) : null
}

function isOfficial(npm: string | null): boolean {
  return !!npm && npm.startsWith('@open-mercato/')
}

function isEnterprise(e: PlanEntry): boolean {
  return !!e.d.enterprise || e.d.npm === '@open-mercato/enterprise'
}

/** Module IDs the entry installs: the descriptor `module`, else every module with src and dist. */
function moduleIdsOf(d: Descriptor, facts: Facts): string[] {
  if (d.module) return [d.module]
  const gate = facts.gate.modules.filter((m) => m.src && m.dist).map((m) => m.id)
  return (gate.length > 0 ? gate : facts.modules.map((m) => m.id)).sort()
}

function modulesOf(facts: Facts, ids: readonly string[]): ModuleFacts[] {
  return facts.modules.filter((m) => ids.includes(m.id))
}

function smokeApi(mods: readonly ModuleFacts[]): string | null {
  for (const m of mods)
    for (const r of m.http.routes)
      if (r.method === 'GET' && r.requireAuth === true && r.path.startsWith('/api/') && !/[[\]]/.test(r.path))
        return r.path
  return null
}

function backendPage(mods: readonly ModuleFacts[]): string | null {
  for (const m of mods) for (const p of m.ui.backendPages) if (!/[[\]]/.test(p.path)) return p.path
  return null
}

function githubTagVersion(sync: SyncRecord | null): { version: string; tag: string } | null {
  const tags = sync?.github?.tags ?? []
  let best: { version: string; tag: string } | null = null
  for (const t of tags) {
    const v = t.name.replace(/^v/, '')
    if (!isVersion(v) || /-/.test(v)) continue
    if (!best || compareVersions(v, best.version) > 0) best = { version: v, tag: t.name }
  }
  return best
}

type Resolved = { ok: true; specs: string[] } | { ok: false; reason: string }

/** Receipts of an entry that scaffolded a preset (a receipt without `om.preset` scaffolded the empty one). */
function receiptsOf(e: PlanEntry, preset: PresetId): Receipt[] {
  return e.receipts.filter((r) => receiptPreset(r) === preset)
}

/** The version of an entry a fresh app of a preset would install on a line (D46: recommended first). */
function installVersionOn(e: PlanEntry, line: LineInfo, now: string, preset: PresetId): string | null {
  const npm = e.sync?.npm
  if (!npm) return null
  const rec = recommendedVersions({
    lines: [line],
    receipts: receiptsOf(e, preset),
    npm: npm.name,
    publishedAt: npm.publishedAt,
    now,
  })[line.key]
  return rec ?? installableOnLine(e, line, now) ?? (line.source === 'develop' ? npm.preview : null)
}

interface Ctx {
  input: PlanInput
  byLocator: Map<string, PlanEntry>
  catalog: CatalogRef[]
  /** data/presets.json with every line and preset filled (`presetsOrFallback`). */
  presets: ReturnType<typeof presetsOrFallback>
}

/**
 * `requiresSpecs` of a cell, deepest first (spec 5.3): module IDs from facts `requires` and catalog peers
 * (data-sync-durable -> durable-work). IDs the cell's preset registers are skipped (an app from the classic preset has
 * integrations, catalog and sales on); an ID of a catalog entry becomes `<npm>@<install version>`, an ID of a core
 * module `core:<id>`, a catalog library the package peers on `lib:<npm>@<install version>` (`yarn add`, never `module
 * add`: terminal-tracking and @freighttech/ui); anything else makes the cell untested.
 */
function resolveRequires(
  ctx: Ctx,
  e: PlanEntry,
  facts: Facts,
  ids: readonly string[],
  line: LineInfo,
  stack: string[],
  presetId: PresetId,
): Resolved {
  const list = presetId === 'classic' ? ctx.presets[line.key]?.classic : ctx.presets[line.key]?.empty
  const preset = new Set((list ?? []).map((m) => m.id))
  const out: string[] = []
  const add = (s: string) => {
    if (!out.includes(s)) out.push(s)
  }
  const visitEntry = (dep: PlanEntry): string | null => {
    if (stack.includes(dep.locator)) return null
    const v = installVersionOn(dep, line, ctx.input.now, presetId)
    const depNpm = dep.sync?.npm?.name ?? null
    const depFacts = v ? dep.facts(v) : null
    if (!v || !depNpm || !depFacts) return `requires ${dep.locator}, which has no installable version on ${line.key}`
    const depIds = moduleIdsOf(dep.d, depFacts)
    if (depIds.length > 0 && depIds.every((id) => preset.has(id))) return null
    const r = resolveRequires(ctx, dep, depFacts, depIds, line, [...stack, dep.locator], presetId)
    if (!r.ok) return r.reason
    r.specs.forEach(add)
    add(`${dep.d.kind === 'library' ? 'lib:' : ''}${depNpm}@${v}`)
    return null
  }
  for (const m of modulesOf(facts, ids)) {
    for (const req of m.requires) {
      const id = req.raw
      if (preset.has(id) || ids.includes(id)) continue
      let dep: PlanEntry | undefined
      if (req.resolvesTo && /^(npm|github):/.test(req.resolvesTo)) dep = ctx.byLocator.get(req.resolvesTo)
      // a core module satisfies its own ID (review r4: sync-akeneo got the third-party data_sync replacement instead
      // of core data_sync, so an official receipt depended on someone else's code); the Install plan does the same
      if (!dep && (ctx.input.builtinIds.has(id) || req.resolvesTo === `core:${id}`)) {
        add(`core:${id}`)
        continue
      }
      // a catalog entry that replaces a core module never stands in for it in another module's requires
      dep ??= [...ctx.byLocator.values()].find((x) => {
        if (x.locator === e.locator || (x.d.replaces ?? []).includes(`core:${id}`)) return false
        const v = installVersionOn(x, line, ctx.input.now, presetId)
        const f = v ? x.facts(v) : null
        return !!f && moduleIdsOf(x.d, f).includes(id)
      })
      if (dep) {
        const err = visitEntry(dep)
        if (err) return { ok: false, reason: err }
        continue
      }
      return { ok: false, reason: `unresolved requires: ${id}` }
    }
  }
  const peers = catalogPeerRequires(e.locator, e.sync?.npm?.peerDependencies, ctx.catalog)
  for (const p of peers) {
    const dep = p.resolvesTo ? ctx.byLocator.get(p.resolvesTo) : undefined
    if (!dep) continue
    const err = visitEntry(dep)
    if (err) return { ok: false, reason: err }
  }
  if (out.length > 10) return { ok: false, reason: `requires closure has ${out.length} items (max 10)` }
  return { ok: true, specs: out }
}

function label(
  locator: string | null,
  version: string | null,
  line: string,
  mode: CellMode,
  preset: PresetId = 'empty',
): string {
  const what = locator === null ? 'baseline' : `${locator}@${version ?? '?'}`
  const tags = [...(preset === 'classic' ? ['classic'] : []), ...(mode === 'early' ? ['early'] : [])]
  return `${what} on ${line}${tags.length ? ` (${tags.join(', ')})` : ''}`
}

/** Whether the npm data lists a version of a package (the version a new app ships on a line). */
function npmLists(n: NonNullable<SyncRecord['npm']>, v: string): boolean {
  return !!n.publishedAt[v] || n.latestStable === v || n.preview === v || Object.values(n.distTags).includes(v)
}

export function planMatrix(input: PlanInput): Matrix {
  const node = input.node ?? NODE_VERSION
  const runner = input.runner ?? 'ubuntu-latest'
  const hash = input.harnessHash
  const due = dueLines(input)
  const selecting = !!input.cells && input.cells.length > 0
  const lineSet = new Set<string>(
    input.onlyLines && input.onlyLines.length > 0
      ? input.onlyLines
      : selecting
        ? input.lines.lines.map((l) => l.key)
        : [...due],
  )
  const lines = input.lines.lines.filter((l) => lineSet.has(l.key)).map(lineInfo)
  // classic first (the main verdict), then empty (the signal `in isolation`), decision of 24 Oct
  const presetIds = PRESET_IDS.filter((p) => !input.onlyPresets?.length || input.onlyPresets.includes(p))
  const ctx: Ctx = {
    input,
    byLocator: new Map(input.entries.map((e) => [e.locator, e])),
    catalog: input.entries.map((e) => ({
      locator: e.locator,
      npm: npmLocatorName(e.locator),
      kind: e.d.kind,
    })),
    presets: presetsOrFallback(input.presets, input.lines.lines, input.now),
  }

  const candidates: Candidate[] = []
  const notRun: NotRunCell[] = []
  // cells of a package the new app already ships (classic, in-preset): run after the packages outside the preset
  const shipsKeys = new Set<string>()
  const weeklyNight = new Date(input.now).getUTCDay() === input.harness.weeklyDay
  // the signal `in isolation` of a version is fresh for MEMO_DAYS whatever harness wrote it (review of 24 Oct: a change
  // of steps.sh made every empty cell run again; their receipts stay valid and are shown)
  const freshIsolation = (receipts: readonly Receipt[], locator: string, version: string, omVersion: string) =>
    receipts.find(
      (r) =>
        receiptPreset(r) === 'empty' &&
        r.module?.locator === locator &&
        r.module.version === version &&
        r.om.version === omVersion &&
        r.harness.mode === 'realistic' &&
        r.harness.runner === runner &&
        r.transition.confirmed &&
        daysBetween(r.run.at, input.now) < MEMO_DAYS,
    )
  const keyOf = (
    locator: string | null,
    version: string | null,
    integrity: string | null,
    om: string,
    mode: CellMode,
    preset: PresetId,
  ) => cellKey({ locator, version, integrity, omVersion: om, harnessHash: hash, node, mode, runner, preset })
  const memoHit = (receipts: readonly Receipt[], key: string): boolean => {
    const r = receipts.filter((x) => x.cellKey === key && x.harness.runner === runner).at(-1)
    return !!r && r.transition.confirmed && daysBetween(r.run.at, input.now) < MEMO_DAYS
  }
  const skip = (
    e: PlanEntry,
    line: LineInfo,
    preset: PresetId,
    version: string | null,
    integrity: string | null,
    status: NotRunCell['status'],
    reason: string,
    mode: CellMode = 'realistic',
    quarantineUntil: string | null = null,
  ) => {
    const key = keyOf(e.locator, version, integrity, line.version, mode, preset)
    notRun.push({
      key,
      key12: key12(key),
      locator: e.locator,
      version,
      integrity,
      line: line.key,
      omVersion: line.version,
      preset,
      mode,
      status,
      reason: reason.slice(0, 200),
      quarantineUntil,
    })
  }

  /**
   * The catalog packages a new app (classic) of a line registers, and the GET route of each its baseline smoke-tests
   * (review of 24 Oct): from the facts of the version that app ships, else of the version a fresh app installs.
   */
  const presetSmokeOf = (line: LineInfo): { packages: string[]; smoke: string[] } => {
    const packages: string[] = []
    const smoke: string[] = []
    for (const e of [...input.entries].sort((a, b) => a.locator.localeCompare(b.locator))) {
      const npm = npmLocatorName(e.locator)
      if (!npm || isEnterprise(e) || !registeredIn(ctx.presets, line.key, MAIN_PRESET, npm)) continue
      if (packages.length >= 60) break
      packages.push(npm)
      const latest = e.sync?.npm?.latestStable ?? null
      const facts =
        e.facts(shippedVersion(line.version)) ??
        e.facts(installableOnLine(e, line, input.now) ?? '') ??
        (latest ? e.facts(latest) : null)
      const api = facts ? smokeApi(modulesOf(facts, moduleIdsOf(e.d, facts))) : null
      if (api && smoke.length < 40) smoke.push(`${npm}=${api}`)
    }
    return { packages, smoke }
  }

  for (const line of lines) {
    const patches = patchesFor(input.harness, line.version)
    for (const preset of presetIds) {
      // Baseline: one app per line and preset as scaffolded, nothing added.
      {
        const key = keyOf(null, null, null, line.version, 'realistic', preset)
        const shipped = preset === MAIN_PRESET ? presetSmokeOf(line) : { packages: [], smoke: [] }
        candidates.push({
          memo: memoHit(input.baselineReceipts, key) ? 'key' : false,
          cell: {
            key,
            key12: key12(key),
            baseline: true,
            locator: null,
            version: null,
            integrity: null,
            line: line.key,
            omVersion: line.version,
            createApp: `create-mercato-app@${line.version}`,
            preset,
            moduleSpec: null,
            moduleNpm: null,
            moduleIds: [],
            moduleFlag: null,
            thirdParty: false,
            requiresSpecs: [],
            replaces: [],
            official: true,
            mode: 'realistic',
            patches,
            smokeApi: null,
            backendPage: null,
            smokePaths: [],
            presetPackages: shipped.packages,
            presetSmoke: shipped.smoke,
            priority: 0,
            label: label(null, null, line.key, 'realistic', preset),
          },
        })
      }

      for (const e of input.entries) {
        const d = e.d
        if (d.status !== 'active' && d.status !== 'hold') continue
        const npmName = npmLocatorName(e.locator)
        const official = isOfficial(npmName)
        const n = e.sync?.npm ?? null
        const latest = n?.latestStable ?? null
        const own = receiptsOf(e, preset)

        const versions: { version: string; mode: CellMode; spec: string | null; ships?: boolean }[] = []
        if (npmName) {
          if (!n) {
            skip(e, line, preset, null, null, 'untested', 'no sync record yet')
            continue
          }
          if (isEnterprise(e)) {
            skip(
              e,
              line,
              preset,
              latest ?? n.preview,
              null,
              'skipped',
              'Enterprise modules need OM_ENABLE_ENTERPRISE_MODULES.',
            )
            continue
          }
          const pre = isPreapproved(n.name, line.preapproved)
          const inst = installableOnLine(e, line, input.now)
          // provider, library and tool are skipped (spec 5.3) before the age gate: no quarantine receipts for them.
          const entryKind = (latest ? e.facts(latest)?.kind : null) ?? (inst ? e.facts(inst)?.kind : null) ?? d.kind
          if (entryKind !== 'module') {
            const v = latest ?? inst ?? n.preview
            skip(e, line, preset, v, v && v === latest ? n.integrity : null, 'skipped', `kind ${entryKind}`)
            continue
          }
          // A package a new app of the line registers (the classic preset: checkout, webhooks, events and the rest of
          // the template) ships at the app's own version (create-mercato-app pins its @open-mercato packages): the
          // classic cell tests that version, `add` is `yarn add` of it (note in-preset). Moving such an app to another
          // version is no test of what a new app has.
          if (preset === MAIN_PRESET && registeredIn(ctx.presets, line.key, preset, n.name)) {
            const v = shippedVersion(line.version)
            // on next a new app ships a new develop snapshot almost every night, so no memo ever holds it: a regular
            // night tests the baseline and the packages outside the preset there, the weekly night these too (the
            // predicate the site's queue sentences read, lib/core/lines.ts `cellCadence`)
            if (presetCellsWeekly(line) && input.event === 'schedule' && !weeklyNight && !selecting)
              skip(
                e,
                line,
                preset,
                v,
                null,
                'untested',
                `a new app on ${line.key} ships the develop snapshot, a new one most nights: tested on the weekly night`,
              )
            else if (npmLists(n, v)) versions.push({ version: v, mode: 'realistic', spec: null, ships: true })
            else
              skip(
                e,
                line,
                preset,
                v,
                null,
                'untested',
                `a new app on ${line.key} ships ${v}, which the npm data does not list yet`,
              )
          } else {
            if (inst) versions.push({ version: inst, mode: 'realistic', spec: null })
            if (latest && latest !== inst && !isInstallable(n.publishedAt[latest], pre, input.now)) {
              const until = installableFrom(n.publishedAt[latest], pre)
              skip(
                e,
                line,
                preset,
                latest,
                n.integrity,
                'quarantine',
                `in the age gate until ${until ?? '?'}`,
                'realistic',
                until,
              )
              const hasEarly = own.some(
                (r) => r.om.line === line.key && r.harness.mode === 'early' && r.module?.version === latest,
              )
              if (!hasEarly) versions.push({ version: latest, mode: 'early', spec: null })
            }
            const rec = recommendedVersions({
              lines: [line],
              receipts: own,
              npm: n.name,
              publishedAt: n.publishedAt,
              now: input.now,
            })[line.key]
            if (rec && inst && rec !== inst && decisiveReceipt(own, line.key, inst)?.result.status !== 'verified')
              versions.push({ version: rec, mode: 'realistic', spec: null })
            if (!latest) {
              if (official && n.preview && line.source === 'develop')
                versions.push({ version: n.preview, mode: 'realistic', spec: null })
              else if (official)
                skip(e, line, preset, n.preview, null, 'skipped', 'No stable release yet. Tested on next only.')
              else skip(e, line, preset, n.preview, null, 'untested', 'no stable release')
            }
          }
        } else {
          const tag = githubTagVersion(e.sync)
          if (!tag) {
            skip(e, line, preset, null, null, 'untested', 'no version tag')
            continue
          }
          const f = e.facts(tag.version)
          const repo = e.sync?.github?.repo ?? e.locator.slice('github:'.length)
          if (!f || !f.gate.modules.some((m) => m.dist)) {
            skip(e, line, preset, tag.version, null, 'untested', 'needs build from source')
            continue
          }
          versions.push({
            version: tag.version,
            mode: 'realistic',
            spec: `${f.package.name}@https://codeload.github.com/${repo}/tar.gz/${tag.tag}`,
          })
        }

        for (const v of versions) {
          if (input.mode && v.mode !== input.mode) continue
          // the version a new app ships may have no facts of its own yet (a develop build): its module IDs and smoke
          // paths come from the facts of the version a fresh app installs, the package being the same
          const own = e.facts(v.version)
          const facts =
            own ??
            (v.ships
              ? (e.facts(installableOnLine(e, line, input.now) ?? '') ?? (latest ? e.facts(latest) : null))
              : null)
          const integrity = own?.package.integrity ?? (v.version === latest ? (n?.integrity ?? null) : null)
          const kind = facts?.kind ?? d.kind
          if (kind !== 'module') {
            skip(e, line, preset, v.version, integrity, 'skipped', `kind ${kind}`, v.mode)
            continue
          }
          if (!facts) {
            skip(e, line, preset, v.version, integrity, 'untested', `no facts for ${v.version} yet`, v.mode)
            continue
          }
          if (!facts.gate.installable) {
            skip(
              e,
              line,
              preset,
              v.version,
              integrity,
              'untested',
              `not installable: ${facts.gate.reason ?? 'gate'}`,
              v.mode,
            )
            continue
          }
          const ids = moduleIdsOf(d, facts)
          const req = resolveRequires(ctx, e, facts, ids, line, [e.locator], preset)
          if (!req.ok) {
            skip(e, line, preset, v.version, integrity, 'untested', req.reason, v.mode)
            continue
          }
          const mods = modulesOf(facts, ids)
          const key = keyOf(e.locator, v.version, integrity, line.version, v.mode, preset)
          const npm = npmName ?? facts.package.name
          const cell: MatrixCell = {
            key,
            key12: key12(key),
            baseline: false,
            locator: e.locator,
            version: v.version,
            integrity,
            line: line.key,
            omVersion: line.version,
            createApp: `create-mercato-app@${line.version}`,
            preset,
            moduleSpec: v.spec ?? `${npm}@${v.version}`,
            moduleNpm: npm,
            moduleIds: ids,
            moduleFlag: d.module ?? (facts.gate.needsModuleFlag ? (ids[0] ?? null) : null),
            thirdParty: !isOfficial(npm),
            requiresSpecs: req.specs,
            replaces: (d.replaces ?? []).map((r) => r.slice('core:'.length)),
            official,
            mode: v.mode,
            patches,
            smokeApi: smokeApi(mods),
            backendPage: backendPage(mods),
            smokePaths: d.smoke?.paths ?? [],
            presetPackages: [],
            presetSmoke: [],
            priority: line.source === 'latest' ? 1 : official ? 2 : 3,
            label: label(e.locator, v.version, line.key, v.mode, preset),
          }
          const fresh =
            v.mode !== 'early' && preset === 'empty'
              ? freshIsolation(e.receipts, e.locator, v.version, line.version)
              : undefined
          const memo: Candidate['memo'] =
            v.mode === 'early' ? false : memoHit(e.receipts, key) ? 'key' : fresh ? { isolation: fresh.run.at } : false
          if (v.ships) shipsKeys.add(key)
          candidates.push({ cell, memo })
        }
      }
    }
  }

  // Selection: explicit cells (ignore memo), else everything due that is not memoized.
  const wanted = (c: MatrixCell) =>
    (input.cells ?? []).some((s) => s === c.key || s === c.key12 || (c.locator !== null && s === c.locator))
  let memo = 0
  // the part of the memo that rests on fresh isolation receipts of any harness, and when the first of those ages out
  // (review of 24 Oct: the plan said `same key` for 113 empty cells whose keys changed with steps.sh)
  let memoIsolation = 0
  let memoIsolationUntil: string | null = null
  const picked: MatrixCell[] = []
  const seen = new Set<string>()
  for (const { cell, memo: m } of candidates) {
    if (seen.has(cell.key)) continue
    seen.add(cell.key)
    if (selecting) {
      if (wanted(cell)) picked.push(cell)
    } else if (m) {
      memo++
      if (typeof m === 'object') {
        memoIsolation++
        const until = new Date(Date.parse(m.isolation) + MEMO_DAYS * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
        if (!memoIsolationUntil || until < memoIsolationUntil) memoIsolationUntil = until
      }
    } else picked.push(cell)
  }
  // the main verdict first: a budget cut defers cells of the empty preset before any cell of the classic one, and in
  // the classic preset the packages a new app already ships (a scaffold and build of the baseline's app again) after
  // the packages outside the preset
  const presetRank = (c: MatrixCell) => (c.preset === MAIN_PRESET ? 0 : 1)
  const shipsRank = (c: MatrixCell) => (shipsKeys.has(c.key) ? 1 : 0)
  picked.sort(
    (a, b) =>
      presetRank(a) - presetRank(b) ||
      shipsRank(a) - shipsRank(b) ||
      a.priority - b.priority ||
      (a.label < b.label ? -1 : a.label > b.label ? 1 : 0),
  )

  const weekly = weeklyNight
  const budgetMin = input.budgetMin ?? (weekly ? BUDGET_WEEKLY_MIN : BUDGET_NIGHT_MIN)
  // Cells run PARALLEL at a time; the window is the cell minutes over PARALLEL, each cell weighed by its preset
  // (MINUTES_BY_PRESET). The first cell always runs. With cells of both presets, the classic ones stop one wave short
  // (EMPTY_RESERVE_MIN), which the empty ones then fill.
  const window = (minutes: number) => Math.ceil(minutes / PARALLEL / MINUTES_PER_CELL) * MINUTES_PER_CELL
  const reserve =
    picked.some((c) => c.preset === MAIN_PRESET) && picked.some((c) => c.preset !== MAIN_PRESET)
      ? Math.min(EMPTY_RESERVE_MIN, budgetMin)
      : 0
  let used = 0
  const cells: MatrixCell[] = []
  const deferredCells: MatrixCell[] = []
  for (const c of picked) {
    const m = MINUTES_BY_PRESET[c.preset]
    const limit = c.preset === MAIN_PRESET ? budgetMin - reserve : budgetMin
    if (cells.length >= MAX_CELLS || (cells.length > 0 && window(used + m) > limit)) {
      deferredCells.push(c)
      continue
    }
    used += m
    cells.push(c)
  }
  const deferred = deferredCells.map((c) => ({ key: c.key, label: c.label }))
  const notRunUnique = [...new Map(notRun.map((x) => [x.key, x])).values()].filter(
    (x) => !selecting || (input.cells ?? []).some((s) => s === x.key || s === x.key12 || s === x.locator),
  )

  return Matrix.parse({
    schema: 1,
    generatedAt: input.now,
    attempt: input.attempt ?? 1,
    runner,
    node,
    harness: { hash, version: harnessVersion(hash) },
    lines: input.lines.lines.map((l) => ({
      key: l.key,
      version: l.version,
      source: l.source,
      createApp: l.createApp,
      due: lineSet.has(l.key),
    })),
    cells,
    notRun: notRunUnique,
    deferred,
    memo,
    ...(memoIsolation > 0 ? { memoIsolation, memoIsolationUntil } : {}),
    estimate: {
      parallel: PARALLEL,
      minutesPerCell: cells.length ? Math.round((used / cells.length) * 10) / 10 : MINUTES_PER_CELL,
      budgetMin,
      windowMin: window(used),
    },
  })
}
