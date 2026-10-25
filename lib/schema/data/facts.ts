// data/facts/<locpath>/<ver>.json and data/builtin/<coreVersion>.json (spec 4.5). Written only by `watch`.
import { z } from 'zod'
import {
  AclFeature,
  EnvName,
  EventId,
  EventSubscription,
  Host,
  IsoDate,
  IsoDateTime,
  LicenseKind,
  Locator,
  ModuleId,
  RoutePath,
  SemVer,
  StableSemVer,
} from '../common.ts'

export const Src = z.object({ file: z.string().max(300), line: z.number().int().positive() }).strict()
/**
 * One env name the code reads, with its first read. additive (25 Oct, rentgen 4): `ifSet` when every read only checks
 * whether the name is set (`Boolean(process.env.A || process.env.B)`, a read inside `isConfigured()`), so the package
 * works without it. Absent in older facts and for a name whose value the code uses.
 */
export const EnvRead = z.object({ name: EnvName, src: Src, ifSet: z.literal(true).optional() }).strict()
export const LintFinding = z
  .object({
    code: z.string(),
    severity: z.enum(['error', 'warn', 'info']),
    message: z.string().max(300),
    anchor: z.string().nullable(),
    src: Src.nullable(),
  })
  .strict()

export const ModuleFacts = z
  .object({
    id: ModuleId,
    title: z.string().max(80).nullable(),
    description: z.string().max(300).nullable(),
    requires: z.array(z.object({ raw: z.string().max(200), resolvesTo: z.string().nullable() }).strict()).max(30),
    ejectable: z.boolean().nullable(),
    data: z
      .object({
        entities: z
          .array(
            z.object({ id: z.string().max(120), table: z.string().max(80).nullable(), src: Src.nullable() }).strict(),
          )
          .max(200),
        migrations: z.object({ count: z.number().int(), first: IsoDate.nullable(), last: IsoDate.nullable() }).strict(),
        customEntities: z.number().int(),
      })
      .strict(),
    http: z
      .object({
        routes: z
          .array(
            z
              .object({
                method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
                path: RoutePath,
                requireAuth: z.boolean().nullable(),
                requireFeatures: z.array(AclFeature).max(10),
                hasOpenApi: z.boolean(),
                src: Src,
              })
              .strict(),
          )
          .max(500),
        legacyRouteFiles: z.number().int(),
        authResolved: z.number().min(0).max(1),
      })
      .strict(),
    security: z.object({ aclFeatures: z.array(AclFeature).max(200), setupDefaultRoleFeatures: z.boolean() }).strict(),
    events: z
      .object({
        emits: z.array(z.object({ id: EventId, src: Src.nullable() }).strict()).max(200),
        subscribes: z.array(z.object({ event: EventSubscription, src: Src.nullable() }).strict()).max(200),
      })
      .strict(),
    ui: z
      .object({
        backendPages: z
          .array(z.object({ path: RoutePath, requireFeatures: z.array(AclFeature).max(10) }).strict())
          .max(200),
        frontendPages: z.array(z.object({ path: RoutePath }).strict()).max(200),
        widgets: z.number().int(),
        extensionHosts: z.number().int(),
      })
      .strict(),
    background: z
      .object({
        workers: z.array(z.object({ queue: z.string().regex(/^[a-z0-9_.:-]{1,80}$/) }).strict()).max(100),
        cli: z.array(z.string().regex(/^[a-z0-9:_-]{1,60}$/)).max(100),
      })
      .strict(),
    ai: z
      .object({
        tools: z.array(z.string().regex(/^[a-z0-9_.-]{1,80}$/)).max(100),
        agents: z.array(z.string().regex(/^[a-z0-9_.-]{1,80}$/)).max(50),
      })
      .strict(),
    config: z
      .object({
        credentials: z
          .array(
            z
              .object({
                key: z.string().regex(/^[a-zA-Z0-9_]{1,64}$/),
                type: z.string().max(20),
                required: z.boolean(),
              })
              .strict(),
          )
          .max(30),
        env: z.array(EnvRead).max(100),
      })
      .strict(),
    network: z
      .object({
        hosts: z.array(z.object({ host: Host, src: Src, confidence: z.enum(['high', 'low']) }).strict()).max(100),
        undeclared: z.array(Host).max(100),
      })
      .strict(),
    extends: z.array(z.object({ kind: z.string().max(40), target: z.string().max(120) }).strict()).max(200), // UMES contributions into other modules
    omImports: z.record(z.string(), z.record(z.string(), z.array(z.string().max(120)))), // {pkg: {subpath: [symbols]}}
    collisionKeys: z
      .object({
        moduleId: ModuleId,
        tables: z.array(z.string()),
        aclFeatures: z.array(AclFeature),
        eventIds: z.array(EventId),
        backendRoutes: z.array(RoutePath),
      })
      .strict(),
    publicRoutes: z.number().int(),
    glyph: z.string().regex(/^[0-3]{7}$/),
    lint: z.array(LintFinding).max(100),
  })
  .strict()

