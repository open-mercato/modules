// The Install card of a module page (Piotr, 28 Oct; audit of 29 Oct, C10): the green Install button is a <details>
// that an address opens, the third-party caution stays in view under the closed button and shows once while it is
// open, and an open panel never widens the page on a phone. The copied command never holds an edit by hand (R3).
import { expect, test, type Page } from '@playwright/test'
import { DESKTOP, phone, themed, url } from './env.ts'

const CONSENTS = '/m/@piotrkarwatka/marketing-consents'
const DATA_SYNC = '/m/@fullstackhouse/open-mercato-data-sync-durable'
const OPEN_PAGES = [CONSENTS, '/m/@open-mercato/storage-s3', '/m/@open-mercato/enterprise']
const BOX = 'details[data-install-open]'

/** The visible elements of a selector inside the Install card. */
const visible = (page: Page, sel: string): Promise<number> =>
  page
    .locator(`#install ${sel}`)
    .evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).length)

test('third-party caution: in view under the closed button, once while it is open', async ({ browser }) => {
  const ctx = await themed(browser, 'light', DESKTOP)
  const page = await ctx.newPage()
  await page.goto(url(CONSENTS))
  await expect(page.locator(BOX)).not.toHaveAttribute('open', '')
  await expect(page.locator('#install .inst__caution--out')).toBeVisible()
  await page.locator(`${BOX} > summary`).click()
  await expect(page.locator(BOX)).toHaveAttribute('open', '')
  await expect(page.locator('#install .inst__caution--out')).toBeHidden()
  expect(await visible(page, '.inst__caution')).toBe(1)
  // the state line, when there is one, shows once too
  expect(await visible(page, '.inst__state--out')).toBe(0)
  expect(await visible(page, '.inst__status:not(.inst__caution), .inst__warn')).toBeLessThanOrEqual(1)
  await ctx.close()
})

test('an address opens the Install button and Other Open Mercato versions', async ({ browser }) => {
  const ctx = await themed(browser, 'light', DESKTOP)
  const page = await ctx.newPage()
  await page.goto(url(`${CONSENTS}#install`))
  await expect(page.locator(BOX)).toHaveAttribute('open', '')
  await page.goto(url(`${CONSENTS}#install-versions`))
  await expect(page.locator(BOX)).toHaveAttribute('open', '')
  await expect(page.locator('details#install-versions')).toHaveAttribute('open', '')
  await ctx.close()
})

test('the link of a failed-latest warning opens Other Open Mercato versions', async ({ browser }) => {
  const ctx = await themed(browser, 'light', DESKTOP)
  const page = await ctx.newPage()
  await page.goto(url(CONSENTS))
  const link = page.locator('#install .inst__warn a[href="#install-versions"]').first()
  test.skip((await link.count()) === 0, 'the data has no failed latest line with another version that works here')
  await link.click()
  await expect(page.locator(BOX)).toHaveAttribute('open', '')
  await expect(page.locator('details#install-versions')).toHaveAttribute('open', '')
  await ctx.close()
})

test('the copied command of data-sync-durable adds durable-work; the removal of data_sync is a step of its own', async ({
  browser,
}) => {
  const ctx = await themed(browser, 'light', DESKTOP)
  const page = await ctx.newPage()
  const res = await page.goto(url(`${DATA_SYNC}#install`))
  test.skip(res?.status() !== 200, 'data-sync-durable is not in this data')
  const copy = await page.locator('#install .inst__steps [data-copy]').first().getAttribute('data-copy')
  expect(copy).toContain('open-mercato-durable-work@')
  expect(copy).not.toContain('Remove')
  await expect(page.locator('#install .inst__steps .inst__t').first()).toContainText("remove { id: 'data_sync'")
  await ctx.close()
})

for (const width of [360, 390])
  test(`an open Install panel fits ${width} px`, async ({ browser }) => {
    const ctx = await themed(browser, 'light', phone(width))
    const page = await ctx.newPage()
    const wide: string[] = []
    for (const path of OPEN_PAGES) {
      const res = await page.goto(url(`${path}#install`), { waitUntil: 'load' })
      if (res?.status() !== 200) continue
      // every disclosure of the card open: the widest the panel gets
      await page.evaluate(() =>
        document.querySelectorAll<HTMLDetailsElement>('#install details').forEach((d) => (d.open = true)),
      )
      await page.evaluate(() => document.fonts.ready)
      const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }))
      if (m.scroll > m.inner) wide.push(`${path}: scrollWidth ${m.scroll} > ${m.inner}`)
    }
    expect(wide, `open Install panels wider than ${width} px`).toEqual([])
    await ctx.close()
  })
