// /modules.json (spec 4.6), plus /m/<locpath>.json and /m/<locpath>/receipts.json.
import { z } from 'zod'
import {
  AclFeature,
  BuiltForKind,
  CategoryId,
  CellStatus,
  EnvName,
  EventId,
  GithubRepo,
  Host,
  IsoDate,
  IsoDateTime,
  LicenseKind,
  LineKey,
  Locator,
  LocPath,
  ModuleId,
  NpmName,
  OriginType,
  SemVer,
  StableSemVer,
  Step,
  Wedge,
} from '../common.ts'
import { Facts } from '../data/facts.ts'
import { Policy, Signals } from '../data/health.ts'
import { Receipt } from '../data/receipt.ts'

export const CellSummary = z.object({
  status: CellStatus,
  step: Step.nullable(),
  omVersion: SemVer,
  moduleVersion: SemVer.nullable(),
  at: IsoDateTime.nullable(),
  receipt: z.string().nullable(),
  since: IsoDate.nullable(),
  precheck: z.enum(['pass', 'fail']).nullable(),
  patches: z.array(z.string()),
  // additive (round 14): why the failed step of a broken cell failed, one sentence, when its excerpt says it plainly
  // (`In a new app from the default preset, the module adds the backend route /backend/webhooks, ...`): the sentence
  // under the module page's strip, so the card, raw/modules.md, llms-full.txt and check_compat say what people read
  finding: z
    .string()
    .max(300)
    .optional()
    .describe(
      'Why the failed step of a broken cell failed, one sentence, when its excerpt says it plainly. The sentence the module page prints under its strip. Absent: no explanation (the receipt has the error).',
    ),
})

/**
 * A cell of the signal `in isolation` (decision of 24 Oct): the last receipt of an app from the empty preset on a line,
 * in the fields its dot and its sentence read (`finding`: what a failed step found, one sentence). Shorter than
 * CellSummary, so compat.json and modules.json stay within their budgets with both presets.
 */
export const IsolationCell = z.object({
  status: CellStatus,
  step: Step.nullable(),
  moduleVersion: SemVer.nullable(),
  at: IsoDateTime.nullable(),
  receipt: z.string().nullable(),
  finding: z.string().max(300).optional(),
})

export const AnatomySummary = z.object({
  version: SemVer,
  coverage: z.enum(['full', 'partial', 'none']),
  counts: z.object({
    entities: z.number(),
    tables: z.number(),
    migrations: z.number(),
    routes: z.number().nullable(), // routes/publicRoutes null = not measured (built-in: module-facts.v2.json from CLI 0.9.0 has empty apiRoutes)
    publicRoutes: z.number().nullable(),
    aclFeatures: z.number(),
    eventsEmitted: z.number(),
    eventsConsumed: z.number(),
    backendPages: z.number(),
    frontendPages: z.number(),
    widgets: z.number(),
    workers: z.number(),
    cli: z.number(),
    aiTools: z.number(),
    aiAgents: z.number(),
    extends: z.number(),
  }),
  lists: z.object({
    aclFeatures: z.array(AclFeature).max(20),
    eventsEmitted: z.array(EventId).max(20),
    eventsConsumed: z.array(EventId).max(20),
    env: z.array(EnvName).max(20),
    // additive (25 Oct, rentgen 4): names the code only checks are set, so the package works without them; `env`
    // leaves them out (finding of 25 Oct: health listed 18 provider keys as settings it needs)
    envIfSet: z
      .array(EnvName)
      .max(20)
      .optional()
      .describe(
        'Env names the code only checks are set, or reads as an opt-in flag in an isXEnabled() function: optional, not needed to run. Absent: none, or facts older than rentgen 4.',
      ),
    hosts: z.array(Host).max(20),
    // additive (25 Oct): the known service SDKs among the package's dependencies, which reach their service with no URL
    // in the code (finding of 25 Oct: gateway-stripe read `Talks to: no hosts found in the code`)
    sdks: z
      .array(z.string().max(214))
      .max(20)
      .optional()
      .describe(
        'Dependencies that are SDKs of a known external service (stripe, @aws-sdk/client-s3, @ai-sdk/openai), first 20: the package talks to that service without a URL in its code. A curated, partial list. Absent: none known.',
      ),
    tables: z.array(z.string()).max(20),
    publicRoutes: z.array(z.string()).max(10),
    credentials: z.array(z.object({ key: z.string(), type: z.string(), required: z.boolean() })).max(10),
    // additive (round 15): the module's backend pages (`/backend/webhooks`), what `plan_install` lists in
    // `adds.backendPages`; catalog entries only (built-in.json leaves it out)
    backendPages: z
      .array(z.string().max(200))
      .max(20)
      .optional()
      .describe(
        "The package's backend page URLs (first 20), as read from its facts. plan_install lists them in adds.backendPages. Absent: not read (older data, built-in modules).",
      ),
  }),
  callout: z.string().max(240), // e.g. 'ADDS 3 TABLES · 8 ROUTES (0 PUBLIC) · 7 PERMISSIONS · EMITS 9 EVENTS'
  diff: z
    .object({
      from: SemVer,
      added: z.object({
        tables: z.number(),
        routes: z.number(),
        publicRoutes: z.number(),
        aclFeatures: z.number(),
        env: z.array(EnvName),
        hosts: z.array(Host),
      }),
      removed: z.object({ tables: z.number(), routes: z.number(), aclFeatures: z.number() }),
    })
    .nullable(),
})

