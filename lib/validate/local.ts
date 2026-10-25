// Offline steps of `validate` (spec 5.2 steps 1, 5, 6 and the curator part of 9): schema, path = locator,
// category, ignore list, texts, typosquat, reserved names, module ID against core, curator fields.
// Nothing here touches the network, so `validate --offline` and `triage` run the same checks.
import { distance } from 'fastest-levenshtein'
import { parseDocument } from 'yaml'
import type { z } from 'zod'
import { injectionFlags, plainTextViolation } from '../core/text.ts'
import {
  CategoryId,
  CURATOR_FIELDS,
  Descriptor,
  DESCRIPTOR_KEY_ORDER,
  LocatorError,
  assertPathMatches,
  descriptorLocator,
  type Descriptor as DescriptorT,
} from '../schema/index.ts'
import type { Catalog } from './catalog.ts'
import type { Finding, StepId } from './types.ts'

export interface LocalInput {
  /** Repo-relative path, e.g. `modules/@a/b.yml`. */
  file: string
  text: string
  /** Text of the same file on the base branch (null: new file; undefined: not a diff, curator check skipped). */
  baseText?: string | null
  /** Pull request labels (`name-reviewed` lifts typosquat and reserved-name errors). */
  labels?: readonly string[]
}

export interface LocalResult {
  d: DescriptorT | null
  locator: string | null
  findings: Finding[]
}

const f = (step: StepId, severity: Finding['severity'], code: string, message: string): Finding => ({
  step,
  severity,
  code,
  message,
})

const TEXT_FIELDS = ['summary', 'whenToUse', 'whenNotToUse', 'reason'] as const

/** Readable message for one Zod issue of the Descriptor schema. */
export function issueMessage(
  issue: z.core.$ZodIssue,
  raw: Record<string, unknown>,
  aliases: Map<string, string>,
): string {
  const path = issue.path.map(String).join('.')
  if (issue.code === 'unrecognized_keys') {
    const keys = (issue as { keys: string[] }).keys
    const where = path ? `${path}: ` : ''
    return `${where}unknown field${keys.length > 1 ? 's' : ''} ${keys.map((k) => JSON.stringify(k)).join(', ')}${
      path ? '' : ` (allowed: ${DESCRIPTOR_KEY_ORDER.join(', ')})`
    }`
  }
  if (path === 'category') {
    const v = raw.category
    if (typeof v === 'string' && aliases.has(v))
      return `category: ${JSON.stringify(v)} is an old name of ${aliases.get(v)}; autofix rewrites it, or run yarn om format modules`
    return `category: must be one of ${CategoryId.options.join(', ')}`
  }
  const value = issue.path.reduce<unknown>(
    (o, k) => (o && typeof o === 'object' ? (o as Record<PropertyKey, unknown>)[k as PropertyKey] : undefined),
    raw,
  )
  if (typeof value === 'string' && issue.message.startsWith('plain text only')) {
    const why = plainTextViolation(value)
    return `${path}: plain text only${why ? ` (found ${why})` : ''}`
  }
  if (issue.code === 'too_big' && typeof value === 'string')
    return `${path}: ${value.length} characters, max ${(issue as { maximum: number | bigint }).maximum}`
  // a minimum with its own message (summary `min 20 characters`) keeps it; Zod's default one gets the count
  if (issue.code === 'too_small' && typeof value === 'string')
    return /^Too small/.test(issue.message)
      ? `${path}: ${value.length} characters, min ${(issue as { minimum: number | bigint }).minimum}`
      : `${path}: ${issue.message}`
  if (issue.code === 'invalid_type' && value === undefined) return `${path}: required`
  return `${path || 'descriptor'}: ${issue.message}`
}

