// The export from the published site (lib/import-webflow/published.ts, `yarn om webflow-export --from-site`): on
// snapshots of live pages (test/fixtures/webflow/published/), a page of an item the fixture export holds gives back
// that item exactly, and a page Webflow added later becomes a new item the importer writes.
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import webflowExport from '../../lib/commands/webflow-export.ts'
import { readExport, type WfItem } from '../../lib/import-webflow/export.ts'
import { knownMedia, MediaRegistry } from '../../lib/import-webflow/media.ts'
import {
  blogPostItem,
  caseStudyItem,
  cfDecode,
  Dictionary,
  exportFromSite,
  fileIdOf,
  listThumbnails,
  PublishedPageError,
  readBlogPostPage,
  readCaseStudyPage,
  sameRichText,
  shownDate,
  sitemapPaths,
  slugify,
  unprotectEmails,
  youTubeWatch,
  type Dictionaries,
} from '../../lib/import-webflow/published.ts'
import { htmlToMarkdown } from '../../lib/import-webflow/richtext.ts'
import { FIXTURE, importFixture, ROOT, tempDir, tree } from './helpers.ts'

const PUBLISHED = join(FIXTURE, 'published')
const ORIGIN = 'https://www.openmercato.com'
const page = (path: string) => readFileSync(join(PUBLISHED, `${path.slice(1).replace(/\//g, '__')}.html`), 'utf8')
const exp = readExport(FIXTURE)
const items = (slug: string): WfItem[] => exp.collections.get(slug)!.items
const bySlug = (slug: string, s: string) => items(slug).find((i) => i.fieldData.slug === s)!