/**
 * `compat.builtFor`: the peer range of the version a new app has on the latest line (`compat.ships`, else the version
 * it installs), its kind and the lines whose version a range covers. additive (review r11, 24 Oct): `ranges` per line
 * when the lines are judged on different versions (search: 0.8.0 on 0.8, 0.9.0 on 0.9; checkout 0.8.0 in a new 0.8
 * app), so `range` alone never reads as the declaration of another line's version.
 */
export const BuiltFor = z.object({
  range: z.string().nullable(),
  kind: BuiltForKind,
  lines: z.array(LineKey),
  ranges: z
    .record(LineKey, z.string())
    .optional()
    .describe(
      "The declared peer range per line, of the version a new app has on that line (compat.ships, else the version it installs), for every line whose declaration was read, when the lines are judged on different versions or their ranges differ (search: { '0.8': '0.8.0', '0.9': '0.9.0' }). A line in `ranges` but not in `lines` declares a range that rejects the line's version; a line missing from `ranges` has a version whose peers were not read (a develop snapshot on next). Absent: every line is judged on one version, whose declaration is `range`.",
    ),
})

export const IndexEntry = z.object({
  locator: Locator,
  path: LocPath,
  npm: NpmName.nullable(),
  github: GithubRepo.nullable(),
  repoPath: z.string().nullable(),
  kind: z.enum(['module', 'provider', 'library', 'tool']),
  type: OriginType,
  enterprise: z.boolean(),
  title: z.string().max(80),
  summary: z.string(),
  whenToUse: z.string(),
  whenNotToUse: z.string().nullable(),
  category: CategoryId,
  tags: z.array(z.string()),
  providers: z.array(z.object({ name: z.string(), label: z.string() })),
  moduleIds: z.array(ModuleId),
  requires: z.array(z.object({ raw: z.string(), resolvesTo: z.string().nullable() })),
  replaces: z.array(z.string()),
  slotConflicts: z.array(Locator),
  renamedFrom: z.array(Locator),
  supersededBy: z.string().nullable(),
  alternatives: z.array(Locator),
  status: z.enum(['active', 'hold', 'unmaintained', 'delisted', 'deprecated', 'archived', 'stale']),
  listed: z.boolean(),
  featured: z.boolean(),
  license: z.object({ spdx: z.string().nullable(), kind: LicenseKind, mismatch: z.boolean() }),
  version: z.object({
    latest: StableSemVer.nullable(),
    preview: SemVer.nullable(),
    publishedAt: IsoDate.nullable(),
    integrity: z.string().nullable(),
    installableFrom: IsoDate.nullable(),
    gitRef: z.string().nullable(),
    recommended: z.record(LineKey, SemVer.nullable()), // D46: highest stable after the age gate with a verified receipt on the line
  }),
  identity: z.object({
    builtFrom: z.enum(['verified', 'none', 'lost']),
    claimed: z.boolean(),
    source: z.enum(['npm', 'github']),
  }),
  compat: z.object({
    builtFor: BuiltFor,
    lines: z.record(LineKey, CellSummary),
    verifiedOn: z.array(LineKey),
    // additive (D10; redefined 24 Oct, when `a new app` became one from the classic preset, what create-mercato-app
    // makes without --preset): lines whose new app already registers the package (data/presets.json `classic`).
    // Nothing to install there; the line keeps its verdict, the receipt of the version a new app ships (`ships`).
    inPresets: z
      .array(LineKey)
      .optional()
      .describe(
        'Lines whose new app (from the classic preset, what create-mercato-app makes without --preset) already registers the package in src/modules.ts. Nothing to install there: install.cli is for an app that does not have it. The line keeps its verdict in compat.lines, the receipt of the version a new app ships there (compat.ships).',
      ),
    // additive (24 Oct): lines whose app from the empty preset registers the package too (events, search)
    inEmptyPreset: z
      .array(LineKey)
      .optional()
      .describe(
        'Lines whose app from the empty preset registers the package too, so no app of the line needs to install it.',
      ),
    // additive (24 Oct): on a line of inPresets, the version a new app ships (create-mercato-app pins its
    // @open-mercato packages to its own version); the line's verdict is about that version
    ships: z
      .record(LineKey, SemVer)
      .optional()
      .describe(
        'On a line of inPresets, the version of the package a new app ships there. compat.lines[line] is the receipt of that version.',
      ),
    // additive (24 Oct): the signal `in isolation` per line, the last receipt from an app from the empty preset (the
    // module without the rest of the platform). Never the main verdict: compat.lines, verifiedOn, tier, agentPolicy
    // and recommended read only receipts from the classic preset. `finding` says what a failed step found.
    isolation: z
      .record(LineKey, IsolationCell)
      .optional()
      .describe(
        "The signal 'in isolation' per line: the last receipt of the package in an app from the empty preset (twelve modules, the module without the rest of the platform). A second signal, never the main verdict: compat.lines (a new app, the classic preset), verifiedOn, tier, agentPolicy and version.recommended do not read it. finding: what a failed step found, one sentence.",
      ),
    // additive (review r8): a newer release that broke on a line whose cell judged the version a new app installs
    // there (webhooks 0.9.0 at typecheck on 0.8, where 0.8.0 is verified): why the line's command pins that version.
    // The tools say it too (`check_compat` notes). Absent = none.
    newerBreaks: z
      .record(LineKey, z.object({ moduleVersion: SemVer, step: Step.nullable(), at: IsoDateTime, receipt: z.string() }))
      .optional(),
    // additive (round 14, lint `backend-route-collision`): backend routes of the module that a module of a new app on
    // the line already has, read statically from the facts of both; `generate` refuses two modules with one backend
    // route. A warning on a line without a verdict, never a verdict, a level or a refusal. Absent = none found.
    collisions: z
      .record(
        LineKey,
        z.array(z.object({ route: z.string().max(200), module: ModuleId, from: z.string().max(214) })).max(20),
      )
      .optional()
      .describe(
        "Per line, backend routes of the module that a module of a new app (the classic preset) already has, read statically from the facts of both (route: the module's own; module and from: the app's module and the package that registers it). yarn generate refuses two modules with one backend route. A warning, never a verdict: on a line without a receipt verdict the policy names it (ROUTE_COLLISION).",
      ),
  }),
  anatomy: AnatomySummary.nullable(), // null: enterprise (hidden) or no facts
  signals: Signals,
  tier: z.enum(['listed', 'verified']).nullable(),
  quality: z.object({ version: StableSemVer, until: IsoDate, report: z.string() }).nullable(),
  agentPolicy: z.record(LineKey, Policy),
  install: z.object({
    // review r10: on a line of compat.inPresets a new app already registers the package; the pages, the card and
    // raw/modules.md say there is nothing to install, and this command is for an app that does not have it
    cli: z
      .string()
      .describe(
        'Install command for the latest line, for an app that does not register the package yet. When the latest line is in compat.inPresets, a new app (from the classic preset) already registers it and there is nothing to install: this is then the command for an app from the empty preset (`yarn mercato module add`; a new app answers `already enabled`), or, when compat.inEmptyPreset names the line too, `yarn add`, which only changes the version. search_modules labels it (presetNote, installEmptyPreset).',
      ),
    cmm: z.string().nullable(),
    needsAllowThirdParty: z.boolean(),
    moduleFlag: ModuleId.nullable(),
  }),
  stats: z.object({ downloads30d: z.number().int().nullable(), stars: z.number().int().nullable() }).nullable(), // null for official
  sigil: z.object({
    glyph: z.string().regex(/^[0-3]{7}$/),
    phase: z.number().int().min(0).max(359),
    publicRoutes: z.boolean(),
  }),
  links: z.object({
    page: z.string(),
    md: z.string(),
    json: z.string(),
    facts: z.string().nullable(),
    npm: z.string().nullable(),
    repo: z.string().nullable(),
    docs: z.string().nullable(),
  }),
  addedAt: IsoDate,
  updatedAt: IsoDateTime, // addedAt = SyncRecord.firstSeenAt
  _meta: z.record(z.string(), z.unknown()).default({}), // reverse-domain keys, e.g. 'com.openmercato.modules/featured'
})

