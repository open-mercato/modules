// Rehearsal of the demo scripts C1 and C2 (spec appendix C, docs/DEMO.md): each step is clicked through in a
// desktop browser, its screenshot goes to out/e2e/demo, and what it shows is attached as an annotation. The
// assertions hold on any data the catalog can carry (the anchors the presenter needs exist); the numbers the
// presenter reads out (15 of 16, peers rejecting N of M) are recorded, not asserted, because they change with data.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { DESKTOP, E2E, KSEF, themed, url } from './env.ts'

const DIR = join(E2E.shots, '..', 'demo')

async function shot(page: Page, name: string, note: string): Promise<void> {
  mkdirSync(DIR, { recursive: true })
  const file = join(DIR, `${name}.png`)
  await page.screenshot({ path: file, animations: 'disabled' })
  await test.info().attach(name, { path: file, contentType: 'image/png' })
  test.info().annotations.push({ type: name, description: note })
}

const text = async (page: Page, sel: string): Promise<string> =>
  ((await page.locator(sel).first().innerText()) || '').replace(/\s+/g, ' ').trim()

test.describe.configure({ mode: 'serial' })

test('step: the home page, modules by category', async ({ browser }) => {
  const ctx = await themed(browser, 'dark', DESKTOP)
  const page = await ctx.newPage()
  await page.goto(url('/'))
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const cats = page.locator('.mods__cats a')
  const cards = page.locator('.mods__grid > li:not([hidden]) .mcard')
  expect(await cats.count()).toBeGreaterThan(1)
  expect(await cards.count()).toBeGreaterThan(0)
  await expect(page.getByRole('heading', { name: 'How to add a module' })).toBeAttached()
  await shot(
    page,
    'home',
    `Home: ${await cards.count()} cards, ${(await cats.count()) - 1} categories; count line: ${await text(page, '.mods__count')}`,
  )
  await ctx.close()
})

test('step: search for ksef narrows the grid to the KSeF module', async ({ browser }) => {
  const ctx = await themed(browser, 'dark', DESKTOP)
  const page = await ctx.newPage()
  await page.goto(url('/'))
  const input = page.getByRole('search', { name: 'Search modules' }).first().locator('input')
  await input.click()
  await input.pressSequentially('ksef', { delay: 40 })
  const shown = page.locator('.mods__grid > li:not([hidden]) .mcard')
  await expect(shown.filter({ hasText: 'KSeF' }).first()).toBeVisible()
  await expect(page).toHaveURL(/[?&]q=ksef/)
  await shot(
    page,
    'search-ksef',
    `query in URL: ${new URL(page.url()).search}; cards left: ${await shown.count()}; count line: ${await text(page, '.mods__count')}`,
  )
  await ctx.close()
})

test('step: KSeF page, sigil, Rentgen and file:line', async ({ browser }) => {
  const ctx = await themed(browser, 'dark', DESKTOP)
  const page = await ctx.newPage()
  // the sigil and the anatomy sit in the closed Technical details; the anatomy address opens it
  await page.goto(url(`${KSEF}#panel-anatomy`))
  await expect(page.locator('details#technical')).toHaveAttribute('open', '')
  const sigil = page.locator('svg[role=img][aria-label^="Anatomy:"]').first()
  await expect(sigil).toBeVisible()
  const level = await text(page, 'main')
  const fileLine = page.locator('a', { hasText: /\.ts:\d+ ↗/ }).first()
  await expect(fileLine).toBeVisible()
  const target = await fileLine.getAttribute('href')
  expect(target).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/@fastwhitecat\/integration-ksef-direct@[^/]+\/src\//)
  const hygiene = await page.getByText('event-prefix').first().isVisible()
  await shot(
    page,
    'ksef',
    `sigil "${await sigil.getAttribute('aria-label')}"; header: ${level.match(/(Verified|Listed|Fits)[^\n]*?(?= Built for| HUMAN)/)?.[0] ?? 'no level line'}; ` +
      `first file:line "${(await fileLine.innerText()).trim()}" -> ${target}; event-prefix finding shown: ${hygiene}`,
  )
  await ctx.close()
})

