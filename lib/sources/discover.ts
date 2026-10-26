// `yarn om discover` (spec 5.2 sync.yml step 3): proposals for one "Discovered packages" issue, never entries.
// Sources: npm `keywords:open-mercato-module` and `keywords:open-mercato`, a pivot over maintainers of known authors,
// the GitHub topic `open-mercato-module`. Filter: the package has a `src/modules/<id>/index.ts` + `dist/modules/<id>/`
// pair (jsDelivr listing, no tarball download); a GitHub repository needs `src/modules/<id>/index.ts`. Never proposed:
// policy/ignore.yml, existing entries and their `renamedFrom`, the repositories of existing entries.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { stringify } from 'yaml'
import { isPlainText } from '../core/text.ts'
import { BuiltinData, type CategoryId, Lines } from '../schema/index.ts'
import { officialCoverage, type OfficialCoverage } from './coverage.ts'
import { type Entry, isIgnored, loadEntries, loadPolicies, readAllSyncRecords } from './entries.ts'
import { parseRepoUrl, repoTree, searchTopic } from './github.ts'
import { errText, type Http } from './http.ts'
import { listFiles, modulePairs } from './jsdelivr.ts'
import { searchNpm, type SearchHit } from './npm.ts'
import { isoSeconds } from './semver.ts'
import { type Attention, writeJson } from './sync.ts'

/** Known third-party authors on npm (spec 5.2, [i4 §2]); maintainers of current third-party entries are added. */
export const PIVOT_MAINTAINERS = [
  'fto-admin',
  'dainamite-acc',
  'jtomaszewski',
  'northboundrun',
  'bernard-fwc',
  'lbajsarowicz',
  'piotrkarwatka',
] as const
export const KEYWORDS = ['open-mercato-module', 'open-mercato'] as const
export const TOPIC = 'open-mercato-module'

export interface Candidate {
  locator: string
  name: string
  version: string | null
  via: string[]
  description: string | null
  moduleIds: string[]
  yaml: string
}

export interface Skipped {
  locator: string
  via: string[]
  reason: string
}

export interface DiscoverResult {
  proposals: Candidate[]
  skipped: Skipped[]
  coverage: OfficialCoverage | null
  missingOfficial: { name: string; url: string; yaml: string }[]
  attention: Attention[]
  errors: string[]
  markdown: string
}

export interface DiscoverOptions {
  http: Http
  root: string
  modulesDir: string
  policyDir: string
  dataDir: string
  outDir: string
  now: Date
  modulesRepo: string
  log?: (line: string) => void
}

const CATEGORY_HINTS: [RegExp, CategoryId][] = [
  // invoicing, KSeF included, is payments (review of 26 Oct: a person looking for invoices did not find KSeF)
  [/gateway|payment|billing|invoic|ksef|pay-|stripe|tpay|payu|przelewy/, 'payments-finance'],
  [/compliance|tax|i18n|translation/, 'localization-compliance'],
  [/channel|email|sms|notification|discord|telephony|chat/, 'communication'],
  [/sync|import|export|akeneo|shopify|sheets|webhook|integration|connector/, 'integrations-sync'],
  [/shipment|shipping|tracking|terminal|carrier|warehouse|logistic|freight/, 'warehouse-shipping'],
  [/cpq|catalog|pricing|product/, 'catalog-pricing'],
  [/checkout|order|cart|commerce/, 'orders-checkout'],
  [/marketing|consent|loyalty|campaign/, 'marketing-loyalty'],
  [/search|analytics|report|dashboard/, 'search-analytics'],
  [/auth|sso|security|login|permission/, 'auth-security'],
  [/ai|assistant|agent|research|llm/, 'ai-automation'],
  [/content|cms|portal|document|form/, 'content-portal'],
  [/storage|s3|cache|queue|durable|health|infra|telemetry|scheduler|job/, 'storage-infrastructure'],
  [/crm|sales|lead|deal|customer|visit|enrich/, 'crm-sales'],
  [/cli|generator|scanner|dev|tool|ui/, 'devtools'],
]

export function guessCategory(text: string): CategoryId {
  const t = text.toLowerCase()
  return CATEGORY_HINTS.find(([re]) => re.test(t))?.[1] ?? 'operations'
}

