// Screenshots of the design gallery (WP11): light and dark, 1440 and 390 px, full page and one PNG per section.
// Not in CI. Build on real data first (the gallery renders site/.generated when it exists):
//   yarn om emit --data .data && OM_DEV_GALLERY=1 yarn astro build
//   lockf -k /tmp/om-shots.lock node test/design/shots/gallery-shots.mjs     # one browser at a time
// Starts `astro preview` itself unless GALLERY_URL is set. Output: .wp/shots/ (git-ignored locally).
// A build with BASE_PATH needs the same BASE_PATH here (default /, the domain root).
// Env: SHOTS_DIR, ONLY (section ids, comma separated), THEMES (light,dark), WIDTHS (1440,390), FULL=0 (no full page).
import { spawn, spawnSync } from 'node:child_process'
import { connect } from 'node:net'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const OUT = process.env.SHOTS_DIR ?? '.wp/shots'
const PORT = Number(process.env.PORT ?? 4329)
// the base path the site was built with, as in test/e2e/env.ts: '' at the domain root (the default since 28 Oct)
const base = ('/' + (process.env.BASE_PATH ?? '/').replace(/^\/+|\/+$/g, '')).replace(/^\/$/, '')
const url = process.env.GALLERY_URL ?? `http://127.0.0.1:${PORT}${base}/_dev/gallery`
const only = process.env.ONLY ? process.env.ONLY.split(',') : null
const themes = (process.env.THEMES ?? 'light,dark').split(',')
const widths = (process.env.WIDTHS ?? '1440,390').split(',').map(Number)
const full = process.env.FULL !== '0'
mkdirSync(OUT, { recursive: true })

let server
if (!process.env.GALLERY_URL) {
  server = spawn(
    join('node_modules', '.bin', 'astro'),
    ['preview', '--port', String(PORT), '--host', '127.0.0.1', '--force'],
    {
      stdio: ['ignore', 'pipe', 'inherit'],
      detached: true,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
    },
  )
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('preview did not start')), 60_000)
    server.stdout.on('data', (b) => {
      if (String(b).includes(String(PORT))) {
        clearTimeout(t)
        resolve()
      }
    })
  })
}

