// The navbar of the main site in the catalog (owner's request of 14 Nov): one navbar, the same as on
// www.openmercato.com, with a new Run menu after Enterprise that holds the pages of the catalog. The layout check
// accepts every main-site address the header and the footer link, and nothing else on that origin.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isMainSiteLink,
  MAIN_SITE_FOOTER,
  MAIN_SITE_FOOTER_OTHER,
  MAIN_SITE_HOME,
  MAIN_SITE_LINKS,
  MAIN_SITE_MENUS,
  MAIN_SITE_ORIGIN,
  RUN_MENU,
} from '../../lib/core/main-site.ts'
import { findBannedChars } from '../../lib/core/text.ts'

const PAGES = join(import.meta.dirname, '..', '..', 'site', 'src', 'pages')

describe('the navbar of the main site', () => {
  it('has the menus of www.openmercato.com in its order, then Contact and Case Studies', () => {
    expect(MAIN_SITE_MENUS.map((m) => m.label)).toEqual(['Product', 'Developers', 'Enterprise'])
    expect(MAIN_SITE_MENUS.map((m) => m.items.length)).toEqual([5, 3, 3])
    expect(MAIN_SITE_LINKS.map((l) => l.label)).toEqual(['Contact', 'Case Studies'])
  })

  it('gives every panel row a description and an icon of its own', () => {
    const rows = [...MAIN_SITE_MENUS.flatMap((m) => m.items), ...RUN_MENU.items]
    for (const r of rows) expect(r.description.length, r.label).toBeGreaterThan(20)
    expect(new Set(rows.map((r) => r.icon)).size).toBe(rows.length)
  })

  it('accepts every address of the main site that the header and the footer link', () => {
    const urls = [
      MAIN_SITE_HOME,
      ...MAIN_SITE_MENUS.flatMap((m) => m.items.map((i) => i.url)),
      ...MAIN_SITE_LINKS.map((l) => l.url),
      ...MAIN_SITE_FOOTER.map((l) => l.url),
      ...MAIN_SITE_FOOTER_OTHER.flatMap((g) => g.links.map((l) => l.url)),
    ]
    for (const u of urls) expect(isMainSiteLink(u), u).toBe(true)
    for (const u of [`${MAIN_SITE_ORIGIN}/crm/x`, `${MAIN_SITE_ORIGIN}/modules`, '/crm', `${MAIN_SITE_ORIGIN}/m/x`])
      expect(isMainSiteLink(u), u).toBe(false)
  })
})

describe('the Run menu', () => {
  it('holds the pages of the catalog after Enterprise, each a page of the site', () => {
    expect(RUN_MENU.label).toBe('Run')
    expect(RUN_MENU.items.map((i) => i.label)).toEqual([
      'Modules',
      'Templates',
      'Compatibility',
      'Radar',
      'Quality',
      'For agents',
    ])
    for (const i of RUN_MENU.items) {
      const file = i.path === '/' ? 'index.astro' : `${i.path.slice(1)}.astro`
      expect(existsSync(join(PAGES, file)), i.path).toBe(true)
    }
  })

  it('writes its own texts without long dashes (AGENTS.md 7)', () => {
    for (const i of RUN_MENU.items) expect(findBannedChars(`${i.label} ${i.description}`), i.label).toEqual([])
  })
})