export const ModulesIndex = z.object({
  $schema: z.string().url(),
  schemaVersion: z.literal(1),
  generatedAt: IsoDateTime,
  dataVersion: z.string(),
  site: z.string().url(),
  // nightly = run.at of the last successful collect; npm = last watch (generatedAt changes on every build);
  // source = runner of the newest receipt (review r6, additive): 'ci' (nightly CI) or 'preview' (a preview run in
  // Docker on the maintainer's machine before the first CI night, so `nightly` is that run's time); null without receipts
  dataAsOf: z.object({
    nightly: IsoDateTime.nullable(),
    npm: IsoDateTime.nullable(),
    source: z.enum(['ci', 'preview']).nullable().optional(),
  }),
  features: z.object({ cliSearch: z.boolean() }), // coreLatest >= policy/site.yml cliSearchSince
  officialCoverage: z.object({ listed: z.number().int(), missing: z.array(NpmName).max(50) }),
  lines: z.array(
    z.object({
      key: LineKey,
      version: SemVer,
      source: z.enum(['latest', 'previous', 'develop']),
      cadence: z.enum(['nightly', 'weekly']),
      baseline: CellSummary.nullable(),
      // additive (review r11): the starter preset of a new app on the line (`classic`), null when the catalog does not
      // know its modules; `compat.inPresets` and built-in.json `inPresets` are read against it
      defaultPreset: z
        .string()
        .nullable()
        .optional()
        .describe(
          'The starter preset of a new app on the line (classic: what create-mercato-app makes without --preset), whose receipts give the main verdict, or null when the catalog has not read its modules. compat.inPresets names the packages it registers.',
        ),
      // additive (24 Oct): the modules each preset of the line registers in src/modules.ts (data/presets.json, else the
      // lists read by hand), so the MCP Worker and the pages plan with the lists the emitter used
      presets: z
        .object({
          classic: z.array(z.object({ id: ModuleId, from: NpmName })).nullable(),
          empty: z.array(z.object({ id: ModuleId, from: NpmName })),
        })
        .optional()
        .describe(
          'The { id, from } entries a new app (classic) and an app from the empty preset of the line register in src/modules.ts. classic null: not read yet.',
        ),
      // additive (24 Oct): the baseline of an app from the empty preset (`baseline` is the one of a new app, classic)
      isolationBaseline: CellSummary.nullable()
        .optional()
        .describe(
          "The last baseline receipt of an app from the empty preset on the line: the 'in isolation' row of Open Mercato itself.",
        ),
    }),
  ),
  categories: z.array(z.object({ id: CategoryId, title: z.string(), wedge: Wedge, count: z.number().int() })),
  counts: z.object({
    entries: z.number(),
    listed: z.number(),
    modules: z.number(),
    verifiedOnLatest: z.number(),
    omQuality: z.number(),
    builtIn: z.number(),
  }),
  builtIn: z.object({ coreVersion: StableSemVer, count: z.number().int(), href: z.string() }),
  entries: z.array(IndexEntry),
})

