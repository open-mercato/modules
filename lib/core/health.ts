// `health/<locpath>.json` (spec 4.5, 6): identity, signals, LST/VER rules, tier, agentPolicy per line.
// Pure function over the data branch; lib/commands/health.ts does the I/O. Isomorphic: no Node APIs.
import type { CellStatus } from '../schema/common.ts'
import type { Descriptor } from '../schema/descriptor.ts'
import type { Facts } from '../schema/data/facts.ts'
import type { FitCell } from '../schema/data/fit.ts'
import type { Health, Policy, Signals } from '../schema/data/health.ts'
import type { Receipt } from '../schema/data/receipt.ts'
import type { Presets } from '../schema/data/lines.ts'
import type { Claims, SyncRecord } from '../schema/data/sync.ts'
import type { CellSummary, IndexEntry, IsolationCell } from '../schema/published/modules.ts'
import { parseLocator } from '../schema/locator.ts'
import {
  ascendingKeys,
  cellSummaries,
  installableFrom,
  isolationReceipts,
  isPreapproved,
  lastReceipt,
  latestLine,
  mainReceipts,
  newAppLines,
  newerBreak,
  presetModules,
  registeredIn,
  type NewerBreak,
  recommendedVersions,
  shippedVersion,
  versionStatus,
  type LineInfo,
  type PresetMap,
  type VersionStatus,
} from './lines.ts'
import {
  BACKEND_ROUTE_COLLISION,
  backendRouteCollisions,
  errorFindingText,
  explainReceiptStep,
  findingText,
  type RouteCollision,
  type RouteFact,
} from './finding.ts'
import { agentPolicy, installVersion, type PolicyEntry } from './policy.ts'
import { compareVersions, isVersion } from './semver.ts'
import {
  anatomySignal,
  declaredVsObservedSignal,
  hygieneFindings,
  hygieneSignal,
  identityLicense,
  maintenanceSignal,
  supplyChainSignal,
} from './signals.ts'
import { listedRules, newestInstallable, tierFrom, verifiedRules } from './tier.ts'

export interface HealthInput {
  locator: string
  /** Parsed descriptor (Zod output), or null when the file is missing or invalid. */
  descriptor: Descriptor | null
  /** Validation issues of the descriptor (LST-1); [] when valid, null when there is no descriptor. */
  descriptorIssues: readonly string[] | null
  sync: SyncRecord | null
  /**
   * Facts of the judged version: the first of `judgedVersions` that has facts (`judgedFacts`). LST-3, VER-2,
   * VER-4, anatomy and module IDs are judged on it, so a release in the age gate does not change the level.
   */
  facts: Facts | null
  /** Fit cell of the same version per line key (used when `fitOf` is absent). */
  fit: Readonly<Record<string, FitCell | null | undefined>>
  /**
   * Fit cell of any version on a line (orchestrator decision E5). When given, each line is judged on its own
   * install version (`recommended[line]`, before receipts the newest stable that fits the line statically), so
   * line 0.8 of a lockstep official package reads the Fit of 0.8.0, not of 0.9.0.
   */
  fitOf?: (version: string, line: string) => FitCell | null | undefined
  receipts: readonly Receipt[]
  /** `data/lines.json` lines. */
  lines: readonly LineInfo[]
  claims?: Claims
  quality?: Health['quality']
  /**
   * data/presets.json filled per line and preset (`presetsOrFallback`): a package the classic preset registers is on
   * in a new app of the line, and its main verdict there is the receipt of the version that app ships (24 Oct).
   */
  presets?: Presets | PresetMap | null
  /** Routes of a version's facts, for naming the route of a smoke 403 in an isolation finding (lib/core/finding.ts). */
  routesOf?: (version: string) => readonly RouteFact[] | undefined
  /**
   * The backend routes of a module of a new app on a line (round 14, lint `backend-route-collision`): of the built-in
   * module in the core facts of that line's version, of a package's module in the facts of the version a new app
   * ships there; null when the catalog has no such facts (the develop snapshot on next). `presetBackendRoutes`.
   */
  backendRoutesOf?: (from: string, moduleId: string, line: LineInfo) => readonly string[] | null
  now: string
}