test('step: KSeF receipts and the api-keys patch', async ({ browser }) => {
  const ctx = await themed(browser, 'dark', DESKTOP)
  const page = await ctx.newPage()
  // the Receipts strip sits in the closed Technical details; the receipts address opens it
  await page.goto(url(`${KSEF}#receipts`))
  await expect(page.locator('details#technical')).toHaveAttribute('open', '')
  await page.locator('[data-receipts-open]').first().click()
  const drawer = page.locator('dialog[open]').first()
  await expect(drawer).toBeVisible()
  const body = (await drawer.innerText()).replace(/\s+/g, ' ')
  await shot(page, 'ksef-receipts', `drawer: ${body.slice(0, 400)}`)
  // the presenter's click: the drawer's isolation line whose receipt names a harness patch (api-keys on 0.9, an app
  // from the empty preset); the hrefs are read first so the click goes to the right one
  const iso = drawer.getByRole('link', { name: /^In isolation/ })
  let patched = -1
  for (let i = 0; i < (await iso.count()); i++) {
    const href = await iso.nth(i).getAttribute('href')
    if (href && (await (await page.request.get(new URL(href, page.url()).href)).text()).includes('api-keys')) {
      patched = i
      break
    }
  }
  if (patched >= 0) {
    await iso.nth(patched).click()
    await expect(page.getByText(/api-keys/).first()).toBeVisible()
    const patch = (
      await page
        .getByText(/api-keys/)
        .first()
        .innerText()
    ).trim()
    await shot(
      page,
      'ksef-api-keys-receipt',
      `drawer link ${patched + 1} opens ${new URL(page.url()).pathname}: ${patch}`,
    )
  } else
    test.info().annotations.push({ type: 'ksef-api-keys-receipt', description: 'no isolation receipt with api-keys' })
  await ctx.close()
})

test('step: Human / Agent toggle in Technical details', async ({ browser }) => {
  const ctx = await themed(browser, 'dark', DESKTOP)
  const page = await ctx.newPage()
  await page.goto(url(KSEF))
  // the page header has no toggle any more (26 Oct); it moved into the closed Technical details
  await page.locator('details#technical > summary').click()
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: /agent/i }).click()
  const pane = page.locator('.agentv')
  await expect(pane).toContainText('locator: npm:@fastwhitecat/integration-ksef-direct')
  await shot(page, 'agent-view', `agent view: ${(await pane.innerText()).replace(/\s+/g, ' ').slice(0, 300)}`)
  await ctx.close()
})

test('step: /compat, Open Mercato itself and the peer sentence', async ({ browser }) => {
  const ctx = await themed(browser, 'dark', DESKTOP)
  const page = await ctx.newPage()
  await page.goto(url('/compat'))
  // the first row of the matrix; the same words also sit in the closed `How the tests run`
  const itself = page.locator('table').getByText('Open Mercato itself').first()
  await expect(itself).toBeVisible()
  const peers = page.getByText(/^Peer ranges reject/).first()
  await expect(peers).toBeVisible()
  await itself.scrollIntoViewIfNeeded()
  await shot(page, 'compat', `${(await peers.innerText()).trim()}`)
  await ctx.close()
})

test('step: /radar, createRequestContainer and Consider them frozen', async ({ browser }) => {
  const ctx = await themed(browser, 'dark', DESKTOP)
  const page = await ctx.newPage()
  await page.goto(url('/radar'))
  await expect(page.getByText(/Consider them frozen\./).first()).toBeVisible()
  const row = page.locator('tr, li, div', { hasText: /^createRequestContainer/ }).last()
  const main = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
  const count = main.match(/createRequestContainer (?:\S+ )?(\d+ of \d+)/)?.[1] ?? null
  await page.getByText('createRequestContainer').first().scrollIntoViewIfNeeded()
  await shot(page, 'radar', `createRequestContainer: ${count ?? (await row.innerText()).slice(0, 80)}`)
  await ctx.close()
})

test('step: plugin install command on /for-agents', async ({ browser }) => {
  const ctx = await themed(browser, 'dark', DESKTOP)
  const page = await ctx.newPage()
  await page.goto(url('/for-agents'))
  const cmd = page.getByText('claude plugin install om-modules@open-mercato').first()
  await expect(cmd).toBeVisible()
  await cmd.scrollIntoViewIfNeeded()
  await shot(page, 'plugin', 'claude plugin install om-modules@open-mercato is on /for-agents')
  await ctx.close()
})