/** Descriptor proposal for a human to finish (summary from the author is used only when it is plain text). */
export function proposalYaml(p: {
  npm?: string
  github?: string
  kind: 'module' | 'provider' | 'library' | 'tool'
  description: string | null
  hint: string
}): string {
  const desc = (p.description ?? '').replace(/\s+/g, ' ').trim()
  const summary =
    desc.length >= 20 && desc.length <= 140 && isPlainText(desc)
      ? desc
      : 'TODO: one sentence, 20 to 140 characters, what the module adds.'
  const doc: Record<string, unknown> = {}
  if (p.npm) doc.npm = p.npm
  if (p.github) doc.github = p.github
  doc.kind = p.kind
  doc.category = guessCategory(`${p.hint} ${desc}`)
  doc.summary = summary
  doc.whenToUse = 'Use when TODO: the situation in which an app needs this, 40 to 240 characters.'
  return stringify(doc, { lineWidth: 0 })
}

function knownSets(entries: Entry[], dataDir: string): { locators: Set<string>; repos: Set<string> } {
  const locators = new Set<string>()
  const repos = new Set<string>()
  for (const e of entries) {
    locators.add(e.locator.toLowerCase())
    for (const r of e.d.renamedFrom ?? []) locators.add(r.toLowerCase())
    if (e.declaredRepo) repos.add(e.declaredRepo.toLowerCase())
    if (e.locator.startsWith('github:')) repos.add(e.locator.slice(7).toLowerCase())
  }
  for (const r of readAllSyncRecords(dataDir).values()) {
    const fromNpm = parseRepoUrl(r.npm?.repositoryUrl)
    if (fromNpm) repos.add(fromNpm.toLowerCase())
    if (r.github) repos.add(r.github.repo.toLowerCase())
  }
  return { locators, repos }
}

function readSyncReport(outDir: string): Attention[] {
  const f = join(outDir, 'sync-report.json')
  if (!existsSync(f)) return []
  try {
    return ((JSON.parse(readFileSync(f, 'utf8')) as { attention?: Attention[] }).attention ?? []).slice(0, 100)
  } catch {
    return []
  }
}

/** Core modules of `data/builtin/<coreLatest>.json` without a category in policy/builtin-categories.yml (spec 4.4). */
export function unmappedCoreModules(
  dataDir: string,
  builtinCategories: Record<string, string>,
): { coreVersion: string | null; ids: string[] } {
  const linesFile = join(dataDir, 'lines.json')
  let core: string | null = null
  if (existsSync(linesFile)) {
    const l = Lines.safeParse(JSON.parse(readFileSync(linesFile, 'utf8')))
    if (l.success) core = l.data.coreLatest
  }
  const dir = join(dataDir, 'builtin')
  if (!core && existsSync(dir))
    core =
      readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .at(-1)
        ?.replace(/\.json$/, '') ?? null
  if (!core) return { coreVersion: null, ids: [] }
  const file = join(dir, `${core}.json`)
  if (!existsSync(file)) return { coreVersion: core, ids: [] }
  const b = BuiltinData.safeParse(JSON.parse(readFileSync(file, 'utf8')))
  if (!b.success) return { coreVersion: core, ids: [] }
  return {
    coreVersion: core,
    ids: b.data.modules
      .map((m) => m.id)
      .filter((id) => !(id in builtinCategories))
      .sort(),
  }
}