/** What `presetBackendRoutes` reads of a facts file: each module's backend routes (`collisionKeys.backendRoutes`). */
export interface RoutesFacts {
  modules: readonly { id: string; collisionKeys: { backendRoutes: readonly string[] } }[]
}

/**
 * `HealthInput.backendRoutesOf` from the data branch (round 14): a built-in module from the core facts of the line's
 * version (`builtin/<coreVersion>.json`, only when that is the line's version), a package's module from the facts of
 * the version a new app ships there (`shippedVersion`). The emitter and `yarn om health` pass it, so both agree.
 */
export function presetBackendRoutes(
  builtin: (RoutesFacts & { coreVersion: string }) | null,
  factsOf: (npm: string, version: string) => RoutesFacts | null,
): (from: string, moduleId: string, line: LineInfo) => readonly string[] | null {
  return (from, moduleId, line) => {
    const f =
      from === '@open-mercato/core'
        ? builtin?.coreVersion === line.version
          ? builtin
          : null
        : factsOf(from, shippedVersion(line.version))
    const m = f?.modules.find((x) => x.id === moduleId)
    return m ? m.collisionKeys.backendRoutes : null
  }
}

/** Everything health and the index entry need, computed once. */
export interface Evaluation {
  health: Health
  /** `IndexEntry.version` (D46 `recommended` included). */
  version: IndexEntry['version']
  /** `IndexEntry.compat.lines`: the main verdict, receipts of a new app (the classic preset). */
  cells: Record<string, CellSummary>
  /** Lines whose new app (classic) registers the package (`compat.inPresets`); [] for none. */
  inPresets: string[]
  /** Lines whose app from the empty preset registers it too (`compat.inEmptyPreset`); [] for none. */
  inEmptyPreset: string[]
  /** The version a new app ships on the lines of `inPresets` (`compat.ships`). */
  ships: Record<string, string>
  /** The signal `in isolation` per line (`compat.isolation`): receipts of the empty preset, never the verdict. */
  isolation: Record<string, IsolationCell>
  /** `compat.newerBreaks` (review r8); {} for none. */
  newerBreaks: Record<string, NewerBreak>
  /** `compat.collisions` (round 14, lint `backend-route-collision`); {} for none. */
  collisions: Record<string, RouteCollision[]>
  /** Lines whose declared peer range covers the line version (`compat.builtFor.lines`). */
  builtFor: IndexEntry['compat']['builtFor']
  verifiedOn: string[]
  kind: IndexEntry['kind']
  moduleIds: string[]
  listed: boolean
  /** Newest stable version past the age gate per line (`IndexEntry._meta`, INSTALLABLE_META_KEY). */
  installableVersions: Record<string, string | null>
  /** Input of agentPolicy, also usable for plans before the index exists. */
  policyEntry: PolicyEntry
}

function githubTag(sync: SyncRecord | null): { name: string; version: string } | null {
  const tags = (sync?.github?.tags ?? [])
    .map((t) => ({ name: t.name, version: t.name.replace(/^v/, '') }))
    .filter((t) => isVersion(t.version))
    .sort((a, b) => compareVersions(b.version, a.version))
  return tags[0] ?? null
}

/** Version data of an entry, shared by `evaluateEntry` and `judgedVersions`. */
interface VersionData {
  npm: string | null
  tag: { name: string; version: string } | null
  latestVersion: string | null
  preview: string | null
  recommended: Record<string, string | null>
  installableVersions: Record<string, string | null>
}

type VersionInput = Pick<HealthInput, 'locator' | 'sync' | 'receipts' | 'lines' | 'now' | 'fitOf' | 'presets'>

