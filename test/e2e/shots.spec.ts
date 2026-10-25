// 16 screenshots (spec 12.2 WP16): the five pages of 7.9 in desktop and mobile, light and dark, chosen: the full
// matrix for /, the KSeF page and /compat (12), and two each for /submit and /for-agents (4). Artifacts for review,
// not golden pixels: saved to E2E_SHOTS (default out/e2e/shots) and attached to the report. Each shot also checks
// that the page rendered in the theme it was asked for.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { DESKTOP, E2E, PAGES, phone, themed, url, type Theme } from './env.ts'

type Form = 'desktop' | 'mobile'
const ALL: [Form, Theme][] = [
  ['desktop', 'light'],
  ['desktop', 'dark'],
  ['mobile', 'light'],
  ['mobile', 'dark'],
]
const PICK: Record<(typeof PAGES)[number]['name'], [Form, Theme][]> = {
  home: ALL,
  ksef: ALL,
  compat: ALL,
  submit: [
    ['desktop', 'light'],
    ['mobile', 'dark'],
  ],
  'for-agents': [
    ['desktop', 'dark'],
    ['mobile', 'light'],
  ],
}

const SHOTS = PAGES.flatMap((p) => PICK[p.name].map(([form, theme]) => ({ ...p, form, theme })))

test('the selection is 16 screenshots of 5 pages', () => {
  expect(SHOTS).toHaveLength(16)
  expect(new Set(SHOTS.map((s) => s.name)).size).toBe(5)
})

for (const s of SHOTS) {
  test(`screenshot ${s.name} ${s.form} ${s.theme}`, async ({ browser }, info) => {
    const ctx = await themed(browser, s.theme, s.form === 'desktop' ? DESKTOP : phone(390))
    const page = await ctx.newPage()
    const res = await page.goto(url(s.path), { waitUntil: 'load' })
    expect(res?.status()).toBe(200)
    await page.evaluate(() => document.fonts.ready)
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(s.theme)
    // the body paints the theme's ground: dark is darker than light
    const lum = await page.evaluate(() => {
      const m = getComputedStyle(document.body)
        .backgroundColor.match(/\d+(\.\d+)?/g)
        ?.map(Number) ?? [0, 0, 0]
      return (0.2126 * (m[0] ?? 0) + 0.7152 * (m[1] ?? 0) + 0.0722 * (m[2] ?? 0)) / 255
    })
    if (s.theme === 'dark') expect(lum).toBeLessThan(0.3)
    else expect(lum).toBeGreaterThan(0.7)
    mkdirSync(E2E.shots, { recursive: true })
    const file = join(E2E.shots, `${s.name}-${s.form}-${s.theme}.png`)
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled' })
    await info.attach(`${s.name}-${s.form}-${s.theme}`, { path: file, contentType: 'image/png' })
    await ctx.close()
  })
}
