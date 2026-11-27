// Responsive images of the main site (audit of 27 Nov 2026: /blog loaded about 26 MB of thumbnails without srcset, 25
// images over 500 KB). A build step and not a component: the images arrive with the importer as files of www/public
// (/media/..., /files/...) and many components and Markdown bodies render them, so the build reads the pages it wrote.
// When the build is done (astro:build:done), for every raster `<img>` of the main site's pages under /media/ or /files/:
// - webp variants at VARIANT_WIDTHS below the image's own width, and one at its width (at most MAX_WIDTH), next to the
//   file (`/media/blog/x.png` gets `/media/blog/x-480w.webp`), and the tag gets `srcset` and `sizes` (sizesFor());
// - the file itself stays the `src`, the fallback for a browser without srcset, recompressed in its own format when it
//   is large (RECOMPRESS_BYTES) or wide (MAX_WIDTH), and kept only when that makes it smaller;
// - an og:image of the main site that is not a raster 1200 by 630 under OG_MAX_BYTES (an SVG cover, a photo of another
//   shape, a 3 MB original) gets a 1200 by 630 JPEG crop (`x-og.jpg`), named in og:image, twitter:image and the size.
// The images are drawn by Astro's own image service (astro/assets/services/sharp), so nothing joins the dependencies.
// Results are cached by content in node_modules/.cache/om-www-images, so a second local build reuses them.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'
import sharpService from 'astro/assets/services/sharp'
import { imageMetadata } from 'astro/assets/utils'
import pLimit from 'p-limit'
import { MAIN_SITE_ORIGIN } from '../lib/core/main-site.ts'

/** Widths of the webp variants, in pixels: a 190 px thumbnail at 2x takes 480, a full-width screenshot 1600. */
export const VARIANT_WIDTHS = [240, 480, 800, 1200, 1600] as const
/** No variant and no fallback wider than this. */
export const MAX_WIDTH = 2000
/** A fallback larger than this is recompressed in its own format. */
export const RECOMPRESS_BYTES = 300 * 1024
/** The og:image card: its size, and the largest file kept as it is. */
export const OG_SIZE = { width: 1200, height: 630 } as const
export const OG_MAX_BYTES = 1024 * 1024
/** Encoder quality of the variants, the recompressed files and the og crops. */
export const QUALITY = 80