const dirs: string[] = []
const tmp = (name: string) => {
  const d = tempDir(name)
  dirs.push(d)
  return d
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

function dicts(): Dictionaries {
  const partner = (id: string, name: string, slug: string): WfItem => ({
    id,
    lastPublished: null,
    lastUpdated: null,
    createdOn: null,
    isArchived: false,
    isDraft: false,
    fieldData: { name, slug },
  })
  return {
    caseCategories: new Dictionary(items('case-studies-categories'), 'name'),
    partners: new Dictionary(
      [...items('certified-partners'), partner('6a4e8ff3523627dd6c83b1da', 'Commerce Weavers', 'commerce-weavers')],
      'name',
      false,
    ),
    authors: new Dictionary(items('blog-authors'), 'name'),
    blogCategories: new Dictionary(items('blog-categories'), 'name'),
  }
}

describe('a published page of an item the export holds gives back that item', () => {
  it('a case study: every field, the rich text kept as the API returned it', () => {
    const url = `${ORIGIN}/case-studies/arvo-configurator`
    const p = readCaseStudyPage(page('/case-studies/arvo-configurator'), url)
    expect(p).toMatchObject({
      slug: 'arvo-configurator',
      name: 'Arvo Configurator: from product choices to a validated quote',
      heroVideo: 'https://www.youtube.com/watch?v=2OzOEnM0Gqo',
      deliveredBy: { name: 'thegoodcode', href: 'https://www.openmercato.com/certified-partners/the-good-code' },
      categories: ['ERP', 'Software House'],
    })
    const base = bySlug('case-studies', 'arvo-configurator')
    const thumbnails = listThumbnails(page('/case-studies'))
    const item = caseStudyItem(p, base, dicts(), thumbnails.get('/case-studies/arvo-configurator'), url)
    expect(item).toEqual(base)
  })

  it('a blog post: every field, with the addresses Cloudflare hides decoded', () => {
    const html = page('/blog-posts/wms-module-open-source')
    expect(html).toContain('/cdn-cgi/l/email-protection')
    const p = readBlogPostPage(html, `${ORIGIN}/blog-posts/wms-module-open-source`)
    expect(p).toMatchObject({ author: 'Tomasz Karwatka', category: { name: 'Product Updates' }, date: '2026-08-10' })
    expect(p.content).toContain('mailto:m.kadziolka@gmail.com')
    const base = bySlug('blog-posts', 'wms-module-open-source')
    expect(blogPostItem(p, base, dicts())).toEqual(base)
  })
})

describe('a page Webflow added after the export', () => {
  it('a case study: what the page shows, no Webflow id, the thumbnail from the list without its alt text', () => {
    const path = '/case-studies/fondaco-warehouse-receiving-pallet-counts'
    const p = readCaseStudyPage(page(path), `${ORIGIN}${path}`)
    const d = dicts()
    const thumb = listThumbnails(page('/case-studies')).get(path)
    const item = caseStudyItem(p, undefined, d, thumb, `${ORIGIN}${path}`)
    expect(item.id).toBe('')
    expect(item.fieldData).toMatchObject({
      slug: 'fondaco-warehouse-receiving-pallet-counts',
      name: 'How Fondaco catches a short delivery before it reaches inventory',
      'main-heading': 'Fondaco catches short deliveries at the pallet',
      'delivered-by': '6a4e8ff3523627dd6c83b1da',
      'delivered-by-url': 'https://commerceweavers.com/',
      'overview-client': 'Fondaco warehouse receiving project',
      'stat-1-title': '2 rolls short',
      'featured-on-agencies-page': false,
      'display-order': null,
      thumbnail: {
        fileId: '6b08ba954c4662bd5519d7cb',
        url: expect.stringContaining('fondaco-warehouse-label-printing.webp'),
        alt: null,
      },
    })
    expect(item.fieldData.category).toHaveLength(2)
    expect(String(item.fieldData['case-content'])).toContain('<h2>')
  })

  it('a post with an interactive tool: its category is new, its embed becomes an om-embed tag', () => {
    const path = '/blog-posts/safety-stock-calculator'
    const p = readBlogPostPage(page(path), `${ORIGIN}${path}`)
    expect(p.category).toEqual({ name: 'Tools & Templates', labelColor: '#243f57', textColor: '#f8f8f1' })
    const d = dicts()
    const item = blogPostItem(p, undefined, d)
    expect(item.fieldData.category).toBe('new:tools-templates')
    expect(item.fieldData['publication-date']).toBe(`${p.date}T00:00:00.000Z`)
    expect(d.blogCategories.added).toEqual(['tools-templates'])
    expect(d.blogCategories.items.at(-1)!.fieldData).toEqual({
      name: 'Tools & Templates',
      slug: 'tools-templates',
      'display-order': null,
      'label-color': '#243f57',
      'text-color': '#f8f8f1',
    })
    const kept: string[] = []
    const md = htmlToMarkdown(String(item.fieldData.content), {
      embed: (html) => {
        kept.push(html)
        return 'blog-safety-stock-calculator-1'
      },
    })
    expect(md).toContain('<om-embed name="blog-safety-stock-calculator-1"></om-embed>')
    expect(kept).toHaveLength(1)
    expect(kept[0]).toMatch(/^<section\s+class="om-workbench"[\s\S]*<script>[\s\S]*<\/section>$/)
  })

  it('refuses a partner the export does not hold, and a page that is not a case study', () => {
    const path = '/case-studies/fondaco-warehouse-receiving-pallet-counts'
    const p = readCaseStudyPage(page(path), `${ORIGIN}${path}`)
    const d = { ...dicts(), partners: new Dictionary(items('certified-partners'), 'name', false) }
    expect(() => caseStudyItem(p, undefined, d, undefined, path)).toThrow(/Commerce Weavers/)
    expect(() => readCaseStudyPage(page('/blog-posts/wms-module-open-source'), 'x')).toThrow(PublishedPageError)
  })
})

describe('the small readers', () => {
  it('decodes Cloudflare-protected addresses', () => {
    expect(cfDecode('4f2261242e2b35262023242e0f28222e2623612c2022')).toBe('m.kadziolka@gmail.com')
    expect(
      unprotectEmails(
        '<a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="4f2261242e2b35262023242e0f28222e2623612c2022">[email&#160;protected]</a>',
      ),
    ).toBe('m.kadziolka@gmail.com')
  })

  it('reads dates, slugs, file ids, video addresses and sitemap paths', () => {
    expect(shownDate('August 10, 2026')).toBe('2026-08-10')
    expect(shownDate('10.08.2026')).toBeUndefined()
    expect(slugify('Tools & Templates')).toBe('tools-templates')
    expect(slugify('Łódź Café')).toBe('odz-cafe')
    expect(
      fileIdOf('https://cdn.prod.website-files.com/69a97e33d587824eef365d84/6b08ba954c4662bd5519d7cb_x.webp'),
    ).toBe('6b08ba954c4662bd5519d7cb')
    expect(fileIdOf('https://example.com/x.png')).toBeUndefined()
    expect(
      youTubeWatch('//cdn.embedly.com/widgets/media.html?src=https%3A%2F%2Fwww.youtube.com%2Fembed%2F2OzOEnM0Gqo'),
    ).toBe('https://www.youtube.com/watch?v=2OzOEnM0Gqo')
    expect(
      sitemapPaths(
        `<urlset><url><loc>${ORIGIN}/blog-posts/a</loc></url><url><loc>${ORIGIN}/blog</loc></url><url><loc>${ORIGIN}/blog-posts/</loc></url></urlset>`,
        '/blog-posts/',
      ),
    ).toEqual(['/blog-posts/a'])
  })

  it('takes rich text for the same when the text, images and links are', () => {
    expect(sameRichText('<p>It&#x27;s <a href="/x">here</a></p>', "<p>It's  <a href='/x'>here</a></p>")).toBe(true)
    expect(sameRichText('<p>It is here</p>', '<p>It is there</p>')).toBe(false)
    expect(sameRichText('<img src="/a.png">', '<img src="/b.png">')).toBe(false)
    expect(sameRichText(null, '<p>x</p>')).toBe(false)
  })
})

describe('the media of a later run', () => {
  it('keeps the path an earlier run wrote, and a copy in the user’s folder when there are two', () => {
    const url = 'https://cdn.prod.website-files.com/69a97e33d587824eef365d84/6b04bd1027b47149dc5d05ce_ppwr.jpeg'
    const known = knownMedia([
      { path: 'www/public/media/blog/6b04bd1027b47149dc5d05ce-ppwr.jpeg', webflowId: '6b04bd1027b47149dc5d05ce' },
      {
        path: 'www/public/media/case-studies/6b04bd1027b47149dc5d05ce-ppwr.jpeg',
        webflowId: '6b04bd1027b47149dc5d05ce',
      },
      { path: 'www/content/blog/x.md', webflowId: 'a' },
    ])
    const reg = new MediaRegistry(known)
    expect(reg.use(url, 'blog', 'blog/x')).toBe('/media/blog/6b04bd1027b47149dc5d05ce-ppwr.jpeg')
    expect(reg.use(url, 'case-studies', 'caseStudies/y')).toBe('/media/case-studies/6b04bd1027b47149dc5d05ce-ppwr.jpeg')
    expect(reg.use(url, 'partners', 'partners/z')).toBe('/media/blog/6b04bd1027b47149dc5d05ce-ppwr.jpeg')
    expect(reg.list()).toHaveLength(2)
    const fresh = new MediaRegistry()
    expect(fresh.use(url, 'partners', 'partners/z')).toBe('/media/partners/6b04bd1027b47149dc5d05ce-ppwr.jpeg')
  })
})

/** The live site as the fixture pages: a sitemap of four items and the case study list. */
function fakeSite(): typeof fetch & { calls: string[] } {
  const calls: string[] = []
  const sitemap = [
    '/case-studies/arvo-configurator',
    '/blog-posts/wms-module-open-source',
    '/blog-posts/safety-stock-calculator',
  ]
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    calls.push(`${url.pathname} ${new Headers(init?.headers).get('user-agent')}`)
    if (url.pathname === '/sitemap.xml')
      return new Response(`<urlset>${sitemap.map((p) => `<url><loc>${ORIGIN}${p}</loc></url>`).join('')}</urlset>`)
    if (url.pathname === '/case-studies' || sitemap.includes(url.pathname)) return new Response(page(url.pathname))
    return new Response('not found', { status: 404 })
  }) as typeof fetch & { calls: string[] }
  f.calls = calls
  return f
}

