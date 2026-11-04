// Published template files (docs/specs/2026-10-29-templates.md, API Contracts "Catalog published files"): the index
// `/templates.json` that `create-mercato-app --template` reads, and `/t/<owner>/<repo>.json` with the full entry and
// the facts of its sha. Additive files; module files do not change. `templates.json` lists `active`, `hold` and
// `unmaintained` entries of public repositories, with a `reason` for every entry that is not `active`.
import { z } from 'zod'
import { EnvName, GithubRepo, HttpsUrl, IsoDateTime, LicenseKind, SemVer, StableSemVer } from '../common.ts'
import { CommitSha, TemplateArchiveFinding, TemplateRefKind } from '../data/templates.ts'
import { TemplateDescriptor, TemplateModule, TemplateSlug, TemplateStatus, TemplateUseCase } from '../template.ts'

export const ListedTemplateStatus = TemplateStatus.exclude(['delisted'])

const EnvKey = z.object({ name: EnvName, description: z.string().max(240).optional(), link: HttpsUrl.optional() })

/** The facts of one sha as the index carries them. */
export const TemplateIndexFacts = z.object({
  omLine: z
    .string()
    .regex(/^\d+\.\d+$/)
    .nullable(),
  omVersion: SemVer.nullable(),
  linesBehind: z.number().int().min(0).nullable(),
  requiresEnterprise: z.boolean(),
  engines: z.record(z.string(), z.string()),
  modules: z.array(TemplateModule),
  env: z.array(EnvKey),
})

export const TemplateIndexEntry = z.object({
  // curator slug (A6); null without one
  slug: TemplateSlug.nullable(),
  github: GithubRepo,
  status: ListedTemplateStatus,
  reason: z.string().nullable(),
  useCase: TemplateUseCase,
  summary: z.string(),
  // the entry's ref, or the default branch it resolved from
  ref: z.string(),
  // the repository is archived on GitHub (Edge cases: the index marks archived repositories)
  archived: z.boolean(),
  source: z.object({
    sha: CommitSha,
    syncedAt: IsoDateTime,
    // null: the archive of this sha was not read yet
    facts: TemplateIndexFacts.nullable(),
  }),
  // Phase 1b: the newest sha with a green smoke; null until then
  verified: z
    .object({
      sha: CommitSha,
      at: IsoDateTime,
      omVersion: SemVer,
      importer: z.string(),
      facts: TemplateIndexFacts.nullable(),
    })
    .nullable(),
})

export const TemplatesIndex = z.object({
  schema: z.literal(1),
  generatedAt: IsoDateTime,
  templates: z.array(TemplateIndexEntry),
})

/** A module of the inventory with the catalog page it links to (site path without the base), null for none. */
export const TemplateDetailModule = TemplateModule.extend({ page: z.string().nullable() })

export const TemplateDetailFacts = z.object({
  readAt: IsoDateTime,
  omLine: z
    .string()
    .regex(/^\d+\.\d+$/)
    .nullable(),
  omVersion: SemVer.nullable(),
  linesBehind: z.number().int().min(0).nullable(),
  // the latest stable line `linesBehind` counts against
  latestStable: StableSemVer.nullable(),
  requiresEnterprise: z.boolean(),
  enterpriseModules: z.array(z.string()),
  enterpriseDependency: z.boolean(),
  engines: z.record(z.string(), z.string()),
  packageManager: z.string().nullable(),
  modules: z
    .object({
      entries: z.array(TemplateDetailModule),
      unparsed: z.array(z.object({ line: z.number().int(), reason: z.string() })),
    })
    .nullable(),
  manifest: z.enum(['absent', 'valid', 'invalid']),
  env: z.array(EnvKey),
  license: z.object({ value: z.string().nullable(), kind: LicenseKind }),
  archive: z.object({ files: z.number().int(), bytes: z.number().int() }),
  findings: z.array(TemplateArchiveFinding),
})

/** `/t/<owner>/<repo>.json`: the entry as published, the repository, and the facts of its sha. */
export const TemplateDetail = z.object({
  schema: z.literal(1),
  generatedAt: IsoDateTime,
  path: z.string(),
  // site path without the base, `/t/<owner>/<repo>`
  page: z.string(),
  // the author and curator fields; hosted screenshots carry their site path
  entry: z.object({
    ...TemplateDescriptor.shape,
    status: ListedTemplateStatus,
    slug: TemplateSlug.nullable(),
    reason: z.string().nullable(),
    screenshots: z.array(z.object({ src: z.string(), alt: z.string() })).optional(),
  }),
  repo: z
    .object({
      fullName: GithubRepo,
      // GitHub serves the repository under another name (a rename or transfer)
      renamed: z.boolean(),
      archived: z.boolean(),
      isTemplate: z.boolean(),
      defaultBranch: z.string(),
      pushedAt: IsoDateTime.nullable(),
      stars: z.number().int(),
      license: z.string().nullable(),
      topics: z.array(z.string()),
      checkedAt: IsoDateTime,
    })
    .nullable(),
  source: z.object({
    ref: z.string(),
    kind: TemplateRefKind,
    sha: CommitSha,
    syncedAt: IsoDateTime,
    facts: TemplateDetailFacts.nullable(),
  }),
  verified: TemplateIndexEntry.shape.verified,
})

export type TemplateIndexFacts = z.infer<typeof TemplateIndexFacts>
export type TemplateIndexEntry = z.infer<typeof TemplateIndexEntry>
export type TemplatesIndex = z.infer<typeof TemplatesIndex>
export type TemplateDetail = z.infer<typeof TemplateDetail>
export type TemplateDetailFacts = z.infer<typeof TemplateDetailFacts>
