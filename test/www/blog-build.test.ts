// The built blog (www site migration spec, Phase 3), read from dist-www/ after `yarn build:www`: every published post
// routes with its canonical, og tags and JSON-LD, no draft is routed, listed, linked or in the sitemap, and a body's
// video loads nothing from YouTube before a click. Runs only with WWW_BUILD=1, right after `yarn build:www` (validate.yml
// does so), so a stale local dist-www/ never fails `yarn test`; with the flag a missing build is a failure.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { publishedPosts, postPath } from '../../www/src/lib/blog.ts'
import { ROOT } from '../emit/helpers.ts'
import { blogEntries } from './blog-content.ts'

const DIST = join(ROOT, 'dist-www')
const ORIGIN = 'https://www.openmercato.com'
const required = process.env.WWW_BUILD === '1'
const built = required && existsSync(join(DIST, 'blog.html'))

const entries = blogEntries()
const published = publishedPosts(entries).map((p) => p.id)
const drafts = entries.filter((e) => e.data.draft).map((e) => e.id)
const read = (...p: string[]): string => readFileSync(join(DIST, ...p), 'utf8')

function htmlFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...htmlFiles(join(dir, e.name)))
    else if (e.name.endsWith('.html')) out.push(join(dir, e.name))
  }
  return out
}

/** The JSON-LD of a page, parsed. */
function jsonLd(html: string): { '@graph': Record<string, unknown>[] } {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)
  if (!m) throw new Error('no JSON-LD')
  return JSON.parse(m[1]!) as { '@graph': Record<string, unknown>[] }
}

const meta = (html: string, property: string): string | undefined =>
  new RegExp(`<meta property="${property}" content="([^"]*)"`).exec(html)?.[1]

describe('the build of the blog', () => {
  it('exists when the test is required', () => {
    if (required)
      expect(existsSync(join(DIST, 'blog.html')), 'dist-www/blog.html (run yarn build:www first)').toBe(true)
  })

  describe.skipIf(!built)('dist-www', () => {
    it('routes every published post and no draft', () => {
      const pages = readdirSync(join(DIST, 'blog-posts'))
        .filter((f) => f.endsWith('.html'))
        .map((f) => f.slice(0, -5))
        .sort()
      expect(pages).toEqual([...published].sort())
      for (const d of drafts) expect(existsSync(join(DIST, 'blog-posts', `${d}.html`)), d).toBe(false)
    })

    it('puts every published post in the sitemap and no draft', () => {
      const locs = [...read('sitemap-0.xml').matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]!)
      for (const p of published) expect(locs, p).toContain(`${ORIGIN}${postPath(p)}`)
      expect(locs).toContain(`${ORIGIN}/blog`)
      for (const d of drafts)
        expect(
          locs.some((l) => l.endsWith(`/${d}`)),
          d,
        ).toBe(false)
    })

    it('lists every published post on /blog, complete without JavaScript', () => {
      const html = read('blog.html')
      const linked = new Set([...html.matchAll(/href="\/blog-posts\/([^"#?]+)"/g)].map((m) => m[1]!))
      expect([...linked].sort()).toEqual([...published].sort())
      expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/blog">`)
      // the filter's controls wait for JavaScript; the server render lists every post
      expect(html).toMatch(/<div class="category-filter__controls" role="group"[^>]* hidden/)
      expect(html).toContain(`Showing all ${published.length} posts.`)
    })

    it('links no draft from any page', () => {
      const posts = new Set(published)
      for (const f of htmlFiles(DIST))
        for (const m of readFileSync(f, 'utf8').matchAll(
          /href="(?:https:\/\/www\.openmercato\.com)?\/blog-posts\/([^"#?]+)/g,
        ))
          expect(posts.has(m[1]!), `${f}: /blog-posts/${m[1]}`).toBe(true)
    })

    it.each(published)('%s has its canonical, og tags and JSON-LD', (slug) => {
      const html = read('blog-posts', `${slug}.html`)
      const url = `${ORIGIN}${postPath(slug)}`
      expect(html).toContain(`<link rel="canonical" href="${url}">`)
      expect(meta(html, 'og:url')).toBe(url)
      expect(meta(html, 'og:type')).toBe('article')
      expect(meta(html, 'og:title')).toMatch(/ \| Open Mercato$/)
      expect(meta(html, 'og:image')).toMatch(/^https:\/\/www\.openmercato\.com\//)
      expect(meta(html, 'article:published_time')).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      const graph = jsonLd(html)['@graph']
      expect(graph.map((g) => g['@type'])).toEqual(['BlogPosting', 'BreadcrumbList'])
      expect(graph[0]).toMatchObject({ url, mainEntityOfPage: url })
      expect((graph[1]!.itemListElement as { item: string }[]).map((i) => i.item)).toEqual([
        `${ORIGIN}/`,
        `${ORIGIN}/blog`,
        url,
      ])
      // nothing of the importer's video tag is left, and no player loads before a click
      expect(html).not.toContain('<lite-video')
      expect(html).not.toMatch(/<iframe[^>]+youtube/)
    })

    it('a video is a link to YouTube that the page turns into a youtube-nocookie.com player', () => {
      const withVideo = published.filter((p) => read('blog-posts', `${p}.html`).includes('class="video-embed"'))
      expect(withVideo.length).toBeGreaterThan(0)
      for (const p of withVideo)
        expect(read('blog-posts', `${p}.html`)).toMatch(
          /<figure class="video-embed" data-video-id="[A-Za-z0-9_-]{11}"[^>]*><a class="video-embed__link" href="https:\/\/www\.youtube\.com\/watch\?v=/,
        )
    })

    it('a table sits in its own scroll region', () => {
      const withTable = published.filter((p) => read('blog-posts', `${p}.html`).includes('<table'))
      expect(withTable.length).toBeGreaterThan(0)
      for (const p of withTable) {
        const html = read('blog-posts', `${p}.html`)
        expect(html.split('<table').length, p).toBe(html.split('<div class="prose-table"').length)
      }
    })
  })
})
