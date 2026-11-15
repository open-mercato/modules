// The navbar copied from the main site (14 Nov), where the copy has to do better than a look-alike: touch targets of
// at least 44 px on a phone (spec 7.10), a panel that a tap opens on a wide touch screen, a focus ring that is not cut
// by the header, and navigation landmarks with names of their own.
import { expect, test } from '@playwright/test'
import { DESKTOP, phone, themed, url } from './env.ts'

/** A length rounded to 0.01 px: Firefox reports a 44 px box as 43.999999. */
const px = (n: number): number => Math.round(n * 100) / 100

for (const width of [360, 390])
  test(`phone navbar: the logo, the GitHub button and the menu button are at least 44 px at ${width} px`, async ({
    browser,
  }) => {
    const ctx = await themed(browser, 'light', phone(width))
    const page = await ctx.newPage()
    await page.goto(url('/'), { waitUntil: 'load' })
    // the menu button is its 48 px icon (the summary around it is narrower by the icon's negative margin)
    for (const sel of ['.navbar_logo-link', '.navbar_gh-button', '.navbar_menu-button .menu-icon']) {
      const box = await page.locator(sel).boundingBox()
      expect(box, sel).not.toBeNull()
      expect(px(box!.height), `${sel} height`).toBeGreaterThanOrEqual(44)
      expect(px(box!.width), `${sel} width`).toBeGreaterThanOrEqual(44)
    }
    // the button drawn inside the GitHub link keeps the main site's 32 px, the logo its 36 px
    expect(px((await page.locator('.navbar_gh-button .om-github-stars').boundingBox())!.height)).toBe(32)
    expect(px((await page.locator('.navbar_logo-link .navbar_logo').boundingBox())!.height)).toBe(36)
    // the bar itself did not grow
    const bar = await page.locator('.navbar_component').boundingBox()
    expect(Math.round(bar!.height)).toBeLessThanOrEqual(64)
    await ctx.close()
  })

test('a tap opens a panel on a wide touch screen, and a second tap closes it', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  })
  const page = await ctx.newPage()
  await page.goto(url('/about'), { waitUntil: 'load' })
  const run = page
    .locator('nav.navbar_menu [data-dropdown]')
    .filter({ has: page.getByRole('button', { name: 'Run', exact: true }) })
  const toggle = run.locator('.navbar_dropdown-toggle')
  const panel = run.locator('.navbar_dropdown-list')
  await expect(panel).toBeHidden()
  await toggle.tap()
  await expect(panel).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  // still open after the emulated hover and the click have both run
  await page.waitForTimeout(300)
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('link', { name: /^Templates/ })).toBeVisible()
  await toggle.tap()
  await expect(panel).toBeHidden()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  // a tap outside closes an open panel
  await toggle.tap()
  await expect(panel).toBeVisible()
  // in the page margin, where no link can sit
  await page.touchscreen.tap(10, 700)
  await expect(panel).toBeHidden()
  // a tap on another menu opens that one and closes the first
  await toggle.tap()
  await expect(panel).toBeVisible()
  const other = page.locator('nav.navbar_menu [data-dropdown]').first()
  await other.locator('.navbar_dropdown-toggle').tap()
  await expect(other.locator('.navbar_dropdown-list')).toBeVisible()
  await expect(panel).toBeHidden()
  await ctx.close()
})

