// `yarn om compare-live` (www site migration spec, API Contracts, compare-live; cutover steps C6 and C8): every URL
// of the live sitemap and every rule of www/content/redirects.yaml is requested from the reference (the live site, or
// the candidate snapshot of an earlier report with --baseline) and from the candidate, without following redirects,
// at most 4 requests at a time, and compared. Read-only: GET requests only.
import pLimit from 'p-limit'
import type { WwwRedirect } from '../emit/www-redirects.ts'
import { similarity, snapshotHtml, type PageSnapshot } from './page.ts'

/** The fields compared per URL; `--planned` names them. */
export const FIELDS = [
  'request',
  'status',
  'redirect',
  'title',
  'description',
  'h1',
  'text',
  'images',
  'canonical',
  'og:title',
  'og:image',
  'json-ld',
] as const
export type Field = (typeof FIELDS)[number]

/** Main text similarity a page needs (spec: at least 0.97). */
export const TEXT_SIMILARITY = 0.97
/** At most this many requests at a time, over both origins (spec: read-only, at most 4). */
export const MAX_REQUESTS = 4
export const DOCS_HOST = 'docs.openmercato.com'
export const USER_AGENT = 'open-mercato-compare-live (read-only)'

/** The kinds of URLs the report counts, in report order. */
export const KINDS = ['blog', 'case-studies', 'partners', 'jobs', 'docs', 'landing', 'page', 'redirect', 'run'] as const
export type Kind = (typeof KINDS)[number]

export const KIND_LABELS: Record<Kind, string> = {
  blog: 'Blog',
  'case-studies': 'Case studies',
  partners: 'Partners',
  jobs: 'Jobs',
  docs: 'Docs redirects',
  landing: 'Landings',
  page: 'Unique pages',
  redirect: 'Other redirects',
  run: 'Run',
}

/** One URL to compare: a path of the site, from the sitemap, from redirects.yaml, or both. */
export interface Target {
  path: string
  sitemap: boolean
  /** The rule of redirects.yaml that starts at this path (a sample path for a splat or a placeholder). */
  redirect?: Pick<WwwRedirect, 'from' | 'to' | 'source'>
}

/** What one origin answered for one path. A Location on the answering origin is kept as a path. */
export interface Answer {
  status: number
  location: string | null
  page: PageSnapshot | null
  error?: string
}

/** An intended difference (`--planned`): its path (a trailing `*` matches a prefix) and field. */
export interface Planned {
  url: string
  field: Field
  note?: string
}

export interface Difference {
  field: Field
  reference: string
  candidate: string
}

export interface UrlResult {
  path: string
  kind: Kind
  result: 'pass' | 'fail'
  failures: Difference[]
  /** Differences `--planned` lists, so not failures. */
  planned: Difference[]
  reference: Answer | null
  candidate: Answer
}

export interface ApexResult {
  url: string
  expected: string
  status: number
  location: string | null
  result: 'pass' | 'fail'
  error?: string
}

export interface Report {
  version: 1
  /** The live origin, or the live origin of the baseline. */
  live: string | null
  baseline: string | null
  candidate: string
  apex: ApexResult | null
  summary: { urls: number; passed: number; failed: number; planned: number }
  /** Planned differences no URL had. */
  unusedPlanned: Planned[]
  urls: UrlResult[]
}

export interface CompareOptions {
  /** The live origin; or `baseline`. */
  live?: string
  /** An earlier report: its candidate answers are the reference (step C8). */
  baseline?: { file: string; report: Report }
  candidate: string
  targets: readonly Target[]
  planned?: readonly Planned[]
  /** The apex check; default from the first `www.` origin of live, baseline and candidate; null to skip it. */
  apex?: { url: string; expected: string } | null
  fetch?: typeof fetch
  concurrency?: number
  timeoutMs?: number
}

/** The paths of a sitemap's `<loc>` entries (path and query), in sitemap order, each once. */
export function sitemapTargets(xml: string): Target[] {
  const out: Target[] = []
  const seen = new Set<string>()
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    let url: URL
    try {
      url = new URL(m[1]!.replace(/&amp;/g, '&'))
    } catch {
      continue
    }
    const path = `${url.pathname}${url.search}`
    if (seen.has(path)) continue
    seen.add(path)
    out.push({ path, sitemap: true })
  }
  return out
}

