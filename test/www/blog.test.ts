// The blog of the main site (www site migration spec, Phase 3): which posts route and list, the category filter's
// query string, the SEO of every published post, and what a Markdown body's HTML becomes. On the real content of
// www/content/; the built pages themselves are checked by test/www/blog-build.test.ts.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BLOG_PATH,
  canonicalUrl,
  featuredPosts,
  matchesCategories,
  postCard,
  postJsonLd,
  postPath,
  postSeo,
  publishedPosts,
  readCategories,
  refId,
  relatedPosts,
  toggleCategory,
  writeCategories,
  type PostEntry,
} from '../../www/src/lib/blog.ts'
import {
  bodyHtmlPlugin,
  linkAction,
  liteVideo,
  rawHtml,
  videoEmbedNode,
  videoPlayerSrc,
  type BodyCtx,
  type LinkRules,
} from '../../www/src/lib/body-html.ts'
import { bodyLinkRules, frontmatter, noindexPostPaths, publishedIds, servesFixed } from '../../www/body-links.ts'
import { shownText } from '../../www/src/islands/CategoryFilter.tsx'
import { blogEntries, CONTENT, names } from './blog-content.ts'

const ORIGIN = 'https://www.openmercato.com'
const entries = blogEntries()
const drafts = entries.filter((e) => e.data.draft).map((e) => e.id)
const published = publishedPosts(entries)

const post = (id: string, over: Partial<PostEntry['data']> = {}): PostEntry => ({
  id,
  data: {
    title: id,
    description: `About ${id}.`,
    date: new Date('2026-10-01T00:00:00Z'),
    featured: false,
    draft: false,
    ...over,
  },
})

describe('which posts the blog shows', () => {
  it('the imported content has published posts and drafts', () => {
    expect(published.length).toBeGreaterThan(0)
    expect(drafts.length).toBeGreaterThan(0)
    expect(published.length + drafts.length).toBe(entries.length)
  })

  it('every published post routes, no draft does, newest first', () => {
    expect(published.map((p) => p.id).sort()).toEqual(entries.filter((e) => !e.data.draft).map((e) => e.id))
    for (const d of drafts) expect(published.some((p) => p.id === d)).toBe(false)
    for (let i = 1; i < published.length; i++)
      expect(published[i - 1]!.data.date.getTime()).toBeGreaterThanOrEqual(published[i]!.data.date.getTime())
    // the link rules of the bodies agree with the routes
    expect([...bodyLinkRules(CONTENT).posts].sort()).toEqual(published.map((p) => p.id).sort())
    expect(publishedIds(`${CONTENT}/blog`)).toEqual(published.map((p) => p.id).sort())
  })

  it('featured and related posts are published posts only', () => {
    const all = [post('a', { featured: true }), post('b', { featured: true, draft: true }), post('c')]
    const pub = publishedPosts(all)
    expect(featuredPosts(pub).map((p) => p.id)).toEqual(['a'])
    for (const p of published) {
      for (const r of relatedPosts(p, published)) {
        expect(r.id).not.toBe(p.id)
        expect(drafts).not.toContain(r.id)
      }
    }
  })

  it('related posts take the same category first, then the newest', () => {
    const all = publishedPosts([
      post('x', { category: 'arch' }),
      post('new', { date: new Date('2026-11-01T00:00:00Z') }),
      post('same', { category: 'arch', date: new Date('2026-01-01T00:00:00Z') }),
      post('old', { date: new Date('2025-01-01T00:00:00Z') }),
    ])
    expect(
      relatedPosts(
        all.find((p) => p.id === 'x')!,
        all,
        2,
      ).map((p) => p.id),
    ).toEqual(['same', 'new'])
    expect(refId({ id: 'arch' })).toBe('arch')
  })

  it('every reference of a published post names an author and a category that exist', () => {
    const authors = names('authors.yaml')
    const categories = names('blog-categories.yaml')
    for (const p of published) {
      const a = refId(p.data.author)
      const c = refId(p.data.category)
      if (a !== undefined) expect(authors.has(a), `${p.id}: author ${a}`).toBe(true)
      if (c !== undefined) expect(categories.has(c), `${p.id}: category ${c}`).toBe(true)
    }
  })
})