/** One line of ModulesIndex.lines; CompatIndex.lines reuses it. */
export const Line = ModulesIndex.shape.lines.element

/** /m/<locpath>.json: IndexEntry + facts of the current version + receipt history (last 10 transitions). */
export const ModuleDetail = IndexEntry.extend({
  facts: Facts.nullable(),
  receipts: z.array(Receipt).max(10),
  // additive (spec 4.7, review r3): the LST and VER rules the level was computed from, so a page or an agent can say
  // why an entry verified on the latest line is still Listed (the same Rule[] as health/<locpath>.json)
  rules: z
    .array(z.object({ id: z.string().regex(/^(LST|VER)-\d$/), pass: z.boolean(), detail: z.string().max(200) }))
    .optional(),
  // additive (25 Oct, D34): host packages the module bundles in a version a new app does not resolve to (lint
  // host-dependency-duplication), with the lines and the sentence the page and the card print
  hostDuplicates: z
    .array(
      z.object({
        name: z.string(),
        moduleRange: z.string(),
        appVersion: z.string(),
        lines: z.array(LineKey).max(5),
        om: z.array(z.string()).max(5),
        message: z.string().max(300),
      }),
    )
    .max(30)
    .optional()
    .describe('Bundled host packages (lint host-dependency-duplication): two copies break types.'),
  // additive (25 Oct, SPEC 7.x item 5 "Maintainers (npm)"): who can publish the package, from the npm sync
  maintainers: z
    .array(z.string().max(214))
    .max(20)
    .optional()
    .describe('npm logins that can publish the package, from the sync. Absent: not on npm, or not synced yet.'),
})

/** /m/<locpath>/receipts.json: last receipt per line, each with its `transition`. */
export const ModuleReceipts = z.object({
  schemaVersion: z.literal(1),
  locator: Locator,
  // the last receipt per line of a new app (the classic preset, 24 Oct)
  lines: z.record(LineKey, Receipt),
  // additive (24 Oct): the last receipt per line of an app from the empty preset, the signal 'in isolation'
  isolation: z
    .record(LineKey, Receipt)
    .optional()
    .describe(
      "The last receipt per line in an app from the empty preset: the signal 'in isolation', never the line's verdict.",
    ),
})

export type CellSummary = z.infer<typeof CellSummary>
export type IsolationCell = z.infer<typeof IsolationCell>
export type AnatomySummary = z.infer<typeof AnatomySummary>
export type IndexEntry = z.infer<typeof IndexEntry>
export type ModulesIndex = z.infer<typeof ModulesIndex>
export type Line = z.infer<typeof Line>
export type ModuleDetail = z.infer<typeof ModuleDetail>
export type ModuleReceipts = z.infer<typeof ModuleReceipts>