const md = (s: string) =>
  s
    .replace(/[\\`*_[\]<>|#]/g, (c) => `\\${c}`)
    .replace(/\s+/g, ' ')
    .slice(0, 160)

export async function runDiscover(o: DiscoverOptions): Promise<DiscoverResult> {
  const log = o.log ?? (() => {})
  const errors: string[] = []
  const { entries } = loadEntries(o.modulesDir)
  const policies = loadPolicies(o.policyDir)
  const known = knownSets(entries, o.dataDir)
  const records = readAllSyncRecords(o.dataDir)

  const npmHits = new Map<string, { hit: SearchHit; via: Set<string> }>()
  const addHit = (h: SearchHit, via: string) => {
    const cur = npmHits.get(h.name) ?? { hit: h, via: new Set<string>() }
    cur.via.add(via)
    npmHits.set(h.name, cur)
  }
  for (const k of KEYWORDS) {
    try {
      for (const h of await searchNpm(o.http, `keywords:${k}`))
        if (h.keywords.map((x) => x.toLowerCase()).includes(k)) addHit(h, `keyword ${k}`)
    } catch (err) {
      errors.push(errText(`npm keywords:${k}`, err))
    }
  }
  const pivot = new Set<string>(PIVOT_MAINTAINERS)
  for (const r of records.values()) if (r.type !== 'official') for (const m of r.npm?.maintainers ?? []) pivot.add(m)
  for (const m of [...pivot].sort()) {
    try {
      for (const h of await searchNpm(o.http, `maintainer:${m}`))
        if (h.maintainers.includes(m)) addHit(h, `maintainer ${m}`)
    } catch (err) {
      errors.push(errText(`npm maintainer:${m}`, err))
    }
  }

  const proposals: Candidate[] = []
  const skipped: Skipped[] = []
  for (const [name, { hit, via }] of [...npmHits].sort(([a], [b]) => a.localeCompare(b))) {
    const locator = `npm:${name}`
    const viaList = [...via].sort()
    if (name.startsWith('@open-mercato/')) continue // official: Missing official packages section
    if (known.locators.has(locator.toLowerCase())) continue
    if (isIgnored(policies.ignore, locator)) {
      skipped.push({ locator, via: viaList, reason: 'policy/ignore.yml' })
      continue
    }
    try {
      const files = await listFiles(o.http, name, hit.version)
      const pairs = files ? modulePairs(files) : null
      if (!pairs || pairs.pairs.length === 0) {
        skipped.push({
          locator,
          via: viaList,
          reason: files ? 'no src/modules + dist/modules pair' : 'jsDelivr has no listing',
        })
        continue
      }
      proposals.push({
        locator,
        name,
        version: hit.version,
        via: viaList,
        description: hit.description,
        moduleIds: pairs.pairs,
        yaml: proposalYaml({
          npm: name,
          kind: 'module',
          description: hit.description,
          hint: `${name} ${hit.keywords.join(' ')}`,
        }),
      })
    } catch (err) {
      errors.push(errText(`jsdelivr ${name}@${hit.version}`, err))
    }
  }

  try {
    for (const r of await searchTopic(o.http, TOPIC)) {
      const locator = `github:${r.repo}`
      if (known.repos.has(r.repo.toLowerCase()) || known.locators.has(locator.toLowerCase())) continue
      if (isIgnored(policies.ignore, locator) || isIgnored(policies.ignore, `github:${r.repo.toLowerCase()}`)) {
        skipped.push({ locator, via: [`topic ${TOPIC}`], reason: 'policy/ignore.yml' })
        continue
      }
      if (r.fork || r.archived) {
        skipped.push({ locator, via: [`topic ${TOPIC}`], reason: r.fork ? 'fork' : 'archived' })
        continue
      }
      const tree = await repoTree(o.http, r.repo, r.defaultBranch)
      const ids = [
        ...new Set(
          tree.map((p) => /^src\/modules\/([a-z0-9_]+)\/index\.ts$/.exec(p)?.[1]).filter((x): x is string => !!x),
        ),
      ].sort()
      if (ids.length === 0) {
        skipped.push({ locator, via: [`topic ${TOPIC}`], reason: 'no src/modules/<id>/index.ts' })
        continue
      }
      proposals.push({
        locator,
        name: r.repo,
        version: null,
        via: [`topic ${TOPIC}`],
        description: r.description,
        moduleIds: ids,
        yaml: proposalYaml({ github: r.repo, kind: 'module', description: r.description, hint: r.repo }),
      })
    }
  } catch (err) {
    errors.push(errText(`github topic:${TOPIC}`, err))
  }

  let coverage: OfficialCoverage | null = null
  try {
    coverage = await officialCoverage(o.http, entries, policies, isoSeconds(o.now) as string)
  } catch (err) {
    errors.push(errText('official coverage', err))
  }
  const missingOfficial = (coverage?.missing ?? []).map((name) => {
    const yaml = proposalYaml({ npm: name, kind: 'module', description: null, hint: name })
    const file = `modules/${name}.yml`
    return {
      name,
      yaml,
      url: `https://github.com/${o.modulesRepo}/new/main?filename=${encodeURIComponent(file)}&value=${encodeURIComponent(yaml)}`,
    }
  })

  const attention: Attention[] = readSyncReport(o.outDir)
  if (attention.length === 0)
    for (const r of records.values()) {
      if (r.github?.archived)
        attention.push({ locator: r.locator, kind: 'archived', text: `Repository ${r.github.repo} is archived.` })
      if (r.github?.redirectedFrom)
        attention.push({
          locator: r.locator,
          kind: 'redirected',
          text: `Repository ${r.github.redirectedFrom} now redirects to ${r.github.repo}.`,
        })
      if (r.npm?.deprecated)
        attention.push({
          locator: r.locator,
          kind: 'deprecated',
          text: `npm says deprecated: ${r.npm.deprecated.slice(0, 120)}`,
        })
    }
  const core = unmappedCoreModules(o.dataDir, policies.builtinCategories)

  const markdown = renderIssue({ proposals, skipped, coverage, missingOfficial, attention, core, errors, now: o.now })
  const result: DiscoverResult = { proposals, skipped, coverage, missingOfficial, attention, errors, markdown }
  writeJson(join(o.outDir, 'discover.json'), { ...result, markdown: undefined, unmappedCore: core })
  log(`discover: ${proposals.length} proposals, ${missingOfficial.length} missing official, ${skipped.length} skipped`)
  return result
}