/** A path a rule's source matches: a splat or a placeholder takes a sample segment. */
export function samplePath(from: string): string {
  return from.replace(/\*/g, 'compare-live-sample').replace(/:[A-Za-z][A-Za-z0-9_]*/g, 'sample')
}

/** The targets of the sitemap and of redirects.yaml together, each path once, sitemap order first. */
export function mergeTargets(sitemap: readonly Target[], redirects: readonly WwwRedirect[]): Target[] {
  const byPath = new Map<string, Target>()
  for (const t of sitemap) byPath.set(t.path, { ...t })
  for (const r of redirects) {
    const path = samplePath(r.from)
    const t = byPath.get(path) ?? { path, sitemap: false }
    t.redirect = { from: r.from, to: r.to, source: r.source }
    byPath.set(path, t)
  }
  return [...byPath.values()]
}

/** The kind of a URL for the report; `landing` when the reference page uses the landing layout. */
export function kindOf(t: Target, reference: Answer | null): Kind {
  const p = t.path.split('?')[0]!
  if (p === '/docs' || p.startsWith('/docs/') || p === '/documentation') return 'docs'
  if (p === '/blog' || p.startsWith('/blog-posts/')) return 'blog'
  if (p === '/case-studies' || p.startsWith('/case-studies/')) return 'case-studies'
  if (p === '/certified-partners' || p.startsWith('/certified-partners/')) return 'partners'
  if (p.startsWith('/careers-jobs/')) return 'jobs'
  if (p === '/run' || p.startsWith('/run/')) return 'run'
  if (!t.sitemap && t.redirect) return 'redirect'
  return reference?.page?.landing ? 'landing' : 'page'
}

/** A Location relative to `base`, as a path when it stays on `origin`, else absolute. */
export function normalizeLocation(location: string | null, base: string, origin: string): string | null {
  if (location === null) return null
  let url: URL
  try {
    url = new URL(location, base)
  } catch {
    return location
  }
  return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : url.href
}

function originOf(u: string): string {
  return new URL(u).origin
}

/** Requests `url` once without following redirects (one retry after a network error, a 429 or a 5xx). */
export async function request(
  url: string,
  origin: string,
  opts: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<Answer> {
  const f = opts.fetch ?? fetch
  let last = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500))
    try {
      const res = await f(url, {
        redirect: 'manual',
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*;q=0.8' },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
      })
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        await res.body?.cancel()
        last = `HTTP ${res.status}`
        continue
      }
      const location = normalizeLocation(res.headers.get('location'), url, origin)
      const type = res.headers.get('content-type') ?? ''
      if (res.status >= 200 && res.status < 300 && type.includes('html'))
        return { status: res.status, location, page: snapshotHtml(await res.text()) }
      await res.body?.cancel()
      return { status: res.status, location, page: null }
    } catch (err) {
      last = (err as Error).message
    }
  }
  return { status: 0, location: null, page: null, error: last }
}

const show = (v: unknown): string => (v === null || v === undefined ? '(none)' : String(v))
const cls = (status: number): string => `${Math.floor(status / 100)}xx`

/** The differences of one URL, before `--planned` is applied. */
export function differences(t: Target, kind: Kind, ref: Answer | null, cand: Answer): Difference[] {
  const out: Difference[] = []
  const diff = (field: Field, reference: unknown, candidate: unknown): void => {
    out.push({ field, reference: show(reference), candidate: show(candidate) })
  }
  if (cand.error) {
    diff('request', 'an answer', cand.error)
    return out
  }
  // a docs URL is a 301 to docs.openmercato.com, whatever Webflow answers today (D4)
  if (kind === 'docs') {
    let host = ''
    try {
      host = cand.location ? new URL(cand.location).host : ''
    } catch {
      host = ''
    }
    if (cand.status !== 301 || host !== DOCS_HOST)
      diff('redirect', `301 to https://${DOCS_HOST}/...`, `${cand.status} ${show(cand.location)}`)
    else if (t.redirect && cand.location !== t.redirect.to) diff('redirect', t.redirect.to, cand.location)
    return out
  }
  // a rule of redirects.yaml (the Webflow panel list, a manual rule): the candidate answers it
  if (t.redirect) {
    // Pages sends the target as written: a path stays a path, an address stays absolute
    const to = t.redirect.to
    if (cand.status !== 301 || cand.location !== to)
      diff('redirect', `301 to ${to}`, `${cand.status} ${show(cand.location)}`)
  }
  if (ref === null) return out
  if (ref.error) {
    diff('request', ref.error, 'an answer')
    return out
  }
  if (cls(ref.status) !== cls(cand.status)) {
    diff('status', ref.status, cand.status)
    return out
  }
  if (ref.status >= 300 && ref.status < 400 && !t.redirect && ref.location !== cand.location)
    diff('redirect', ref.location, cand.location)
  const a = ref.page
  const b = cand.page
  if (!a || !b) {
    if (a && !b) diff('status', `${ref.status} HTML`, `${cand.status} not HTML`)
    return out
  }
  if (a.title !== b.title) diff('title', a.title, b.title)
  if (a.description !== b.description) diff('description', a.description, b.description)
  if (a.h1 !== b.h1) diff('h1', a.h1, b.h1)
  const sim = similarity(a.words, b.words)
  if (sim < TEXT_SIMILARITY)
    diff('text', `${a.words.length} words`, `${b.words.length} words, similarity ${sim.toFixed(3)}`)
  if (a.images !== b.images) diff('images', a.images, b.images)
  if (!b.canonical) diff('canonical', 'present', 'missing')
  if (!b.ogTitle) diff('og:title', 'present', 'missing')
  if (!b.ogImage) diff('og:image', 'present', 'missing')
  if (!b.jsonLd) diff('json-ld', 'present', 'missing')
  return out
}