/** Step 1: YAML, schema, path. Returns the parsed descriptor or the errors. */
export function checkSchema(
  input: LocalInput,
  catalog: Pick<Catalog, 'categoryAliases'>,
): { d: DescriptorT | null; raw: Record<string, unknown> | null; findings: Finding[] } {
  const findings: Finding[] = []
  if (!/^modules\/.+\.yml$/.test(input.file)) {
    findings.push(f('schema', 'error', 'file-name', `${input.file}: descriptors are modules/<path>.yml files`))
    return { d: null, raw: null, findings }
  }
  const doc = parseDocument(input.text, { prettyErrors: true, uniqueKeys: true })
  if (doc.errors.length > 0) {
    for (const e of doc.errors.slice(0, 5)) {
      const pos = e.linePos?.[0]
      const first = e.message.split('\n')[0] ?? 'YAML error'
      findings.push(
        f(
          'schema',
          'error',
          'yaml',
          `YAML${pos ? ` line ${pos.line}` : ''}: ${first.replace(/ at line \d+, column \d+:?$/, '')}`,
        ),
      )
    }
    return { d: null, raw: null, findings }
  }
  const raw = doc.toJS() as unknown
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    findings.push(f('schema', 'error', 'yaml', 'a descriptor is a YAML map of fields'))
    return { d: null, raw: null, findings }
  }
  const parsed = Descriptor.safeParse(raw)
  if (!parsed.success) {
    const seen = new Set<string>()
    for (const issue of parsed.error.issues) {
      const msg = issueMessage(issue, raw as Record<string, unknown>, catalog.categoryAliases)
      if (seen.has(msg)) continue
      seen.add(msg)
      findings.push(f('schema', 'error', 'schema', msg))
    }
    return { d: null, raw: raw as Record<string, unknown>, findings }
  }
  try {
    assertPathMatches(input.file, parsed.data)
  } catch (err) {
    if (!(err instanceof LocatorError)) throw err
    findings.push(f('schema', 'error', 'path', err.message))
    return { d: null, raw: raw as Record<string, unknown>, findings }
  }
  return { d: parsed.data, raw: raw as Record<string, unknown>, findings }
}

/** Owner of a locator for the typosquat rule: npm scope, else the GitHub owner (descriptor `github`), else none. */
export function ownerKey(d: Pick<DescriptorT, 'npm' | 'github'>): string | null {
  if (d.npm?.startsWith('@')) return d.npm.slice(0, d.npm.indexOf('/')).toLowerCase()
  if (d.github) return `gh:${d.github.split('/')[0]?.toLowerCase()}`
  return null
}

const nameOf = (d: Pick<DescriptorT, 'npm' | 'github'>): string => (d.npm ?? d.github ?? '').toLowerCase()
const bareOf = (name: string): string => name.slice(name.lastIndexOf('/') + 1)

export interface NameHit {
  other: string
  distance: number
  /**
   * The hit is only the same bare name under a scope that is not a look-alike, of an owner that is not
   * `@open-mercato` (finding of 25 Oct: every `@<you>/visits` made from the create-mercato-module example failed as a
   * typosquat of `@piotrkarwatka/visits`). A warning a curator reads, never an error.
   */
  sameNameOnly?: boolean
  /**
   * The same, for a module name 1 or 2 edits from the other one (finding of 25 Oct: `@acme/marketing-consent` failed as
   * a typosquat of `@piotrkarwatka/marketing-consents`, while the same name under a scope of its own only warned). A
   * look-alike scope, a reserved name and a name close to an `@open-mercato/*` package stay errors.
   */
  nearNameOnly?: boolean
  /**
   * The bare names are equal and the full names differ by this many edits: the hit is the same name under another
   * scope or owner, not the same package name (finding of 25 Oct: `@open-mercat0/gateway-stripe` read `same package
   * name as npm:@open-mercato/gateway-stripe`). At most 2: a look-alike scope.
   */
  scopeDistance?: number
}

/**
 * Typosquat (spec 5.2 step 6): Levenshtein <= 2 between full names, or between bare names (after the scope or owner;
 * names shorter than 5 characters only when equal), against the other entries and the known `@open-mercato/*` names,
 * for a different owner only. Pairs in the same
 * npm scope (`gateway-payu` and `gateway-tpay`, distance 2) or of the same repository owner are skipped.
 */
