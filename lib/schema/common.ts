// Shared types (spec 4.1). Zod 4 is the single source of truth; JSON Schema is generated from it.
import { z } from 'zod'
import { isPlainText } from '../core/text.ts'

export const NpmName = z
  .string()
  .max(214)
  .regex(/^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/)
export const GithubRepo = z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/)
export const Locator = z
  .string()
  .regex(
    /^(npm:(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*|github:[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100})$/,
  )
export const LocPath = z
  .string()
  .regex(
    /^(@[a-z0-9-~][a-z0-9-._~]*\/[a-z0-9-~][a-z0-9-._~]*|[a-z0-9-~][a-z0-9-._~]*|github\/[a-z0-9-]{1,39}\/[a-z0-9._-]{1,100})$/,
  )
export const ModuleId = z
  .string()
  .max(64)
  .regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/) // strictest pattern [i1 2.3]
export const SemVer = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
export const StableSemVer = z.string().regex(/^\d+\.\d+\.\d+$/)
export const LineKey = z.string().regex(/^(\d+\.\d+|next)$/) // '0.8' | '0.9' | 'next'
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const IsoDateTime = z.string().datetime()
export const HttpsUrl = z.string().url().startsWith('https://').max(300)
export const AclFeature = z
  .string()
  .max(100)
  .regex(/^[a-z0-9_]+(\.[A-Za-z0-9_*-]+){1,5}$/) // camelCase segments are real (checkout.viewPii)
export const EventId = AclFeature
/** Subscriptions may use the wildcard '*' (webhooks, enterprise agent_orchestrator). */
export const EventSubscription = z.union([EventId, z.literal('*')])
export const EnvName = z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/)
export const Host = z
  .string()
  .max(253)
  .regex(/^(\*\.)?([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/)
export const RoutePath = z
  .string()
  .max(200)
  .regex(/^\/[a-zA-Z0-9/_\-\[\].]*$/)
export const CategoryId = z.enum([
  'crm-sales',
  'catalog-pricing',
  'orders-checkout',
  'warehouse-shipping',
  'payments-finance',
  'marketing-loyalty',
  'communication',
  'integrations-sync',
  'ai-automation',
  'search-analytics',
  'auth-security',
  'content-portal',
  'localization-compliance',
  'storage-infrastructure',
  'devtools',
  'operations',
])
export const Kind = z.enum(['module', 'provider', 'library', 'tool', 'built-in'])
export const OriginType = z.enum(['official', 'community', '3rd-party'])
export const LicenseKind = z.enum(['osi', 'proprietary', 'enterprise', 'unknown'])
export const Step = z.enum([
  'scaffold',
  'install',
  'add',
  'generate',
  'typecheck',
  'initialize',
  'build',
  'start',
  'smoke',
])
export const CellStatus = z.enum([
  'verified',
  'broken',
  'quarantine',
  'harness-red',
  'infra-error',
  'untested',
  'skipped',
])
/**
 * Starter preset of create-mercato-app a cell scaffolds with (decision of 24 Oct): `classic`, what `npx
 * create-mercato-app` makes without `--preset` (DEFAULT_PRESET_ID), gives the main verdict; `empty` is the signal
 * `in isolation` (the module works without the rest of the platform) and never changes the main verdict.
 */
export const StarterPreset = z.enum(['classic', 'empty'])
export type StarterPreset = z.infer<typeof StarterPreset>

export const BuiltForKind = z.enum(['exact-pin', 'caret-0x', 'bounded', 'open', 'star', 'missing'])
/** Hive wedge of a category (policy/categories.yml, ModulesIndex.categories). */
export const Wedge = z.enum(['sell', 'operate', 'money', 'connect', 'think', 'platform'])
// PlainText: no URL, markdown, HTML or backticks; phrase heuristics for models are flags for review, not errors
export const PlainText = (max: number) =>
  z.string().min(1).max(max).refine(isPlainText, 'plain text only: no URLs, markdown or HTML')

export type CategoryId = z.infer<typeof CategoryId>
export type Kind = z.infer<typeof Kind>
export type OriginType = z.infer<typeof OriginType>
export type LicenseKind = z.infer<typeof LicenseKind>
export type Step = z.infer<typeof Step>
export type CellStatus = z.infer<typeof CellStatus>
export type BuiltForKind = z.infer<typeof BuiltForKind>
export type LineKey = z.infer<typeof LineKey>
export type Wedge = z.infer<typeof Wedge>