const report = []
const browser = await chromium.launch()
try {
  for (const theme of themes) {
    for (const width of widths) {
      const ctx = await browser.newContext({
        viewport: { width, height: width > 500 ? 900 : 844 },
        deviceScaleFactor: width > 500 ? 1 : 2,
        colorScheme: theme,
        reducedMotion: 'reduce',
      })
      const page = await ctx.newPage()
      await page.addInitScript((t) => {
        try {
          localStorage.setItem('om-theme', t)
        } catch {}
      }, theme)
      await page.goto(url, { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      const tag = `${theme}-${width}`
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      console.log(`${tag}: horizontal overflow ${overflow}px`)
      report.push(`${tag}: horizontal overflow ${overflow}px`)
      if (overflow > 0) {
        const wide = await page.evaluate(() => {
          const out = []
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect()
            if (r.right > window.innerWidth + 1 && r.width > 0) {
              const parent = el.parentElement?.getBoundingClientRect()
              if (!parent || parent.right <= window.innerWidth + 1)
                out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} right=${Math.round(r.right)}`)
            }
          }
          return out.slice(0, 15)
        })
        report.push(...wide.map((w) => `  ${w}`))
      }
      // touch targets on phones (spec 7.10): every visible control at least 44 x 44 px, inline text links excepted
      if (width < 768) {
        const small = await page.evaluate(() => {
          const out = []
          for (const el of document.querySelectorAll(
            'main a[href], main button, main summary, main input, main select, header a[href], header button, header summary, footer a[href], footer button',
          )) {
            const r = el.getBoundingClientRect()
            const cs = getComputedStyle(el)
            if (!r.width || !r.height || cs.visibility === 'hidden') continue
            if (el.closest('[aria-hidden="true"]') || el.getAttribute('tabindex') === '-1') continue
            // a checkbox inside its label: the label is the target
            if (el.tagName === 'INPUT' && el.closest('label')) {
              const lr = el.closest('label').getBoundingClientRect()
              if (lr.width >= 44 && lr.height >= 44) continue
            }
            // a stretched link (::after over the whole card) is as large as its card
            if (
              getComputedStyle(el, '::after').position === 'absolute' &&
              getComputedStyle(el, '::after').content !== 'none'
            )
              continue
            // a link inside running text is exempt (WCAG 2.5.8 inline exception)
            if (
              el.tagName === 'A' &&
              cs.display === 'inline' &&
              el.parentElement &&
              /^(P|LI|DD|SPAN)$/.test(el.parentElement.tagName)
            )
              continue
            if (r.width < 44 || r.height < 44)
              out.push(
                `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ${Math.round(r.width)}x${Math.round(r.height)} "${(el.textContent ?? '').trim().slice(0, 30)}"`,
              )
          }
          return out
        })
        const uniq = [...new Set(small)]
        report.push(`${tag}: ${uniq.length} touch targets under 44 px`)
        report.push(...uniq.map((w) => `  ${w}`))
        console.log(`${tag}: ${uniq.length} touch targets under 44 px`)
      }
      if (full) await page.screenshot({ path: join(OUT, `gallery-${tag}-full.png`), fullPage: true })
      await page.addStyleTag({ content: '.site-header{position:static !important}' })
      const ids = await page.$$eval('main > section[id], main > .band[id]', (els) => els.map((e) => e.id))
      for (const [name, sel] of [
        ['site-header', '.site-header'],
        ['site-footer', '.site-footer'],
      ]) {
        if (only && !only.includes(name)) continue
        const el = page.locator(sel).first()
        if (await el.count()) await el.screenshot({ path: join(OUT, `${tag}-${name}.png`) })
      }
      for (const id of ids) {
        if (only && !only.includes(id)) continue
        const el = page.locator(`#${id}`)
        await el.screenshot({ path: join(OUT, `${tag}-${id}.png`) })
      }
      await ctx.close()
    }
  }
  // DataStamp in a real browser: a page built while data was fresh and opened 3 days later shows the banner;
  // opened 1 h after the night it does not, although the gallery also holds a stale demo stamp.
  if (!only) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const probe = await ctx.newPage()
    await probe.goto(url, { waitUntil: 'domcontentloaded' })
    const nightly = await probe.$eval('.stamp[data-primary]', (el) => el.getAttribute('data-nightly'))
    await probe.close()
    if (!nightly)
      report.push('stale check: skipped, the data has no nightly run yet (test/design/freshness.test.ts covers it)')
    for (const [hours, expectShown] of nightly
      ? [
          [72, true],
          [1, false],
        ]
      : []) {
      const page = await ctx.newPage()
      await page.clock.install({ time: Date.parse(nightly) + hours * 3_600_000 })
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      const shown = await page.$eval('#stale-banner', (el) => !el.hidden)
      const dot = await page.$eval('.stamp[data-primary]', (el) => el.classList.contains('is-stale'))
      const line = `stale check +${hours}h: banner ${shown ? 'shown' : 'hidden'}, header dot ${dot ? 'yellow' : 'green'} (${shown === expectShown && dot === expectShown ? 'ok' : 'FAIL'})`
      console.log(line)
      report.push(line)
      if (hours === 72) await page.locator('.site-header').screenshot({ path: join(OUT, 'stale-72h-header.png') })
      if (hours === 72) await page.locator('#stale-banner').screenshot({ path: join(OUT, 'stale-72h-banner.png') })
      await page.close()
    }
    await ctx.close()
  }
} finally {
  await browser.close()
  if (server) {
    try {
      process.kill(-server.pid, 'SIGTERM')
    } catch {
      // the preview group already exited
    }
    // Astro 7 may hand the server to a background process with a lock file (`Preview server already running`),
    // which the process group kill does not reach: stop it through the CLI, then check the port is free.
    spawnSync(join('node_modules', '.bin', 'astro'), ['preview', 'stop'], { stdio: 'ignore' })
    const listening = () =>
      new Promise((resolve) => {
        const sock = connect(PORT, '127.0.0.1')
        sock.once('connect', () => (sock.destroy(), resolve(true)))
        sock.once('error', () => resolve(false))
      })
    let busy = true
    for (let i = 0; i < 20 && busy; i++) {
      busy = await listening()
      if (busy) await new Promise((r) => setTimeout(r, 250))
    }
    const line = `preview server on port ${PORT}: ${busy ? 'STILL RUNNING' : 'stopped'}`
    console.log(line)
    report.push(line)
  }
  writeFileSync(join(OUT, 'report.txt'), `${report.join('\n')}\n`)
}