function versionData(i: VersionInput): VersionData {
  const parsed = parseLocator(i.locator)
  const npm = parsed.source === 'npm' ? parsed.name : null
  const n = i.sync?.npm ?? null
  const tag = parsed.source === 'github' ? githubTag(i.sync) : null
  // D46 from the main verdict only: a version verified in an app from the empty preset is not recommended (24 Oct)
  const recommended = recommendedVersions({
    lines: i.lines,
    receipts: mainReceipts(i.receipts),
    npm,
    publishedAt: n?.publishedAt ?? {},
    now: i.now,
  })
  const installableVersions: Record<string, string | null> = {}
  const fitOf = i.fitOf
  for (const l of i.lines)
    installableVersions[l.key] = newestInstallable(i.sync, l, i.now, fitOf ? (v) => fitOf(v, l.key) : undefined)
  return {
    npm,
    tag,
    latestVersion: n ? n.latestStable : (tag?.version ?? null),
    preview: n ? n.preview : null,
    recommended,
    installableVersions,
  }
}

/**
 * Versions whose facts and Fit judge the version-bound rules (LST-3, VER-2, VER-4), anatomy and module IDs,
 * best first: the version a fresh app installs on the latest line (`recommended`, else the newest stable past
 * the age gate, spec 4.6, D46), then the other known releases, newest first. A release in the age gate, or one
 * not scanned yet, never decides the level (6.3); callers load the first version that has facts (`judgedFacts`).
 */
export function judgedVersions(i: VersionInput): string[] {
  const v = versionData(i)
  const latest = latestLine(i.lines)
  const n = i.sync?.npm ?? null
  const first = latest
    ? installVersion(
        {
          version: { recommended: v.recommended, latest: v.latestVersion, preview: v.preview } as IndexEntry['version'],
          installableVersions: v.installableVersions,
        },
        latest.key,
      )
    : null
  const all = [first, v.latestVersion, n?.previousStable ?? null, v.preview]
  return all.filter((x, idx): x is string => !!x && all.indexOf(x) === idx)
}

/** The judged version and its facts: the first of `judgedVersions` with facts, else the first, without facts. */
export function judgedFacts(
  i: VersionInput,
  factsOf: (version: string) => Facts | null,
): { version: string | null; facts: Facts | null } {
  const versions = judgedVersions(i)
  for (const version of versions) {
    const facts = factsOf(version)
    if (facts) return { version, facts }
  }
  return { version: versions[0] ?? null, facts: null }
}

/** Kinds the nightly run installs: a module, never the enterprise bundle (spec 5.3). */
const moduleKindOf = (kind: string, enterprise: boolean): boolean => kind === 'module' && !enterprise

/** Module IDs the entry installs: gate modules with src and dist (descriptor `module` narrows to one). */
export function entryModuleIds(facts: Facts | null, descriptor: Pick<Descriptor, 'module'> | null): string[] {
  const fromGate = (facts?.gate.modules ?? []).filter((m) => m.src && m.dist).map((m) => m.id)
  const ids = fromGate.length > 0 ? fromGate : (facts?.modules ?? []).map((m) => m.id)
  const valid = ids.filter((id) => /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(id))
  return descriptor?.module ? valid.filter((id) => id === descriptor.module) : valid
}