describe('the category filter and the query string', () => {
  const known = ['ai-engineering', 'architecture', 'security']

  it('reads the selected categories, known ones only, in their order', () => {
    expect(readCategories('', known)).toEqual([])
    expect(readCategories('?category=security&category=architecture', known)).toEqual(['architecture', 'security'])
    expect(readCategories('?category=nope&category=security&utm_source=x', known)).toEqual(['security'])
  })

  it('writes the selection and keeps other parameters', () => {
    expect(writeCategories('', ['architecture'])).toBe('?category=architecture')
    expect(writeCategories('?utm_source=x&category=security', ['ai-engineering', 'security'])).toBe(
      '?utm_source=x&category=ai-engineering&category=security',
    )
    expect(writeCategories('?category=security', [])).toBe('')
    // what is written reads back the same
    const sel = ['architecture', 'security']
    expect(readCategories(writeCategories('?a=1', sel), known)).toEqual(sel)
  })

  it('toggles a category and matches any selected one', () => {
    expect(toggleCategory([], 'security', known)).toEqual(['security'])
    expect(toggleCategory(['security', 'ai-engineering'], 'security', known)).toEqual(['ai-engineering'])
    expect(matchesCategories(undefined, [])).toBe(true)
    expect(matchesCategories('security', ['architecture', 'security'])).toBe(true)
    expect(matchesCategories('ai-engineering', ['security'])).toBe(false)
    // a post without a category shows only while nothing is selected
    expect(matchesCategories(undefined, ['security'])).toBe(false)
  })

  it('announces the number of posts shown', () => {
    expect(shownText(49, 49)).toBe('Showing all 49 posts.')
    expect(shownText(3, 49)).toBe('Showing 3 of 49 posts.')
  })
})

describe('SEO of every published post', () => {
  const authors = names('authors.yaml')
  const categories = names('blog-categories.yaml')

  it('canonical addresses have no trailing slash and no query, but the home page keeps its /', () => {
    expect(canonicalUrl(ORIGIN, '/blog-posts/x/?a=1#b')).toBe(`${ORIGIN}/blog-posts/x`)
    expect(canonicalUrl(ORIGIN, '/')).toBe(`${ORIGIN}/`)
    expect(canonicalUrl(ORIGIN, BLOG_PATH)).toBe(`${ORIGIN}/blog`)
  })

  it.each(published.map((p) => [p.id, p] as const))('%s', (_id, p) => {
    const seo = postSeo(p, ORIGIN)
    expect(seo.canonical).toBe(`${ORIGIN}${postPath(p.id)}`)
    expect(seo.title).toBe(p.data.seo?.title ?? `${p.data.title} | Open Mercato`)
    expect(seo.description.length).toBeGreaterThan(0)
    const n = {
      author: authors.get(refId(p.data.author) ?? ''),
      category: categories.get(refId(p.data.category) ?? ''),
    }
    const ld = postJsonLd(p, ORIGIN, n) as { '@context': string; '@graph': Record<string, unknown>[] }
    expect(ld['@context']).toBe('https://schema.org')
    const [posting, crumbs] = ld['@graph']
    expect(posting).toMatchObject({
      '@type': 'BlogPosting',
      headline: p.data.title,
      url: seo.canonical,
      mainEntityOfPage: seo.canonical,
      datePublished: p.data.date.toISOString(),
      dateModified: (p.data.updated ?? p.data.date).toISOString(),
    })
    if (n.author) expect(posting!.author).toEqual({ '@type': 'Person', name: n.author })
    else expect(posting!.author).toBeUndefined()
    if (p.data.thumbnail) expect(posting!.image).toBe(`${ORIGIN}${p.data.thumbnail.src}`)
    expect(crumbs).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: `${ORIGIN}/blog` },
        { '@type': 'ListItem', position: 3, name: p.data.title, item: seo.canonical },
      ],
    })
  })

  it('an seo override wins over the post fields', () => {
    const p = post('x', { seo: { title: 'Own title', description: 'Own description.', ogImage: '/media/blog/og.png' } })
    expect(postSeo(p, ORIGIN)).toEqual({
      title: 'Own title',
      description: 'Own description.',
      canonical: `${ORIGIN}/blog-posts/x`,
      ogImage: '/media/blog/og.png',
      noindex: false,
    })
  })

  it('a card leaves out what a post does not have and hides the alt text of a decorative image', () => {
    const maps = { authors: new Map([['a', 'Ann']]), categories: new Map([['c', 'Cat']]) }
    const card = postCard(
      post('x', {
        author: 'a',
        category: 'missing',
        thumbnail: { src: '/media/blog/x.png', alt: '', decorative: true },
      }),
      maps,
    )
    expect(card).toEqual({
      slug: 'x',
      href: '/blog-posts/x',
      title: 'x',
      description: 'About x.',
      date: '2026-10-01T00:00:00.000Z',
      author: 'Ann',
      thumbnail: { src: '/media/blog/x.png', alt: '' },
    })
  })
})

