// Internal links and data links (spec 12.2 WP16): every page in the sitemap, every internal href/src in it, and
// every site URL written into the published data files (llms.txt, modules.json and the rest of 4.6) answers 200,
// with no 404 and no redirect (the local server follows the static host's lookup order, so a 301 there is a
// redirect on the host too).
// Absolute URLs on the site's own origin (`site` of modules.json) are checked against the site under test.
import { expect, test, type APIRequestContext } from '@playwright/test'
import { E2E, url } from './env.ts'

/** Published data files whose site URLs must resolve (spec 4.6). */
const DATA_FILES = [
  '/modules.json',
  '/built-in.json',
  '/compat.json',
  '/changes.json',
  '/picker.json',
  '/allowlist.json',
  '/surface.json',
  '/llms.txt',
  '/llms-full.txt',
  '/feed.xml',
  '/robots.txt',
  '/sitemap-index.xml',
]

const ATTR = /\s(?:href|src|action|poster)\s*=\s*"([^"]*)"/g
/** `content` of meta tags only when it is a URL (og:image, og:url); descriptions are not links. */
const CONTENT_URL = /\scontent\s*=\s*"(https?:[^"]*)"/g
const SRCSET = /\ssrcset\s*=\s*"([^"]*)"/g
const decode = (s: string): string =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) await fn(items[i++] as T)
    }),
  )
}

test('internal and data links answer 200 without redirects', async ({ request }) => {
  test.setTimeout(240_000)
  const index = (await (await request.get(url('/modules.json'))).json()) as { site: string }
  // the site's public address (https://modules.openmercato.com) and its path ('' at the domain root)
  const site = index.site.replace(/\/+$/, '')
  const sitePath = new URL(site).pathname.replace(/\/+$/, '')
  const toLocal = (raw: string, from: string): string | null => {
    const v = decode(raw.trim())
    if (v === '' || v.startsWith('#') || /^(mailto|tel|data|javascript|blob):/i.test(v)) return null
    let abs: URL
    try {
      abs = new URL(v, from)
    } catch {
      return null
    }
    const local = new URL(E2E.base)
    let path: string
    if (abs.href === site || abs.href.startsWith(`${site}/`) || abs.href.startsWith(`${site}?`))
      path = abs.pathname.slice(sitePath.length)
    else if (
      abs.origin === local.origin &&
      (abs.pathname === E2E.basePath || abs.pathname.startsWith(`${E2E.basePath}/`))
    )
      path = abs.pathname.slice(E2E.basePath.length)
    else return null
    return `${E2E.base}${path}${abs.search}`
  }

  const referrer = new Map<string, string>()
  const add = (u: string | null, from: string): void => {
    if (u && !referrer.has(u)) referrer.set(u, from)
  }

  // pages: from the sitemap
  const pages: string[] = []
  const smIndex = await (await request.get(url('/sitemap-index.xml'))).text()
  for (const sm of smIndex.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const local = toLocal(sm[1] as string, url('/'))
    if (!local) continue
    add(local, '/sitemap-index.xml')
    const xml = await (await request.get(local)).text()
    for (const loc of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const page = toLocal(loc[1] as string, url('/'))
      if (page) {
        pages.push(page)
        add(page, 'sitemap')
      }
    }
  }
  expect(pages.length, 'pages in the sitemap').toBeGreaterThan(10)

  // links in every page
  const pageErrors: string[] = []
  await pool(pages, 12, async (p) => {
    const res = await request.get(p, { maxRedirects: 0 })
    if (res.status() !== 200) {
      pageErrors.push(`${res.status()} ${p}`)
      return
    }
    const html = await res.text()
    for (const m of html.matchAll(ATTR)) add(toLocal(m[1] as string, p), p)
    for (const m of html.matchAll(CONTENT_URL)) add(toLocal(m[1] as string, p), p)
    for (const m of html.matchAll(SRCSET))
      for (const part of (m[1] as string).split(',')) add(toLocal(part.trim().split(/\s+/)[0] ?? '', p), p)
  })

  // site URLs in the data files
  const siteUrl = new RegExp(`${escapeRe(site)}[^\\s"'<>)\\]\`|]*`, 'g')
  for (const f of DATA_FILES) {
    const res = await request.get(url(f))
    if (res.status() === 404 && !['/modules.json', '/llms.txt'].includes(f)) continue
    expect(res.status(), f).toBe(200)
    const text = await res.text()
    for (const m of text.matchAll(siteUrl)) {
      const u = m[0].replace(/[.,;:]+$/, '')
      // the bare `site` of modules.json is the base agents join paths to, not a link; the home page is `${site}/`
      if (u === site) continue
      add(toLocal(u, url(f)), f)
    }
    if (f.endsWith('.json'))
      for (const m of text.matchAll(/"(\/(?:m|r|c|built-in|badge|schema|raw|radar)\/[^"]*)"/g))
        if (!m[1]!.includes(' ')) add(toLocal(`${E2E.base}${m[1]}`, url(f)), f)
  }

  const failures: string[] = [...pageErrors]
  await pool([...referrer.keys()], 16, async (u) => {
    const res = await check(request, u)
    if (res !== 200) failures.push(`${res} ${u.slice(E2E.base.length) || '(base)'}  <- ${shortFrom(referrer.get(u))}`)
  })
  test.info().annotations.push({ type: 'links', description: `${referrer.size} URLs from ${pages.length} pages` })
  console.log(`links: ${referrer.size} unique URLs from ${pages.length} pages and ${DATA_FILES.length} data files`)
  expect(failures.sort(), 'links that are not a plain 200').toEqual([])
})

const shortFrom = (u: string | undefined): string =>
  !u ? '?' : u.startsWith(E2E.base) ? u.slice(E2E.base.length) || '/' : u

async function check(request: APIRequestContext, u: string): Promise<number | string> {
  try {
    const res = await request.head(u, { maxRedirects: 0 })
    if (res.status() === 405) return (await request.get(u, { maxRedirects: 0 })).status()
    return res.status() === 301 || res.status() === 302
      ? `${res.status()} -> ${res.headers()['location']}`
      : res.status()
  } catch (err) {
    return `error ${(err as Error).message.split('\n')[0]}`
  }
}
