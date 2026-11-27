// The main site's behavior scripts in a real browser (www site migration spec, Phase 7): the cookie banner, the CTA
// tracker and the video carousel, each bundled by Vite as the build bundles it and run in Playwright's Chromium on a
// fixture page served from memory. Runs only with WWW_BROWSER=1 (validate.yml installs Chromium and sets it), so
// `yarn test` on a machine without the browser does not fail; with the flag a missing browser is a failure.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { carouselHtml } from '../../www/src/lib/carousel.ts'
import { ROOT } from '../emit/helpers.ts'

const required = process.env.WWW_BROWSER === '1'
const ORIGIN = 'http://site.test'
const GITHUB = 'https://github.com/open-mercato/open-mercato'

/** One script of www/src/scripts as an IIFE, bundled with its imports. */
async function bundle(name: string): Promise<string> {
  const out = await build({
    configFile: false,
    root: ROOT,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      target: 'es2022',
      lib: { entry: join(ROOT, 'www', 'src', 'scripts', name), formats: ['iife'], name: 'om', fileName: 'om' },
    },
  })
  const res = (Array.isArray(out) ? out[0] : out) as { output: { type: string; code?: string }[] }
  return res.output.map((o) => (o.type === 'chunk' ? (o.code ?? '') : '')).join('\n')
}

const css = (name: string): string => readFileSync(join(ROOT, 'www', 'src', 'styles', 'webflow', name), 'utf8')

