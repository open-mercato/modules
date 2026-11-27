// The docs map (spec API Contracts, "Docs map"; D4): each Webflow `docs` item's `/docs/<slug>` maps to the
// docs.openmercato.com path whose sitemap entry matches its section and slug (the Webflow slug is the docs path
// flattened with `-`); unmatched slugs map to the docs home. Plus `/docs`, `/documentation` and the `/docs/*` catch-all,
// written last so the specific rules match first.
import type { WfItem } from './export.ts'

export const DOCS_ORIGIN = 'https://docs.openmercato.com'
export const DOCS_HOME = `${DOCS_ORIGIN}/`
export const DOCS_SITEMAP_URL = `${DOCS_ORIGIN}/sitemap.xml`

/**
 * The comment heading www/content/redirects.yaml. It marks the place of the Webflow 301 list (D8), which nobody can
 * read through the API and which is copied from the Webflow panel at cutover step C4 (docs/RUNBOOK.md, Main site
 * switch): those rules go first, before the docs map, so they match before the docs catch-all.
 */
export const REDIRECTS_HEADER = `# Redirects of the main site (spec 2026-11-24-www-site-migration.md of PR #23, Data Model, redirects).
# yarn om pages-site --merge writes them into the root _redirects in this order; the first matching rule wins.
#
# source: webflow-panel. The 301 list of Webflow (Site settings, Publishing, 301 redirects; decision D8), copied by
# hand at cutover step C4 (docs/RUNBOOK.md, Main site switch). Empty until then. Its rules go right below this
# comment, before the docs map. The importer keeps every rule whose source is not docs-map.
#
# source: docs-map. Written by yarn om import-webflow --only redirects; a re-run replaces these rules only.
`

export interface RedirectRule {
  from: string
  to: string
  status: 301
  source: 'docs-map'
}

/** The paths of a sitemap's `<loc>` entries on the docs host, without a trailing slash, in sitemap order. */
export function sitemapPaths(xml: string): string[] {
  const out: string[] = []
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    let url: URL
    try {
      url = new URL(m[1]!.replace(/&amp;/g, '&'))
    } catch {
      continue
    }
    if (url.origin !== DOCS_ORIGIN) continue
    const path = url.pathname.replace(/\/+$/, '')
    if (path && !out.includes(path)) out.push(path)
  }
  return out
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface DocsMap {
  rules: RedirectRule[]
  /** `/docs/<slug>` to its target, for the link rewrite of rich text. */
  targets: Map<string, string>
  /** Slugs with no sitemap match (sent to the docs home). */
  unmatched: string[]
}

/**
 * Matches each docs item to a sitemap path: the path flattened with `-` equals the slug, or equals the section's slug
 * plus the item slug (the section prefix is sometimes left out of the Webflow slug). Among several matches the one
 * under the section's folder wins.
 */
export function buildDocsMap(items: readonly WfItem[], paths: readonly string[]): DocsMap {
  const byFlat = new Map<string, string[]>()
  for (const p of paths) {
    const flat = p.slice(1).split('/').join('-').toLowerCase()
    byFlat.set(flat, [...(byFlat.get(flat) ?? []), p])
  }
  const rules: RedirectRule[] = []
  const targets = new Map<string, string>()
  const unmatched: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (item.isArchived) continue
    const slug = String(item.fieldData.slug ?? '')
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    const section = slugify(String(item.fieldData.section ?? ''))
    const candidates = [...(byFlat.get(slug) ?? []), ...(section ? (byFlat.get(`${section}-${slug}`) ?? []) : [])]
    const inSection = candidates.find((p) => section && p.split('/')[1] === section)
    const path = inSection ?? candidates[0]
    const to = path ? `${DOCS_ORIGIN}${path}` : DOCS_HOME
    if (!path) unmatched.push(slug)
    const from = `/docs/${slug}`
    rules.push({ from, to, status: 301, source: 'docs-map' })
    targets.set(from, to)
  }
  return {
    rules: [
      { from: '/docs', to: DOCS_HOME, status: 301, source: 'docs-map' },
      { from: '/documentation', to: DOCS_HOME, status: 301, source: 'docs-map' },
      ...rules,
      { from: '/docs/*', to: DOCS_HOME, status: 301, source: 'docs-map' },
    ],
    targets,
    unmatched,
  }
}
