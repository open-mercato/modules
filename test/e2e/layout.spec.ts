// Where the pages sit (move under www.openmercato.com/run, 14 Nov): the home page at its address, the Run menu
// pointing at it, and, when the site was built with a home path (HOME_PATH `/modules`: `/run/modules`), the base
// answering a redirect instead of a page. Runs in both layouts: with no variables the home page is the base itself.
// The local server answers the static rules of dist/_redirects as Pages does (test/e2e/serve.ts); what the Functions
// answer on the old hosts is covered by test/pages/site-host.test.ts.
import { expect, test } from '@playwright/test'
import { DESKTOP, E2E, url } from './env.ts'

const withHomePath = E2E.homePath !== '/'
/** Path of the home page on the host under test: `/`, `/run/` or `/run/modules`. */
const homePath = `${E2E.basePath}${E2E.homePath}`

test('the home page answers at its address, and its canonical URL and og:url name it', async ({ request }) => {
  const res = await request.get(url('/'), { maxRedirects: 0 })
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('text/html')
  const html = await res.text()
  const index = (await (await request.get(url('/modules.json'))).json()) as { site: string }
  const site = index.site.replace(/\/+$/, '')
  // `site` of modules.json is the site root with its base path; the home page is under it
  const want = `${site}${E2E.homePath}`
  expect(/<link rel="canonical" href="([^"]*)"/.exec(html)?.[1]).toBe(want)
  expect(/<meta property="og:url" content="([^"]*)"/.exec(html)?.[1]).toBe(want)
  expect(new URL(want).pathname.endsWith(homePath)).toBe(true)
})

test('the page and the data file of the same name do not collide', async ({ request }) => {
  const data = await request.get(url('/modules.json'), { maxRedirects: 0 })
  expect(data.status()).toBe(200)
  expect(data.headers()['content-type']).toContain('application/json')
  expect(Array.isArray(((await data.json()) as { entries: unknown[] }).entries)).toBe(true)
  const page = await request.get(url('/'), { maxRedirects: 0 })
  expect(page.headers()['content-type']).toContain('text/html')
})

test('the sitemap lists the home page at its address and never the bare base', async ({ request }) => {
  const index = (await (await request.get(url('/modules.json'))).json()) as { site: string }
  const site = index.site.replace(/\/+$/, '')
  const smIndex = await (await request.get(url('/sitemap-index.xml'))).text()
  const locs: string[] = []
  for (const sm of smIndex.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const local = `${E2E.base}${new URL(sm[1] as string).pathname.slice(new URL(site).pathname.replace(/\/+$/, '').length)}`
    const xml = await (await request.get(local)).text()
    for (const loc of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) locs.push(loc[1] as string)
  }
  // trailingSlash 'never': the sitemap writes the home page of a site without a home path as the bare site root
  const home = withHomePath ? `${site}${E2E.homePath}` : site
  expect(locs.map((l) => l.replace(/\/+$/, ''))).toContain(home)
  if (withHomePath) expect(locs.map((l) => l.replace(/\/+$/, ''))).not.toContain(site)
  for (const p of ['/templates', '/compat', '/radar', '/quality', '/for-agents']) expect(locs).toContain(`${site}${p}`)
})

test('the Run menu links the six pages, Modules at the home page', async ({ browser }) => {
  const context = await browser.newContext(DESKTOP)
  const page = await context.newPage()
  await page.goto(url('/compat'), { waitUntil: 'load' })
  const rows = await page
    .locator('nav.navbar_menu .navbar_dropdown-link[href^="/"]')
    .evaluateAll((els) =>
      els.map((a) => [a.querySelector('.navbar_dropdown-name')?.textContent?.trim() ?? '', a.getAttribute('href')]),
    )
  expect(rows).toEqual([
    ['Modules', homePath],
    ['Templates', `${E2E.basePath}/templates`],
    ['Compatibility', `${E2E.basePath}/compat`],
    ['Radar', `${E2E.basePath}/radar`],
    ['Quality', `${E2E.basePath}/quality`],
    ['For agents', `${E2E.basePath}/for-agents`],
  ])
  // each of them answers 200 without a redirect
  for (const [, href] of rows) {
    const res = await page.request.get(new URL(href as string, E2E.base).href, { maxRedirects: 0 })
    expect(res.status(), String(href)).toBe(200)
  }
  // on the home page the Modules row is the current page, and the context line reads Run / Modules
  await page.goto(url('/'), { waitUntil: 'load' })
  await expect(page.locator('nav.navbar_menu .navbar_dropdown-link[aria-current="page"]')).toHaveAttribute(
    'href',
    homePath,
  )
  await expect(page.locator('.ctx__where')).toHaveText(/^\s*Run\s*\/\s*Modules\s*$/)
  await context.close()
})

test('a click on Browse modules lands on the home page without a redirect', async ({ browser }) => {
  const context = await browser.newContext(DESKTOP)
  const page = await context.newPage()
  await page.goto(url('/compat'), { waitUntil: 'load' })
  const redirects: string[] = []
  page.on('response', (r) => {
    if (r.status() >= 300 && r.status() < 400) redirects.push(`${r.status()} ${r.url()}`)
  })
  await page.getByRole('link', { name: 'Browse modules.' }).click()
  await page.waitForLoadState('load')
  expect(new URL(page.url()).pathname).toBe(homePath)
  expect(redirects).toEqual([])
  await expect(page.locator('[data-search-input]').first()).toBeVisible()
  await context.close()
})

test.describe('with a home path', () => {
  test.skip(!withHomePath, 'the site was built without HOME_PATH: the base is the home page')

  test('the base, with and without its slash, answers a 302 to the home page and keeps the query', async ({
    request,
  }) => {
    for (const [from, to] of [
      [E2E.basePath, homePath],
      [`${E2E.basePath}/`, homePath],
      [`${E2E.basePath}?q=ksef`, `${homePath}?q=ksef`],
      [`${E2E.basePath}/?q=ksef`, `${homePath}?q=ksef`],
    ] as const) {
      const res = await request.get(new URL(from, E2E.base).href, { maxRedirects: 0 })
      expect(res.status(), from).toBe(302)
      expect(res.headers()['location'], from).toBe(to)
    }
  })

  test('a visitor of the base ends on the home page with its search field', async ({ browser }) => {
    const context = await browser.newContext(DESKTOP)
    const page = await context.newPage()
    const res = await page.goto(`${E2E.base}/`, { waitUntil: 'load' })
    expect(res?.status()).toBe(200)
    expect(new URL(page.url()).pathname).toBe(homePath)
    await expect(page.locator('[data-search-input]').first()).toBeVisible()
    await context.close()
  })

  test('no page of the site sits at the base', async ({ request }) => {
    const res = await request.get(`${E2E.base}/index.html`, { maxRedirects: 0 })
    expect(res.status()).toBe(404)
  })
})

test.describe('without a home path', () => {
  test.skip(withHomePath, 'the site was built with HOME_PATH')

  test('the base with its slash is the home page', async ({ request }) => {
    const res = await request.get(`${E2E.base}/`, { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    expect(await res.text()).toContain('data-search-input')
  })
})
