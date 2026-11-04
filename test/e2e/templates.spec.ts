// The Templates section on fixture data (docs/specs/2026-10-29-templates.md, Phase 1a step 7): test/e2e/build.ts
// builds `templates` from the module fixture plus the template fixture (four listed entries: b2b-portal, active,
// featured, with a slug and screenshots; Acme/Field-CRM, active, two lines behind, an unconditional enterprise module,
// renamed on GitHub; acme/kiosk, unmaintained and archived; ready-app-oss-prm, on hold without a slug). The gallery
// replaces the coming-soon page, sorts and filters by use case; each page shows the create command or the hold reason,
// the facts of one named sha, the module inventory and the env keys. The real build keeps the coming-soon page while its
// data has no active template (test/pages/templates.test.ts and mobile.spec.ts cover that one).
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { DESKTOP, E2E, phone, themed, url } from './env.ts'

const B2B = '/t/acme/b2b-portal'
const CRM = '/t/acme/field-crm'
const KIOSK = '/t/acme/kiosk'
const PRM = '/t/open-mercato/ready-app-oss-prm'
const PAGES = ['/templates', B2B, CRM, KIOSK, PRM]

/** Titles of the visible cards, in order. */
const visibleCards = (page: Page): Promise<string[]> =>
  page
    .locator('[data-tgrid] > li')
    .evaluateAll((els) =>
      els.filter((e) => !(e as HTMLElement).hidden).map((e) => e.querySelector('h3')?.textContent?.trim() ?? ''),
    )

