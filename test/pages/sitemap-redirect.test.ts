// /sitemap.xml (live review of 30 Oct, item 6): the address crawlers try first gave the 404 page; @astrojs/sitemap
// writes sitemap-index.xml, which robots.txt names. Cloudflare Pages reads site/public/_redirects (copied to dist/) and
// sends the old address there with a permanent redirect. The site lives at the domain root, so the paths carry no base.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_BASE_PATH } from '../../lib/core/home.ts'
import { robotsTxt } from '../../lib/emit/wellknown.ts'
import { ROOT } from '../emit/helpers.ts'

const rules = readFileSync(join(ROOT, 'site', 'public', '_redirects'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))

describe('/sitemap.xml', () => {
  it('redirects permanently to the sitemap index robots.txt names', () => {
    expect(rules).toEqual(['/sitemap.xml /sitemap-index.xml 301'])
    expect(robotsTxt('https://modules.openmercato.com')).toContain(
      'Sitemap: https://modules.openmercato.com/sitemap-index.xml',
    )
  })

  it('the site is at the domain root, where the rule paths hold', () => {
    expect(DEFAULT_BASE_PATH).toBe('/')
  })
})
