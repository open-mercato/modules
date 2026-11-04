// Templates (docs/specs/2026-10-29-templates.md, Data Model): the catalog entry `templates/<owner>/<repo>.yml` and the
// in-repo manifest `mercato-template.json`. Only author (A) and curator (K) fields; synced facts live on the `data`
// branch. The save tool `create-mercato-template` writes the manifest and prints the entry, so both shapes are a
// contract with it (revision 7): a change here is a change to the published `template-1.json` and
// `mercato-template-1.json`.
import { z } from 'zod'
import { EnvName, GithubRepo, Host, HttpsUrl, ModuleId, PlainText, SemVer } from './common.ts'
import { SCREENSHOT_MAX, Screenshot, screenshotRepo } from './descriptor.ts'
import { LocatorError } from './locator.ts'

/** Key order of a template entry (table order of the spec's "Catalog entry"). */
export const TEMPLATE_KEY_ORDER = [
  'github',
  'ref',
  'useCase',
  'summary',
  'whenToUse',
  'whenNotToUse',
  'links',
  'screenshots',
  'pricing',
  'declares',
  'smoke',
  'slug',
  'status',
  'reason',
  'alternatives',
  'supersededBy',
  'featured',
] as const

/** Fields only a curator may set (K in the spec). */
export const TEMPLATE_CURATOR_FIELDS = ['slug', 'status', 'reason', 'alternatives', 'supersededBy', 'featured'] as const

/** Key order of `mercato-template.json` (the spec's example). */
export const TEMPLATE_MANIFEST_KEY_ORDER = [
  'schema',
  'name',
  'description',
  'openMercato',
  'env',
  'modules',
  'createdWith',
] as const

/** The manifest file at the root of a template repository. */
export const TEMPLATE_MANIFEST_FILE = 'mercato-template.json'

/** The closed use case list (A3). */
export const TemplateUseCase = z.enum([
  'crm',
  'commerce',
  'b2b-portal',
  'partner-portal',
  'operations',
  'field-service',
  'internal-tools',
  'starter',
])
export type TemplateUseCase = z.infer<typeof TemplateUseCase>

export const TemplateStatus = z.enum(['active', 'hold', 'unmaintained', 'delisted'])
export type TemplateStatus = z.infer<typeof TemplateStatus>

/**
 * A branch, tag or sha. The `git check-ref-format` rules that keep the GitHub request inside the repository: no empty
 * segment, no segment that starts with `.` or ends with `.lock`, no `..` and no trailing `.`. A `pull/` or `refs/pull/`
 * ref is refused, because it names a pull request's commits, a fork's among them. Reachability is checked by
 * validation, not here.
 */
export const TemplateRef = z
  .string()
  .min(1)
  .max(250)
  .regex(
    /^(?!\/)(?!.*\/\/)(?!.*\/$)(?!(?:.*\/)?\.)(?!.*\.\.)(?!.*\.lock(?:\/|$))(?!.*\.$)(?!(?:refs\/)?pull\/)[A-Za-z0-9._/-]+$/,
    'a branch, tag or commit sha: git ref name rules, no pull/ ref',
  )

/** A curator slug (A6): lower-case words joined by single hyphens. */
export const TemplateSlug = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)

/** A template name in the manifest: the npm name rule for one unscoped segment, as a slug. */
export const TemplateName = z
  .string()
  .max(214)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)

/** A smoke path (the module rule) and the ready route (a concrete path, so no route brackets). */
export const SmokePath = z.string().regex(/^\/(backend|api)\/[a-zA-Z0-9/_\-.]+$/)
export const ReadyPath = z
  .string()
  .max(200)
  .regex(/^\/[a-zA-Z0-9/_\-.]*$/)

const SUPPORT_MAILTO = /^mailto:[^\s]+$/

/** One env key a user must fill: a name, a description and an optional link, never a value. */
export const TemplateEnvDeclaration = z
  .object({ name: EnvName, description: PlainText(240), link: HttpsUrl.optional() })
  .strict()

/** Reason a status other than `active` needs (the module rule, reused as is). */
export const STATUSES_WITH_REASON: readonly TemplateStatus[] = ['hold', 'unmaintained', 'delisted']