test.describe('templates variant', () => {
  test.skip(!E2E.templatesBase, 'no templates build: run node test/e2e/build.ts, or set E2E_TEMPLATES_URL')
  const base = E2E.templatesBase ?? ''

  test('the gallery replaces the coming-soon page and lists active and held templates in order', async ({
    browser,
  }) => {
    const ctx = await themed(browser, 'light', DESKTOP)
    const page = await ctx.newPage()
    expect((await page.goto(url('/templates', base)))?.status()).toBe(200)
    await expect(page.locator('[data-templates-state="coming-soon"]')).toHaveCount(0)
    await expect(page.locator('h1')).toHaveText('Start a new app from a whole app.')
    // featured first, then the last push; the held entry gets no boost; unmaintained kiosk is not in the gallery
    expect(await visibleCards(page)).toEqual(['b2b-portal', 'Field-CRM', 'ready-app-oss-prm'])
    const b2b = page.locator('[data-tgrid] > li', { has: page.locator('h3', { hasText: 'b2b-portal' }) })
    await expect(b2b.locator('[data-line-badge]')).toHaveText('Built on 0.9.x')
    await expect(b2b.locator('[data-behind]')).toHaveCount(0)
    await expect(b2b.locator('[data-verified="0"]')).toHaveText('Not verified')
    await expect(b2b.locator('[data-enterprise]')).toHaveCount(0)
    await expect(b2b.locator('img')).toHaveAttribute('src', /\/shots\/templates\/acme\/b2b-portal-quotes\.png$/)
    await expect(b2b).toContainText('42')
    const crm = page.locator('[data-tgrid] > li', { has: page.locator('h3', { hasText: 'Field-CRM' }) })
    await expect(crm.locator('[data-line-badge]')).toHaveText('Built on 0.7.x')
    await expect(crm.locator('[data-behind]')).toHaveText('2 lines behind')
    await expect(crm.locator('[data-enterprise]')).toHaveText('Enterprise license')
    const prm = page.locator('[data-tgrid] > li', { has: page.locator('h3', { hasText: 'ready-app-oss-prm' }) })
    await expect(prm).toContainText('No license yet, and it pins Open Mercato 0.4.')
    await expect(prm.locator('a')).toHaveAttribute('href', new RegExp(`${PRM}$`))
    await ctx.close()
  })

  test('one filter, the use case, kept in the address', async ({ browser }) => {
    const ctx = await themed(browser, 'light', DESKTOP)
    const page = await ctx.newPage()
    await page.goto(url('/templates', base))
    const chips = page.locator('[role="group"][aria-label="Use case"] button')
    await expect(chips).toHaveText([/^All\s*3$/, /^B2B portal\s*1$/, /^Partner portal\s*1$/, /^Field service\s*1$/])
    await chips.filter({ hasText: 'Field service' }).click()
    expect(await visibleCards(page)).toEqual(['Field-CRM'])
    await expect(chips.filter({ hasText: 'Field service' })).toHaveAttribute('aria-pressed', 'true')
    expect(new URL(page.url()).searchParams.get('use')).toBe('field-service')
    await chips.filter({ hasText: 'All' }).click()
    expect(await visibleCards(page)).toHaveLength(3)
    expect(new URL(page.url()).searchParams.has('use')).toBe(false)
    await page.goto(url('/templates?use=partner-portal', base))
    expect(await visibleCards(page)).toEqual(['ready-app-oss-prm'])
    await ctx.close()
  })

  test('without JavaScript every card shows and the filter is not shown', async ({ browser }) => {
    const ctx = await browser.newContext({ ...DESKTOP, javaScriptEnabled: false })
    const page = await ctx.newPage()
    await page.goto(url('/templates?use=crm', base))
    await expect(page.locator('[role="group"][aria-label="Use case"]')).toBeHidden()
    expect(await visibleCards(page)).toHaveLength(3)
    await ctx.close()
  })

  test('the header item Templates is current on /templates and on /t/ pages', async ({ browser }) => {
    const ctx = await themed(browser, 'light', DESKTOP)
    const page = await ctx.newPage()
    for (const path of ['/templates', B2B, PRM]) {
      await page.goto(url(path, base))
      const current = page.locator('.hdr__nav a[aria-current="page"]')
      await expect(current, path).toHaveCount(1)
      await expect(current, path).toHaveText('Templates')
    }
    await ctx.close()
  })

  test('an active page: the create command, the facts of its sha, the modules and the env keys', async ({
    browser,
  }) => {
    const ctx = await themed(browser, 'light', DESKTOP)
    const page = await ctx.newPage()
    expect((await page.goto(url(B2B, base)))?.status()).toBe(200)
    const create = page.locator('#create')
    await expect(create.locator('[data-create-command]')).toHaveAttribute(
      'data-create-command',
      'npx create-mercato-app my-app --template b2b-portal',
    )
    await expect(create).toContainText('Planned')
    // planned, not released: no copy button for a command that does not work yet
    await expect(create.locator('button[data-copy]')).toHaveCount(0)
    await expect(create.locator('[data-hold-reason]')).toHaveCount(0)
    await expect(create.locator('[data-built-on]')).toHaveText('Open Mercato 0.9.0 (0.9.x, the latest line)')
    await expect(create.locator('[data-verification]')).toContainText('not run on this commit')
    await expect(create).toContainText('b2b000000000')
    await expect(create).toContainText('tag v1.2.0')
    const mods = page.locator('#modules')
    await expect(mods.locator('[data-group="own"]')).toContainText('ratelimit_probe')
    await expect(mods.locator('[data-group="packages"] a[href$="/m/@open-mercato/gateway-stripe"]')).toHaveText(
      'gateway_stripe',
    )
    await expect(mods.locator('[data-group="packages"]')).toContainText('OM_ENABLE_ENTERPRISE_MODULES')
    await expect(mods.locator('[data-group="built-in"] a[href$="/built-in/currencies"]')).toHaveCount(1)
    await expect(mods).toContainText('module:example')
    await expect(page.locator('#env')).toContainText('OPENAI_API_KEY')
    await expect(page.locator('#env')).toContainText('Used by the AI assistant.')
    await expect(page.locator('#shots-h')).toHaveText('Screenshots')
    await expect(page.locator('[data-license]')).toHaveText('MIT')
    await ctx.close()
  })

  test('without a slug the command names owner/repo; the Enterprise mark sits above it', async ({ browser }) => {
    const ctx = await themed(browser, 'light', DESKTOP)
    const page = await ctx.newPage()
    await page.goto(url(CRM, base))
    const create = page.locator('#create')
    await expect(create.locator('[data-create-command]')).toHaveAttribute(
      'data-create-command',
      'npx create-mercato-app my-app --template Acme/Field-CRM',
    )
    await expect(create.locator('.tcreate__ent')).toContainText('Requires an Enterprise license')
    await expect(page.locator('.mh [data-behind]')).toHaveText('2 lines behind')
    await expect(page.locator('.banner--renamed')).toContainText('acme-labs/field-crm')
    await ctx.close()
  })

  test('a held page shows its reason instead of a create command', async ({ browser }) => {
    const ctx = await themed(browser, 'light', DESKTOP)
    const page = await ctx.newPage()
    expect((await page.goto(url(PRM, base)))?.status()).toBe(200)
    await expect(page.locator('#create [data-create-command]')).toHaveCount(0)
    await expect(page.locator('#create [data-hold-reason]')).toContainText(
      'No license yet, and it pins Open Mercato 0.4.',
    )
    await expect(page.locator('#create')).not.toContainText('create-mercato-app')
    await ctx.close()
  })

  test('an unmaintained page still works and says why', async ({ browser }) => {
    const ctx = await themed(browser, 'light', DESKTOP)
    const page = await ctx.newPage()
    expect((await page.goto(url(KIOSK, base)))?.status()).toBe(200)
    await expect(page.locator('.mod__banners')).toContainText('The author no longer updates it.')
    await expect(page.locator('.mod__banners')).toContainText('archived on GitHub')
    await expect(page.locator('#create [data-create-command]')).toHaveCount(1)
    await expect(page.locator('[data-archived]')).toHaveText('Yes')
    await ctx.close()
  })

  for (const width of [360, 390])
    test(`no horizontal scroll at ${width} px`, async ({ browser }) => {
      const ctx = await themed(browser, 'light', phone(width))
      const page = await ctx.newPage()
      const wide: string[] = []
      for (const path of PAGES) {
        await page.goto(url(path, base), { waitUntil: 'load' })
        await page.evaluate(() => document.fonts.ready)
        const m = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          inner: window.innerWidth,
        }))
        if (m.scroll > m.inner) wide.push(`${path}: scrollWidth ${m.scroll} > ${m.inner}`)
      }
      expect(wide).toEqual([])
      await ctx.close()
    })

  test('every internal link and image of the template pages answers 200', async ({ request }) => {
    const origin = new URL(base).origin
    const seen = new Set<string>()
    const bad: string[] = []
    for (const path of PAGES) {
      const html = await (await request.get(url(path, base))).text()
      for (const m of html.matchAll(/\s(?:href|src)="([^"#]+)/g)) {
        const target = new URL(m[1]!.replace(/&amp;/g, '&'), url(path, base))
        if (target.origin !== origin || seen.has(target.href)) continue
        seen.add(target.href)
        const res = await request.get(target.href, { maxRedirects: 0 })
        if (res.status() !== 200) bad.push(`${path}: ${target.pathname}${target.search} answers ${res.status()}`)
      }
    }
    expect(seen.size).toBeGreaterThan(20)
    expect(bad).toEqual([])
  })

  // artifacts for review, not golden pixels, next to the 16 of shots.spec.ts
  for (const [name, path, form, theme] of [
    ['gallery', '/templates', 'desktop', 'light'],
    ['gallery', '/templates', 'mobile', 'dark'],
    ['b2b-portal', B2B, 'desktop', 'dark'],
    ['b2b-portal', B2B, 'mobile', 'light'],
    ['prm', PRM, 'desktop', 'light'],
  ] as const)
    test(`screenshot templates ${name} ${form} ${theme}`, async ({ browser }, info) => {
      const ctx = await themed(browser, theme, form === 'desktop' ? DESKTOP : phone(390))
      const page = await ctx.newPage()
      await page.goto(url(path, base), { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)
      mkdirSync(E2E.shots, { recursive: true })
      const file = join(E2E.shots, `templates-${name}-${form}-${theme}.png`)
      await page.screenshot({ path: file, fullPage: true })
      await info.attach(`templates-${name}-${form}-${theme}`, { path: file, contentType: 'image/png' })
      await ctx.close()
    })

  for (const theme of ['light', 'dark'] as const)
    for (const path of ['/templates', B2B, PRM])
      test(`axe ${path} ${theme}`, async ({ browser }) => {
        const ctx = await themed(browser, theme, DESKTOP)
        const page = await ctx.newPage()
        await page.goto(url(path, base), { waitUntil: 'load' })
        await page.evaluate(() => document.fonts.ready)
        const result = await new AxeBuilder({ page }).analyze()
        const bad = result.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
        expect(bad).toEqual([])
        await ctx.close()
      })
})