export function typosquatHits(
  d: Pick<DescriptorT, 'npm' | 'github'>,
  catalog: Pick<Catalog, 'entries' | 'officialNames'>,
): NameHit[] {
  const name = nameOf(d)
  const own = ownerKey(d)
  const self = descriptorLocator(d).toLowerCase()
  const others: { name: string; owner: string | null; label: string }[] = []
  for (const [loc, e] of catalog.entries) {
    if (loc === self) continue
    others.push({ name: nameOf(e.d), owner: ownerKey(e.d), label: e.locator })
  }
  for (const n of catalog.officialNames)
    if (!others.some((o) => o.name === n)) others.push({ name: n, owner: '@open-mercato', label: `npm:${n}` })
  const hits: NameHit[] = []
  for (const o of others) {
    if (o.name === name) continue
    if (own !== null && own === o.owner) continue
    const full = distance(name, o.name)
    const a = bareOf(name)
    const b = bareOf(o.name)
    const bare = distance(a, b)
    // bare names catch a known name under another scope; short ones (crm, cpq, ui) only when equal
    const bareHit = Math.min(a.length, b.length) >= 5 ? bare <= 2 : bare === 0
    const dist = Math.min(full, bareHit ? bare : Number.POSITIVE_INFINITY)
    const sameNameOnly = full > 2 && bare === 0 && o.owner !== '@open-mercato'
    const nearNameOnly = full > 2 && bareHit && bare > 0 && o.owner !== '@open-mercato'
    if (dist <= 2)
      hits.push({
        other: o.label,
        distance: dist,
        ...(sameNameOnly ? { sameNameOnly } : {}),
        ...(nearNameOnly ? { nearNameOnly } : {}),
        ...(bare === 0 ? { scopeDistance: full } : {}),
      })
  }
  return hits.sort((a, b) => a.distance - b.distance || a.other.localeCompare(b.other))
}

/** Changed curator fields (spec 4.3 column K) between the base and the PR version of a descriptor. */
export function curatorChanges(baseText: string | null | undefined, d: DescriptorT): string[] {
  let base: Record<string, unknown> = {}
  if (baseText) {
    const parsed = Descriptor.safeParse(parseDocument(baseText).toJS())
    if (parsed.success) base = parsed.data as Record<string, unknown>
  }
  const cur = d as Record<string, unknown>
  return CURATOR_FIELDS.filter((k) => JSON.stringify(base[k] ?? null) !== JSON.stringify(cur[k] ?? null)).filter(
    // defaults of a new file are not a change
    (k) => !(baseText == null && ((k === 'status' && cur[k] === 'active') || (k === 'featured' && cur[k] === false))),
  )
}

const isIgnored = (catalog: Pick<Catalog, 'ignore'>, locator: string) => {
  const lc = locator.toLowerCase()
  return catalog.ignore.find((i) => {
    const pat = i.locator.toLowerCase()
    return pat.endsWith('*') ? lc.startsWith(pat.slice(0, -1)) : lc === pat
  })
}

