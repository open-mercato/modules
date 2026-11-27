// One import run: read the export, build every entry, load the media, then plan the output against the ownership
// manifest and write it (or, with --check, only compare). Deterministic: the same export, media cache and docs
// sitemap give byte-identical files; nothing of the run's time or machine is written.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import pLimit from 'p-limit'
import { parse as parseYaml } from 'yaml'
import {
  redirectSchema,
  RESERVED_SEGMENTS,
  SLUG_RE,
  WWW_COLLECTIONS,
  WWW_SOURCES,
  wwwSchemas,
  type WwwCollection,
} from '../schema/www-content.ts'
import { collectionEntries, WEBFLOW_COLLECTIONS } from './collections.ts'
import { emptyReport, guard, ItemText, type Entry, type Report, type RunCtx } from './context.ts'
import { buildDocsMap, DOCS_SITEMAP_URL, REDIRECTS_HEADER, sitemapPaths, type DocsMap } from './docs-map.ts'
import { readExport, type WebflowExport, type WfPage } from './export.ts'
import { align, chromeOf, contentLines, isLandingDom, landingEntry, parseLanding } from './landing.ts'
import { knownMedia, loadMedia, MAX_TOTAL_BYTES, MediaError, MediaRegistry } from './media.ts'
import {
  applyPlan,
  format,
  markdownFile,
  planOutput,
  readManifest,
  toYaml,
  utf8,
  type ManifestEntry,
  type OutFile,
  type Plan,
} from './output.ts'
import { pageEntry, pageSkipReason, pageSlug } from './pages.ts'

export interface ImportOptions {
  /** The export directory (webflow-raw/, strony/). */
  exportDir: string
  /** The directory that holds www/ (the repository root by default). */
  target: string
  /** The repository root, for the Prettier config. */
  repoRoot: string
  mediaCache: string
  offline: boolean
  only?: ReadonlySet<WwwCollection>
  check: boolean
  /** Paths (under target) a conflict may overwrite. */
  force: ReadonlySet<string>
  /** A docs sitemap file to use instead of the cache or the network. */
  docsSitemap?: string
  fetch?: typeof fetch
}

export interface ImportResult {
  report: Report
  plan?: Plan
  media: { files: number; bytes: number; errors: string[] }
  docs?: DocsMap
  /** The output would change (--check) or changed. */
  differs: boolean
  exitCode: 0 | 1 | 2
  /** A reason the run could not start or finish, when exitCode is 2. */
  fatal?: string
}

export class ImportEnvError extends Error {}

/** Where the rich-text embeds of the bodies go, one HTML file each (www/src/lib/body-html.ts puts them in place). */
export const EMBEDS_DIR = 'www/content/embeds'

/** The docs sitemap: a given file, else the copy in the media cache, else (online) the network, then cached. */
async function docsSitemap(opts: ImportOptions): Promise<string> {
  if (opts.docsSitemap) return readFileSync(opts.docsSitemap, 'utf8')
  const cached = join(opts.mediaCache, 'docs-sitemap.xml')
  if (existsSync(cached)) return readFileSync(cached, 'utf8')
  if (opts.offline)
    throw new ImportEnvError(`no docs sitemap: pass --docs-sitemap <file> or run online once (${cached})`)
  const res = await (opts.fetch ?? fetch)(DOCS_SITEMAP_URL)
  if (!res.ok) throw new ImportEnvError(`${DOCS_SITEMAP_URL}: HTTP ${res.status}`)
  const xml = await res.text()
  mkdirSync(opts.mediaCache, { recursive: true })
  writeFileSync(cached, xml)
  return xml
}

const wants = (opts: ImportOptions, c: WwwCollection) => !opts.only || opts.only.has(c)

/** Static pages with their visible text, and the lines all of them share (navbar, footer). */
function pageTexts(exp: WebflowExport): { chrome: { prefix: number; suffix: number } } {
  // the pages the importer reads: landings and unique pages (a redirect or a list route may lack the navbar)
  const statics = exp.pages.filter((p) => {
    if (p.collectionId || !exp.text.has(pageSlug(p))) return false
    const nodes = exp.dom.get(p.id)
    return nodes !== undefined && (isLandingDom(nodes) || pageSkipReason(p) === undefined)
  })
  return { chrome: chromeOf(statics.map((p) => exp.text.get(pageSlug(p))!)) }
}