describe('yarn om webflow-export --from-site', () => {
  it('writes an export the importer reads: the base items kept, the new ones added', async () => {
    const dir = join(tmp('from-site'), 'export')
    const site = fakeSite()
    const r = await exportFromSite({ base: FIXTURE, dir, origin: ORIGIN, fetch: site })
    expect(r.counts['blog-posts']).toEqual({ read: 2, added: ['safety-stock-calculator'], unlisted: 2 })
    expect(r.counts['case-studies']).toEqual({ read: 1, added: [], unlisted: 0 })
    expect(r.added).toEqual({ 'blog-categories': ['tools-templates'] })
    expect(site.calls.every((c) => c.endsWith('open-mercato-webflow-export (read-only)'))).toBe(true)
    const out = readExport(dir)
    expect(out.collections.get('case-studies')!.items).toEqual(items('case-studies'))
    const posts = out.collections.get('blog-posts')!.items
    expect(posts.slice(0, 3)).toEqual(items('blog-posts'))
    expect(posts.at(-1)!.fieldData.slug).toBe('safety-stock-calculator')
    // the rest of the base comes along unchanged
    expect(out.pages).toEqual(exp.pages)

    const target = tmp('from-site-target')
    const result = await importFixture({ exportDir: dir, target, mediaCache: tmp('from-site-cache') })
    expect(result.report.stopped).toEqual([])
    const files = tree(target)
    const post = files.get('www/content/blog/safety-stock-calculator.md')!.toString()
    expect(post).not.toContain('webflowId')
    expect(post).toContain('category: tools-templates')
    expect(post).toContain('<om-embed name="blog-safety-stock-calculator-1"></om-embed>')
    expect(files.get('www/content/embeds/blog-safety-stock-calculator-1.html')!.toString()).toContain('om-workbench')
    const manifest = JSON.parse(files.get('www/content/.webflow-import.json')!.toString()) as {
      files: { path: string; webflowId: string }[]
    }
    expect(manifest.files.find((f) => f.path === 'www/content/blog/safety-stock-calculator.md')!.webflowId).toBe(
      'new:safety-stock-calculator',
    )
    expect(files.get('www/content/blog-categories.yaml')!.toString()).toContain(
      'tools-templates:\n  name: Tools & Templates',
    )
  })

  it('refuses a directory that holds files, and offline; never needs the token', async () => {
    const dir = tmp('from-site-full')
    await expect(exportFromSite({ base: FIXTURE, dir: FIXTURE, origin: ORIGIN, fetch: fakeSite() })).rejects.toThrow(
      /already holds files/,
    )
    const ctx = (args: string[], offline = false) => ({
      root: ROOT,
      args,
      flags: { offline, json: false, out: join(dir, 'out') },
    })
    const errors: string[] = []
    const err = console.error
    console.error = (m: string) => errors.push(m)
    try {
      expect(await webflowExport(ctx(['--dir', join(dir, 'x'), '--from-site', FIXTURE], true) as never)).toBe(2)
      expect(await webflowExport(ctx(['--dir', join(dir, 'x'), '--from-site', join(dir, 'nope')]) as never)).toBe(2)
    } finally {
      console.error = err
    }
    expect(errors.join('\n')).toMatch(/--offline has nothing to read/)
    expect(errors.join('\n')).toMatch(/no webflow-raw/)
  })
})
