// Template files of the `data` branch (docs/specs/2026-10-29-templates.md, Data Model "Data branch" and "Never typed by
// hand"): `sync/templates/<owner>/<repo>.json`, the repository and the sha its `ref` pointed to at the last sync, and
// `facts/templates/<owner>/<repo>/<sha>.json`, what the catalog read statically from the archive of that one sha.
// Written only by `sync`. Paths use the lower-case `owner/repo` of `templatePath`.
import { z } from 'zod'
import { EnvName, GithubRepo, HttpsUrl, IsoDateTime, LicenseKind, SemVer, StableSemVer } from '../common.ts'
import { TemplateModule } from '../template.ts'

/** A full commit sha. */
export const CommitSha = z.string().regex(/^[0-9a-f]{40}$/)

const OWNER = String.raw`[a-z0-9-]{1,39}`
const REPO = String.raw`[a-z0-9._-]{1,100}`

/** `sync/templates/<owner>/<repo>.json`. No module path has this shape (an unscoped npm name has no slash). */
export const TEMPLATE_SYNC_FILE = new RegExp(`^sync/templates/${OWNER}/${REPO}\\.json$`)
/** `facts/templates/<owner>/<repo>/<sha>.json`. Module facts are `facts/<locpath>/<version>.json`. */
export const TEMPLATE_FACTS_FILE = new RegExp(`^facts/templates/${OWNER}/${REPO}/[0-9a-f]{40}\\.json$`)

/** True for a template file of the data branch (relative path), which the module readers skip. */
export function isTemplateDataPath(relPath: string): boolean {
  const p = relPath.split('\\').join('/')
  return TEMPLATE_SYNC_FILE.test(p) || TEMPLATE_FACTS_FILE.test(p)
}

export const TemplateRefKind = z.enum(['default branch', 'branch', 'tag', 'ref', 'commit'])

export const TemplateSyncRecord = z
  .object({
    /** `github` of the entry, as written. */
    github: GithubRepo,
    checkedAt: IsoDateTime,
    // first sync of the entry, seeded from the first commit of templates/<path>.yml as for modules
    firstSeenAt: IsoDateTime,
    // null: GitHub answers 404 (deleted, or private and not visible to the token)
    repo: z
      .object({
        // `full_name` as GitHub answers it today: another name than `github` is a rename or transfer
        fullName: GithubRepo,
        private: z.boolean(),
        archived: z.boolean(),
        isTemplate: z.boolean(),
        defaultBranch: z.string().max(250),
        pushedAt: IsoDateTime.nullable(),
        stars: z.number().int(),
        // SPDX id GitHub detects, null for none or NOASSERTION
        license: z.string().max(100).nullable(),
        topics: z.array(z.string().max(50)).max(20),
        tags: z.array(z.object({ name: z.string().max(250), sha: CommitSha }).strict()).max(30),
      })
      .strict()
      .nullable(),
    // the sha the entry's `ref` pointed to at the last sync that resolved it; null before the first one
    source: z
      .object({
        ref: z.string().max(250),
        kind: TemplateRefKind,
        sha: CommitSha,
        syncedAt: IsoDateTime,
      })
      .strict()
      .nullable(),
    errors: z.array(z.string().max(300)).max(20),
  })
  .strict()

export const TemplateArchiveFinding = z
  .object({ severity: z.enum(['error', 'warning', 'info']), code: z.string().max(40), message: z.string().max(300) })
  .strict()

export const TemplateFacts = z
  .object({
    factsVersion: z.literal(1),
    github: GithubRepo,
    sha: CommitSha,
    readAt: IsoDateTime,
    archive: z.object({ files: z.number().int(), bytes: z.number().int() }).strict(),
    // the pinned @open-mercato/core of yarn.lock; null when it is not pinned there
    omVersion: SemVer.nullable(),
    omLine: z
      .string()
      .regex(/^\d+\.\d+$/)
      .nullable(),
    // lines behind the latest stable line `latestStable`, as sync last computed it: 0 on that line or a newer one, null
    // without a pinned core, without a latest line, or on another major line
    linesBehind: z.number().int().min(0).nullable(),
    latestStable: StableSemVer.nullable(),
    engines: z.record(z.string().max(40), z.string().max(100)).nullable(),
    packageManager: z.string().max(100).nullable(),
    // D5 (revision 7): an unconditional module from a package of the enterprise license kind; `enterpriseDependency`
    // (package.json or yarn.lock) alone does not set it
    requiresEnterprise: z.boolean(),
    enterpriseModules: z.array(z.string().max(64)).max(60),
    enterpriseDependency: z.boolean(),
    // the module inventory of src/modules.ts (modulesFromModulesTs), `package` resolved in yarn.lock as the save tool
    // writes it; null when the archive has no src/modules.ts
    modules: z
      .object({
        entries: z.array(TemplateModule).max(2000),
        unparsed: z.array(z.object({ line: z.number().int(), reason: z.string().max(300) }).strict()).max(100),
      })
      .strict()
      .nullable(),
    // mercato-template.json at this sha: its state and, when valid, its env keys
    manifest: z.enum(['absent', 'valid', 'invalid']),
    manifestEnv: z
      .array(
        z.object({ name: EnvName, description: z.string().max(240).optional(), link: HttpsUrl.optional() }).strict(),
      )
      .max(60)
      .nullable(),
    license: z
      .object({
        value: z.string().max(100).nullable(),
        kind: LicenseKind,
        sources: z
          .object({
            licenseFile: z.string().max(100).nullable(),
            packageJson: z.string().max(100).nullable(),
            github: z.string().max(100).nullable(),
          })
          .strict(),
      })
      .strict(),
    // what the static archive check found at this sha (lib/templates/archive.ts)
    findings: z.array(TemplateArchiveFinding).max(50),
  })
  .strict()

export type TemplateSyncRecord = z.infer<typeof TemplateSyncRecord>
export type TemplateFacts = z.infer<typeof TemplateFacts>