export function evaluateEntry(i: HealthInput): Evaluation {
  const parsed = parseLocator(i.locator)
  const source = parsed.source
  const npm = parsed.source === 'npm' ? parsed.name : null
  const enterprise = npm === '@open-mercato/enterprise'
  const d = i.descriptor
  const kind = i.facts?.kind ?? d?.kind ?? 'module'
  const latest = latestLine(i.lines)

  // identity
  const type: Health['identity']['type'] =
    i.sync?.type ?? (npm?.startsWith('@open-mercato/') ? 'official' : '3rd-party')
  const typeReason = i.sync?.typeReason ?? 'No sync record yet.'
  const license = identityLicense(i.facts, i.sync, enterprise)
  const prov = i.sync?.provenance
  const claim = i.claims?.[i.locator]
  const identity: Health['identity'] = {
    type,
    typeReason,
    enterprise,
    license,
    builtFrom: {
      status: prov?.status ?? 'none',
      repo: prov?.sourceRepo ?? null,
      commit: prov?.commit ?? null,
      workflow: prov?.workflow ?? null,
    },
    claimed: claim
      ? { value: true, by: claim.by, method: claim.method, pr: claim.pr }
      : { value: false, by: null, method: null, pr: null },
    source,
  }

  // versions
  const n = i.sync?.npm ?? null
  const { tag, latestVersion, preview, recommended, installableVersions } = versionData(i)
  const current = latestVersion ?? preview
  const publishedAt = current && n ? (n.publishedAt[current] ?? null) : null
  const pre = isPreapproved(npm, latest?.preapproved)
  const version: IndexEntry['version'] = {
    latest: latestVersion,
    preview,
    publishedAt: publishedAt ? publishedAt.slice(0, 10) : null,
    integrity: n?.integrity ?? null,
    installableFrom: installableFrom(publishedAt, pre),
    gitRef: source === 'github' ? (tag?.name ?? null) : (n?.gitHead ?? null),
    recommended,
  }

  // each line is judged on its own install version (D46, E5): `recommended[line]`, else the newest stable past the
  // age gate that fits the line statically, else the newest release
  const evaluated: Record<string, string | null> = {}
  for (const l of i.lines) evaluated[l.key] = installVersion({ version, installableVersions }, l.key)

  // The main verdict (decision of 24 Oct): receipts of a new app, the classic preset. Receipts of the empty preset are
  // the signal `in isolation` (`compat.isolation`), which never decides a square, a level, a policy or `recommended`.
  const main = mainReceipts(i.receipts)
  const iso = isolationReceipts(i.receipts)
  const moduleKind = moduleKindOf(kind, enterprise)
  // lines whose new app already registers the package (D10): nothing to install there, and the line is judged on the
  // version that app ships (create-mercato-app pins its @open-mercato packages to its own version)
  const inPresets = moduleKind ? ascendingKeys(newAppLines(i.presets, i.lines, npm), i.lines) : []
  const inEmptyPreset = moduleKind
    ? ascendingKeys(
        i.lines.filter((l) => registeredIn(i.presets, l.key, 'empty', npm)).map((l) => l.key),
        i.lines,
      )
    : []
  const ships: Record<string, string> = {}
  for (const l of i.lines) if (inPresets.includes(l.key)) ships[l.key] = shippedVersion(l.version)
  // the version each line is judged on (`lineVersion`): the one a new app ships there, else the one it installs. The
  // static fit and the declaration (`signals.fit`, `builtFor`) describe that version too (review of 24 Oct: /compat read
  // `Built for 0.9.0 (peers reject 0.8)` for checkout on 0.8, where a new app has 0.8.0, whose peers accept 0.8)
  const judgedOn: Record<string, string | null> = { ...evaluated, ...ships }
  const fitOf = i.fitOf
  const lineFit: Record<string, FitCell | null> = {}
  for (const l of i.lines) {
    const v = judgedOn[l.key] ?? null
    lineFit[l.key] = fitOf ? (v ? (fitOf(v, l.key) ?? null) : null) : (i.fit[l.key] ?? null)
  }
  // the line's cell is the last main receipt of the version it is judged on (review r7): a newer receipt of another
  // version on the line is no verdict, so the square, the counts and the agent policy agree
  const cells = cellSummaries(main, i.lines, judgedOn)
  // why a broken cell broke, when its excerpt says it plainly (round 14): the sentence under the module page's strip,
  // in the words of a new app (the classic preset, what it registers on the line), so every agent channel reads it;
  // else what the step printed first, as the isolation sentence says it (round 15: `Typecheck failed: TS7016 ...`)
  for (const [k, c] of Object.entries(cells)) {
    const r = c.status === 'broken' && c.receipt ? main.find((x) => x.id === c.receipt) : undefined
    if (!r) continue
    const classic = presetModules(i.presets, k, 'classic')
    const why =
      explainReceiptStep(r, {
        preset: 'classic',
        ...(classic ? { registeredBy: (mid: string) => classic.find((m) => m.id === mid)?.from } : {}),
        ...(r.module && i.routesOf ? { routes: i.routesOf(r.module.version) } : {}),
      }) ?? errorFindingText(r)
    if (why) cells[k] = { ...c, finding: why }
  }
  const installStatus: Record<string, VersionStatus | null> = {}
  for (const l of i.lines) installStatus[l.key] = versionStatus(main, l.key, judgedOn[l.key])
  // a newer release that broke where the cell judged the install version: the line's command pins it (review r8)
  const newerBreaks: Record<string, NewerBreak> = {}
  for (const l of i.lines) {
    const b = newerBreak(cells[l.key], lastReceipt(main, l.key))
    if (b) newerBreaks[l.key] = b
  }
  // the signal `in isolation`: the last empty-preset receipt of the version such an app has (the version it ships where
  // the empty preset registers the package, else the one a fresh app installs), else the last one, with what its failed
  // step found (events: GET /api/events needs workflows.view, which the empty preset has off)
  const isoOn: Record<string, string | null> = { ...evaluated }
  for (const l of i.lines) if (inEmptyPreset.includes(l.key)) isoOn[l.key] = shippedVersion(l.version)
  const isolation: Record<string, IsolationCell> = {}
  for (const [k, c] of Object.entries(cellSummaries(iso, i.lines, isoOn))) {
    if (!moduleKind) break
    const r = c.receipt ? iso.find((x) => x.id === c.receipt) : undefined
    const empty = presetModules(i.presets, k, 'empty')
    const found = r
      ? findingText(r, {
          enabledInEmptyPreset: empty ? (mid) => empty.some((m) => m.id === mid) : undefined,
          routes: r.module ? i.routesOf?.(r.module.version) : undefined,
        })
      : null
    // `typecheck failed.` says no more than `broken at typecheck` before it
    // with a capital first letter, as `compat.lines[].finding` (round 16: `typecheck failed: TS2707 ...` beside
    // `Typecheck failed: TS2707 ...` of the same receipt text); a sentence that follows a colon lowers it itself
    const finding =
      found && found !== `${r?.result.failedStep} failed.` ? `${found.charAt(0).toUpperCase()}${found.slice(1)}` : null
    isolation[k] = {
      status: c.status,
      step: c.step,
      moduleVersion: c.moduleVersion,
      at: c.at,
      receipt: c.receipt,
      ...(finding ? { finding } : {}),
    }
  }
  // lint `backend-route-collision` (round 14): a backend page of the module whose URL a module of a new app on the line
  // already has, read statically from the facts of both; `generate` refuses it in `module add`. Never a verdict.
  const ownIds = entryModuleIds(i.facts, d)
  const ownRoutes = (i.facts?.modules ?? [])
    .filter((m) => ownIds.includes(m.id))
    .flatMap((m) => m.collisionKeys.backendRoutes)
  const collisions: Record<string, RouteCollision[]> = {}
  const routesOfApp = i.backendRoutesOf
  // the catalog has no facts of the develop snapshot (round 16: next was never checked, while freighttech broke at add
  // there on the webhooks route): a module of a new app on next is read from the newest other line whose new app
  // registers the same module from the same package, the closest release of it
  const newestFirst = [...i.lines].sort((a, b) => compareVersions(b.version, a.version))
  const routesOn = (m: { id: string; from: string }, l: LineInfo): readonly string[] | null => {
    const own = routesOfApp?.(m.from, m.id, l) ?? null
    if (own || l.source !== 'develop') return own
    for (const o of newestFirst) {
      if (o.key === l.key || o.source === 'develop') continue
      if (!(presetModules(i.presets, o.key, 'classic') ?? []).some((x) => x.id === m.id && x.from === m.from)) continue
      const r = routesOfApp?.(m.from, m.id, o) ?? null
      if (r) return r
    }
    return null
  }
  if (moduleKind && routesOfApp && ownRoutes.length > 0)
    for (const l of i.lines) {
      const app = (presetModules(i.presets, l.key, 'classic') ?? [])
        .filter((m) => m.from !== npm && !ownIds.includes(m.id))
        .flatMap((m) => {
          const routes = routesOn(m, l)
          return routes && routes.length > 0 ? [{ id: m.id, from: m.from, routes }] : []
        })
      const cs = backendRouteCollisions(ownRoutes, app)
      if (cs.length > 0) collisions[l.key] = cs
    }
  const previewOnly = !!n && !n.latestStable && !!n.preview
  const receipt: Record<string, CellStatus> = {}
  for (const l of i.lines) {
    if (!moduleKind || (previewOnly && l.source !== 'develop')) receipt[l.key] = 'skipped'
    else if (recommended[l.key]) receipt[l.key] = 'verified'
    else receipt[l.key] = installStatus[l.key]?.status ?? 'untested'
  }
  const fit: Record<string, Signals['fit'][string]> = {}
  for (const l of i.lines) fit[l.key] = lineFit[l.key]?.status ?? 'unknown'

  const latestFit = latest ? lineFit[latest.key] : null
  const findings = hygieneFindings(i.facts, latestFit, i.sync, d)
  // the lint `backend-route-collision` counts for Hygiene like the lint of the facts (round 15: the page listed it under
  // Hygiene, the card, llms-full.txt and signals.hygiene.failing did not); a warning, never an error
  if (Object.keys(collisions).length > 0) findings.push({ ...BACKEND_ROUTE_COLLISION })
  // a line is "built for" only by a peer range that accepts it: a version with no Open Mercato peers declares nothing
  // (it was every line, as nothing rejects it, so tools read `Built for 0.8, 0.9, next` beside `no Open Mercato peer
  // range` on their card, finding of 25 Oct)
  const builtForLines = ascendingKeys(
    i.lines
      .filter((l) => lineFit[l.key]?.declared.satisfied && lineFit[l.key]?.declared.range != null)
      .map((l) => l.key),
    i.lines,
  )
  // reading order, as the strip and the sentences (review r8): `0.8, 0.9, next`
  const verifiedOn = ascendingKeys(
    i.lines.filter((l) => receipt[l.key] === 'verified').map((l) => l.key),
    i.lines,
  )
  const declared = (latestFit ?? Object.values(lineFit).find((c) => !!c) ?? null)?.declared
  const signals: Signals = {
    receipt,
    fit,
    anatomy: anatomySignal(i.facts, enterprise),
    supplyChain: supplyChainSignal(i.sync, d, i.now),
    hygiene: hygieneSignal(findings),
    maintenance: maintenanceSignal(i.sync, receipt, i.lines, i.now),
    declaredVsObserved: declaredVsObservedSignal(builtForLines, verifiedOn, i.facts, d, {
      peers: !declared ? 'unread' : declared.kind === 'missing' ? 'none' : 'range',
      installed: moduleKind,
    }),
  }

  // state (people first, then automation; spec 6.4)
  const state: Health['state'] =
    d && d.status !== 'active'
      ? d.status
      : n?.deprecated
        ? 'deprecated'
        : i.sync?.github?.archived
          ? 'archived'
          : signals.maintenance.status === 'stale'
            ? 'stale'
            : 'active'

  const rules = [
    ...listedRules({
      source,
      type,
      descriptorIssues: i.descriptorIssues,
      sync: i.sync,
      facts: i.facts,
      kind,
      license,
      licenseValue: i.facts?.license.value ?? i.sync?.npm?.license ?? i.sync?.github?.license ?? null,
      githubTagged: tag !== null,
    }),
    ...verifiedRules({
      source,
      npm,
      descriptorGithub: d?.github ?? null,
      sync: i.sync,
      receipts: main,
      lines: i.lines,
      recommended,
      installableVersions,
      githubVersion: tag?.version ?? null,
      signals,
      ships,
      isolation,
      now: i.now,
    }),
  ]
  const tier = tierFrom(rules, state, enterprise)
  const listed = state !== 'hold' && state !== 'delisted' && rules.every((r) => !r.id.startsWith('LST-') || r.pass)

  const moduleIds = entryModuleIds(i.facts, d)
  const policyEntry: PolicyEntry = {
    locator: i.locator,
    npm,
    kind,
    type,
    status: state,
    license,
    replaces: d?.replaces ?? [],
    moduleIds,
    identity: { builtFrom: identity.builtFrom.status, claimed: identity.claimed.value, source },
    version,
    compat: {
      builtFor: {
        range: declared?.range ?? null,
        kind: declared?.kind ?? 'missing',
        lines: builtForLines,
        ...builtForRanges(
          i.lines.map((l) => l.key),
          lineFit,
          judgedOn,
        ),
      },
      lines: cells,
      verifiedOn,
      ...(inPresets.length > 0 ? { inPresets, ships } : {}),
      ...(inEmptyPreset.length > 0 ? { inEmptyPreset } : {}),
      ...(Object.keys(isolation).length > 0 ? { isolation } : {}),
      ...(Object.keys(newerBreaks).length > 0 ? { newerBreaks } : {}),
      ...(Object.keys(collisions).length > 0 ? { collisions } : {}),
    },
    signals,
    advisories: i.sync?.advisories ?? [],
    installable: i.facts ? i.facts.gate.installable : null,
    statusReason: d?.reason ?? null,
    licenseValue: i.facts?.license.value ?? i.sync?.npm?.license ?? null,
    installableVersions,
    installStatus,
  }
  const policies: Record<string, Policy> = {}
  for (const l of i.lines) policies[l.key] = agentPolicy(policyEntry, l.key, undefined, { now: i.now })

  const health: Health = {
    locator: i.locator,
    version: current,
    computedAt: i.now,
    identity,
    signals,
    rules,
    tier,
    quality: i.quality ?? null,
    agentPolicy: policies,
    state,
    recommended,
    // the version each line was judged on: the one a new app ships there, else the one it installs (24 Oct)
    evaluated: judgedOn,
    verdictPreset: 'classic',
  }
  return {
    health,
    version,
    cells,
    builtFor: policyEntry.compat.builtFor,
    verifiedOn,
    inPresets,
    inEmptyPreset,
    ships,
    isolation,
    newerBreaks,
    collisions,
    kind,
    moduleIds,
    listed,
    installableVersions,
    policyEntry,
  }
}

