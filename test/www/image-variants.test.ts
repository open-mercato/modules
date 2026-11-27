// Responsive images of the main site (www/image-variants.ts, audit of 27 Nov 2026): the srcset and sizes the build
// writes, the og:image crop, and one run through Astro's own sharp image service on generated images. With
// WWW_BUILD=1 (validate.yml, right after `yarn build:www`) the built /blog is read too.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  astroImageService,
  DEFAULT_SIZES,
  imgSources,
  ogCropSize,
  ogPath,
  ogSource,
  OG_SIZE,
  processImages,
  sizesFor,
  variantPath,
  variantWidths,
  withOgImage,
  withSrcset,
} from '../../www/image-variants.ts'
import { ROOT } from '../emit/helpers.ts'

const ORIGIN = 'https://www.openmercato.com'

describe('srcset and sizes', () => {
  it('varies an image at the widths below its own, then at its own (at most 2000)', () => {
    expect(variantWidths(190)).toEqual([190])
    expect(variantWidths(500)).toEqual([240, 480, 500])
    expect(variantWidths(1600)).toEqual([240, 480, 800, 1200, 1600])
    expect(variantWidths(4271)).toEqual([240, 480, 800, 1200, 1600, 2000])
    expect(variantPath('/media/blog/a b.png', 480)).toBe('/media/blog/a b-480w.webp')
    expect(variantPath('/media/blog/x.webp', 240)).toBe('/media/blog/x-240w.webp')
    expect(ogPath('/media/blog/cover.svg')).toBe('/media/blog/cover-og.jpg')
    // the og crop keeps the 1.91:1 card shape; a small image gives a smaller card, never an enlarged one
    expect(ogCropSize(4271, 3089)).toEqual({ width: 1200, height: 630 })
    expect(ogCropSize(800, 800)).toEqual({ width: 800, height: 420 })
    expect(ogCropSize(1200, 300)).toEqual({ width: 571, height: 300 })
  })

  it('takes sizes from the class: the blog list thumbnails are small, a content image fills the column', () => {
    expect(sizesFor('blog-list_thumbnail')).toBe('(max-width: 479px) 80px, (max-width: 991px) 170px, 190px')
    expect(sizesFor('x case-list_thumbnail')).toBe('(max-width: 991px) 90vw, 560px')
    expect(sizesFor(null)).toBe(DEFAULT_SIZES)
  })

  it('writes srcset and sizes on raster images of /media and /files only, once', () => {
    const html = [
      '<img class="blog-list_thumbnail" src="/media/blog/a.png" alt loading="lazy" decoding="async"/>',
      '<img src="/media/x.jpg" alt="A > B">',
      '<img src="/files/site/logo.svg" alt="">',
      '<img src="/media/y.png" srcset="/media/y.png 1x" alt="">',
      '<img src="https://cdn.example/z.png" alt="">',
      '<img src="/media/tiny.png" alt="">',
    ].join('\n')
    expect(imgSources(html)).toEqual(['/media/blog/a.png', '/media/x.jpg', '/media/tiny.png'])
    const widths = (src: string): number[] | null =>
      src === '/media/tiny.png' ? [120] : src.endsWith('a.png') ? [240, 480, 800] : [240, 300]
    const r = withSrcset(html, widths)
    expect(r.images).toBe(2)
    const lines = r.html.split('\n')
    expect(lines[0]).toBe(
      '<img class="blog-list_thumbnail" src="/media/blog/a.png" alt loading="lazy" decoding="async" srcset="/media/blog/a-240w.webp 240w, /media/blog/a-480w.webp 480w, /media/blog/a-800w.webp 800w" sizes="(max-width: 479px) 80px, (max-width: 991px) 170px, 190px"/>',
    )
    expect(lines[1]).toBe(
      `<img src="/media/x.jpg" alt="A > B" srcset="/media/x-240w.webp 240w, /media/x-300w.webp 300w" sizes="${DEFAULT_SIZES}">`,
    )
    expect(lines.slice(2)).toEqual(html.split('\n').slice(2))
    // a second pass changes nothing
    expect(withSrcset(r.html, widths).images).toBe(0)
  })

  it('moves og:image and twitter:image to the crop and states its size', () => {
    const head =
      `<meta property="og:image" content="${ORIGIN}/media/blog/cover.svg">` +
      `<meta name="twitter:image" content="${ORIGIN}/media/blog/cover.svg">` +
      '<meta property="og:title" content="T">'
    expect(ogSource(head)).toBe('/media/blog/cover.svg')
    expect(ogSource(`<meta property="og:image" content="${ORIGIN}/run/og-default.png">`)).toBeNull()
    const out = withOgImage(head, '/media/blog/cover.svg', '/media/blog/cover-og.jpg')
    expect(out).toBe(
      `<meta property="og:image" content="${ORIGIN}/media/blog/cover-og.jpg">` +
        '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' +
        `<meta name="twitter:image" content="${ORIGIN}/media/blog/cover-og.jpg">` +
        '<meta property="og:title" content="T">',
    )
    // sizes already stated are set, not added twice
    const sized = `<meta property="og:image" content="${ORIGIN}/media/a.jpg"><meta property="og:image:width" content="4271"><meta property="og:image:height" content="3089">`
    expect(withOgImage(sized, '/media/a.jpg', '/media/a-og.jpg')).toBe(
      `<meta property="og:image" content="${ORIGIN}/media/a-og.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`,
    )
  })
})

