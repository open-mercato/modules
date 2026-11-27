// Writes test/fixtures/webflow/ from a full Webflow export (the 24 and 25 Nov export, kept outside the repository):
// public content only, the items the importer tests need. Run `node test/fixtures/webflow/trim.ts <export-dir>`, then
// `yarn prettier --write test/fixtures/webflow`. The landing pages' 45 KB animation embed is cut to one line.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))

/** What the fixture keeps. */
export const KEEP = {
  pages: ['baselinker-alternative', 'baselinker-alternatywa', 'contact', 'careers'],
  posts: [
    'coding-agents-benchmark-open-mercato',
    'wms-module-open-source',
    'open-source-erp-odoo-erpnext-open-mercato-comparison',
  ],
  caseStudies: ['arvo-configurator'],
  partners: ['10clouds', 'the-good-code'],
  jobs: ['senior-ai-engineering'],
  docs: ['user-guide-workflows-user-tasks', 'agent-orchestrator-overview', 'cli-overview'],
  /** Dictionaries are kept whole. */
  dictionaries: [
    'blog-authors',
    'blog-categories',
    'case-studies-categories',
    'partners-tiers',
    'partners-industries',
    'partners-services',
    'partners-language',
    'partners-location',
  ],
  /** docs.openmercato.com sitemap paths the fixture's docs sitemap lists. */
  docsPaths: [
    '/user-guide/workflows/user-tasks',
    '/user-guide/workflows/transitions',
    '/cli/overview',
    '/framework/events/overview',
  ],
}

function main(src: string): void {
  const raw = join(src, 'webflow-raw')
  const read = (f: string) => JSON.parse(readFileSync(join(raw, f), 'utf8'))
  const write = (f: string, v: unknown) => {
    mkdirSync(dirname(join(OUT, f)), { recursive: true })
    writeFileSync(join(OUT, f), JSON.stringify(v, null, 2) + '\n')
  }
  for (const d of ['webflow-raw', 'strony']) if (existsSync(join(OUT, d))) rmSync(join(OUT, d), { recursive: true })

  const bySlug = (items: { fieldData: { slug: string } }[], slugs: string[]) =>
    items.filter((i) => slugs.includes(i.fieldData.slug))
  const kept: Record<string, string[]> = {
    'blog-posts': KEEP.posts,
    'case-studies': KEEP.caseStudies,
    'certified-partners': KEEP.partners,
    'careers-jobs': KEEP.jobs,
    docs: KEEP.docs,
  }
  const collections = read('collections.json')
  const keepCols = [...Object.keys(kept), ...KEEP.dictionaries]
  write('webflow-raw/collections.json', {
    collections: collections.collections.filter((c: { slug: string }) => keepCols.includes(c.slug)),
  })
  for (const c of keepCols) {
    write(`webflow-raw/col_${c}.json`, read(`col_${c}.json`))
    const items = read(`items_${c}.json`)
    const list = kept[c] ? bySlug(items, kept[c]) : items
    // the importer reads a docs item's slug and section only; the article copy is docs.openmercato.com's
    if (c === 'docs') for (const i of list) (i.fieldData as Record<string, unknown>)['article-body'] = ''
    write(`webflow-raw/items_${c}.json`, list)
  }

  const pages = read('pages.json') as {
    id: string
    slug: string | null
    openGraph?: { imageAssetId?: string | null }
  }[]
  const keptPages = pages.filter((p) => p.slug !== null && KEEP.pages.includes(p.slug))
  write('webflow-raw/pages.json', keptPages)
  const assetIds = new Set<string>()
  for (const p of keptPages) {
    if (p.openGraph?.imageAssetId) assetIds.add(p.openGraph.imageAssetId)
    const f = readdirSync(join(raw, 'dom')).find((x) => !x.startsWith('._') && x.endsWith(`_${p.id}.json`))
    if (!f) continue
    const dom = JSON.parse(readFileSync(join(raw, 'dom', f), 'utf8'))
    for (const n of dom.nodes) {
      if (n.type === 'image' && n.image?.assetId) assetIds.add(n.image.assetId)
      if (n.type === 'html-embed' && n.html.length > 2000)
        n.html = '<script>/* the landing animation embed, cut from the fixture */</script>'
    }
    write(`webflow-raw/dom/${f}`, dom)
  }
  write(
    'webflow-raw/assets.json',
    (read('assets.json') as { id: string }[]).filter((a) => assetIds.has(a.id)),
  )

  mkdirSync(join(OUT, 'strony'), { recursive: true })
  for (const p of KEEP.pages) {
    const f = join(src, 'strony', `${p}.txt`)
    if (existsSync(f)) cpSync(f, join(OUT, 'strony', `${p}.txt`))
  }
  const crawled = JSON.parse(readFileSync(join(src, 'strony', '_pages.json'), 'utf8')) as { slug: string }[]
  write(
    'strony/_pages.json',
    crawled.filter((p) => KEEP.pages.includes(p.slug)),
  )

  const urls = KEEP.docsPaths.map((p) => `<url><loc>https://docs.openmercato.com${p}</loc></url>`).join('')
  writeFileSync(
    join(OUT, 'docs-sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`,
  )
}

if (import.meta.main) {
  const src = process.argv[2]
  if (!src) {
    console.error('usage: node test/fixtures/webflow/trim.ts <export-dir>')
    process.exitCode = 2
  } else main(src)
}
