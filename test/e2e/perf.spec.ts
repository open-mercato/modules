// The budgets of spec 7.11 that a browser can measure without Lighthouse (WP16): JS on / (gzip, measured after the
// first search, which fetches nothing since 26 Oct), /search-index.json (gzip, the published file),
// CSS (gzip), HTML of / (gzip), fonts (3 woff2, <= 150 KB, one preload), 0 third-party requests while a page loads,
// and CLS. Sizes are gzip -6 of the bytes the browser received, as Pages compresses them. LCP, TBT and the
// Lighthouse scores come from test/e2e/lighthouse.ts (yarn e2e:lighthouse); an unthrottled LCP is only annotated.
import { gzipSync } from 'node:zlib'
import { expect, test, type Page, type Response } from '@playwright/test'
import { BUDGET, kb } from './budgets.ts'
import { E2E, PAGES, phone, themed, url } from './env.ts'

const gz = (b: Buffer): number => gzipSync(b, { level: 6 }).length
const origin = new URL(E2E.base).origin

/** Every response of a page with its body, by resource type. */
function record(page: Page): { list: { url: string; type: string; res: Response }[] } {
  const out = { list: [] as { url: string; type: string; res: Response }[] }
  page.on('response', (res) => {
    out.list.push({ url: res.url(), type: res.request().resourceType(), res })
  })
  return out
}

async function gzSizes(items: { url: string; res: Response }[]): Promise<Map<string, number>> {
  const sizes = new Map<string, number>()
  for (const it of items) {
    if (sizes.has(it.url)) continue
    const body = await it.res.body().catch(() => null)
    if (body) sizes.set(it.url, gz(body))
  }
  return sizes
}

const sum = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0)
const isScript = (r: { url: string; type: string }): boolean => r.type === 'script' || /\.m?js(\?|$)/.test(r.url)

test('HTML of / is within budget', async ({ request }) => {
  const body = await (await request.get(url('/'), { headers: { 'accept-encoding': 'identity' } })).body()
  const size = gz(body)
  test.info().annotations.push({ type: 'html /', description: `${kb(body.length)} raw, ${kb(size)} gzip` })
  expect(size, `HTML / gzip ${kb(size)}`).toBeLessThanOrEqual(BUDGET.htmlHome)
})

// The home page of 26 Oct filters its cards in the page (a small plain script, no island): typing fetches nothing.
// search-index.json stays published for agents and /for-agents, so its budget is checked on the file itself.
test('JS on / stays within budget through the first search, which fetches nothing', async ({ browser }) => {
  const ctx = await themed(browser, 'light', phone(390))
  const page = await ctx.newPage()
  const rec = record(page)
  await page.goto(url('/'), { waitUntil: 'load' })
  await page.waitForLoadState('networkidle')
  const jsLoad = sum(await gzSizes(rec.list.filter(isScript)))
  const before = rec.list.length

  const input = page.getByRole('search', { name: 'Search modules' }).first().locator('input')
  await input.click()
  await input.pressSequentially('ksef', { delay: 30 })
  await page.waitForLoadState('networkidle')
  const after = rec.list.slice(before)
  expect(
    after.map((r) => r.url),
    'requests made by typing in the home search',
  ).toEqual([])
  const jsAll = await gzSizes(rec.list.filter(isScript))
  const top = [...jsAll.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([u, s]) => `${u.split('/').pop()} ${kb(s)}`)
    .join(', ')
  test.info().annotations.push({
    type: 'js /',
    description: `${kb(jsLoad)} at load, ${kb(sum(jsAll))} after the first search (${top})`,
  })
  expect(sum(jsAll), `JS on / gzip ${kb(sum(jsAll))}`).toBeLessThanOrEqual(BUDGET.jsHome)
  await ctx.close()
})

test('search-index.json is within budget', async ({ request }) => {
  const res = await request.get(url('/search-index.json'), { headers: { 'accept-encoding': 'identity' } })
  expect(res.status()).toBe(200)
  const size = gz(await res.body())
  test.info().annotations.push({ type: 'search-index.json', description: `${kb(size)} gzip` })
  expect(size, `search-index.json gzip ${kb(size)}`).toBeLessThanOrEqual(BUDGET.searchIndex)
})

