// A preview build opened days later (review r6, P0): the clock of the browser is frozen at 27 Oct, four days after
// the preview run of 23 Oct. The STALE DATA banner must stay hidden on every page and the header stamp must read
// `Preview <day>` with no hour and no stale dot, because no nightly run exists to be late. A CI build (dataAsOf
// source `ci`) still turns stale after 48 h; this script checks the preview build only.
// Not in CI (Playwright runs on Cezar or locally under the shots lock). Build on preview data first:
//   yarn om emit --data <copy of the preview .data> && astro build
//   lockf -k /tmp/om-shots.lock node test/design/shots/preview-clock.mjs dist
// Exit code 1 when a page shows the banner or a stale stamp.
import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const dist = resolve(process.argv[2] ?? 'dist')
const now = new Date(process.env.CLOCK ?? '2026-10-27T10:00:00Z')
const PORT = Number(process.env.PORT ?? 4996)
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}
const meta = JSON.parse(readFileSync(join(dist, 'modules.json'), 'utf8'))
if (meta.dataAsOf?.source !== 'preview') {
  console.error(`preview-clock: ${dist} is not a preview build (dataAsOf.source = ${meta.dataAsOf?.source})`)
  process.exit(2)
}
const server = createServer((req, res) => {
  let u = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
  u = u.replace(/^\/modules/, '') || '/'
  const cands = u.endsWith('/') ? [`${u}index.html`] : [u, `${u}.html`, `${u}/index.html`]
  for (const c of cands) {
    const f = join(dist, c)
    if (existsSync(f) && statSync(f).isFile()) {
      res.writeHead(200, { 'content-type': types[extname(f)] ?? 'application/octet-stream' })
      return res.end(readFileSync(f))
    }
  }
  res.writeHead(404)
  res.end()
}).listen(PORT)

const first = meta.entries.find((e) => e.listed)
const pages = ['/', '/compat', '/radar', '/about', ...(first ? [`/m/${first.path}`] : [])]
const failures = []
const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.clock.setFixedTime(now)
  for (const p of pages) {
    await page.goto(`http://localhost:${PORT}/modules${p}`, { waitUntil: 'networkidle' })
    const state = await page.evaluate(() => {
      const banner = document.getElementById('stale-banner')
      const stamp = document.querySelector('.stamp[data-primary]')
      return {
        bannerHidden: banner ? banner.hidden : true,
        stale: document.querySelectorAll('.stamp.is-stale').length,
        stamp: stamp?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      }
    })
    const ok = state.bannerHidden && state.stale === 0 && /^Preview \d{1,2} [A-Z][a-z]{2}$/.test(state.stamp)
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${p} banner hidden=${state.bannerHidden} stale stamps=${state.stale} stamp="${state.stamp}"`,
    )
    if (!ok) failures.push(p)
  }
} finally {
  await browser.close()
  server.close()
}
if (failures.length) {
  console.error(`preview-clock: ${failures.length} page(s) failed at ${now.toISOString()}`)
  process.exit(1)
}