function page(scripts: string): string {
  const carousel = carouselHtml({
    label: 'Customer videos',
    noun: 'customer video',
    placement: 'stories',
    items: [
      { video: 'xd9YxWFfAoE', title: 'Vistula Valley', thumbnail: '/files/a.png', width: 16, height: 9 },
      { video: 'YBV5pNGCCpw', title: 'MDM NT', thumbnail: '/files/b.png', width: 16, height: 9 },
      { video: 'GD2ToD1jmLE', title: 'Architecture', thumbnail: '/files/c.png', width: 16, height: 9 },
    ],
  })
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>fixture</title>
<style>body{margin:0;font-family:sans-serif}${css('consent.css')}${css('carousel.css')}</style></head><body>
<header data-cta-placement="nav">
  <a href="${GITHUB}" data-cta-action="github" data-stay>GitHub</a>
  <button type="button" data-cta-action="product_menu">Product</button>
</header>
<a href="${ORIGIN}/x" data-cta-action="orphan" data-stay>No placement</a>
<section style="padding:40px 0 120px">${carousel}</section>
<div style="height:3000px">a long page</div>
<script>document.addEventListener('click', (e) => { if (e.target.closest('[data-stay]')) e.preventDefault() })</script>
<script>${scripts}</script></body></html>`
}

describe.skipIf(!required)('the behavior scripts in Chromium', () => {
  let browser: Browser
  let html: string
  const contexts: BrowserContext[] = []

  beforeAll(async () => {
    html = page(
      [await bundle('cta-tracking.ts'), await bundle('consent-banner.ts'), await bundle('carousel.ts')].join('\n;\n'),
    )
    browser = await chromium.launch({ args: ['--no-sandbox'] })
  }, 120_000)
  afterAll(async () => {
    for (const c of contexts) await c.close()
    await browser?.close()
  })

  async function open(opts: { javaScriptEnabled?: boolean } = {}): Promise<{ ctx: BrowserContext; p: Page }> {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', ...opts })
    contexts.push(ctx)
    await ctx.route(`${ORIGIN}/**`, (route) => {
      const path = new URL(route.request().url()).pathname
      if (path === '/') return route.fulfill({ contentType: 'text/html', body: html })
      return route.fulfill({ status: 404, body: '' })
    })
    await ctx.route('https://**', (route) => route.abort())
    await ctx.addInitScript(() => {
      const w = window as unknown as { events: unknown[][]; gtag: (...a: unknown[]) => void }
      w.events = []
      w.gtag = (...a) => void w.events.push(a)
    })
    const p = await ctx.newPage()
    await p.goto(`${ORIGIN}/`)
    return { ctx, p }
  }
  const events = (p: Page) => p.evaluate(() => (window as unknown as { events: unknown[][] }).events)
  const counter = (p: Page) => p.locator('[data-current]').textContent()

  it('shows the banner on a first visit; Accept sets cookieAccepted=true for 180 days and hides it for good', async () => {
    const { ctx, p } = await open()
    const banner = p.locator('.cookie-banner_component')
    await expect.poll(() => banner.isVisible()).toBe(true)
    expect(await banner.textContent()).toContain('We use essential cookies to remember your preferences.')
    const before = Date.now() / 1000
    await p.getByText('Accept cookies').click()
    const cookie = (await ctx.cookies()).find((c) => c.name === 'cookieAccepted')
    expect(cookie).toMatchObject({ value: 'true', path: '/' })
    expect((cookie!.expires - before) / 86400).toBeCloseTo(180, 2)
    await expect.poll(() => banner.evaluate((el) => getComputedStyle(el).display)).toBe('none')
    await p.reload()
    expect(await p.locator('.cookie-banner_component').count()).toBe(0)
  })

  it('Accept keeps the scroll position and the address (no jump to the top, no #)', async () => {
    const { p } = await open()
    const banner = p.locator('.cookie-banner_component')
    await expect.poll(() => banner.isVisible()).toBe(true)
    await p.evaluate(() => window.scrollTo(0, 1500))
    await expect.poll(() => p.evaluate(() => window.scrollY)).toBe(1500)
    await p.getByText('Accept cookies').click()
    await expect.poll(() => banner.evaluate((el) => getComputedStyle(el).display)).toBe('none')
    expect(await p.evaluate(() => [window.scrollY, location.hash, location.href])).toEqual([1500, '', `${ORIGIN}/`])
  })

  it('Dismiss works from the keyboard and sets the same cookie', async () => {
    const { ctx, p } = await open()
    await p.locator('[cookie-banner="dismiss"]').focus()
    await p.keyboard.press('Enter')
    expect((await ctx.cookies()).find((c) => c.name === 'cookieAccepted')?.value).toBe('true')
  })

  it('sends the live CTA events on a click and a middle click, and nothing without a placement', async () => {
    const { p } = await open()
    await p.getByText('GitHub').click()
    await p.getByRole('button', { name: 'Product' }).click()
    await p.getByText('GitHub').click({ button: 'middle' })
    await p.getByText('GitHub').click({ button: 'right' })
    await p.getByText('No placement').click()
    const github = { send_to: 'G-64ZQGMNZKB', cta_placement: 'nav', cta_action: 'github', link_url: GITHUB }
    expect(await events(p)).toEqual([
      ['event', 'cta_nav_github', github],
      ['event', 'cta_nav_product_menu', { send_to: 'G-64ZQGMNZKB', cta_placement: 'nav', cta_action: 'product_menu' }],
      ['event', 'cta_nav_github', github],
    ])
  })

  it('the carousel is endless both ways, by the arrows and the keys', async () => {
    const { p } = await open()
    expect(await counter(p)).toBe('01')
    expect(await p.locator('[data-total]').textContent()).toBe('03')
    const next = p.getByRole('button', { name: 'Next customer video' })
    const seen: (string | null)[] = []
    for (let i = 0; i < 3; i++) {
      await next.click()
      seen.push(await counter(p))
    }
    expect(seen).toEqual(['02', '03', '01'])
    await p.locator('.omr-carousel').focus()
    await p.keyboard.press('ArrowLeft')
    expect(await counter(p)).toBe('03')
    await p.keyboard.press('ArrowRight')
    expect(await counter(p)).toBe('01')
    // one active slide, the others and the two clones hidden from assistive technology
    const hidden = await p.locator('.omr-slide').evaluateAll((s) => s.map((e) => e.getAttribute('aria-hidden')))
    expect(hidden).toEqual(['true', 'false', 'true', 'true', 'true'])
  })

  it('keeps focus out of a slide that leaves, and a faded clone brings its slide forward', async () => {
    const { p } = await open()
    await p.locator('.omr-slide.is-active .omr-play').focus()
    await p.keyboard.press('ArrowRight')
    expect(await counter(p)).toBe('02')
    expect(await p.evaluate(() => !!document.activeElement?.closest('[aria-hidden="true"]'))).toBe(false)
    await p.getByRole('button', { name: 'Previous customer video' }).click()
    // the clone of the last slide, faded on the left of the first
    const box = (await p.locator('.omr-slide').first().boundingBox())!
    await p.mouse.click(box.x + box.width - 60, box.y + box.height / 2)
    expect(await counter(p)).toBe('03')
    expect(await p.evaluate(() => !!document.activeElement?.closest('[aria-hidden="true"]'))).toBe(false)
  })

  it('loads the video from youtube-nocookie.com only on a click, and stops it on a move', async () => {
    const { p } = await open()
    expect(await p.locator('iframe').count()).toBe(0)
    await p.locator('.omr-slide.is-active .omr-play').click()
    const frame = p.locator('.omr-slide.is-active iframe')
    expect(await frame.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/xd9YxWFfAoE?autoplay=1&rel=0&playsinline=1',
    )
    expect(await events(p)).toContainEqual([
      'event',
      'cta_stories_play_video',
      { send_to: 'G-64ZQGMNZKB', cta_placement: 'stories', cta_action: 'play_video', video_title: 'Vistula Valley' },
    ])
    await p.getByRole('button', { name: 'Next customer video' }).click()
    expect(await p.locator('iframe').count()).toBe(0)
  })

  it('without JavaScript every slide is shown and links to its video', async () => {
    const { p } = await open({ javaScriptEnabled: false })
    const slides = p.locator('.omr-slide')
    expect(await slides.count()).toBe(3)
    expect(await slides.evaluateAll((s) => s.map((e) => getComputedStyle(e).opacity))).toEqual(['1', '1', '1'])
    expect(await p.locator('.omr-play').evaluateAll((a) => a.map((e) => e.getAttribute('href')))).toEqual([
      'https://www.youtube.com/watch?v=xd9YxWFfAoE',
      'https://www.youtube.com/watch?v=YBV5pNGCCpw',
      'https://www.youtube.com/watch?v=GD2ToD1jmLE',
    ])
    expect(await p.locator('.omr-window').evaluate((e) => getComputedStyle(e).overflowX)).toBe('auto')
    expect(await p.locator('.omr-arrow').first().isVisible()).toBe(false)
    expect(await p.locator('.cookie-banner_component').count()).toBe(0)
  })
})

describe('the browser test', () => {
  it('runs when it is required', () => {
    if (required) expect(chromium.executablePath()).toBeTruthy()
  })
})
