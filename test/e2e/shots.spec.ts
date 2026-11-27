// 8 screenshots (spec 12.2 WP16): the five pages of 7.9 in desktop and mobile, chosen: both forms for /, the KSeF
// page and /compat (6), and one each for /submit and /for-agents (2). Artifacts for review, not golden pixels: saved
// to E2E_SHOTS (default out/e2e/shots) and attached to the report. The site has one light theme since 13 Nov (like
// openmercato.com), so every page is also checked under a dark system: it must still paint the light ground.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { DESKTOP, E2E, PAGES, phone, themed, url } from './env.ts'

type Form = 'desktop' | 'mobile'
const PICK: Record<(typeof PAGES)[number]['name'], Form[]> = {
  home: ['desktop', 'mobile'],
  ksef: ['desktop', 'mobile'],
  compat: ['desktop', 'mobile'],
  submit: ['desktop'],
  'for-agents': ['mobile'],
}

const SHOTS = PAGES.flatMap((p) => PICK[p.name].map((form) => ({ ...p, form })))

test('the selection is 8 screenshots of 5 pages', () => {
  expect(SHOTS).toHaveLength(8)
  expect(new Set(SHOTS.map((s) => s.name)).size).toBe(5)
})

/** Relative luminance of the body background, 0 (black) to 1 (white). */
const ground = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const m = getComputedStyle(document.body)
      .backgroundColor.match(/\d+(\.\d+)?/g)
      ?.map(Number) ?? [0, 0, 0]
    return (0.2126 * (m[0] ?? 0) + 0.7152 * (m[1] ?? 0) + 0.0722 * (m[2] ?? 0)) / 255
  })

for (const p of PAGES)
  test(`a dark system still gets the light page: ${p.name}`, async ({ browser }) => {
    const ctx = await themed(browser, 'dark', DESKTOP)
    const page = await ctx.newPage()
    const res = await page.goto(url(p.path), { waitUntil: 'load' })
    expect(res?.status()).toBe(200)
    expect(await ground(page)).toBeGreaterThan(0.7)
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light')
    await ctx.close()
  })

for (const s of SHOTS) {
  test(`screenshot ${s.name} ${s.form}`, async ({ browser }, info) => {
    const ctx = await themed(browser, 'light', s.form === 'desktop' ? DESKTOP : phone(390))
    const page = await ctx.newPage()
    const res = await page.goto(url(s.path), { waitUntil: 'load' })
    expect(res?.status()).toBe(200)
    await page.evaluate(() => document.fonts.ready)
    expect(await ground(page)).toBeGreaterThan(0.7)
    mkdirSync(E2E.shots, { recursive: true })
    const file = join(E2E.shots, `${s.name}-${s.form}.png`)
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled' })
    await info.attach(`${s.name}-${s.form}`, { path: file, contentType: 'image/png' })
    await ctx.close()
  })
}