for (const p of PAGES)
  test(`CSS, fonts, third parties and CLS on ${p.name}`, async ({ browser }) => {
    const ctx = await themed(browser, 'light', phone(390))
    const page = await ctx.newPage()
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number; __lcp: number }
      w.__cls = 0
      w.__lcp = 0
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[])
          if (!e.hadRecentInput) w.__cls += e.value
      }).observe({ type: 'layout-shift', buffered: true })
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) w.__lcp = e.startTime
      }).observe({ type: 'largest-contentful-paint', buffered: true })
    })
    const rec = record(page)
    const third: string[] = []
    page.on('request', (r) => {
      const u = r.url()
      if (/^(data|blob):/.test(u)) return
      if (new URL(u).origin !== origin) third.push(u)
    })
    await page.goto(url(p.path), { waitUntil: 'load' })
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(300)

    const css = sum(await gzSizes(rec.list.filter((r) => r.type === 'stylesheet' || /\.css(\?|$)/.test(r.url))))
    const fonts = rec.list.filter((r) => r.type === 'font' || /\.woff2(\?|$)/.test(r.url))
    const fontUrls = [...new Set(fonts.map((f) => f.url))]
    let fontBytes = 0
    for (const f of fontUrls) fontBytes += (await fonts.find((x) => x.url === f)!.res.body()).length
    const preloads = await page.locator('link[rel=preload][as=font]').count()
    const declared = await page.evaluate(() => {
      const srcs = new Set<string>()
      for (const s of document.styleSheets) {
        let rules: CSSRuleList
        try {
          rules = s.cssRules
        } catch {
          continue
        }
        for (const r of rules)
          if (r instanceof CSSFontFaceRule) {
            const m = r.style.getPropertyValue('src').match(/url\("?([^")]+)"?\)/)
            if (m?.[1]) srcs.add(new URL(m[1], location.href).href)
          }
      }
      return [...srcs]
    })
    const perf = await page.evaluate(() => {
      const w = window as unknown as { __cls: number; __lcp: number }
      return { cls: w.__cls, lcp: w.__lcp }
    })
    test.info().annotations.push({
      type: p.name,
      description:
        `CSS ${kb(css)} gzip; fonts ${fontUrls.length} loaded of ${declared.length} declared, ${kb(fontBytes)}, ` +
        `${preloads} preload; third-party ${third.length}; CLS ${perf.cls.toFixed(3)}; LCP unthrottled ${Math.round(perf.lcp)} ms`,
    })
    expect(css, `CSS gzip on ${p.path}: ${kb(css)}`).toBeLessThanOrEqual(BUDGET.css)
    expect(declared.length, 'woff2 files declared').toBeLessThanOrEqual(BUDGET.fontFiles)
    expect(fontUrls.length, 'woff2 files loaded').toBeLessThanOrEqual(BUDGET.fontFiles)
    expect(fontBytes, `fonts loaded on ${p.path}: ${kb(fontBytes)}`).toBeLessThanOrEqual(BUDGET.fonts)
    expect(preloads, 'font preloads').toBe(BUDGET.fontPreloads)
    expect(third, `third-party requests while ${p.path} loads`).toEqual([])
    expect(perf.cls, `CLS on ${p.path}`).toBeLessThan(BUDGET.cls)
    await ctx.close()
  })

test('the three font files together are within budget', async ({ request, page }) => {
  await page.goto(url('/'))
  const srcs = await page.evaluate(() => {
    const out = new Set<string>()
    for (const s of document.styleSheets)
      for (const r of s.cssRules)
        if (r instanceof CSSFontFaceRule) {
          const m = r.style.getPropertyValue('src').match(/url\("?([^")]+)"?\)/)
          if (m?.[1]) out.add(new URL(m[1], location.href).href)
        }
    return [...out]
  })
  expect(srcs.length).toBe(BUDGET.fontFiles)
  let total = 0
  for (const s of srcs) total += (await (await request.get(s)).body()).length
  test.info().annotations.push({ type: 'fonts', description: `${srcs.length} woff2, ${kb(total)}` })
  expect(total, `fonts ${kb(total)}`).toBeLessThanOrEqual(BUDGET.fonts)
})