export const TemplateDescriptor = z
  .object({
    github: GithubRepo,
    ref: TemplateRef.optional(),
    useCase: TemplateUseCase,
    summary: PlainText(140).min(20, 'min 20 characters'),
    whenToUse: PlainText(240).regex(/^Use when [\s\S]{31,}$/, 'start with "Use when ", min 40 characters'),
    whenNotToUse: PlainText(160).optional(),
    links: z
      .object({
        docs: HttpsUrl.optional(),
        support: z.union([HttpsUrl, z.string().regex(SUPPORT_MAILTO)]).optional(),
        demo: HttpsUrl.optional(),
      })
      .strict()
      .optional(),
    screenshots: z.array(Screenshot).max(SCREENSHOT_MAX, `at most ${SCREENSHOT_MAX} screenshots`).optional(),
    // paid templates are out of scope in v1; paid dependencies are a computed mark (D5)
    pricing: z.enum(['free']).default('free'),
    declares: z
      .object({
        env: z.array(TemplateEnvDeclaration).max(30).optional(),
        hosts: z.array(Host).max(30).optional(),
      })
      .strict()
      .optional(),
    // Phase 1b; `login: false` needs `ready` and one `paths` entry (superRefine)
    smoke: z
      .object({
        paths: z.array(SmokePath).max(5).optional(),
        login: z.boolean().optional(),
        ready: ReadyPath.optional(),
      })
      .strict()
      .optional(),
    slug: TemplateSlug.optional(),
    status: TemplateStatus.default('active'),
    reason: PlainText(200).optional(),
    alternatives: z.array(GithubRepo).max(5).optional(),
    supersededBy: GithubRepo.optional(),
    featured: z.boolean().default(false),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.status !== 'active' && !d.reason)
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'reason is required for this status' })
    if (d.smoke?.login === false) {
      if (!d.smoke.ready)
        ctx.addIssue({ code: 'custom', path: ['smoke', 'ready'], message: 'login: false needs a ready path' })
      if (!d.smoke.paths?.length)
        ctx.addIssue({ code: 'custom', path: ['smoke', 'paths'], message: 'login: false needs one smoke path' })
    }
    // a raw.githubusercontent.com image only from the template's own repository
    d.screenshots?.forEach((s, i) => {
      const repo = screenshotRepo(s.src)
      if (repo && repo.toLowerCase() !== d.github.toLowerCase())
        ctx.addIssue({
          code: 'custom',
          path: ['screenshots', i, 'src'],
          message: `link an image of the template's own repository ${d.github}, not of ${repo}, or host the file under screenshots/`,
        })
    })
  })

export type TemplateDescriptor = z.output<typeof TemplateDescriptor>
export type TemplateDescriptorInput = z.input<typeof TemplateDescriptor>

// EnvName and `module:` + ModuleId of common.ts, without anchors (a test keeps them in step)
const ENV_TERM = /[A-Z][A-Z0-9_]{1,63}/
const MODULE_TERM = /module:[a-z][a-z0-9]*(?:_[a-z0-9]+)*/
const WHEN_TERM = `!?(?:${ENV_TERM.source}|${MODULE_TERM.source})`

/**
 * `modules[].when` (revision 7): env flag names and `module:<id>` terms, each optionally negated with `!`, joined with
 * ` && `; a condition outside that grammar is the literal `custom`. `modulesFromModulesTs` writes nothing else.
 */
export const WHEN_PATTERN = new RegExp(`^(?:custom|${WHEN_TERM}(?: && ${WHEN_TERM})*)$`)

/** `<npm name>@<resolved version>`, as Yarn resolved it. */
export const ModulePackage = z.string().regex(/^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*@[^\s@]+$/)

export const TemplateModule = z
  .object({
    id: ModuleId,
    // `@app`, an npm name, or any other string the save tool keeps with a warning
    from: z.string().min(1).max(214),
    package: ModulePackage.optional(),
    when: z.string().regex(WHEN_PATTERN).optional(),
  })
  .strict()
export type TemplateModule = z.infer<typeof TemplateModule>

export const TemplateManifest = z
  .object({
    schema: z.literal(1),
    name: TemplateName,
    description: PlainText(350).optional(),
    openMercato: z
      .string()
      .regex(/^\d+\.\d+\.x$/)
      .optional(),
    // descriptions come from .env.example comments as the save tool reads them, so any text (pages escape it)
    env: z
      .array(
        z
          .object({ name: EnvName, description: z.string().min(1).max(240).optional(), link: HttpsUrl.optional() })
          .strict(),
      )
      .optional(),
    modules: z.array(TemplateModule),
    createdWith: z.object({ tool: z.literal('create-mercato-template'), version: SemVer }).strict(),
  })
  .strict()
export type TemplateManifest = z.infer<typeof TemplateManifest>

/** `owner/repo` of a template in lower case, the key of its file and page. Throws LocatorError on anything else. */
export function templatePath(github: string): string {
  if (!GithubRepo.safeParse(github).success) throw new LocatorError(`invalid github repo: ${JSON.stringify(github)}`)
  return github.toLowerCase()
}

/** Repo-relative entry file of a template: `templates/<owner>/<repo>.yml` (lower case, as module GitHub paths). */
export function templateFile(github: string): string {
  return `templates/${templatePath(github)}.yml`
}

/** Site page of a template, without the base path: `/t/<owner>/<repo>`. */
export function templatePagePath(github: string): string {
  return `/t/${templatePath(github)}`
}
