// Files in policy/, quality/ and harness/lines.yml (spec 4.4, 6.3). Curated by people in PRs.
import { z } from 'zod'
import { CategoryId, HttpsUrl, IsoDate, IsoDateTime, Locator, ModuleId, StableSemVer, Wedge } from './common.ts'

const GithubLogin = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,38})$/) // lower case
const NpmScope = z.string().regex(/^@[a-z0-9-~][a-z0-9-._~]*$/)
const NpmUser = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,213}$/)

/** policy/categories.yml: closed list, stable slugs; `wedge` is the Hive wedge; aliases are old research slugs. */
export const CategoriesFile = z
  .object({
    categories: z
      .array(
        z
          .object({
            id: CategoryId,
            title: z.string().min(1).max(60),
            wedge: Wedge,
            aliases: z.array(z.string().regex(/^[a-z0-9-]{2,40}$/)).default([]),
          })
          .strict(),
      )
      .length(CategoryId.options.length)
      .superRefine((list, ctx) => {
        const ids = new Set(list.map((c) => c.id))
        if (ids.size !== list.length) ctx.addIssue({ code: 'custom', message: 'duplicate category id' })
        const aliases = list.flatMap((c) => c.aliases)
        if (new Set(aliases).size !== aliases.length) ctx.addIssue({ code: 'custom', message: 'duplicate alias' })
        for (const a of aliases)
          if (ids.has(a as CategoryId)) ctx.addIssue({ code: 'custom', message: `alias ${a} is a category id` })
      }),
  })
  .strict()

/** policy/builtin-categories.yml: core module ID -> category. */
export const BuiltinCategoriesFile = z.record(ModuleId, CategoryId)

/**
 * policy/builtin-upcoming.yml (round 13): core module IDs that the develop line has and no released core has yet
 * (`ecommerce` on main, spec 4.4 / P9), each with where it was seen. Their category stays in builtin-categories.yml,
 * so a new minor never puts them in operations; emit and scan do not report them as unknown until a release ships
 * them, and then ask to remove the entry.
 */
export const BuiltinUpcomingFile = z.record(ModuleId, z.string().min(1).max(200))

/** policy/community.yml (spec 4.4, D25, D-OPEN-6). */
export const CommunityFile = z
  .object({
    owners: z.array(GithubLogin).default([]),
    orgs: z
      .array(z.object({ company: z.string().min(1).max(100), org: z.string().regex(/^[A-Za-z0-9-]{1,39}$/) }).strict())
      .default([]),
    npmScopes: z.array(NpmScope).default([]),
  })
  .strict()

/** policy/official-maintainers.yml (D38). */
export const OfficialMaintainersFile = z
  .object({ githubOrg: z.literal('open-mercato'), npm: z.array(NpmUser).min(1) })
  .strict()

/** policy/reserved.yml: reserved names; core module IDs are loaded from data/builtin/<coreVersion>.json. */
export const ReservedFile = z.object({ names: z.array(z.string().regex(/^[a-z0-9-]{2,60}$/)).min(1) }).strict()

/** policy/site.yml: OM version that shipped `module search` (null until 9.1 is released). */
export const SiteFile = z.object({ cliSearchSince: StableSemVer.nullable() }).strict()

/** A locator, or an npm locator ending in `*` (prefix match), as used in policy/ignore.yml. */
export const LocatorPattern = z.union([
  Locator,
  z.string().regex(/^npm:(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*\*$/),
])

/** policy/ignore.yml: packages discovery never proposes, each with a reason. */
export const IgnoreFile = z.array(z.object({ locator: LocatorPattern, reason: z.string().min(1).max(200) }).strict())

/** harness/lines.yml: harness patches per OM version range, cadence per line. */
export const HarnessLinesFile = z
  .object({
    patches: z.array(
      z
        .object({
          id: z.string().regex(/^[a-z0-9-]{2,40}$/),
          applies: z.string().min(1).max(100), // semver range of create-mercato-app
          script: z.string().regex(/^patches\/[a-z0-9-]+\.sh$/),
          why: z.string().min(1).max(200),
          ref: z.string().url(),
        })
        .strict(),
    ),
    cadence: z
      .object({
        latest: z.enum(['nightly', 'weekly']),
        next: z.enum(['nightly', 'weekly']),
        previous: z.enum(['nightly', 'weekly']),
      })
      .strict(),
    weeklyDay: z.number().int().min(0).max(6),
  })
  .strict()

/** quality/reviews/<locpath>/<version>.yml (spec 6.3, OM Quality; 0 granted at launch). */
export const QualityReview = z
  .object({
    version: StableSemVer,
    integrity: z.string().min(1),
    checklistVersion: z.literal(1),
    items: z
      .array(
        z
          .object({
            id: z.string().regex(/^OMQ-\d{2}$/),
            pass: z.boolean(),
            note: z.string().max(500),
            file: z.string().max(300).nullable(),
            line: z.number().int().positive().nullable(),
          })
          .strict(),
      )
      .length(12),
    reviewers: z.array(z.string().min(1)).min(2),
    reviewedAt: IsoDate,
    until: IsoDate,
    reportUrl: HttpsUrl,
  })
  .strict()
  // finding of 25 Oct: twelve copies of OMQ-01 or the same reviewer twice passed the schema
  .superRefine((r, ctx) => {
    const ids = r.items.map((i) => i.id)
    const want = Array.from({ length: 12 }, (_, i) => `OMQ-${String(i + 1).padStart(2, '0')}`)
    const missing = want.filter((id) => !ids.includes(id))
    if (missing.length > 0 || new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message: `items must be OMQ-01 to OMQ-12, each once${missing.length ? ` (missing ${missing.join(', ')})` : ''}`,
      })
    const people = r.reviewers.map((x) => x.trim().toLowerCase().replace(/^@/, ''))
    if (new Set(people).size !== people.length)
      ctx.addIssue({ code: 'custom', path: ['reviewers'], message: 'reviewers must be different people' })
    if (r.until <= r.reviewedAt)
      ctx.addIssue({ code: 'custom', path: ['until'], message: 'until must be after reviewedAt' })
  })

/** A review that grants OM Quality: every item of the checklist passed (spec 6.3, quality/checklist/v1.md). */
export const qualityGranted = (r: Pick<z.infer<typeof QualityReview>, 'items'>): boolean => r.items.every((i) => i.pass)

/** quality/revocations.yml: manual OM Quality revocations, public. */
export const RevocationsFile = z.array(
  z
    .object({
      locator: Locator,
      version: StableSemVer,
      reason: z.string().min(1).max(200),
      at: z.union([IsoDate, IsoDateTime]),
    })
    .strict(),
)

export type CategoriesFile = z.output<typeof CategoriesFile>
export type CommunityFile = z.output<typeof CommunityFile>
export type OfficialMaintainersFile = z.output<typeof OfficialMaintainersFile>
export type ReservedFile = z.output<typeof ReservedFile>
export type SiteFile = z.output<typeof SiteFile>
export type IgnoreFile = z.output<typeof IgnoreFile>
export type HarnessLinesFile = z.output<typeof HarnessLinesFile>
export type QualityReview = z.output<typeof QualityReview>
