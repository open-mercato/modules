// One-off render of site/public/og-default.png, 1200x630 (spec 7.12): black, a faint hex lattice (kept off the
// Hive, which draws its own), wordmark + MODULES chip, "Extend everything.", the gradient rule, and the Hive of
// today's catalog on the right. Committed; rerun with `node scripts/og-default.ts` after a visual change.
// Uses takumi-js (no browser), fonts from the geist package.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from 'takumi-js'
import { Renderer } from 'takumi-js/node'
import { renderHive } from '../lib/hive/render.ts'
import { galleryHive } from '../site/src/lib/dev/fixtures.ts'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string): Buffer => readFileSync(join(ROOT, p))
const fontDir = 'node_modules/geist/dist/fonts'
const fonts = [
  { name: 'Geist', data: read(`${fontDir}/geist-sans/Geist-Regular.ttf`), weight: 400 },
  { name: 'Geist', data: read(`${fontDir}/geist-sans/Geist-Medium.ttf`), weight: 500 },
  { name: 'Geist Mono', data: read(`${fontDir}/geist-mono/GeistMono-Regular.ttf`), weight: 400 },
]

/** The same Hive as the gallery hero: spec 11.1 entries and the 46 core modules of @open-mercato/cli 0.9.0, wedges
 * from policy/categories.yml (through galleryHive). */
function hiveSvg(): string {
  return renderHive(galleryHive(), { labels: false })
}

const svgUri = (svg: string): string => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
const wordmark = readFileSync(join(ROOT, 'site/src/components/assets/open-mercato-wordmark.svg'), 'utf8')
  .replace(/currentColor/g, '#FAFAFA')
  .replace('<svg ', '<svg width="188" height="48" ')
const lattice = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><pattern id="h" width="28" height="48.5" patternUnits="userSpaceOnUse"><path d="M14 0v8.1L0 16.2v16.1l14 8.1 14-8.1V16.2L14 8.1M14 40.4v8.1" fill="none" stroke="#1A1A1A" stroke-width="1"/></pattern><linearGradient id="f" x1="0" x2="1"><stop offset="0" stop-color="#0C0C0C" stop-opacity="1"/><stop offset=".55" stop-color="#0C0C0C" stop-opacity=".2"/><stop offset="1" stop-color="#0C0C0C" stop-opacity="0"/></linearGradient><radialGradient id="p" cx="892" cy="315" r="300" gradientUnits="userSpaceOnUse"><stop offset=".8" stop-color="#0C0C0C" stop-opacity="1"/><stop offset="1" stop-color="#0C0C0C" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="630" fill="url(#h)"/><rect width="1200" height="630" fill="url(#f)"/><rect width="1200" height="630" fill="url(#p)"/></svg>`
const hive = hiveSvg()
  .replace('<svg ', '<svg width="560" height="560" ')
  .replace(/<a [^>]*>/g, '')
  .replace(/<\/a>/g, '')
  .replace(/<title>[^<]*<\/title>/g, '')

const html = `
<div style="width:1200px;height:630px;display:flex;position:relative;background:#0C0C0C;font-family:Geist;color:#FAFAFA">
  <img src="${svgUri(lattice)}" width="1200" height="630" style="position:absolute;left:0;top:0" />
  <img src="${svgUri(hive)}" width="560" height="560" style="position:absolute;right:28px;top:35px" />
  <div style="display:flex;flex-direction:column;justify-content:space-between;padding:72px 0 72px 80px;width:700px;height:630px;position:relative">
    <div style="display:flex;align-items:center;gap:16px">
      <img src="${svgUri(wordmark)}" width="188" height="48" />
      <div style="display:flex;padding:5px 12px 5px 13px;background:#B4F372;color:#0C0C0C;font-family:'Geist Mono';font-size:18px;letter-spacing:1.5px;clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))">MODULES</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:22px">
      <div style="font-family:'Geist Mono';font-size:18px;letter-spacing:2px;color:#9E9E9E">// PROOF, NOT PROMISES</div>
      <div style="font-size:92px;line-height:1;letter-spacing:-3.7px">Extend everything.</div>
      <div style="font-size:24px;line-height:1.4;color:#9E9E9E;width:590px">Start with 80% done. Every module here is read from its published code, and every installable one goes into a fresh Open Mercato app on each release line.</div>
    </div>
    <div style="width:520px;height:4px;background-image:linear-gradient(90deg,#BC9AFF,#EEFB63 50%,#B4F372)"></div>
  </div>
</div>`

const renderer = new Renderer()
for (const f of fonts) await renderer.registerFont(f)
const png = await render(html, { renderer, width: 1200, height: 630, format: 'png' })
const out = join(ROOT, 'site/public/og-default.png')
writeFileSync(out, png)
console.log(`og-default: ${out} (${png.byteLength} bytes)`)