describe('a build through a stand-in service', () => {
  let tmp: string
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'om-images-'))
  })
  afterEach(() => rmSync(tmp, { recursive: true, force: true }))
  const stub = {
    transform: async () => new Uint8Array([1, 2, 3]),
    metadata: async () => ({ width: 1000, height: 500, format: 'png' }),
  }

  it('refuses two sources that would write the same variant, and skips a source that is no valid encoding', async () => {
    mkdirSync(join(tmp, 'media'))
    for (const f of ['x.png', 'x.jpg']) writeFileSync(join(tmp, 'media', f), 'img')
    writeFileSync(join(tmp, 'a.html'), '<img src="/media/x.png" alt=""><img src="/media/x.jpg" alt="">')
    await expect(processImages(tmp, stub)).rejects.toThrow(
      'om-www-images: /media/x.jpg and /media/x.png would both write /media/x-240w.webp; rename one of them',
    )
    writeFileSync(join(tmp, 'a.html'), '<img src="/media/100%.png" alt="">')
    expect((await processImages(tmp, stub)).images).toBe(0)
  })

  it('states the og size after an og:image tag in any attribute order and quoting', () => {
    const head = `<meta content='${ORIGIN}/media/a.png' property='og:image'><meta name="x" content="y">`
    expect(withOgImage(head, '/media/a.png', '/media/a-og.jpg', { width: 800, height: 420 })).toBe(
      `<meta content="${ORIGIN}/media/a-og.jpg" property='og:image'><meta property="og:image:width" content="800"><meta property="og:image:height" content="420"><meta name="x" content="y">`,
    )
  })
})