test('with a mouse a panel opens on hover and closes when the pointer leaves', async ({ browser }) => {
  const ctx = await browser.newContext({ ...DESKTOP, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.goto(url('/about'), { waitUntil: 'load' })
  const run = page
    .locator('nav.navbar_menu [data-dropdown]')
    .filter({ has: page.getByRole('button', { name: 'Run', exact: true }) })
  const panel = run.locator('.navbar_dropdown-list')
  await run.locator('.navbar_dropdown-toggle').hover()
  await expect(panel).toBeVisible()
  // away from the bar and from the panel under it
  await page.mouse.move(1380, 860)
  await expect(panel).toBeHidden()
  // a click pins the panel: it stays when the pointer leaves, and a click elsewhere closes it
  await run.locator('.navbar_dropdown-toggle').click()
  await page.mouse.move(1380, 860)
  await page.waitForTimeout(300)
  await expect(panel).toBeVisible()
  await page.mouse.click(1380, 860)
  await expect(panel).toBeHidden()
  await ctx.close()
})

test('keyboard: focus opens a panel, Enter and Escape close it, and the focus ring stays inside the header', async ({
  browser,
}) => {
  const ctx = await browser.newContext({ ...DESKTOP, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.goto(url('/about'), { waitUntil: 'load' })
  const first = page.locator('nav.navbar_menu [data-dropdown]').first()
  const toggle = first.locator('.navbar_dropdown-toggle')
  const panel = first.locator('.navbar_dropdown-list')
  // skip link, logo, then the first menu
  for (let i = 0; i < 6 && !(await toggle.evaluate((el) => el === document.activeElement)); i++)
    await page.keyboard.press('Tab')
  await expect(toggle).toBeFocused()
  await expect(panel).toBeVisible()
  const ring = await toggle.evaluate((el) => {
    const s = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const header = (el.closest('.navbar_component') as HTMLElement).getBoundingClientRect()
    const offset = parseFloat(s.outlineOffset)
    const width = parseFloat(s.outlineWidth)
    return {
      style: s.outlineStyle,
      width,
      // the outer edge of the ring against the header box and the viewport
      top: r.top - offset - width,
      bottom: r.bottom + offset + width,
      headerTop: header.top,
      headerBottom: header.bottom,
    }
  })
  expect(ring.style).toBe('solid')
  expect(ring.width).toBeGreaterThanOrEqual(2)
  expect(ring.top).toBeGreaterThanOrEqual(Math.max(0, ring.headerTop))
  expect(ring.bottom).toBeLessThanOrEqual(ring.headerBottom)
  await page.keyboard.press('Enter')
  await expect(panel).toBeHidden()
  await page.keyboard.press('Enter')
  await expect(panel).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(toggle).toBeFocused()
  await ctx.close()
})

for (const reducedMotion of ['reduce', 'no-preference'] as const)
  test(`keyboard: Tab goes from a menu button into its panel and on to the next menu (reduced motion: ${reducedMotion})`, async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ ...DESKTOP, reducedMotion })
    const page = await ctx.newPage()
    await page.goto(url('/about'), { waitUntil: 'load' })
    const drops = page.locator('nav.navbar_menu [data-dropdown]')
    const [first, second] = [drops.nth(0), drops.nth(1)]
    const toggle = first.locator('.navbar_dropdown-toggle')
    const links = first.locator('.navbar_dropdown-link')
    for (let i = 0; i < 6 && !(await toggle.evaluate((el) => el === document.activeElement)); i++)
      await page.keyboard.press('Tab')
    await expect(toggle).toBeFocused()
    // every link of the panel in turn, the panel open all the way
    const count = await links.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      await page.keyboard.press('Tab')
      await expect(links.nth(i)).toBeFocused()
      await expect(first.locator('.navbar_dropdown-list')).toBeVisible()
    }
    // then the next menu, whose panel opens while the first one closes
    await page.keyboard.press('Tab')
    await expect(second.locator('.navbar_dropdown-toggle')).toBeFocused()
    await expect(second.locator('.navbar_dropdown-list')).toBeVisible()
    await expect(first.locator('.navbar_dropdown-list')).toBeHidden()
    await page.keyboard.press('Tab')
    await expect(second.locator('.navbar_dropdown-link').first()).toBeFocused()
    await ctx.close()
  })