/**
 * `compat.builtFor.ranges` (review r11, 24 Oct): the declared range of the version each line is judged on, for every
 * line whose declaration the catalog read, when the lines are judged on more than one version or their ranges differ
 * (search 0.8.0 on 0.8 and 0.9.0 on 0.9 read as `range: 0.9.0, lines: [0.8, 0.9]` before). With `ranges`, a line
 * missing from it has a version whose peers the catalog has not read (a develop snapshot a new app ships on next).
 */
function builtForRanges(
  lines: readonly string[],
  fit: Readonly<Record<string, FitCell | null>>,
  versions: Readonly<Record<string, string | null>>,
): { ranges?: Record<string, string> } {
  const ranges: Record<string, string> = {}
  for (const k of lines) {
    const r = fit[k]?.declared.range
    if (r) ranges[k] = r
  }
  const judged = new Set(lines.map((k) => versions[k]).filter((v): v is string => !!v))
  // no version on any line (GitHub-only without a tag): the peers were never read, which `ranges: {}` says to
  // declaredOn and builtForText (finding of 25 Oct: treg read `No peer range` while its package.json has peers)
  if (judged.size === 0) return { ranges: {} }
  if (Object.keys(ranges).length === 0) return {}
  return judged.size > 1 || new Set(Object.values(ranges)).size > 1 ? { ranges } : {}
}

/** Convenience: only the Health document. */
export function computeHealth(i: HealthInput): Health {
  return evaluateEntry(i).health
}
