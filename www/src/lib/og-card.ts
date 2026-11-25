// The OG image of a landing (spec, SEO: a 1200 by 630 image per page from one template, drawn at build with
// takumi-js), in the landings' look until the designer's template (D7): the landing's light page, the wordmark, the
// eyebrow in the landings' green, the hero title, and the gradient rule of the site. Node: reads the fonts of the
// geist package and the wordmark of the catalog.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { render } from 'takumi-js'
import { Renderer } from 'takumi-js/node'

export const OG_WIDTH = 1200
export const OG_HEIGHT = 630

const root = (p: string): string => fileURLToPath(new URL(`../../../${p}`, import.meta.url))
const fontDir = 'node_modules/geist/dist/fonts'
/**
 * The family name the card's fonts are registered under. Not `Geist`: takumi embeds a Geist of its own, Latin only,
 * which wins over a font registered under the same name and draws no ń or ł (the Polish landing's title).
 */
export const OG_FONT_FAMILY = 'OG Geist'

let renderer: Promise<Renderer> | undefined
function fontsLoaded(): Promise<Renderer> {
  renderer ??= (async () => {
    const r = new Renderer()
    for (const f of [
      { name: OG_FONT_FAMILY, file: `${fontDir}/geist-sans/Geist-Regular.ttf`, weight: 400 },
      { name: OG_FONT_FAMILY, file: `${fontDir}/geist-sans/Geist-Medium.ttf`, weight: 500 },
    ])
      await r.registerFont({ name: f.name, data: readFileSync(root(f.file)), weight: f.weight })
    return r
  })()
  return renderer
}

const escape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const svgUri = (svg: string): string => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

let wordmark: string | undefined

/** The HTML of the card, for takumi (flex layout, inline styles). */
export function ogCardHtml(card: { eyebrow: string; title: string }): string {
  wordmark ??= readFileSync(root('site/src/components/assets/open-mercato-wordmark.svg'), 'utf8')
    .replace(/currentColor/g, '#151713')
    .replace('<svg ', '<svg width="188" height="48" ')
  const size = card.title.length > 70 ? 60 : card.title.length > 45 ? 70 : 80
  return `
<div style="width:${OG_WIDTH}px;height:${OG_HEIGHT}px;display:flex;flex-direction:column;justify-content:space-between;background:#fafaf7;font-family:'${OG_FONT_FAMILY}';color:#151713;padding:72px 80px">
  <img src="${svgUri(wordmark)}" width="188" height="48" />
  <div style="display:flex;flex-direction:column;gap:26px">
    <div style="font-size:26px;font-weight:500;color:#4a6136">${escape(card.eyebrow)}</div>
    <div style="font-size:${size}px;line-height:1.05;letter-spacing:-0.05em;width:1000px">${escape(card.title)}</div>
  </div>
  <div style="width:520px;height:6px;background-image:linear-gradient(90deg,#BC9AFF,#EEFB63 50%,#B4F372)"></div>
</div>`
}

/** The card as a PNG. */
export async function ogCardPng(card: { eyebrow: string; title: string }): Promise<Uint8Array> {
  return render(ogCardHtml(card), { renderer: await fontsLoaded(), width: OG_WIDTH, height: OG_HEIGHT, format: 'png' })
}
