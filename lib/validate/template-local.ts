// Offline steps of `validate` for a template entry `templates/<owner>/<repo>.yml` (docs/specs/2026-10-29-templates.md,
// Phase 1a step 2): schema and path, texts, names, a slug unique across statuses and kept when an entry moves to
// `hold` (hold policy), and the curator fields of a diff. The status `reason` and the `smoke.login: false` rule are
// schema rules (TemplateDescriptor). Nothing here touches the network.
import { parseDocument } from 'yaml'
import { injectionFlags } from '../core/text.ts'
import {
  TEMPLATE_CURATOR_FIELDS,
  TEMPLATE_KEY_ORDER,
  TemplateDescriptor,
  templateFile,
  templatePath,
  type TemplateDescriptor as TemplateDescriptorT,
} from '../schema/template.ts'
import type { Catalog } from './catalog.ts'
import { issueMessage, parseEntryYaml, screenshotFindings, typosquatHits, type LocalInput } from './local.ts'
import type { Finding, StepId } from './types.ts'

/** A template entry file: `templates/<owner>/<repo>.yml`. */
export const TEMPLATE_ENTRY_FILE = /^templates\/[^/]+\/[^/]+\.yml$/

/** Whether a repo-relative path belongs to the templates section (entries and their screenshots). */
export const isTemplatePath = (file: string): boolean => file.startsWith('templates/')

export interface TemplateLocalResult {
  d: TemplateDescriptorT | null
  /** `github` as the entry writes it, once the schema passed. */
  locator: string | null
  findings: Finding[]
}

const f = (step: StepId, severity: Finding['severity'], code: string, message: string): Finding => ({
  step,
  severity,
  code,
  message,
})

/** The base entry of a diff, when it parses (null: a new file, or a base that did not parse). */
function baseEntry(baseText: string | null | undefined): TemplateDescriptorT | null {
  if (!baseText) return null
  const parsed = TemplateDescriptor.safeParse(parseDocument(baseText).toJS())
  return parsed.success ? parsed.data : null
}

/** Schema and path: the YAML map, TemplateDescriptor, and the file at `templates/<lower-case owner/repo>.yml`. */
export function checkTemplateSchema(input: Pick<LocalInput, 'file' | 'text'>): {
  d: TemplateDescriptorT | null
  findings: Finding[]
} {
  const findings: Finding[] = []
  if (!TEMPLATE_ENTRY_FILE.test(input.file)) {
    findings.push(
      f('schema', 'error', 'file-name', `${input.file}: template entries are templates/<owner>/<repo>.yml files`),
    )
    return { d: null, findings }
  }
  const yaml = parseEntryYaml(input.text, 'a template entry')
  findings.push(...yaml.findings)
  if (yaml.raw === null) return { d: null, findings }
  const parsed = TemplateDescriptor.safeParse(yaml.raw)
  if (!parsed.success) {
    const seen = new Set<string>()
    for (const issue of parsed.error.issues) {
      const msg = issueMessage(issue, yaml.raw, new Map(), TEMPLATE_KEY_ORDER)
      if (seen.has(msg)) continue
      seen.add(msg)
      findings.push(f('schema', 'error', 'schema', msg))
    }
    return { d: null, findings }
  }
  const expected = templateFile(parsed.data.github)
  if (input.file !== expected) {
    findings.push(
      f('schema', 'error', 'path', `template entry path ${input.file} does not match its github; expected ${expected}`),
    )
    return { d: null, findings }
  }
  return { d: parsed.data, findings }
}

/** Changed curator fields (K in the spec's field table) between the base and the pull request version. */
export function templateCuratorChanges(baseText: string | null | undefined, d: TemplateDescriptorT): string[] {
  const base = (baseEntry(baseText) ?? {}) as Record<string, unknown>
  const cur = d as Record<string, unknown>
  return TEMPLATE_CURATOR_FIELDS.filter(
    (k) => JSON.stringify(base[k] ?? null) !== JSON.stringify(cur[k] ?? null),
  ).filter(
    // defaults of a new file are not a change
    (k) => !(baseText == null && ((k === 'status' && cur[k] === 'active') || (k === 'featured' && cur[k] === false))),
  )
}

/** Other template entries in the shape the typosquat rule reads (`github:` locators of the same owner skip). */
function templateNames(catalog: Pick<Catalog, 'templates'>) {
  const entries = new Map<string, { locator: string; d: { github: string } }>()
  for (const t of catalog.templates.values())
    entries.set(`github:${templatePath(t.d.github)}`, { locator: t.d.github, d: { github: t.d.github } })
  return { entries, officialNames: [] as string[] }
}