export async function runImport(opts: ImportOptions): Promise<ImportResult> {
  const exp = readExport(opts.exportDir)
  const report = emptyReport()
  const media = new MediaRegistry(knownMedia(readManifest(opts.target).files))
  let docs: DocsMap | undefined
  const docsItems = exp.collections.get('docs')?.items ?? []
  if (docsItems.length > 0) docs = buildDocsMap(docsItems, sitemapPaths(await docsSitemap(opts)))
  const ctx: RunCtx = {
    exp,
    media,
    docs: docs?.targets ?? new Map(),
    report,
    schemas: wwwSchemas(),
    matrixTitles: new Set(),
  }

  const entries: Entry[] = []
  // pages and landings first: their media keep the folder of the first use either way, but a page is the natural home
  const { chrome } = pageTexts(exp)
  const landings: { entry: Entry; competitor?: string }[] = []
  if (wants(opts, 'landings')) collectMatrixTitles(ctx, chrome)
  for (const page of exp.pages) {
    const slug = pageSlug(page)
    const nodes = exp.dom.get(page.id)
    if (page.collectionId) continue
    if (!nodes) {
      if (!pageSkipReason(page))
        report.notes.push({ item: `pages/${slug}`, note: 'no DOM in the export, not imported' })
      continue
    }
    const lines = exp.text.get(slug)
    if (isLandingDom(nodes)) {
      if (!wants(opts, 'landings')) continue
      const name = `landings/${slug}`
      const skip = landingSkipReason(page, slug)
      if (skip) {
        report.notes.push({ item: name, note: `not imported: ${skip}` })
        continue
      }
      if (!lines) {
        report.stopped.push({ item: name, why: `no strony/${slug}.txt to cross-check the text with` })
        continue
      }
      const r = guard(ctx, name, () => landingEntry(ctx, page, slug, nodes, contentLines(lines, chrome)))
      if (r) landings.push(r)
      continue
    }
    if (!wants(opts, 'pages')) continue
    const skip = pageSkipReason(page)
    if (skip) {
      report.notes.push({ item: `pages/${slug}`, note: `not imported: ${skip}` })
      continue
    }
    const e = guard(ctx, `pages/${slug}`, () =>
      pageEntry(ctx, page, nodes, lines ? contentLines(lines, chrome) : undefined),
    )
    if (e) entries.push(e)
  }
  // hreflang: a landing in another locale names the English landing about the same competitor
  for (const l of landings) {
    if (l.entry.data.locale === 'en' || l.competitor === undefined) continue
    const en = landings.find((o) => o.entry.data.locale === 'en' && o.competitor === l.competitor)
    if (en) {
      const { webflowId, locale, kind, competitor, ...rest } = l.entry.data
      l.entry.data = { webflowId, locale, kind, competitor, alternateOf: en.entry.id, ...rest }
    } else report.notes.push({ item: `landings/${l.entry.id}`, note: 'no English landing about the same competitor' })
  }
  entries.push(...landings.map((l) => l.entry))

  entries.push(...collectionEntries(ctx, opts.only))

  if (docs && wants(opts, 'redirects')) {
    entries.push({
      collection: 'redirects',
      id: 'redirects',
      webflowId: exp.collections.get('docs')!.schema.id,
      draft: false,
      data: {},
    })
    for (const s of docs.unmatched)
      report.notes.push({
        item: `redirects/docs/${s}`,
        note: 'no docs.openmercato.com page matches; sent to the docs home',
      })
  }

  seoNotes(entries, report)
  for (const e of entries) {
    const c = report.counts.get(e.collection) ?? { entries: 0, drafts: 0 }
    c.entries += e.collection === 'redirects' ? (docs?.rules.length ?? 0) : 1
    if (e.draft) c.drafts++
    report.counts.set(e.collection, c)
  }

  // media: a file that fails stops the items that use it (a re-run resumes from the cache)
  const limit = pLimit(4)
  const failed: { message: string; users: Set<string> }[] = []
  const loaded = await Promise.all(
    media.list().map((f) =>
      limit(async () => {
        try {
          return {
            f,
            bytes: await loadMedia(f, { cacheDir: opts.mediaCache, offline: opts.offline, fetch: opts.fetch }),
          }
        } catch (err) {
          if (err instanceof MediaError) {
            failed.push({ message: err.message, users: err.file.users })
            return undefined
          }
          throw err
        }
      }),
    ),
  )
  const stoppedItems = new Set<string>()
  for (const f of failed.sort((a, b) => (a.message < b.message ? -1 : 1))) {
    for (const u of [...f.users].sort()) {
      stoppedItems.add(u)
      report.stopped.push({ item: u, why: `media ${f.message}` })
    }
  }
  // an item stopped for any reason (converter, schema, media) writes no media of its own
  for (const st of report.stopped) stoppedItems.add(st.item)
  const kept = entries.filter((e) => !stoppedItems.has(`${e.collection}/${e.id}`))
  for (const e of entries) {
    if (kept.includes(e)) continue
    const c = report.counts.get(e.collection)!
    c.entries--
    if (e.draft) c.drafts--
  }
  let bytes = 0
  const files: OutFile[] = []
  for (const l of loaded) {
    if (!l || [...l.f.users].every((u) => stoppedItems.has(u))) continue
    bytes += l.bytes.byteLength
    files.push({ path: `www/public${l.f.path}`, bytes: l.bytes, webflowId: l.f.fileId })
  }
  const mediaResult = { files: files.length, bytes, errors: failed.map((f) => f.message).sort() }
  if (bytes > MAX_TOTAL_BYTES) {
    return {
      report,
      media: mediaResult,
      docs,
      differs: true,
      exitCode: 2,
      fatal: `media total ${bytes} bytes is above the 150 MB cap (A8)`,
    }
  }

  files.push(...(await serialize(kept, exp, docs, opts.repoRoot, opts.target, report)))
  const ownedDirs = ownedPrefixes(opts.only)
  const owned = (e: ManifestEntry) => ownedDirs === undefined || ownedDirs.some((p) => e.path.startsWith(p))
  const plan = await planOutput(opts.target, opts.repoRoot, files, owned, opts.force)
  const differs = plan.manifestChanged || plan.actions.some((a) => a.kind !== 'unchanged')
  if (!opts.check) applyPlan(opts.target, plan)
  const problems = report.stopped.length > 0 || plan.actions.some((a) => a.kind === 'conflict')
  // --check also fails on stopped items: a stopped item is missing from the output, not a difference of it
  const exitCode = (opts.check ? differs || report.stopped.length > 0 : problems) ? 1 : 0
  return { report, plan, media: mediaResult, docs, differs, exitCode }
}

