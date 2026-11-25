import { rmSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import webflowExport from '../../lib/commands/webflow-export.ts'
import { exportSite, visibleText, WebflowApiError } from '../../lib/import-webflow/webflow-api.ts'
import { readExport } from '../../lib/import-webflow/export.ts'
import { ROOT, tempDir, tree } from './helpers.ts'

const TOKEN = 'wf-test-token-0123456789abcdef'
const SITE = '69a97e33d587824eef365d83'

/** A fake Webflow API and public site; records every request with its Authorization header. */
function fakeWebflow(overrides: Record<string, () => Response> = {}) {
  const calls: { url: string; auth: string | null }[] = []
  const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } })
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const auth = new Headers(init?.headers).get('authorization')
    calls.push({ url, auth })
    const u = new URL(url)
    for (const [k, make] of Object.entries(overrides)) if (url.includes(k)) return make()
    const offset = Number(u.searchParams.get('offset') ?? 0)
    switch (u.pathname) {
      case `/v2/sites/${SITE}/collections`:
        return json({ collections: [{ id: 'c1', slug: 'blog-posts' }] })
      case '/v2/collections/c1':
        return json({ id: 'c1', slug: 'blog-posts', fields: [] })
      case '/v2/collections/c1/items':
        // 150 items over two pages
        return json({
          items: Array.from({ length: offset === 0 ? 100 : 50 }, (_, i) => ({ id: `i${offset + i}`, fieldData: {} })),
          pagination: { limit: 100, offset, total: 150 },
        })
      case `/v2/sites/${SITE}/pages`:
        return json({
          pages: [
            {
              id: 'p1',
              slug: null,
              title: 'Home',
              collectionId: null,
              draft: false,
              archived: false,
              publishedPath: '/',
            },
            {
              id: 'p2',
              slug: 'detail_blog',
              title: 'Post',
              collectionId: 'c1',
              draft: false,
              archived: false,
              publishedPath: '/blog-posts',
            },
          ],
          pagination: { total: 2 },
        })
      case '/v2/pages/p1/dom':
      case '/v2/pages/p2/dom':
        return json({
          pageId: u.pathname.split('/')[3],
          nodes: [{ id: 'n', type: 'text', text: { html: '<p>Hi</p>' } }],
          pagination: { total: 1 },
        })
      case `/v2/sites/${SITE}/assets`:
        return json({ assets: [{ id: 'a1', hostedUrl: 'https://cdn/x.png' }], pagination: { total: 1 } })
      case '/sitemap.xml':
        return new Response('<urlset/>')
      case '/':
        return new Response(
          '<html><head><title>T</title></head><body><h1>Home</h1><p>Hello <b>you</b></p><script>x</script></body></html>',
        )
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch
  return { fetch: f, calls }
}

describe('yarn om webflow-export (spec API Contracts)', () => {
  let dir: string
  beforeEach(() => {
    dir = tempDir('export')
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes an export the importer reads, paging through every list, with the token only in the header', async () => {
    const api = fakeWebflow()
    const r = await exportSite({ token: TOKEN, siteId: SITE, dir, text: true, fetch: api.fetch, sleep: async () => {} })
    expect(r).toEqual({ collections: 1, items: 150, pages: 2, assets: 1 })
    const exp = readExport(dir)
    expect(exp.collections.get('blog-posts')!.items).toHaveLength(150)
    expect(exp.pages).toHaveLength(2)
    expect(exp.dom.get('p1')).toHaveLength(1)
    expect(exp.text.get('home')).toEqual(['Home', 'Hello', 'you'])
    for (const c of api.calls) {
      expect(c.url).not.toContain(TOKEN)
      if (c.url.startsWith('https://api.webflow.com/')) expect(c.auth).toBe(`Bearer ${TOKEN}`)
      else expect(c.auth).toBeNull()
    }
    for (const bytes of tree(dir).values()) expect(bytes.toString('utf8')).not.toContain(TOKEN)
  })

  it('retries a rate limit and names the failing path, never the token', async () => {
    let n = 0
    const api = fakeWebflow({
      '/collections/c1/items': () =>
        ++n === 1
          ? new Response('slow down', { status: 429, headers: { 'retry-after': '1' } })
          : new Response('{"message":"nope"}', { status: 403 }),
    })
    const err = await exportSite({
      token: TOKEN,
      siteId: SITE,
      dir,
      text: false,
      fetch: api.fetch,
      sleep: async () => {},
    }).catch((e) => e)
    expect(err).toBeInstanceOf(WebflowApiError)
    expect(err.message).toMatch(/^GET \/collections\/c1\/items\?offset=0&limit=100: HTTP 403/)
    expect(err.message).not.toContain(TOKEN)
    expect(n).toBe(2)
  })

  it('refuses to run without the token, in CI, or offline, and never prints the token', async () => {
    const errors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((m: string) => void errors.push(m))
    const ctx = (args: string[], offline = false) => ({
      args,
      root: ROOT,
      flags: { data: '.data', out: 'out', offline, json: false },
    })
    const env = { ...process.env }
    try {
      delete process.env.WEBFLOW_TOKEN
      delete process.env.CI
      expect(await webflowExport(ctx(['--dir', dir]))).toBe(2)
      expect(errors.pop()).toBe('webflow-export: WEBFLOW_TOKEN is not set')
      process.env.WEBFLOW_TOKEN = TOKEN
      process.env.CI = 'true'
      expect(await webflowExport(ctx(['--dir', dir]))).toBe(2)
      expect(errors.pop()).toMatch(/refused in CI/)
      delete process.env.CI
      expect(await webflowExport(ctx(['--dir', dir], true))).toBe(2)
      expect(await webflowExport(ctx([]))).toBe(2)
      expect(await webflowExport(ctx(['--dir', dir, '--site', 'nope']))).toBe(2)
      for (const e of errors) expect(e).not.toContain(TOKEN)
    } finally {
      process.env = env
      spy.mockRestore()
    }
  })

  it('reads the visible text of a page as one text node per line', () => {
    expect(
      visibleText('<html><body><nav><a>Docs</a><span>1,914</span></nav><p>Hi <em>there</em></p></body></html>'),
    ).toBe('Docs\n1,914\nHi\nthere')
  })
})