/** Schema, texts, names, slug and the curator check of a template entry, without network. */
export function checkTemplateLocal(
  input: LocalInput,
  catalog: Pick<Catalog, 'templates' | 'reserved'>,
): TemplateLocalResult {
  const schema = checkTemplateSchema(input)
  const findings = [...schema.findings]
  const d = schema.d
  if (!d) return { d: null, locator: null, findings }
  const reviewed = (input.labels ?? []).includes('name-reviewed')

  if (input.fileSize) findings.push(...screenshotFindings(input.file, d.screenshots ?? [], input.fileSize))

  // texts: the schema checked plain text, lengths and `Use when `; phrase flags go to a human
  const texts: [string, string][] = []
  for (const k of ['summary', 'whenToUse', 'whenNotToUse', 'reason'] as const) {
    const v = d[k]
    if (typeof v === 'string') texts.push([k, v])
  }
  ;(d.screenshots ?? []).forEach((s, i) => texts.push([`screenshots.${i}.alt`, s.alt]))
  ;(d.declares?.env ?? []).forEach((e, i) => texts.push([`declares.env.${i}.description`, e.description]))
  for (const [k, v] of texts) {
    const flags = injectionFlags(v)
    if (flags.length > 0) findings.push(f('texts', 'warning', 'text-flag', `${k}: phrase flag ${flags.join(', ')}`))
  }
  if (/#\s*TODO\b/.test(input.text))
    findings.push(
      f('texts', 'error', 'todo', 'the file still has # TODO marks: write those values and remove the marks'),
    )

  // names: reserved repository names and look-alikes of other templates (errors unless `name-reviewed`)
  const nameSeverity = reviewed ? 'info' : 'error'
  const suffix = reviewed ? ' (name-reviewed)' : '. A curator can add the name-reviewed label'
  const [owner, repo] = templatePath(d.github).split('/') as [string, string]
  if (owner !== 'open-mercato' && catalog.reserved.includes(repo))
    findings.push(f('name', nameSeverity, 'reserved', `name ${repo} is reserved (policy/reserved.yml)${suffix}`))
  for (const h of typosquatHits({ github: d.github }, templateNames(catalog)).slice(0, 3))
    findings.push(
      // the same or a near repository name under an owner of its own is a warning, except next to an official template
      (h.sameNameOnly || h.nearNameOnly) && !h.other.toLowerCase().startsWith('open-mercato/')
        ? f(
            'name',
            reviewed ? 'info' : 'warning',
            'typosquat',
            `${h.sameNameOnly ? 'same repository name as' : `repository name ${h.distance} edit${h.distance > 1 ? 's' : ''} away from`} ${h.other} under another owner; a curator checks that it is not posing as it${reviewed ? ' (name-reviewed)' : ''}`,
          )
        : f(
            'name',
            nameSeverity,
            'typosquat',
            `${
              h.distance === 0
                ? `same name as ${h.other} under ${(h.scopeDistance ?? 99) <= 2 ? `the look-alike owner ${owner}` : 'another owner'}`
                : `name is ${h.distance} edit${h.distance > 1 ? 's' : ''} away from ${h.other}`
            }, another owner${suffix}`,
          ),
    )

  // slug: unique across every status (a `delisted` or `hold` entry keeps its slug reserved, A6 and the hold policy)
  if (d.slug !== undefined) {
    const self = templatePath(d.github)
    const clash = [...catalog.templates.entries()]
      .filter(([key, t]) => key !== self && t.file !== input.file && t.d.slug === d.slug)
      .map(([, t]) => `${t.file} (${t.d.status})`)
      .sort()
    if (clash.length > 0)
      findings.push(f('slug', 'error', 'slug-taken', `slug ${d.slug} is already used by ${clash.join(', ')}`))
  }
  // hold policy: an entry on hold keeps the slug it had, so `--template <slug>` keeps refusing with the reason
  const base = input.baseText === undefined ? null : baseEntry(input.baseText)
  if (base?.slug !== undefined && d.status === 'hold' && d.slug !== base.slug)
    findings.push(
      f(
        'slug',
        'error',
        'slug-kept',
        d.slug === undefined
          ? `an entry on hold keeps its slug: put back slug: ${base.slug}`
          : `an entry on hold keeps its slug: ${base.slug}, not ${d.slug}`,
      ),
    )

  // curator fields (only for a diff): information for the curator, never an error
  const changed = input.baseText === undefined ? [] : templateCuratorChanges(input.baseText, d)
  if (changed.length > 0)
    findings.push(
      f('claim', 'warning', 'curator-fields', `sets curator fields: ${changed.join(', ')} (a curator decides)`),
    )
  return { d, locator: d.github, findings }
}