/** A raster image of the main site that the build may vary: a site path under /media/ or /files/. */
const RASTER = /^\/(?:media|files)\/[^?#"'<>\s]+\.(?:png|jpe?g|webp)$/i
/** The same, or an SVG, as an og:image may name it (absolute on the main site, or a site path). */
const OG_SOURCE = /^\/(?:media|files)\/[^?#"'<>\s]+\.(?:png|jpe?g|webp|svg)$/i

/**
 * `sizes` per class of the main site's images, from their rendered widths at 375 to 1440 px (audit of 27 Nov 2026):
 * the blog list thumbnails are 80 to 190 px, the case-study cards and content images up to about the column width.
 */
export const IMG_SIZES: Readonly<Record<string, string>> = {
  'blog-list_thumbnail': '(max-width: 479px) 80px, (max-width: 991px) 170px, 190px',
  'case-list_thumbnail': '(max-width: 991px) 90vw, 560px',
  'border-grid_team-image': '112px',
  'agencies_card-logo': '210px',
  agency_logo: '120px',
  asset_image: '(max-width: 991px) 90vw, 1100px',
}
/** `sizes` of any other image: a content image, at most the width of the text column. */
export const DEFAULT_SIZES = '(max-width: 991px) 90vw, 860px'

/** The `sizes` of an image by its class attribute: the first class IMG_SIZES knows, else DEFAULT_SIZES. */
export function sizesFor(className: string | null): string {
  for (const c of (className ?? '').split(/\s+/)) if (IMG_SIZES[c]) return IMG_SIZES[c]
  return DEFAULT_SIZES
}

/** The widths of the variants of an image `width` pixels wide: the VARIANT_WIDTHS below it, then its own (capped). */
export function variantWidths(width: number): number[] {
  const own = Math.min(width, MAX_WIDTH)
  return [...VARIANT_WIDTHS.filter((w) => w < own), own]
}

/** The site path of the webp variant of `src` at `width`: `/media/blog/x.png` at 480 is `/media/blog/x-480w.webp`. */
export function variantPath(src: string, width: number): string {
  return `${src.replace(/\.[^./]+$/, '')}-${width}w.webp`
}

/**
 * The size of the og crop of an image `width` by `height`: OG_SIZE, or the largest size of that shape the image covers
 * (the image service never enlarges), so the card keeps the 1.91:1 shape social sites show.
 */
export function ogCropSize(width: number, height: number): { width: number; height: number } {
  const k = Math.min(1, width / OG_SIZE.width, height / OG_SIZE.height)
  return { width: Math.round(OG_SIZE.width * k), height: Math.round(OG_SIZE.height * k) }
}

/** The site path of the og crop of `src`: `/media/blog/x.svg` is `/media/blog/x-og.jpg`. */
export function ogPath(src: string): string {
  return `${src.replace(/\.[^./]+$/, '')}-og.jpg`
}

/** An `<img>` start tag, quoted values holding `>` included. */
const IMG_TAG = /<img\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi
/** One attribute of a tag, quoted or not. */
const ATTR = /\s([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g

function attr(tag: string, name: string): string | null {
  for (const m of tag.matchAll(ATTR)) if ((m[1] ?? '').toLowerCase() === name) return m[2] ?? m[3] ?? m[4] ?? ''
  return null
}

const escapeAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

/** The raster sources under /media/ or /files/ of the `<img>` tags of `html` that have no srcset yet. */
export function imgSources(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(IMG_TAG)) {
    const src = attr(m[0], 'src')
    if (src && RASTER.test(src) && attr(m[0], 'srcset') === null) out.push(src)
  }
  return out
}

/**
 * `html` with `srcset` and `sizes` on every `<img>` whose source `widths` knows (the variant widths of that source, the
 * last one its own width, written as the webp variants), and how many tags changed. A tag with a srcset of its own, a
 * source of another kind, and a source with one variant only are left as they are.
 */
export function withSrcset(html: string, widths: (src: string) => number[] | null): { html: string; images: number } {
  let images = 0
  const out = html.replace(IMG_TAG, (tag) => {
    const src = attr(tag, 'src')
    if (!src || !RASTER.test(src) || attr(tag, 'srcset') !== null) return tag
    const ws = widths(src)
    if (!ws || ws.length < 2) return tag
    images++
    const srcset = ws.map((w) => `${variantPath(src, w)} ${w}w`).join(', ')
    const sizes = attr(tag, 'sizes') === null ? ` sizes="${escapeAttr(sizesFor(attr(tag, 'class')))}"` : ''
    const end = tag.endsWith('/>') ? tag.length - 2 : tag.length - 1
    return `${tag.slice(0, end).trimEnd()} srcset="${escapeAttr(srcset)}"${sizes}${tag.slice(end)}`
  })
  return { html: images > 0 ? out : html, images }
}

/** A `<meta>` start tag. */
const META_TAG = /<meta\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi

/** The site path of an og:image value on the main site (`https://www.openmercato.com/media/x.png` or `/media/x.png`). */
export function ogSourcePath(value: string): string | null {
  const path = value.startsWith(`${MAIN_SITE_ORIGIN}/`) ? value.slice(MAIN_SITE_ORIGIN.length) : value
  return OG_SOURCE.test(path) ? path : null
}

/** The og:image of `html` as a site path of the main site, or null. */
export function ogSource(html: string): string | null {
  for (const m of html.matchAll(META_TAG))
    if (attr(m[0], 'property') === 'og:image') return ogSourcePath(attr(m[0], 'content') ?? '')
  return null
}

/**
 * `html` with its og:image and twitter:image moved from `from` to `to` (site paths of the main site, written absolute
 * as the page wrote them), and og:image:width and og:image:height set to `size` (added after og:image when missing).
 */
export function withOgImage(
  html: string,
  from: string,
  to: string,
  size: { width: number; height: number } = OG_SIZE,
): string {
  let sawWidth = false
  let sawHeight = false
  const swap = (v: string): string =>
    v === `${MAIN_SITE_ORIGIN}${from}` ? `${MAIN_SITE_ORIGIN}${to}` : v === from ? to : v
  let out = html.replace(META_TAG, (tag) => {
    const key = attr(tag, 'property') ?? attr(tag, 'name')
    const content = attr(tag, 'content')
    if (content === null) return tag
    const set = (v: string): string =>
      tag.replace(/(\scontent\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s"'>]+)/i, `$1"${escapeAttr(v)}"`)
    if (key === 'og:image' || key === 'twitter:image') return set(swap(content))
    if (key === 'og:image:width') {
      sawWidth = true
      return set(String(size.width))
    }
    if (key === 'og:image:height') {
      sawHeight = true
      return set(String(size.height))
    }
    return tag
  })
  const add = [
    sawWidth ? '' : `<meta property="og:image:width" content="${size.width}">`,
    sawHeight ? '' : `<meta property="og:image:height" content="${size.height}">`,
  ].join('')
  if (add !== '') out = out.replace(/<meta\s+property="og:image"[^>]*>/i, (m) => `${m}${add}`)
  return out
}

/** What a transform of the image service gives: the bytes and the format. */
export type Transform = (
  input: Uint8Array,
  options: { src: string; width?: number; height?: number; fit?: 'cover'; format: string; quality: number },
) => Promise<Uint8Array>

/** The image's width, height and format, as Astro reads them. */
export type Metadata = (input: Uint8Array, src: string) => Promise<{ width: number; height: number; format: string }>

/** The transform and metadata of Astro's sharp image service. */
export async function astroImageService(): Promise<{ transform: Transform; metadata: Metadata }> {
  // imported at the top: the config's module runner is closed by the time astro:build:done runs
  const service = sharpService
  const config = { service: { entrypoint: 'astro/assets/services/sharp', config: {} }, dangerouslyProcessSVG: true }
  const logger = { warn: (m: string) => console.warn(`om-www-images: ${m}`) }
  return {
    transform: async (input, options) => {
      const r = await (service.transform as (...a: unknown[]) => Promise<{ data: Uint8Array }>)(
        input,
        options,
        config,
        logger,
      )
      return r.data
    },
    metadata: async (input, src) => {
      const m = await imageMetadata(input, src)
      return { width: m.width, height: m.height, format: m.format }
    },
  }
}

/** A cache of transform results by the input's content and the options, in `dir` (none when null). */
function cached(dir: string | null, transform: Transform): { run: Transform; hits: () => number } {
  let hits = 0
  return {
    hits: () => hits,
    run: async (input, options) => {
      if (dir === null) return transform(input, options)
      const key = createHash('sha256')
        .update(input)
        .update(JSON.stringify({ ...options, src: undefined }))
        .digest('hex')
      const file = join(dir, key.slice(0, 2), key)
      if (existsSync(file)) {
        hits++
        return readFileSync(file)
      }
      const data = await transform(input, options)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, data)
      return data
    },
  }
}

function walkHtml(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkHtml(p, acc)
    else if (name.endsWith('.html')) acc.push(p)
  }
  return acc
}

export interface ImageResult {
  /** Source images varied, variants written, img tags given a srcset, og crops written, results from the cache. */
  images: number
  variants: number
  tags: number
  og: number
  cached: number
  /** Bytes of the fallback files before and after recompression. */
  before: number
  after: number
}

const formatOf = (src: string): string => {
  const ext = (/\.([^.]+)$/.exec(src)?.[1] ?? '').toLowerCase()
  return ext === 'jpg' ? 'jpeg' : ext
}

/**
 * Writes the variants, the recompressed fallbacks and the og crops into the built site `root` and rewrites its pages
 * (withSrcset, withOgImage). `cacheDir` keeps the results between builds (null: no cache).
 */
export async function processImages(
  root: string,
  service: { transform: Transform; metadata: Metadata },
  cacheDir: string | null = null,
): Promise<ImageResult> {
  const pages = walkHtml(root)
  const html = new Map(pages.map((f) => [f, readFileSync(f, 'utf8')]))
  const sources = new Set<string>()
  const ogs = new Set<string>()
  for (const text of html.values()) {
    for (const s of imgSources(text)) sources.add(s)
    const og = ogSource(text)
    if (og) ogs.add(og)
  }
  const { run, hits } = cached(cacheDir, service.transform)
  const limit = pLimit(4)
  const widths = new Map<string, number[]>()
  const ogTo = new Map<string, { path: string; size: { width: number; height: number } }>()
  const r: ImageResult = { images: 0, variants: 0, tags: 0, og: 0, cached: 0, before: 0, after: 0 }
  const file = (src: string): string => join(root, decodeURIComponent(src))
  // the originals as built, before any recompression: variants and og crops are drawn from them
  const original = new Map<string, Uint8Array>()
  const read = (src: string): Uint8Array | null => {
    if (!original.has(src)) {
      const f = file(src)
      if (!existsSync(f)) return null
      original.set(src, readFileSync(f))
    }
    return original.get(src) ?? null
  }

  await Promise.all(
    [...ogs].map((src) =>
      limit(async () => {
        const input = read(src)
        if (!input) return
        const m = await service.metadata(input, src)
        const fits =
          m.format !== 'svg' &&
          m.width === OG_SIZE.width &&
          m.height === OG_SIZE.height &&
          input.byteLength <= OG_MAX_BYTES
        if (fits) return
        const size = ogCropSize(m.width, m.height)
        const data = await run(input, { src, ...size, fit: 'cover', format: 'jpeg', quality: QUALITY })
        writeFileSync(file(ogPath(src)), data)
        ogTo.set(src, { path: ogPath(src), size })
        r.og++
      }),
    ),
  )
  await Promise.all(
    [...sources].map((src) =>
      limit(async () => {
        const input = read(src)
        if (!input) return
        const m = await service.metadata(input, src)
        const ws = variantWidths(m.width)
        if (ws.length < 2) return
        for (const w of ws) {
          const out = file(variantPath(src, w))
          writeFileSync(out, await run(input, { src, width: w, format: 'webp', quality: QUALITY }))
          r.variants++
        }
        widths.set(src, ws)
        r.images++
        r.before += input.byteLength
        if (input.byteLength > RECOMPRESS_BYTES || m.width > MAX_WIDTH) {
          const smaller = await run(input, {
            src,
            width: Math.min(m.width, MAX_WIDTH),
            format: formatOf(src),
            quality: QUALITY,
          })
          if (smaller.byteLength < input.byteLength) {
            writeFileSync(file(src), smaller)
            r.after += smaller.byteLength
            return
          }
        }
        r.after += input.byteLength
      }),
    ),
  )
  for (const [f, text] of html) {
    const next = withSrcset(text, (src) => widths.get(src) ?? null)
    let out = next.html
    r.tags += next.images
    const og = ogSource(out)
    const to = og ? ogTo.get(og) : undefined
    if (og && to) out = withOgImage(out, og, to.path, to.size)
    if (out !== text) writeFileSync(f, out)
  }
  r.cached = hits()
  return r
}

/** Astro integration of the main site: processImages() on the built pages, with the cache of node_modules. */
export function imageVariants(): AstroIntegration {
  const cacheDir = fileURLToPath(new URL('../node_modules/.cache/om-www-images/', import.meta.url))
  return {
    name: 'om-www-images',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const r = await processImages(fileURLToPath(dir), await astroImageService(), cacheDir)
        const mb = (n: number): string => (n / 1024 / 1024).toFixed(1)
        logger.info(
          `${r.images} images: ${r.variants} webp variants (${r.cached} from the cache), srcset on ${r.tags} img tags, ${r.og} og:image crops, fallbacks ${mb(r.before)} MB to ${mb(r.after)} MB`,
        )
      },
    },
  }
}
