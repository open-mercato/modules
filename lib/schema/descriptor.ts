// Descriptor YAML (spec 4.3): only author (A) and curator (K) fields. Synced fields live on the `data` branch.
import { z } from 'zod'
import { CategoryId, EnvName, GithubRepo, Host, HttpsUrl, Locator, ModuleId, NpmName, PlainText } from './common.ts'

/** Key order of a descriptor file (table order in spec 4.3); `om format` sorts keys by it. */
export const DESCRIPTOR_KEY_ORDER = [
  'npm',
  'github',
  'repo',
  'module',
  'kind',
  'category',
  'tags',
  'summary',
  'whenToUse',
  'whenNotToUse',
  'providers',
  'extends',
  'links',
  'pricing',
  'smoke',
  'scriptsRequired',
  'declares',
  'status',
  'reason',
  'alternatives',
  'replaces',
  'renamedFrom',
  'supersededBy',
  'enterprise',
  'featured',
  'aliases',
] as const

/** Fields only a curator may set (K in spec 4.3). */
export const CURATOR_FIELDS = [
  'status',
  'reason',
  'alternatives',
  'replaces',
  'renamedFrom',
  'supersededBy',
  'enterprise',
  'featured',
  'aliases',
] as const

export const Descriptor = z
  .object({
    npm: NpmName.optional(),
    github: GithubRepo.optional(),
    repo: z
      .string()
      .regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+(#[A-Za-z0-9._\/-]+)?$/)
      .optional(),
    module: ModuleId.optional(),
    kind: z.enum(['module', 'provider', 'library', 'tool']).default('module'),
    category: CategoryId,
    tags: z
      .array(z.string().regex(/^[a-z0-9-]{2,24}$/))
      .max(8)
      .default([]),
    // length and prefix as JSON-Schema-compatible checks (finding of 25 Oct): descriptor-1.json carries them too, so an
    // editor or agent validating against the published file sees what CI says; one check each, one message each
    summary: PlainText(140).min(20, 'min 20 characters'),
    whenToUse: PlainText(240).regex(/^Use when [\s\S]{31,}$/, 'start with "Use when ", min 40 characters'),
    whenNotToUse: PlainText(160).optional(),
    providers: z
      .array(z.object({ name: z.string().regex(/^[a-z0-9-]{2,32}$/), label: PlainText(40) }).strict())
      .max(20)
      .default([]),
    extends: Locator.optional(),
    links: z
      .object({
        docs: HttpsUrl.optional(),
        support: z.union([HttpsUrl, z.string().regex(/^mailto:[^\s]+$/)]).optional(),
        demo: HttpsUrl.optional(),
      })
      .strict()
      .default({}),
    pricing: z.enum(['free', 'paid', 'contact']).default('free'),
    smoke: z
      .object({
        paths: z.array(z.string().regex(/^\/(backend|api)\/[a-zA-Z0-9/_\-.]+$/)).max(5),
      })
      .strict()
      .optional(),
    scriptsRequired: z
      .object({ reason: PlainText(200) })
      .strict()
      .optional(),
    declares: z
      .object({ hosts: z.array(Host).max(30).default([]), env: z.array(EnvName).max(30).default([]) })
      .strict()
      .optional(),
    status: z.enum(['active', 'hold', 'unmaintained', 'delisted']).default('active'),
    reason: PlainText(200).optional(),
    alternatives: z.array(Locator).max(5).optional(),
    replaces: z
      .array(z.string().regex(/^core:[a-z][a-z0-9_]*$/))
      .max(3)
      .optional(),
    renamedFrom: z.array(Locator).max(5).optional(),
    supersededBy: z.union([Locator, z.string().regex(/^core:[a-z][a-z0-9_]*$/)]).optional(),
    enterprise: z
      .object({ offerUrl: HttpsUrl, modules: z.array(ModuleId).max(20) })
      .strict()
      .optional(),
    featured: z.boolean().default(false),
    aliases: z.array(PlainText(40)).max(10).optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (!d.npm && !d.github) ctx.addIssue({ code: 'custom', message: 'npm or github is required' })
    if (d.status !== 'active' && !d.reason)
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'reason is required for this status' })
    if (d.enterprise && d.npm !== '@open-mercato/enterprise')
      ctx.addIssue({ code: 'custom', path: ['enterprise'], message: 'enterprise is reserved' })
    if (d.extends && d.kind !== 'provider')
      ctx.addIssue({ code: 'custom', path: ['extends'], message: 'extends is for providers' })
  })

export type Descriptor = z.output<typeof Descriptor>
export type DescriptorInput = z.input<typeof Descriptor>
