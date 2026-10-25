// Shared types of the emitter (lib/emit/**). Everything except load.ts, schemas.ts and astro-integration.ts is a
// pure function of these inputs, so `emit` is testable without a disk and deterministic for golden files.
import type { CategoryId, Wedge } from '../schema/common.ts'
import type { Descriptor } from '../schema/descriptor.ts'
import type {
  BuiltinData,
  Change,
  Claims,
  Facts,
  FitCell,
  FitResult,
  Health,
  HiveSlots,
  Lines,
  OfficialCoverage,
  Presets,
  Receipt,
  Stats,
  SyncRecord,
} from '../schema/data/index.ts'
import type { Radar } from '../schema/published/radar.ts'
import type { IndexEntry } from '../schema/published/modules.ts'
import type { Rule } from '../core/tier.ts'
import type {
  AgentSkillsIndex as AgentSkillsIndexSchema,
  Allowlist as AllowlistSchema,
  McpServerCard as McpServerCardSchema,
  ShieldsBadge as ShieldsBadgeSchema,
} from '../schema/published/misc.ts'
import type { z } from 'zod'

/** Types of the smaller published files (lib/schema/published/misc.ts exports only the schemas). */
export type AgentSkillsIndex = z.infer<typeof AgentSkillsIndexSchema>
export type Allowlist = z.infer<typeof AllowlistSchema>
export type McpServerCard = z.infer<typeof McpServerCardSchema>
export type ShieldsBadge = z.infer<typeof ShieldsBadgeSchema>

export interface LoadedDescriptor {
  /** Path relative to the parent of the descriptor folder, e.g. `modules/@x/y.yml`. */
  file: string
  locator: string
  /** Zod output, or null when the file does not validate (the entry is then left out of the index). */
  descriptor: Descriptor | null
  issues: string[]
}

export interface SkillSource {
  /** Folder name under skills/ (equals the skill name, spec 8.6). */
  dir: string
  /** Exact bytes of SKILL.md (the digest covers these bytes). */
  content: Uint8Array
}

export interface CategoryInfo {
  id: CategoryId
  title: string
  wedge: Wedge
}

/** Everything `emit` reads (load.ts). */
export interface EmitData {
  descriptors: LoadedDescriptor[]
  lines: Lines | null
  presets: Presets | null
  claims: Claims
  stats: Stats | null
  coverage: OfficialCoverage | null
  hive: HiveSlots | null
  radar: Radar | null
  builtin: BuiltinData | null
  sync: Map<string, SyncRecord>
  /** Facts by locator, then by version. */
  facts: Map<string, Map<string, Facts>>
  /** Fit results by Open Mercato version. */
  fit: Map<string, FitResult>
  /** Module receipts by locator (baseline receipts are in `baseline`). */
  receipts: Map<string, Receipt[]>
  baseline: Receipt[]
  health: Map<string, Health>
  changes: Change[]
  categories: CategoryInfo[]
  /** policy/builtin-categories.yml, or null when missing. */
  builtinCategories: Record<string, CategoryId> | null
  /** policy/builtin-upcoming.yml: core module IDs of the develop line only (not reported as unknown). */
  builtinUpcoming?: readonly string[]
  /** policy/site.yml `cliSearchSince`. */
  cliSearchSince: string | null
  skills: SkillSource[]
  /** `@open-mercato/cli` pinned in package.json: core version when the data branch has no lines yet. */
  pinnedCoreVersion: string | null
  warnings: string[]
}

export interface EmitOptions {
  /** Site root plus base path, no trailing slash (e.g. https://open-mercato.github.io/modules). */
  site: string
  /** Base path of the site (`/modules`, or `/` on the domain). */
  base: string
  /** Clock (IsoDateTime): `generatedAt` and the age gate. */
  now: string
  /** MCP endpoint (repo variable MCP_URL), or null before the first Worker deploy. */
  mcpUrl: string | null
  /** WEBMCP_OT_TOKENS: `{ "<origin>": { "token": "...", "expires": "YYYY-MM-DD" } }` as JSON text, or null. */
  originTrialTokens: string | null
}

/** Per-entry state the emitter keeps next to the IndexEntry. */
export interface EntryContext {
  entry: IndexEntry
  descriptor: Descriptor
  sync: SyncRecord | null
  /** Facts of the judged version (WP08 `judgedFacts`). */
  facts: Facts | null
  /** Version whose facts and Fit judge the entry. */
  judgedVersion: string | null
  /** Fit cell per line key of the version that line is judged on (its install version, E5). */
  fit: Record<string, FitCell | null>
  receipts: Receipt[]
  /** Every facts document of the entry, by version. */
  allFacts: Map<string, Facts>
  /** LST and VER rules of the entry (`/m/<path>.json` `rules`); absent in contexts built by hand. */
  rules?: Rule[]
}

/** A published or site-data file: path relative to its root and its content. */
export type FileMap = Map<string, string | Uint8Array>