export const Facts = z
  .object({
    factsVersion: z.literal(1),
    extractor: z
      .object({
        engine: z.string(),
        factsContractVersion: z.literal(2),
        catalog: z.string(),
        durationMs: z.number(),
      })
      .strict(),
    package: z
      .object({
        locator: Locator,
        name: z.string(),
        version: SemVer,
        integrity: z.string().nullable(),
        source: z.enum(['npm-tarball', 'github-archive']),
        gitRef: z.string().nullable(),
      })
      .strict(),
    gate: z
      .object({
        installable: z.boolean(),
        needsModuleFlag: z.boolean(),
        reason: z.string().max(200).nullable(),
        modules: z.array(z.object({ id: z.string().max(64), src: z.boolean(), dist: z.boolean() }).strict()).max(60),
      })
      .strict(),
    kind: z.enum(['module', 'provider', 'library', 'tool']),
    license: z
      .object({
        value: z.string().nullable(),
        kind: LicenseKind,
        mismatch: z.boolean(),
        sources: z
          .object({
            packageJson: z.string().nullable(),
            licenseFile: z.string().nullable(),
            moduleInfo: z.string().nullable(),
            integrationTs: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
    omPeers: z.record(z.string(), z.string()),
    dependencies: z.record(z.string(), z.string()), // runtime dependencies from package.json (input for Fit hostDuplicates)
    agentsMd: z.boolean(),
    readmeExcerpt: z.string().max(4000).nullable(), // author text, always UNTRUSTED
    modules: z.array(ModuleFacts).max(60),
    // additive (25 Oct, rentgen 3): a package without a module (a provider, library or tool) has its src/ read for the
    // env names and hosts its code uses, the config and network sections a module holds itself (finding of 25 Oct: the
    // web-research adapters read `no hosts found in the code` while they call api.exa.ai). Absent in older facts.
    packageCode: z
      .object({
        env: z.array(EnvRead).max(100),
        hosts: z.array(z.object({ host: Host, src: Src, confidence: z.enum(['high', 'low']) }).strict()).max(100),
      })
      .strict()
      .optional(),
    coverage: z
      .object({ routesAuthResolved: z.number(), integrationTs: z.enum(['expanded', 'absent', 'unparsed']) })
      .strict(),
    diagnostics: z.array(z.string().max(300)).max(50),
  })
  .strict()

/**
 * data/builtin/<coreVersion>.json: facts of the modules built into @open-mercato/core, read from
 * dist/agentic/guides/module-facts.v2.json of @open-mercato/cli@<coreVersion> (filter sourcePackage ==
 * "@open-mercato/core"). Not spelled out in spec 4.5; this is the WP01 shape. `routesMeasured: false`
 * because the CLI file has empty apiRoutes for built-ins (AnatomySummary routes are then null).
 */
export const BuiltinData = z
  .object({
    factsVersion: z.literal(1),
    coreVersion: StableSemVer,
    extractor: z
      .object({
        engine: z.string(),
        factsContractVersion: z.literal(2),
        source: z.literal('module-facts.v2.json'),
        cliVersion: SemVer,
      })
      .strict(),
    computedAt: IsoDateTime,
    routesMeasured: z.boolean(),
    modules: z.array(ModuleFacts).max(120),
    diagnostics: z.array(z.string().max(300)).max(50),
  })
  .strict()

export type Src = z.infer<typeof Src>
export type LintFinding = z.infer<typeof LintFinding>
export type ModuleFacts = z.infer<typeof ModuleFacts>
export type Facts = z.infer<typeof Facts>
export type BuiltinData = z.infer<typeof BuiltinData>