function landingSkipReason(page: WfPage, slug: string): string | undefined {
  if (page.archived) return 'archived in Webflow'
  if (page.draft) return 'a draft page in Webflow'
  if (!SLUG_RE.test(slug)) return `the slug "${slug}" is not a slug`
  if ((RESERVED_SEGMENTS as readonly string[]).includes(slug)) return `/${slug} is a reserved route`
  return undefined
}

/**
 * The group titles of every landing's capability matrix, read where the matrix shows them without doubt, so that
 * parseMatrix can tell a new group from a row's note (a dry run: nothing is registered or reported).
 */
function collectMatrixTitles(ctx: RunCtx, chrome: { prefix: number; suffix: number }): void {
  const dry: RunCtx = { ...ctx, media: new MediaRegistry(), report: emptyReport(), matrixTitles: new Set() }
  for (const page of ctx.exp.pages) {
    const slug = pageSlug(page)
    const nodes = ctx.exp.dom.get(page.id)
    const lines = ctx.exp.text.get(slug)
    if (page.collectionId || !nodes || !lines || !isLandingDom(nodes) || landingSkipReason(page, slug)) continue
    try {
      const l = parseLanding(
        align(nodes, contentLines(lines, chrome)),
        new ItemText(dry, slug, 'landings', false),
        slug,
      )
      for (const g of l.capabilities?.matrix.groups ?? []) ctx.matrixTitles.add(g.title)
    } catch {
      // the real pass reports why this landing stops
    }
  }
}