describe('the HTML of a Markdown body', () => {
  const rules: LinkRules = { origin: ORIGIN, posts: new Set(['live-post']), serves: servesFixed }

  it('keeps links to published posts and pages this build serves', () => {
    for (const href of [
      '/blog-posts/live-post',
      '/blog-posts/live-post#x',
      '/',
      '/blog',
      '/media/blog/a.png',
      '/run/modules',
    ])
      expect(linkAction(href, rules), href).toEqual({ kind: 'keep' })
    for (const href of ['https://github.com/x', '#part', 'mailto:a@b.co'])
      expect(linkAction(href, rules), href).toEqual({ kind: 'keep' })
  })

  it('renders a link to a draft or a missing post as text', () => {
    for (const d of [...drafts.slice(0, 3), 'no-such-post'])
      expect(linkAction(`/blog-posts/${d}`, { ...rules, posts: bodyLinkRules(CONTENT).posts }).kind).toBe('text')
  })

  it('points a link to a page still on Webflow at the live site', () => {
    expect(linkAction('/contact', rules)).toEqual({ kind: 'live', href: `${ORIGIN}/contact` })
    expect(linkAction('/case-studies/arvo-configurator?x=1', rules)).toEqual({
      kind: 'live',
      href: `${ORIGIN}/case-studies/arvo-configurator?x=1`,
    })
  })

  it('reads a lite-video tag, and nothing else', () => {
    expect(liteVideo('<lite-video id="0jdlGSlZusI" title="A &quot;b&quot;"></lite-video>')).toEqual({
      id: '0jdlGSlZusI',
      title: 'A "b"',
    })
    expect(liteVideo('<lite-video id="0jdlGSlZusI">')).toEqual({ id: '0jdlGSlZusI' })
    expect(liteVideo('<lite-video id="bad id">')).toBeUndefined()
    expect(liteVideo('<iframe src="x">')).toBeUndefined()
    expect(videoPlayerSrc('0jdlGSlZusI')).toBe('https://www.youtube-nocookie.com/embed/0jdlGSlZusI?autoplay=1')
  })

  it('the plugin rewrites links, warns on draft links, wraps tables and swaps a video paragraph', () => {
    const calls: string[] = []
    const warnings: string[] = []
    const ctx: BodyCtx = {
      replaceNode: (n, m) => calls.push(`replace ${JSON.stringify(n)} -> ${JSON.stringify(m)}`),
      removeNode: (n) => calls.push(`remove ${JSON.stringify(n)}`),
      setProperty: (_n, k, v) => calls.push(`set ${k}=${String(v)}`),
      wrapNode: (_n, p) => calls.push(`wrap ${p.raw}`),
      parent: () => ({ type: 'element', tagName: 'p', properties: {}, children: [open, close] }),
      fileURL: new URL('file:///repo/www/content/blog/x.md'),
    }
    const open = { type: 'raw' as const, value: '<lite-video id="0jdlGSlZusI" title="T">' }
    const close = { type: 'raw' as const, value: '</lite-video>' }
    const plugin = bodyHtmlPlugin(rules, (m) => warnings.push(m))
    const bold = { type: 'element', tagName: 'strong', properties: {}, children: [{ type: 'text', value: 'b' }] }
    const a = (href: string) => ({ type: 'element' as const, tagName: 'a', properties: { href }, children: [bold] })
    plugin.element.visit(a('/contact'), ctx)
    plugin.element.visit(a('/blog-posts/gone'), ctx)
    plugin.element.visit({ type: 'element', tagName: 'table', properties: {}, children: [] }, ctx)
    plugin.raw(open, ctx)
    plugin.raw(close, ctx)
    expect(calls[0]).toBe(`set href=${ORIGIN}/contact`)
    // the link goes, its content (here bold text) stays
    expect(calls[1]).toMatch(new RegExp(`-> ${JSON.stringify([bold]).replace(/[[\]{}]/g, '\\$&')}$`))
    expect(warnings).toEqual([
      'www/content/blog/x.md: /blog-posts/gone is not a published post; the link renders as text',
    ])
    expect(calls[2]).toMatch(/^wrap <div class="prose-table" role="region"/)
    // the paragraph that held the video is replaced by the figure, and its closing tag goes with it
    expect(calls[3]).toBe(
      `replace ${JSON.stringify({ type: 'element', tagName: 'p', properties: {}, children: [open, close] })} -> ${JSON.stringify(videoEmbedNode('0jdlGSlZusI', 'T'))}`,
    )
    expect(calls).toHaveLength(4)
  })

  it('raw HTML follows the same rules for images and links', () => {
    const fig =
      '<figure><img src="/media/blog/a.png" alt="A" /><figcaption>See <a href="/contact">us</a>, ' +
      '<a class="x" href="/blog-posts/gone">a draft</a>, <a href="/blog-posts/live-post">a post</a> and ' +
      '<a href="https://example.com/">a site</a>.</figcaption></figure>'
    expect(rawHtml(fig, rules)).toEqual({
      html:
        '<figure><img loading="lazy" decoding="async" src="/media/blog/a.png" alt="A" /><figcaption>See ' +
        `<a href="${ORIGIN}/contact">us</a>, <a class="x">a draft</a>, <a href="/blog-posts/live-post">a post</a> and ` +
        '<a href="https://example.com/">a site</a>.</figcaption></figure>',
      unlinked: ['/blog-posts/gone is not a published post'],
    })
    // an image that already says how it loads is left alone
    expect(rawHtml('<img loading="eager" src="/media/x.png" alt="">', rules).html).toBe(
      '<img loading="eager" src="/media/x.png" alt="">',
    )
    const warnings: string[] = []
    const replaced: unknown[] = []
    const ctx = {
      replaceNode: (_n: unknown, m: unknown) => replaced.push(m),
      removeNode: () => {},
      setProperty: () => {},
      wrapNode: () => {},
      parent: () => undefined,
      fileURL: undefined,
    }
    bodyHtmlPlugin(rules, (m) => warnings.push(m)).raw({ type: 'raw', value: '<a href="/blog-posts/gone">x</a>' }, ctx)
    expect(replaced).toEqual([{ type: 'raw', value: '<a>x</a>' }])
    expect(warnings).toEqual(['a Markdown body: /blog-posts/gone is not a published post; the link renders as text'])
  })

  it('no imported post asks for noindex; one that does is left out of the sitemap', () => {
    expect([...noindexPostPaths(CONTENT)]).toEqual([])
    const dir = mkdtempSync(join(tmpdir(), 'om-www-noindex-'))
    mkdirSync(join(dir, 'blog'))
    writeFileSync(join(dir, 'blog', 'a.md'), '---\ntitle: A\nseo:\n  noindex: true\n---\n')
    writeFileSync(join(dir, 'blog', 'b.md'), '---\ntitle: B\n---\n')
    writeFileSync(join(dir, 'blog', 'c.md'), '---\ntitle: C\ndraft: true\nseo:\n  noindex: true\n---\n')
    expect([...noindexPostPaths(dir)]).toEqual(['/blog-posts/a'])
    rmSync(dir, { recursive: true, force: true })
  })

  it('reads the frontmatter of a Markdown file', () => {
    expect(frontmatter('---\ntitle: A\ndraft: true\n---\n\nBody')).toEqual({ title: 'A', draft: true })
    expect(frontmatter('No frontmatter')).toEqual({})
  })
})
