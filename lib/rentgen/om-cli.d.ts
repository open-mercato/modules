// Local types of the Rentgen engine `@open-mercato/cli/lib/generators/module-facts` (CLI 0.9.0,
// factsContractVersion 2). The package maps subpath types to its `.ts` sources, which `tsc` would
// type-check under NodeNext (TS2835), so the engine is imported dynamically through a variable in
// extract.ts (spec 3.4) and typed here. Only the fields Rentgen reads are declared; shapes follow
// packages/cli/src/lib/generators/module-facts.ts:54-330 and
// packages/shared/src/modules/widgets/extension-points.ts:317-610 at 0.9.0.

export interface OmSourceRef {
  sourcePath: string
  exportName?: string
  line?: number
}

export interface OmEntityFact {
  id: string
  class: string
  table: string
  editable: boolean
  customFields: boolean
}

export interface OmEventFact {
  id: string
  label?: string
  category: string | null
  entity: string | null
  clientBroadcast?: boolean
  portalBroadcast?: boolean
}

export interface OmPageFact {
  path: string
  sourcePath: string
  metadataSourcePath?: string
  metadata?: {
    requireAuth?: boolean
    requireCustomerAuth?: boolean
    requireFeatures?: string[]
    requireCustomerFeatures?: string[]
    navHidden?: boolean
    pageContext?: string
  }
}

export interface OmApiRouteFact {
  path: string
  methods: string[]
  auth: Record<string, { requireAuth?: boolean; requireFeatures?: string[]; requireRoles?: string[] }>
  sourcePath: string | null
}

export type OmScalar = string | number | boolean | null

export interface OmOwnedContractFact {
  kind: string
  id: string
  source: OmSourceRef
  metadata?: Record<string, OmScalar | OmScalar[]>
}

export interface OmExtensionTargetFact {
  id: string
  resolution: 'exact' | 'pattern' | 'framework' | 'fact-ref' | 'optional-external' | 'unresolved'
  factRef?: { factSection: string; factKey: string }
  optionalOwnerPackage?: string
}

export interface OmContributionFact {
  kind: string
  id: string
  targets: OmExtensionTargetFact[]
  source: { path: string; symbol?: string }
  details?: Record<string, unknown>
}

export interface OmExtensionSurfaceFacts {
  hosts: { key: string; id: string; ownerModule: string }[]
  contributions: OmContributionFact[]
  unresolved: { key: string; source: { path: string; symbol?: string }; reason: string }[]
}

export interface OmFactSourceEntry {
  kind: string
  id: string
  source?: OmSourceRef
  factRef?: { factSection: string; factKey?: string }
}

/** One entry of `extractModuleFacts` output, also the value shape of module-facts.v2.json. */
export interface OmModuleFacts {
  module?: string
  title: string | null
  description: string | null
  coreVersion: string | null
  sourcePackage: string | null
  sourceVersion: string | null
  sourceRoot: string
  entities: OmEntityFact[]
  events: OmEventFact[]
  aclFeatures: string[]
  apiRoutes: OmApiRouteFact[]
  diTokens: string[]
  searchEntities: string[]
  notifications: string[]
  cli: string[]
  backendPages: OmPageFact[]
  frontendPages: OmPageFact[]
  cliCommands: { command: string; sourcePath: string }[]
  aiTools: { name: string; sourcePath: string }[]
  aiAgents?: { id: string; sourcePath: string }[]
  extensionSurfaces?: OmExtensionSurfaceFacts
  factSources?: OmFactSourceEntry[]
  ownedContracts?: Record<string, OmOwnedContractFact[] | undefined>
  warnings?: string[]
}

export interface OmExtractOptions {
  moduleId: string
  moduleRoot?: string
  coreSrcRoot?: string
  coreVersion?: string | null
  sourcePackage?: string | null
  sourceVersion?: string | null
  registryPath?: string | null
  portableSourceRoot?: string
  factsContractVersion?: 1 | 2
}

/** The engine module (ENGINE_SPEC in extract.ts), loaded dynamically. */
export interface ExtractorModule {
  extractModuleFacts(options: OmExtractOptions): OmModuleFacts
}
