// data/sync/<locpath>.json (spec 4.5). Written only by the `sync` job.
import { z } from 'zod'
import { GithubRepo, IsoDate, IsoDateTime, Locator, NpmName, OriginType, SemVer, StableSemVer } from '../common.ts'

export const SyncRecord = z
  .object({
    locator: Locator,
    checkedAt: IsoDateTime,
    // first time the locator appeared in sync; seeded from the first commit of modules/<path>.yml
    // (`git log --diff-filter=A --format=%aI`); source of IndexEntry.addedAt and Hive slots
    firstSeenAt: IsoDateTime,
    npm: z
      .object({
        name: NpmName,
        distTags: z.record(z.string(), SemVer),
        latestStable: StableSemVer.nullable(),
        previousStable: StableSemVer.nullable(),
        preview: SemVer.nullable(),
        publishedAt: z.record(SemVer, IsoDateTime), // only for latestStable, previousStable, preview
        deprecated: z.string().nullable(),
        license: z.string().nullable(),
        repositoryUrl: z.string().nullable(),
        gitHead: z.string().nullable(),
        keywords: z.array(z.string()).max(30),
        maintainers: z.array(z.string()).max(20),
        peerDependencies: z.record(z.string(), z.string()),
        dependencies: z.record(z.string(), z.string()),
        installScripts: z.array(z.enum(['preinstall', 'install', 'postinstall', 'prepare'])),
        integrity: z.string().nullable(),
        tarball: z.string().url().nullable(),
      })
      .strict()
      .nullable(),
    github: z
      .object({
        repo: GithubRepo,
        redirectedFrom: GithubRepo.nullable(),
        archived: z.boolean(),
        pushedAt: IsoDateTime,
        defaultBranch: z.string(),
        stars: z.number().int(),
        license: z.string().nullable(),
        topics: z.array(z.string()).max(20),
        ownerType: z.enum(['User', 'Organization']),
        tags: z.array(z.object({ name: z.string(), sha: z.string() }).strict()).max(50),
      })
      .strict()
      .nullable(),
    provenance: z
      .object({
        status: z.enum(['verified', 'none', 'lost']),
        sourceRepo: z.string().nullable(),
        commit: z.string().nullable(),
        workflow: z.string().nullable(),
      })
      .strict(),
    advisories: z.array(
      z
        .object({
          id: z.string(),
          severity: z.enum(['low', 'moderate', 'high', 'critical']),
          publishedAt: IsoDateTime,
          fixedIn: z.string().nullable(),
        })
        .strict(),
    ),
    type: OriginType,
    typeReason: z.string().max(200),
    downloads30d: z.number().int().nullable(),
    errors: z.array(z.string().max(300)).max(20),
  })
  .strict()

/** data/claims.json (spec 4.5). Written only by `sync`. */
export const Claims = z.record(
  Locator,
  z
    .object({
      by: z.string(),
      method: z.enum(['provenance', 'repo-owner', 'org-member']),
      pr: z.number().int(),
      at: IsoDate,
    })
    .strict(),
)

/**
 * data/stats.json. Written only by `sync`. Not specified field by field in spec 4.5;
 * this shape is the WP01 proposal: downloads and stars per locator, shown not scored.
 */
export const Stats = z
  .object({
    at: IsoDateTime,
    entries: z.record(
      Locator,
      z.object({ downloads30d: z.number().int().nullable(), stars: z.number().int().nullable() }).strict(),
    ),
  })
  .strict()

export type SyncRecord = z.infer<typeof SyncRecord>
export type Claims = z.infer<typeof Claims>
export type Stats = z.infer<typeof Stats>