/** Whether a planned entry covers a path and a field. */
export function plannedCovers(p: Planned, path: string, field: Field): boolean {
  if (p.field !== field) return false
  return p.url.endsWith('*') ? path.startsWith(p.url.slice(0, -1)) : p.url === path
}

/** The apex check's default: the apex of the first `www.` origin, which must answer a 301 to that origin. */
export function defaultApex(origins: readonly (string | null | undefined)[]): { url: string; expected: string } | null {
  for (const o of origins) {
    if (!o) continue
    const u = new URL(o)
    if (u.hostname.startsWith('www.'))
      return { url: `${u.protocol}//${u.hostname.slice(4)}/`, expected: `${u.protocol}//${u.hostname}/` }
  }
  return null
}

/** Compares every target; the report's urls keep the targets' order. */
export async function compareLive(opts: CompareOptions): Promise<Report> {
  if (!opts.live && !opts.baseline) throw new Error('--live or --baseline is required')
  const limit = pLimit(opts.concurrency ?? MAX_REQUESTS)
  const candidate = originOf(opts.candidate)
  const live = opts.live ? originOf(opts.live) : null
  const base = opts.baseline ? new Map(opts.baseline.report.urls.map((u) => [u.path, u])) : null
  const planned = opts.planned ?? []
  const used = new Set<Planned>()
  const ask = (origin: string, path: string): Promise<Answer> =>
    limit(() => request(`${origin}${path}`, origin, { fetch: opts.fetch, timeoutMs: opts.timeoutMs }))

  const apexTarget = opts.apex === undefined ? defaultApex([live, opts.baseline?.report.live, candidate]) : opts.apex
  const apexP = apexTarget
    ? limit(() => request(apexTarget.url, originOf(apexTarget.url), { fetch: opts.fetch, timeoutMs: opts.timeoutMs }))
    : null

  const urls = await Promise.all(
    opts.targets.map(async (t): Promise<UrlResult> => {
      const isDocs = kindOf(t, null) === 'docs'
      const [ref, cand] = await Promise.all([
        // a docs URL is judged on the candidate alone; the baseline has no request to make
        live && !isDocs ? ask(live, t.path) : Promise.resolve(base?.get(t.path)?.candidate ?? null),
        ask(candidate, t.path),
      ])
      const kind = base?.get(t.path)?.kind ?? kindOf(t, ref)
      const failures: Difference[] = []
      const plannedHit: Difference[] = []
      for (const d of differences(t, kind, ref, cand)) {
        const p = planned.find((x) => plannedCovers(x, t.path, d.field))
        if (p) {
          used.add(p)
          plannedHit.push(d)
        } else failures.push(d)
      }
      if (base && !base.has(t.path) && !isDocs)
        failures.push({ field: 'request', reference: 'in the baseline', candidate: 'not in the baseline' })
      return {
        path: t.path,
        kind,
        result: failures.length === 0 ? 'pass' : 'fail',
        failures,
        planned: plannedHit,
        reference: ref,
        candidate: cand,
      }
    }),
  )

  let apex: ApexResult | null = null
  if (apexTarget && apexP) {
    const a = await apexP
    const location = a.location === null ? null : new URL(a.location, apexTarget.url).href
    apex = {
      url: apexTarget.url,
      expected: apexTarget.expected,
      status: a.status,
      location,
      result: a.status === 301 && location === apexTarget.expected ? 'pass' : 'fail',
      ...(a.error ? { error: a.error } : {}),
    }
  }
  const failed = urls.filter((u) => u.result === 'fail').length
  return {
    version: 1,
    live: live ?? opts.baseline?.report.live ?? null,
    baseline: opts.baseline?.file ?? null,
    candidate,
    apex,
    summary: {
      urls: urls.length,
      passed: urls.length - failed,
      failed,
      planned: urls.reduce((n, u) => n + u.planned.length, 0),
    },
    unusedPlanned: planned.filter((p) => !used.has(p)),
    urls,
  }
}

