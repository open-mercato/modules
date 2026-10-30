// Cloudflare Email Obfuscation (live review of 30 Oct, item 1): the zone rewrote every `scope/name@version` of the HTML
// into `[email protected]`, install commands and /for-agents included, for every reader without JS. The owner turns the
// zone setting off; the layout also wraps the head and the body in Cloudflare's `<!--email_off-->` markers, written
// through set:html so Astro's HTML compression keeps them, and every page renders through that layout.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EMAIL_OFF, EMAIL_ON } from '../../site/src/lib/email-off.ts'
import { ROOT } from '../emit/helpers.ts'

const SITE = join(ROOT, 'site', 'src')
const base = readFileSync(join(SITE, 'layouts', 'Base.astro'), 'utf8')
const markup = base.replace(/^---[\s\S]*?\n---\n/, '')

/** The routed pages: .astro files under pages/, without the `_` files and folders Astro skips. */
function pages(dir = join(SITE, 'pages')): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (n.startsWith('_')) return []
    if (statSync(p).isDirectory()) return pages(p)
    return n.endsWith('.astro') ? [p] : []
  })
}

describe('Cloudflare email obfuscation guard', () => {
  it('uses the markers Cloudflare documents', () => {
    expect(EMAIL_OFF).toBe('<!--email_off-->')
    expect(EMAIL_ON).toBe('<!--/email_off-->')
  })

  it('wraps the head and the body of the layout, each in its own pair, through set:html', () => {
    const off = '<Fragment set:html={EMAIL_OFF} />'
    const on = '<Fragment set:html={EMAIL_ON} />'
    const head = /<head>([\s\S]*?)<\/head>/.exec(markup)?.[1] ?? ''
    const body = /<body[^>]*>([\s\S]*?)<\/body>/.exec(markup)?.[1] ?? ''
    for (const [name, part] of [
      ['head', head],
      ['body', body],
    ] as const) {
      const a = part.indexOf(off)
      const b = part.lastIndexOf(on)
      expect(a, name).toBeGreaterThanOrEqual(0)
      expect(b, name).toBeGreaterThan(a)
    }
    // the body pair holds everything the page shows: nothing but whitespace after the closing marker
    expect(body.slice(body.lastIndexOf(on) + on.length).trim()).toBe('')
    expect(body.slice(0, body.indexOf(off)).trim()).toBe('')
    // the head pair opens right after the charset, which must stay first
    expect(head.trim().startsWith('<meta charset="utf-8" />')).toBe(true)
  })

  it('every routed page renders through the layout', () => {
    const without = pages()
      .filter((p) => !/import Base from '[^']*layouts\/Base\.astro'/.test(readFileSync(p, 'utf8')))
      .map((p) => relative(SITE, p))
    expect(without).toEqual([])
  })
})
