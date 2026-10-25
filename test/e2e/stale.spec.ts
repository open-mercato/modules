// The stale-data banner (spec 4.6, 7.6, 7.8, P5): built from a fixture variant whose `dataAsOf.nightly` is 3 days
// and 1 hour older than a fresh `generatedAt` (test/e2e/build.ts), the banner `Data from <day>. The nightly run did
// not finish.` shows, the header dot turns yellow, and the same holds without JavaScript (the build-time fallback).
// The browser clock decides: an hour after that night the banner is hidden again. On the real build the banner
// follows the same 48 h rule from its own modules.json, and never shows on preview data.
import { expect, test, type Page } from '@playwright/test'
import { DESKTOP, E2E, KSEF, url } from './env.ts'

interface Index {
  generatedAt: string
  dataAsOf: { nightly: string | null; npm: string | null; source?: 'ci' | 'preview' | null }
}

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const bannerText = (nightly: string): string =>
  `Data from ${DAY.format(new Date(nightly))}. The nightly run did not finish.`

async function banner(page: Page): Promise<{ visible: boolean; text: string; dotStale: boolean }> {
  const b = page.locator('#stale-banner')
  const visible = (await b.count()) > 0 && (await b.isVisible())
  const text = visible ? (await b.innerText()).replace(/\s+/g, ' ').trim() : ''
  const dotStale = await page.locator('.stamp[data-primary]').evaluate((el) => el.classList.contains('is-stale'))
  return { visible, text, dotStale }
}

test.describe('stale variant', () => {
  test.skip(!E2E.staleBase, 'no stale build: run node test/e2e/build.ts, or set E2E_STALE_URL')
  const base = E2E.staleBase ?? ''

  test('its data is 3 days old and its build is fresh', async ({ request }) => {
    const idx = (await (await request.get(url('/modules.json', base))).json()) as Index
    expect(idx.dataAsOf.source).toBe('ci')
    expect(idx.dataAsOf.nightly).not.toBeNull()
    const age = Date.parse(idx.generatedAt) - Date.parse(idx.dataAsOf.nightly!)
    expect(age).toBeGreaterThanOrEqual(3 * 24 * 3600 * 1000)
    expect(Date.now() - Date.parse(idx.generatedAt)).toBeLessThan(24 * 3600 * 1000)
  })

  for (const path of ['/', KSEF, '/compat'])
    test(`banner shows on ${path}`, async ({ browser, request }) => {
      const idx = (await (await request.get(url('/modules.json', base))).json()) as Index
      const ctx = await browser.newContext(DESKTOP)
      const page = await ctx.newPage()
      await page.goto(url(path, base))
      const b = await banner(page)
      expect(b.visible).toBe(true)
      expect(b.text).toContain(bannerText(idx.dataAsOf.nightly!))
      expect(b.dotStale).toBe(true)
      await ctx.close()
    })

  test('banner shows without JavaScript (build-time fallback)', async ({ browser }) => {
    const ctx = await browser.newContext({ ...DESKTOP, javaScriptEnabled: false })
    const page = await ctx.newPage()
    await page.goto(url('/', base))
    expect((await banner(page)).visible).toBe(true)
    await ctx.close()
  })

  test('the browser clock decides: an hour after the night the banner is hidden', async ({ browser, request }) => {
    const idx = (await (await request.get(url('/modules.json', base))).json()) as Index
    const ctx = await browser.newContext(DESKTOP)
    const page = await ctx.newPage()
    await page.clock.setFixedTime(Date.parse(idx.dataAsOf.nightly!) + 3600 * 1000)
    await page.goto(url('/', base))
    const b = await banner(page)
    expect(b.visible).toBe(false)
    expect(b.dotStale).toBe(false)
    await ctx.close()
  })
})

test('real build: the banner follows the 48 h rule of its own data', async ({ browser, request }) => {
  const idx = (await (await request.get(url('/modules.json'))).json()) as Index
  const n = idx.dataAsOf.nightly
  const expected = !!n && idx.dataAsOf.source !== 'preview' && Date.now() - Date.parse(n) > 48 * 3600 * 1000
  const ctx = await browser.newContext(DESKTOP)
  const page = await ctx.newPage()
  await page.goto(url('/'))
  const b = await banner(page)
  test.info().annotations.push({
    type: 'data',
    description: `nightly ${n ?? 'none'}, source ${idx.dataAsOf.source ?? 'none'}, banner ${b.visible ? 'shown' : 'hidden'}`,
  })
  expect(b.visible).toBe(expected)
  if (idx.dataAsOf.source === 'preview') expect(await page.locator('#stale-banner').count()).toBe(0)
  await ctx.close()
})