describe('a build through the image service', () => {
  let tmp: string
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'om-images-'))
  })
  afterEach(() => rmSync(tmp, { recursive: true, force: true }))

  it('writes the variants, shrinks a large fallback, crops an SVG og:image, and caches the results', async () => {
    const service = await astroImageService()
    // generated images: a wide noisy PNG (a screenshot stand-in), a small one, and an SVG cover
    const rects = Array.from(
      { length: 400 },
      (_, i) =>
        `<rect x="${(i * 37) % 2400}" y="${(i * 53) % 1500}" width="${20 + (i % 60)}" height="${10 + (i % 40)}" fill="#${((i * 2654435761) >>> 8).toString(16).padStart(6, '0').slice(0, 6)}"/>`,
    ).join('')
    const svg = (w: number, h: number, body = ''): Uint8Array =>
      new TextEncoder().encode(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#4a6136"/>${body}</svg>`,
      )
    const grad =
      '<defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="#bc9aff"/><stop offset="1" stop-color="#b4f372"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)" opacity="0.7"/>'
    const wide = await service.transform(svg(2400, 1500, grad + rects), {
      src: 'wide.svg',
      format: 'png',
      quality: 100,
    })
    const small = await service.transform(svg(200, 100), { src: 'small.svg', format: 'png', quality: 100 })
    mkdirSync(join(tmp, 'media', 'blog'), { recursive: true })
    writeFileSync(join(tmp, 'media', 'blog', 'shot.png'), wide)
    writeFileSync(join(tmp, 'media', 'blog', 'small.png'), small)
    writeFileSync(join(tmp, 'media', 'blog', 'cover.svg'), svg(1200, 630))
    mkdirSync(join(tmp, 'blog-posts'))
    writeFileSync(
      join(tmp, 'blog-posts', 'p.html'),
      `<html><head><meta property="og:image" content="${ORIGIN}/media/blog/cover.svg"></head><body>` +
        '<img src="/media/blog/shot.png" alt="Shot"><img src="/media/blog/small.png" alt=""></body></html>',
    )
    const cache = join(tmp, '.cache')
    const site = join(tmp)
    const r = await processImages(site, service, cache)
    expect([r.images, r.variants, r.tags, r.og, r.cached]).toEqual([1, 6, 1, 1, 0])
    for (const w of [240, 480, 800, 1200, 1600, 2000]) {
      const f = join(tmp, 'media', 'blog', `shot-${w}w.webp`)
      expect(existsSync(f), f).toBe(true)
      expect((await service.metadata(readFileSync(f), f)).width).toBe(w)
    }
    expect(existsSync(join(tmp, 'media', 'blog', 'small-200w.webp'))).toBe(false)
    expect(existsSync(join(tmp, 'media', 'blog', 'small-240w.webp'))).toBe(false)
    const og = readFileSync(join(tmp, 'media', 'blog', 'cover-og.jpg'))
    expect(await service.metadata(og, 'og')).toMatchObject({ ...OG_SIZE, format: 'jpg' })
    // the wide PNG is over 2000 px: its fallback is redrawn smaller, in its own format
    const fallback = readFileSync(join(tmp, 'media', 'blog', 'shot.png'))
    expect(fallback.byteLength).toBeLessThan(wide.byteLength)
    expect(await service.metadata(fallback, 'shot')).toMatchObject({ width: 2000, format: 'png' })
    const page = readFileSync(join(tmp, 'blog-posts', 'p.html'), 'utf8')
    expect(page).toContain('srcset="/media/blog/shot-240w.webp 240w,')
    expect(page).toContain('/media/blog/shot-2000w.webp 2000w"')
    expect(page).toContain(`<meta property="og:image" content="${ORIGIN}/media/blog/cover-og.jpg">`)
    expect(page).toContain('<meta property="og:image:width" content="1200">')
    // a second build of the same sources comes from the cache
    writeFileSync(join(tmp, 'media', 'blog', 'shot.png'), wide)
    writeFileSync(
      join(tmp, 'blog-posts', 'p.html'),
      `<html><head><meta property="og:image" content="${ORIGIN}/media/blog/cover.svg"></head><body><img src="/media/blog/shot.png" alt="Shot"></body></html>`,
    )
    const again = await processImages(site, service, cache)
    expect(again.cached).toBe(again.variants + again.og + 1)
  }, 60_000)
})

const DIST = join(ROOT, 'dist-www')
const built = process.env.WWW_BUILD === '1'

describe.runIf(built)('the built main site', () => {
  const read = (f: string): string => readFileSync(join(DIST, f), 'utf8')
  const files = (dir: string, acc: string[] = []): string[] => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) files(p, acc)
      else if (n.endsWith('.html')) acc.push(p)
    }
    return acc
  }

  it('/blog gives every raster thumbnail a srcset whose files exist', () => {
    const html = read('blog.html')
    const tags = html.match(/<img\b[^>]*class="blog-list_thumbnail"[^>]*>/g) ?? []
    expect(tags.length).toBeGreaterThan(0)
    for (const t of tags) {
      if (!/src="\/media\/[^"]*\.(?:png|jpe?g|webp)"/i.test(t)) continue
      const srcset = /srcset="([^"]*)"/.exec(t)?.[1]
      expect(srcset, t).toBeDefined()
      for (const c of srcset!.split(', ')) expect(existsSync(join(DIST, c.split(' ')[0]!)), c).toBe(true)
    }
  })

  it('no page names an SVG, or a missing file, as og:image', () => {
    for (const f of files(DIST)) {
      const og = /<meta property="og:image" content="([^"]*)"/.exec(readFileSync(f, 'utf8'))?.[1]
      if (!og) continue
      expect(og, f).not.toMatch(/\.svg$/i)
      const path = new URL(og).pathname
      if (path.startsWith('/media/')) expect(existsSync(join(DIST, path)), `${f} ${og}`).toBe(true)
    }
  })
})