/** SEO notes (spec Data Model, Seo): titles over 70 and descriptions outside 50..170 characters, reported only. */
function seoNotes(entries: readonly Entry[], report: Report): void {
  for (const e of entries) {
    const seo = e.data.seo as { title?: string; description?: string } | undefined
    if (!seo) continue
    const item = `${e.collection}/${e.id}`
    if (seo.title && seo.title.length > 70)
      report.notes.push({ item, note: `SEO title of ${seo.title.length} characters (over 70)` })
    const d = seo.description?.length ?? 0
    if (seo.description && (d < 50 || d > 170))
      report.notes.push({ item, note: `SEO description of ${d} characters (outside 50..170)` })
  }
}

/** Path prefixes of the manifest entries a run with --only owns; undefined for a full run. */
function ownedPrefixes(only: ReadonlySet<WwwCollection> | undefined): string[] | undefined {
  if (!only) return undefined
  const out: string[] = []
  for (const c of only) {
    const s = WWW_SOURCES[c]
    out.push(s.kind === 'entries' ? `www/content/${s.dir}/` : `www/content/${s.file}`)
  }
  // the embeds are the blog's: only the blog writes them
  if (only.has('blog')) out.push(`${EMBEDS_DIR}/`)
  // media are not owned by --only: a folder is shared (blog-categories and blog), so a partial run carries every media
  // entry it does not write and never reports one as gone
  return out
}

/** The rules of redirects.yaml whose source is not the docs map, as the file holds them. */
function otherRedirects(file: string, report: Report): unknown[] {
  if (!existsSync(file)) return []
  const data = parseYaml(readFileSync(file, 'utf8')) as unknown
  if (!Array.isArray(data)) {
    report.notes.push({ item: 'redirects', note: 'redirects.yaml is not a list; its other rules are not kept' })
    return []
  }
  const schema = redirectSchema()
  return data.filter((r) => {
    if ((r as { source?: unknown })?.source === 'docs-map') return false
    if (!schema.safeParse(r).success)
      report.notes.push({
        item: 'redirects',
        note: `a rule of another source does not validate: ${JSON.stringify(r).slice(0, 120)}`,
      })
    return true
  })
}

async function serialize(
  entries: readonly Entry[],
  exp: WebflowExport,
  docs: DocsMap | undefined,
  repoRoot: string,
  target: string,
  report: Report,
): Promise<OutFile[]> {
  const out: OutFile[] = []
  const grouped = new Map<WwwCollection, Entry[]>()
  for (const e of entries) grouped.set(e.collection, [...(grouped.get(e.collection) ?? []), e])
  for (const collection of WWW_COLLECTIONS) {
    const list = grouped.get(collection)
    if (!list) continue
    const source = WWW_SOURCES[collection]
    if (source.kind === 'entries') {
      for (const e of list) {
        const path = `www/content/${source.dir}/${e.id}.${source.ext}`
        const text = source.ext === 'md' ? markdownFile(e.data, e.body ?? '') : toYaml(e.data)
        out.push({ path, webflowId: e.webflowId, bytes: utf8(await format(text, path, repoRoot)) })
        for (const em of e.embeds ?? []) {
          const file = `${EMBEDS_DIR}/${em.name}.html`
          out.push({ path: file, webflowId: e.webflowId, bytes: utf8(await format(`${em.html}\n`, file, repoRoot)) })
        }
      }
      continue
    }
    const path = `www/content/${source.file}`
    let value: unknown
    let webflowId: string
    let merged = false
    if (collection === 'redirects') {
      // the importer owns the docs-map rules only: rules of other sources (the Webflow panel list of D8, manual ones)
      // stay, first, so they match before the docs catch-all
      const others = otherRedirects(join(target, path), report)
      value = [...others, ...(docs?.rules ?? [])]
      merged = others.length > 0
      webflowId = list[0]!.webflowId
    } else {
      value = Object.fromEntries(list.map((e) => [e.id, e.data]))
      const wf = Object.entries(WEBFLOW_COLLECTIONS).find(([, v]) => v.collection === collection)?.[0]
      webflowId = (wf ? exp.collections.get(wf)?.schema.id : undefined) ?? collection
    }
    const text = collection === 'redirects' ? `${REDIRECTS_HEADER}${toYaml(value)}` : toYaml(value)
    out.push({ path, webflowId, merged, bytes: utf8(await format(text, path, repoRoot)) })
  }
  return out
}