const ISSUE_LIMIT = 60_000

function renderIssue(r: {
  proposals: Candidate[]
  skipped: Skipped[]
  coverage: OfficialCoverage | null
  missingOfficial: { name: string; url: string; yaml: string }[]
  attention: Attention[]
  core: { coreVersion: string | null; ids: string[] }
  errors: string[]
  now: Date
}): string {
  const out: string[] = []
  out.push(`Updated by \`yarn om discover\` on ${isoSeconds(r.now)}. Proposals only: a person opens each PR.`, '')
  out.push('## Missing official packages', '')
  if (!r.coverage) out.push('Coverage unknown: the npm listing failed.', '')
  else if (r.missingOfficial.length === 0)
    out.push(`${r.coverage.listed} of ${r.coverage.listed} official packages listed.`, '')
  else {
    out.push(`${r.coverage.listed} of ${r.coverage.listed + r.coverage.missing.length} official packages listed.`, '')
    for (const m of r.missingOfficial) out.push(`- [ ] \`${m.name}\`: [create the descriptor](${m.url})`)
    out.push('')
  }
  out.push('## Discovered packages', '')
  if (r.proposals.length === 0) out.push('Nothing new.', '')
  for (const p of r.proposals) {
    out.push(`### \`${p.locator}\`${p.version ? ` ${p.version}` : ''}`, '')
    out.push(`Found by ${p.via.join(', ')}. Modules: ${p.moduleIds.map((m) => `\`${m}\``).join(', ')}.`, '')
    out.push('```yaml', p.yaml.replace(/```/g, "'''").trimEnd(), '```', '')
  }
  out.push('## Needs attention', '')
  const lines = r.attention.map((a) => `- \`${a.locator}\` ${a.kind}: ${md(a.text)}`)
  if (r.core.ids.length)
    lines.push(
      `- core ${r.core.coreVersion}: modules without a category in policy/builtin-categories.yml: ${r.core.ids.map((i) => `\`${i}\``).join(', ')}`,
    )
  for (const e of r.errors.slice(0, 20)) lines.push(`- source error: ${md(e)}`)
  out.push(...(lines.length ? lines : ['Nothing.']), '')
  // only what points at Open Mercato itself (a keyword, the topic, the ignore list): a maintainer's other npm work
  // stays out of a public issue (finding of 25 Oct: 33 of 40 lines were unrelated personal packages); the full list
  // is in out/discover.json
  const shown = r.skipped.filter(
    (s) => s.reason === 'policy/ignore.yml' || s.via.some((v) => !v.startsWith('maintainer ')),
  )
  if (shown.length) {
    out.push('<details><summary>Checked and skipped</summary>', '')
    for (const s of shown) out.push(`- \`${s.locator}\` (${s.via.join(', ')}): ${s.reason}`)
    const rest = r.skipped.length - shown.length
    if (rest > 0)
      out.push('', `${rest} more packages of the same maintainers, not about Open Mercato: out/discover.json.`)
    out.push('', '</details>', '')
  }
  let text = out.join('\n')
  if (text.length > ISSUE_LIMIT) text = `${text.slice(0, ISSUE_LIMIT)}\n\nTruncated. Full list in out/discover.json.\n`
  return text
}
