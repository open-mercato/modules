// Phone checks (spec 7.10, P15, 12.2 WP16): no horizontal page scroll at 360 and 390 px
// (`document.documentElement.scrollWidth <= innerWidth`), and the Receipts strip of a module page is one touch
// target of at least 44 x 44 px (inside Technical details since 26 Oct, opened by the `#receipts` address).
import { expect, test } from '@playwright/test'
import { KSEF, PAGES, phone, themed, url } from './env.ts'

const MORE = [
  '/radar',
  '/quality',
  '/about',
  '/templates',
  '/built-in',
  '/m/@piotrkarwatka/marketing-consents',
  '/m/@fullstackhouse/open-mercato-durable-work',
  '/m/@open-mercato/enterprise',
  '/404',
]
const WIDE_PATHS = [...PAGES.map((p) => p.path), ...MORE]

for (const width of [360, 390])
  test(`no horizontal scroll at ${width} px`, async ({ browser }) => {
    test.setTimeout(120_000)
    const ctx = await themed(browser, 'light', phone(width))
    const page = await ctx.newPage()
    const wide: string[] = []
    for (const path of WIDE_PATHS) {
      const res = await page.goto(url(path), { waitUntil: 'load' })
      if (path !== '/404' && res?.status() !== 200) {
        wide.push(`${path}: HTTP ${res?.status()}`)
        continue
      }
      await page.evaluate(() => document.fonts.ready)
      const m = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
        // the widest element that sticks out, to name the culprit
        culprit: (() => {
          let worst: { sel: string; right: number } | null = null
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect()
            if (r.width === 0 || r.right <= window.innerWidth + 0.5) continue
            if (!worst || r.right > worst.right) {
              const cls = typeof el.className === 'string' ? el.className.split(/\s+/).slice(0, 2).join('.') : ''
              worst = { sel: `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`, right: Math.round(r.right) }
            }
          }
          return worst
        })(),
      }))
      if (m.scroll > m.inner)
        wide.push(
          `${path}: scrollWidth ${m.scroll} > ${m.inner}${m.culprit ? ` (${m.culprit.sel} to ${m.culprit.right})` : ''}`,
        )
    }
    expect(wide, `pages wider than ${width} px`).toEqual([])
    await ctx.close()
  })

const STRIP_PAGES = [KSEF, '/m/@piotrkarwatka/marketing-consents', '/m/@fullstackhouse/open-mercato-durable-work']

for (const width of [360, 390])
  test(`Receipts strip is a touch target of at least 44 px at ${width} px`, async ({ browser }) => {
    const ctx = await themed(browser, 'light', phone(width))
    const page = await ctx.newPage()
    for (const path of STRIP_PAGES) {
      // the strip sits in the closed Technical details (26 Oct); the receipts address opens it
      await page.goto(url(`${path}#receipts`), { waitUntil: 'load' })
      await expect(page.locator('details#technical'), `${path}: Technical details open`).toHaveAttribute('open', '')
      const strip = page.locator('[data-receipts-open]').first()
      await expect(strip, `${path}: the Receipts strip`).toBeVisible()
      const box = await strip.boundingBox()
      expect(box, `${path}: strip box`).not.toBeNull()
      expect(box!.height, `${path}: strip height`).toBeGreaterThanOrEqual(44)
      expect(box!.width, `${path}: strip width`).toBeGreaterThanOrEqual(44)
      // one target: a button or a link, named, that opens the receipts
      const tag = await strip.evaluate((el) => el.tagName.toLowerCase())
      expect(['button', 'a']).toContain(tag)
      expect(await strip.getAttribute('aria-label')).toMatch(/^Receipts\./)
      await strip.tap()
      await expect(page.locator('dialog[open], [role=dialog]:visible').first()).toBeVisible()
    }
    await ctx.close()
  })
