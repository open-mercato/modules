// Tool contract tools@1 (spec 8.2): tool names and required fields are frozen; new input fields only optional.
import { z } from 'zod'
import {
  AclFeature,
  BuiltForKind,
  CategoryId,
  CellStatus,
  EnvName,
  EventId,
  Host,
  IsoDate,
  IsoDateTime,
  Kind,
  LicenseKind,
  LineKey,
  Locator,
  LocPath,
  ModuleId,
  OriginType,
  SemVer,
} from './common.ts'
import { Change } from './data/changes.ts'
import { ModuleFacts } from './data/facts.ts'
import { Policy } from './data/health.ts'
import { CellSummary, IndexEntry } from './published/modules.ts'

const Ref = z.string().min(1).max(220) // locator | npm name | locpath | module ID

export const ModuleCard = z.object({
  locator: Locator,
  path: LocPath,
  title: z.string(),
  summary: z.string(),
  whenToUse: z.string(),
  type: OriginType,
  kind: Kind,
  category: CategoryId,
  license: z.object({ spdx: z.string().nullable(), kind: LicenseKind }),
  tier: z.enum(['listed', 'verified']).nullable(),
  omQuality: z.boolean(),
  verifiedOn: z.array(LineKey),
  line: LineKey.nullable(),
  status: CellStatus.nullable(),
  agentPolicy: Policy.nullable(),
  installableFrom: IsoDate.nullable(),
  install: z
    .string()
    .describe(
      'What to run on the line: the exact install command, or, on a line whose new app (from the classic preset) already registers the package (presetNote is set), the sentence that there is nothing to install. Never run it there: the command for an app from the empty preset is installEmptyPreset.',
    ),
  matchedOn: z.array(z.string()).max(5),
  card: z.string().url(),
  // additive (24 Oct): the page's install sentence on a line whose new app already registers the package
  presetNote: z
    .string()
    .max(400)
    .nullable()
    .optional()
    .describe(
      'Set on a line whose new app (from the classic preset, what create-mercato-app makes without --preset) already registers the package: nothing to install there, followed by the command of an app from the empty preset when that preset does not register it. Absent: install the package with `install`.',
    ),
  installEmptyPreset: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Set with presetNote: the command for an app from the empty preset (`yarn mercato module add ...`), or null when that preset registers the package too. Run it only in such an app; a new app gets `already enabled`.',
    ),
})
export const BuiltInCard = z.object({
  id: ModuleId,
  title: z.string(),
  description: z.string(),
  category: CategoryId,
  enabled: z.boolean().nullable(),
  install: z.string(),
  page: z.string().url(),
  matchedOn: z.array(z.string()).max(5),
  // additive (review r11, 24 Oct): what a new app (classic) of the requested line has, in the page's sentence (`On in a
  // new app on 0.9: nothing to enable.`, then `install` for an app from the empty preset when it has it off); null when
  // a new app has it off
  presetNote: z
    .string()
    .max(240)
    .nullable()
    .optional()
    .describe(
      'What a new app (from the classic preset) of the line has: on (nothing to enable), followed by `install` for an app from the empty preset when that preset has it off. Null: off in a new app, enable it with `install`.',
    ),
})

export const SearchModulesInput = z.object({
  query: z.string().min(1).max(200),
  omVersion: z.string().max(40).optional(),
  category: CategoryId.optional(),
  type: z.array(OriginType).max(3).optional(),
  kind: z.array(Kind).max(5).optional(),
  verifiedOnly: z.boolean().default(false),
  includeBuiltIn: z.boolean().default(true),
  includeExamples: z.boolean().default(false),
  emits: EventId.optional(),
  consumes: EventId.optional(),
  provider: z.string().max(32).optional(),
  limit: z.number().int().min(1).max(20).default(10),
})
export const SearchModulesOutput = z.object({
  results: z.array(ModuleCard),
  builtIn: z.array(BuiltInCard).max(5),
  total: z.number().int(),
  line: LineKey.nullable(),
  dataVersion: z.string(),
  generatedAt: IsoDateTime,
  // where the statuses come from (review r6, additive): 'preview' = a preview run in Docker on the maintainer's
  // machine, not CI; absent in data from before the field
  receiptSource: z.enum(['ci', 'preview']).nullable().optional(),
})

export const GetModuleInput = z.object({
  ref: Ref,
  version: SemVer.optional(),
  sections: z
    .array(z.enum(['anatomy', 'compat', 'trust', 'install', 'versions', 'readme']))
    .max(6)
    .optional(),
})
export const GetModuleOutput = z.object({
  entry: IndexEntry.nullable(),
  candidates: z.array(Locator).max(10), // when ref is a module ID matching several entries
  anatomy: z.array(ModuleFacts).nullable(),
  warnings: z.array(z.string().max(200)).max(10),
  untrusted: z.object({ source: z.literal('readme'), notice: z.string(), text: z.string().max(8000) }).nullable(),
  card: z.string().url().nullable(),
})

