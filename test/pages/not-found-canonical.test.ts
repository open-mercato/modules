// The 404 page (live review of 30 Oct, item 14): Cloudflare Pages serves 404.html for every missing address, and its
// canonical and og:url pointed every such address at /404, a page that answers 200 at its own address. A page that
// stands in for a missing address names no address of its own: the 404 page has neither tag, and stays noindex.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROOT } from '../emit/helpers.ts'

const read = (...p: string[]): string => readFileSync(join(ROOT, 'site', 'src', ...p), 'utf8')
const base = read('layouts', 'Base.astro')
const notFound = read('pages', '404.astro')

describe('canonical address of the 404 page', () => {
  it('the layout writes canonical and og:url only when the page has an address', () => {
    expect(base).toContain('{canonical && <link rel="canonical" href={canonical} />}')
    expect(base).toContain('{canonical && <meta property="og:url" content={canonical} />}')
    expect(base).toMatch(/const canonical = path === null \? null : absoluteUrl\(site, path\)/)
  })

  it('the 404 page passes no path and keeps noindex', () => {
    expect(notFound).toMatch(/\n\s+path=\{null\}\n/)
    expect(notFound).toMatch(/\n\s+noindex\n/)
  })
})