/** Steps 1, 5, 6 and the curator check of step 9, without network. */
export function checkLocal(input: LocalInput, catalog: Catalog): LocalResult {
  const schema = checkSchema(input, catalog)
  const findings = [...schema.findings]
  const d = schema.d
  if (!d) return { d: null, locator: null, findings }
  const locator = descriptorLocator(d)
  const reviewed = (input.labels ?? []).includes('name-reviewed')

  const ignored = isIgnored(catalog, locator)
  if (ignored) findings.push(f('schema', 'error', 'ignored', `${locator} is in policy/ignore.yml: ${ignored.reason}`))
  for (const r of d.renamedFrom ?? [])
    if (catalog.entries.has(r.toLowerCase()))
      findings.push(f('schema', 'error', 'renamed', `renamedFrom ${r} is still an entry of its own`))

  // 5. texts: the schema checked PlainText, lengths and `Use when `; phrase flags go to a human
  const texts: [string, string][] = []
  for (const k of TEXT_FIELDS) {
    const v = d[k]
    if (typeof v === 'string') texts.push([k, v])
  }
  d.providers.forEach((p, i) => texts.push([`providers.${i}.label`, p.label]))
  ;(d.aliases ?? []).forEach((a, i) => texts.push([`aliases.${i}`, a]))
  for (const [k, v] of texts) {
    const flags = injectionFlags(v)
    if (flags.length > 0) findings.push(f('texts', 'warning', 'text-flag', `${k}: phrase flag ${flags.join(', ')}`))
  }
  // the draft `create-mercato-module describe` prints is no description yet (finding of 25 Oct: it passed unchanged)
  if (/#\s*TODO\b/.test(input.text))
    findings.push(
      f('texts', 'error', 'todo', 'the file still has # TODO marks: write those values and remove the marks'),
    )
  if (/^Use when an Open Mercato app needs the .+ module\.$/.test(d.whenToUse))
    findings.push(
      f('texts', 'error', 'template', 'whenToUse is the describe template: say when the module is the right choice'),
    )
  if (/^.+ module for Open Mercato apps\.$/.test(d.summary))
    findings.push(f('texts', 'error', 'template', 'summary is the describe template: say what the module does'))

  // 6. names: typosquat and reserved names (errors unless a curator adds `name-reviewed`)
  const nameSeverity = reviewed ? 'info' : 'error'
  const suffix = reviewed ? ' (name-reviewed)' : '. A curator can add the name-reviewed label'
  for (const h of typosquatHits(d, catalog).slice(0, 3))
    findings.push(
      h.sameNameOnly || h.nearNameOnly
        ? // the same or a near module name under a scope of its own (`@acme/visits` and `@piotrkarwatka/visits`,
          // `@acme/marketing-consent` and `@piotrkarwatka/marketing-consents`): a curator reads it
          f(
            'name',
            reviewed ? 'info' : 'warning',
            'typosquat',
            `${h.sameNameOnly ? 'same module name as' : `module name ${h.distance} edit${h.distance > 1 ? 's' : ''} away from`} ${h.other} under another scope; a curator checks that it is not posing as it${reviewed ? ' (name-reviewed)' : ''}`,
          )
        : f(
            'name',
            nameSeverity,
            'typosquat',
            `${
              h.distance === 0
                ? `same name as ${h.other} under ${
                    (h.scopeDistance ?? 99) <= 2
                      ? `the look-alike ${d.npm ? 'scope' : 'owner'} ${nameOf(d).slice(0, nameOf(d).lastIndexOf('/'))}`
                      : `another ${d.npm ? 'scope' : 'owner'}`
                  }`
                : `name is ${h.distance} edit${h.distance > 1 ? 's' : ''} away from ${h.other}`
            }, another owner${suffix}`,
          ),
    )
  const official = d.npm?.startsWith('@open-mercato/') ?? false
  const bare = bareOf(nameOf(d))
  if (!official && catalog.reserved.includes(bare))
    findings.push(f('name', nameSeverity, 'reserved', `name ${bare} is reserved (policy/reserved.yml)${suffix}`))
  const coreIds = new Set((catalog.builtin?.modules ?? []).map((m) => m.id))
  const replaced = new Set((d.replaces ?? []).map((r) => r.slice(5)))
  if (d.module && coreIds.has(d.module) && !replaced.has(d.module))
    findings.push(
      f(
        'name',
        'error',
        'collision-core',
        `module ${d.module} is a core module; add replaces: ["core:${d.module}"] or rename it`,
      ),
    )
  for (const id of replaced)
    if (coreIds.size > 0 && !coreIds.has(id))
      findings.push(
        f(
          'name',
          'error',
          'replaces',
          `replaces core:${id}, but core ${catalog.builtin?.coreVersion} has no module ${id}`,
        ),
      )
  if (d.supersededBy?.startsWith('core:') && coreIds.size > 0 && !coreIds.has(d.supersededBy.slice(5)))
    findings.push(
      f(
        'name',
        'warning',
        'superseded',
        `supersededBy ${d.supersededBy}: core ${catalog.builtin?.coreVersion} has no such module yet`,
      ),
    )

  // 9. curator fields (only for a diff): information for the curator, never an error
  const changed = input.baseText === undefined ? [] : curatorChanges(input.baseText, d)
  if (changed.length > 0)
    findings.push(
      f('claim', 'warning', 'curator-fields', `sets curator fields: ${changed.join(', ')} (a curator decides)`),
    )
  return { d, locator, findings }
}