export const CheckCompatInput = z.object({ refs: z.array(Ref).min(1).max(10), omVersion: z.string().min(1).max(40) })
export const CheckCompatOutput = z.object({
  line: LineKey.nullable(),
  omVersion: z.string(),
  results: z.array(
    z.object({
      ref: z.string(),
      locator: Locator.nullable(),
      version: SemVer.nullable(),
      builtFor: z.object({
        range: z.string().nullable(),
        kind: BuiltForKind,
        satisfied: z.boolean(),
        // additive (24 Oct): the version the declaration is of, so it never reads as the peers of another version
        version: SemVer.nullable()
          .optional()
          .describe(
            "The version whose peer declaration range, kind and satisfied describe: the result's `version` (what a new app has on the line), unless the catalog has not read that version's peers (a develop snapshot on next), then the version a new app has on the latest line, and a note says so.",
          ),
      }),
      // the static fit of the result's `version` on the line
      fitsStatically: z.enum(['ok', 'drift', 'no-fit', 'unknown']).nullable(),
      receipt: CellSummary.nullable(),
      status: CellStatus.nullable(),
      recommendedVersion: SemVer.nullable(), // highest version with a verified receipt on this line
      installableFrom: IsoDate.nullable(),
      agentPolicy: Policy,
      receiptUrl: z.string().url().nullable(),
      notes: z.array(z.string().max(200)).max(5),
    }),
  ),
  // where the receipts come from (review r6, additive): 'preview' = a preview run, not CI
  receiptSource: z.enum(['ci', 'preview']).nullable().optional(),
})

export const PlanInstallInput = z.object({
  refs: z.array(Ref).min(1).max(10),
  app: z
    .object({
      omVersion: z.string().max(40),
      enabledModules: z
        .array(z.object({ id: ModuleId, from: z.string().max(214) }))
        .max(200)
        .default([]),
    })
    .optional(),
})
export const InstallPlan = z.object({
  line: LineKey.nullable(),
  order: z.array(
    z.object({
      locator: Locator,
      version: SemVer,
      moduleIds: z.array(ModuleId),
      reason: z.enum(['requested', 'required']),
      requiredBy: z.array(Locator),
    }),
  ),
  builtInNeeded: z.array(
    z.object({
      id: ModuleId,
      enabled: z.boolean().nullable(),
      command: z.string(),
      // additive (24 Oct): whether a new app (the classic preset) has it on; without app.enabledModules the plan's
      // `commands` leave out what a new app has on
      inNewApp: z
        .boolean()
        .optional()
        .describe('Whether a new app (from the classic preset) of the line has the module on. Absent: not known.'),
    }),
  ),
  adds: z.object({
    tables: z.array(z.string()),
    routes: z.number().int(),
    publicRoutes: z.array(z.string()),
    aclFeatures: z.array(AclFeature),
    eventsEmitted: z.number().int(),
    eventsConsumed: z.number().int(),
    backendPages: z.array(z.string()),
    widgets: z.number().int(),
    aiTools: z.array(z.string()),
  }),
  needs: z.object({
    env: z.array(EnvName),
    credentials: z.array(z.object({ key: z.string(), type: z.string(), required: z.boolean() })),
    hosts: z.array(Host),
  }),
  conflicts: z.array(
    z.object({
      kind: z.enum(['slot', 'replaces', 'table', 'route', 'acl', 'event']),
      detail: z.string().max(200),
      with: z.string(),
    }),
  ),
  license: z.array(z.object({ locator: Locator, spdx: z.string().nullable(), kind: LicenseKind })),
  commands: z.array(z.string()), // exact versions, order from the requires closure (deepest first)
  then: z.array(z.string()), // 'yarn generate', 'yarn db:migrate (ask the user first)', 'Grant these permissions to roles the user names: ...'
  agentPolicy: Policy, // strictest decision among the plan items
  consentText: z.string().nullable(),
  untrustedNotice: z.string(),
  // additive (24 Oct): without app.enabledModules, `commands` and `then` are for a new app (the classic preset of the
  // line); this is the same plan for an app from the empty preset, named as such
  emptyPreset: z
    .object({
      commands: z.array(z.string()),
      then: z.array(z.string()),
      // additive (round 16): every permission of its Grant step (the step lists ten and counts the rest), as
      // adds.aclFeatures is for a new app; it differs where that app installs a dependency a new app has
      aclFeatures: z.array(AclFeature).optional(),
    })
    .optional()
    .describe(
      'Only when app.enabledModules is not given: commands and then for an app from the empty preset. commands and then above are for a new app (from the classic preset, what create-mercato-app makes without --preset).',
    ),
})

export const GetChangesInput = z.object({
  since: IsoDateTime,
  types: z.array(Change.shape.type).optional(),
  limit: z.number().int().min(1).max(200).default(100),
})
export const GetChangesOutput = z.object({ changes: z.array(Change), truncated: z.boolean(), generatedAt: IsoDateTime })

/** The five tools of tools@1 with their input and output schemas (MCP, WebMCP, CLI parity tests). */
export const TOOLS = {
  search_modules: { input: SearchModulesInput, output: SearchModulesOutput },
  get_module: { input: GetModuleInput, output: GetModuleOutput },
  check_compat: { input: CheckCompatInput, output: CheckCompatOutput },
  plan_install: { input: PlanInstallInput, output: InstallPlan },
  get_changes: { input: GetChangesInput, output: GetChangesOutput },
} as const

export type ToolName = keyof typeof TOOLS
export type ModuleCard = z.infer<typeof ModuleCard>
export type BuiltInCard = z.infer<typeof BuiltInCard>
export type SearchModulesInput = z.input<typeof SearchModulesInput>
export type SearchModulesOutput = z.infer<typeof SearchModulesOutput>
export type GetModuleInput = z.input<typeof GetModuleInput>
export type GetModuleOutput = z.infer<typeof GetModuleOutput>
export type CheckCompatInput = z.input<typeof CheckCompatInput>
export type CheckCompatOutput = z.infer<typeof CheckCompatOutput>
export type PlanInstallInput = z.input<typeof PlanInstallInput>
export type InstallPlan = z.infer<typeof InstallPlan>
export type GetChangesInput = z.input<typeof GetChangesInput>
export type GetChangesOutput = z.infer<typeof GetChangesOutput>
