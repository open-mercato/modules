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
  'screenshots',
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

/** At most this many screenshots per descriptor. */
export const SCREENSHOT_MAX = 6
/** Size limit of a screenshot file hosted in the catalog (`modules/<scope>/screenshots/<name>`). */
export const SCREENSHOT_MAX_BYTES = 600 * 1024

const HOSTED_SRC = /^screenshots\/[a-z0-9][a-z0-9_-]{0,63}\.(?:webp|png|jpg)$/
// no `..` or an encoded dot: a browser resolves them, and the link would leave the repository it names
const RAW_SRC =
  /^(?!.*(?:\.\.|%2[eE]))https:\/\/raw\.githubusercontent\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})\/[A-Za-z0-9._~%/-]+$/
const ATTACHMENT_SRC = /^https:\/\/github\.com\/user-attachments\/assets\/[A-Za-z0-9-]+$/

/**
 * `src` of a screenshot: a file of the catalog next to the descriptor (`screenshots/<name>.webp`, `.png` or `.jpg`,
 * lower case), or an image on GitHub (raw.githubusercontent.com of the module's own repository, or an attachment).
 * One pattern, so descriptor-1.json says the same; the own-repository rule and the file are checked in superRefine and
 * `validate`.
 */
export const ScreenshotSrc = z
  .string()
  .max(300)
  .regex(
    new RegExp(`${HOSTED_SRC.source}|${RAW_SRC.source}|${ATTACHMENT_SRC.source}`),
    'use screenshots/<name>.webp (or .png, .jpg, lower case) next to the descriptor, or an https link on raw.githubusercontent.com or github.com/user-attachments/assets',
  )

/** Bounds of a screenshot's description (alt text), in characters; the /submit form says them from here. */
export const SCREENSHOT_ALT_MIN = 10
export const SCREENSHOT_ALT_MAX = 120

export const Screenshot = z
  .object({
    src: ScreenshotSrc,
    alt: PlainText(SCREENSHOT_ALT_MAX).min(SCREENSHOT_ALT_MIN, `min ${SCREENSHOT_ALT_MIN} characters`),
  })
  .strict()

/** A `src` that is a file of the catalog (else an https URL). */
export const isHostedScreenshot = (src: string): boolean => HOSTED_SRC.test(src)

/** Repository (`owner/repo`) a raw.githubusercontent.com `src` points at, or null. */
export function screenshotRepo(src: string): string | null {
  const m = RAW_SRC.exec(src)
  return m ? `${m[1]}/${m[2]}` : null
}

/** The module's own GitHub repository: `github`, else the repository of `repo` (`owner/name#ref/path`). */
export function ownRepo(d: { github?: string | undefined; repo?: string | undefined }): string | null {
  return d.github ?? d.repo?.split('#')[0] ?? null
}

/**
 * Repo-relative path of a catalog-hosted screenshot: `src` resolved against the folder of the descriptor file
 * (`modules/@acme/x.yml` + `screenshots/a.webp` = `modules/@acme/screenshots/a.webp`; a descriptor right under
 * `modules/` uses `modules/screenshots/`).
 */
export function screenshotFile(descriptorFile: string, src: string): string {
  const dir = descriptorFile.includes('/') ? descriptorFile.slice(0, descriptorFile.lastIndexOf('/')) : '.'
  return `${dir}/${src}`
}

/** A changed file that is a catalog-hosted screenshot (`modules/<folder>/screenshots/<name>.<ext>`), not a descriptor. */
export const SCREENSHOT_FILE = /^modules\/(?:.+\/)?screenshots\/[a-z0-9][a-z0-9_-]{0,63}\.(?:webp|png|jpg)$/

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
    screenshots: z.array(Screenshot).max(SCREENSHOT_MAX, `at most ${SCREENSHOT_MAX} screenshots`).optional(),
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
    // a raw.githubusercontent.com image only from the module's own repository (an image elsewhere can change under it)
    const own = ownRepo(d)
    d.screenshots?.forEach((s, i) => {
      const repo = screenshotRepo(s.src)
      if (!repo) return
      if (!own)
        ctx.addIssue({
          code: 'custom',
          path: ['screenshots', i, 'src'],
          message:
            'a raw.githubusercontent.com link needs the github field of the module; set it or host the file under screenshots/',
        })
      else if (repo.toLowerCase() !== own.toLowerCase())
        ctx.addIssue({
          code: 'custom',
          path: ['screenshots', i, 'src'],
          message: `link an image of the module's own repository ${own}, not of ${repo}, or host the file under screenshots/`,
        })
    })
  })

export type Descriptor = z.output<typeof Descriptor>
export type DescriptorInput = z.input<typeof Descriptor>