/** Whether the run passes: no URL failed and the apex check, when made, passed. */
export function reportPasses(r: Report): boolean {
  return r.summary.failed === 0 && (r.apex === null || r.apex.result === 'pass')
}

/** The JSON report: reference word lists left out (a later --baseline reads the candidate's). */
export function reportJson(r: Report): string {
  const slim = {
    ...r,
    urls: r.urls.map((u) => ({
      ...u,
      reference: u.reference?.page ? { ...u.reference, page: { ...u.reference.page, words: [] } } : u.reference,
    })),
  }
  return `${JSON.stringify(slim, null, 1)}\n`
}

const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 160)

/** Counts per kind: URLs, passed, failed. */
export function countsByKind(r: Report): { kind: Kind; urls: number; passed: number; failed: number }[] {
  return KINDS.map((kind) => {
    const of = r.urls.filter((u) => u.kind === kind)
    const failed = of.filter((u) => u.result === 'fail').length
    return { kind, urls: of.length, passed: of.length - failed, failed }
  }).filter((k) => k.urls > 0)
}

/** The Markdown report: summary, counts per kind, the apex check, failures with their fields, then every URL. */
export function reportMarkdown(r: Report): string {
  const lines: string[] = ['# compare-live', '']
  lines.push(`- Reference: ${r.baseline ? `baseline ${r.baseline} (of ${show(r.live)})` : show(r.live)}.`)
  lines.push(`- Candidate: ${r.candidate}.`)
  lines.push(
    `- URLs: ${r.summary.urls}, passed ${r.summary.passed}, failed ${r.summary.failed}. Planned differences: ${r.summary.planned}.`,
  )
  if (r.apex)
    lines.push(
      `- Apex: ${r.apex.url} answers ${r.apex.status} ${show(r.apex.location)}; expected 301 ${r.apex.expected}: ${r.apex.result}.`,
    )
  else lines.push('- Apex: not checked (no www. origin).')
  lines.push('', '## By kind', '', '| Kind | URLs | Passed | Failed |', '| --- | --- | --- | --- |')
  for (const k of countsByKind(r)) lines.push(`| ${KIND_LABELS[k.kind]} | ${k.urls} | ${k.passed} | ${k.failed} |`)
  const failures = r.urls.filter((u) => u.result === 'fail')
  if (failures.length > 0) {
    lines.push(
      '',
      '## Failures',
      '',
      '| URL | Kind | Field | Reference | Candidate |',
      '| --- | --- | --- | --- | --- |',
    )
    for (const u of failures)
      for (const d of u.failures)
        lines.push(
          `| ${cell(u.path)} | ${KIND_LABELS[u.kind]} | ${d.field} | ${cell(d.reference)} | ${cell(d.candidate)} |`,
        )
  }
  if (r.unusedPlanned.length > 0) {
    lines.push('', '## Planned differences not seen', '')
    for (const p of r.unusedPlanned) lines.push(`- ${p.url} ${p.field}${p.note ? `: ${p.note}` : ''}`)
  }
  lines.push('', '## Every URL', '', '| URL | Kind | Result | Fields |', '| --- | --- | --- | --- |')
  for (const u of r.urls)
    lines.push(
      `| ${cell(u.path)} | ${KIND_LABELS[u.kind]} | ${u.result} | ${[...u.failures.map((d) => d.field), ...u.planned.map((d) => `${d.field} (planned)`)].join(', ')} |`,
    )
  return `${lines.join('\n')}\n`
}