test('a plain navbar link keeps its focus ring inside the header too', async ({ browser }) => {
  const ctx = await browser.newContext({ ...DESKTOP, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.goto(url('/about'), { waitUntil: 'load' })
  const link = page.locator('nav.navbar_menu a.navbar_link').first()
  // by keyboard, so :focus-visible applies: through the logo and the panels up to the first plain link
  for (let i = 0; i < 40 && !(await link.evaluate((el) => el === document.activeElement)); i++)
    await page.keyboard.press('Tab')
  await expect(link).toBeFocused()
  const ring = await link.evaluate((el) => {
    const s = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const header = (el.closest('.navbar_component') as HTMLElement).getBoundingClientRect()
    const reach = parseFloat(s.outlineOffset) + parseFloat(s.outlineWidth)
    return { style: s.outlineStyle, top: r.top - reach, bottom: r.bottom + reach, headerBottom: header.bottom }
  })
  expect(ring.style).toBe('solid')
  expect(ring.top).toBeGreaterThanOrEqual(0)
  expect(ring.bottom).toBeLessThanOrEqual(ring.headerBottom)
  await ctx.close()
})

test('Escape closes a panel pinned by a click, wherever the focus is', async ({ browser }) => {
  const ctx = await browser.newContext({ ...DESKTOP, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.goto(url('/about'), { waitUntil: 'load' })
  const run = page.locator('nav.navbar_menu [data-dropdown]').filter({
    has: page.getByRole('button', { name: 'Run', exact: true }),
  })
  const toggle = run.locator('.navbar_dropdown-toggle')
  const panel = run.locator('.navbar_dropdown-list')
  await toggle.click()
  await page.mouse.move(1380, 860)
  await expect(panel).toBeVisible()
  // as in a browser that does not focus a button on click
  await toggle.evaluate((el) => (el as HTMLElement).blur())
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await ctx.close()
})

test('the Run row of a deeper page is the current section, not the current page', async ({ browser }) => {
  const ctx = await browser.newContext({ ...DESKTOP, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  for (const [path, value] of [
    ['/compat', 'page'],
    ['/c/operations', 'true'],
    ['/built-in', 'true'],
  ] as const) {
    await page.goto(url(path), { waitUntil: 'load' })
    const current = page.locator('nav.navbar_menu a[aria-current]')
    await expect(current, path).toHaveCount(1)
    await expect(current, path).toHaveAttribute('aria-current', value)
  }
  // the list of built-in modules names its place under Modules
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveText(
    /^\s*Run\s*\/\s*Modules\s*\/\s*Built-in\s*$/,
  )
  await ctx.close()
})

test('the navigation landmarks a visitor can reach have names of their own', async ({ browser }) => {
  const ctx = await browser.newContext({ ...DESKTOP, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.goto(url('/'), { waitUntil: 'load' })
  const names = await page.locator('nav:visible').evaluateAll((els) => els.map((n) => n.getAttribute('aria-label')))
  expect(names).toContain('Open Mercato')
  expect(names).toContain('Footer')
  expect(new Set(names).size, names.join(', ')).toBe(names.length)
  await ctx.close()
})

test('the star count is asked from GitHub at the first interaction, not while the page loads', async ({ browser }) => {
  const ctx = await browser.newContext({ ...DESKTOP, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  const asked: string[] = []
  await page.route('https://api.github.com/**', async (route) => {
    asked.push(route.request().url())
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ stargazers_count: 4321 }) })
  })
  await page.goto(url('/about'), { waitUntil: 'load' })
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300)
  expect(asked).toEqual([])
  const count = page.locator('.navbar_content-right [data-om-star-count]')
  const built = (await count.innerText()).trim()
  expect(built).toMatch(/^[\d,]+$/)
  // a pointer move is not an interaction: the browser reports one by itself while a page lays out
  await page.mouse.move(400, 400)
  await page.waitForTimeout(300)
  expect(asked).toEqual([])
  await page.mouse.wheel(0, 200)
  await expect(count).toHaveText('4,321')
  expect(asked).toEqual(['https://api.github.com/repos/open-mercato/open-mercato'])
  // further interactions ask nothing, and the next page reads the count from the cache both sites share
  await page.keyboard.press('ArrowDown')
  await page.goto(url('/submit'), { waitUntil: 'load' })
  await expect(page.locator('.navbar_content-right [data-om-star-count]')).toHaveText('4,321')
  await page.mouse.wheel(0, 200)
  await page.waitForTimeout(300)
  expect(asked).toHaveLength(1)
  await ctx.close()
})
