// The navbar of the main site in the catalog (owner's request of 14 Nov): one navbar, the same as on
// www.openmercato.com, with a new Run menu after Enterprise that holds the pages of the catalog. The layout check
// accepts every main-site address the header and the footer link, and nothing else on that origin.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isMainSiteLink,
  MAIN_SITE_FOOTER,
  MAIN_SITE_FOOTER_NOTE,
  MAIN_SITE_FOOTER_OTHER,
  MAIN_SITE_HOME,
  MAIN_SITE_LINKS,
  MAIN_SITE_MENUS,
  MAIN_SITE_ORIGIN,
  MAIN_SITE_SANDBOX,
  RUN_MENU,
} from '../../lib/core/main-site.ts'
import { findBannedChars } from '../../lib/core/text.ts'
import { footerSchema, navigationSchema } from '../../lib/schema/www-content.ts'

const PAGES = join(import.meta.dirname, '..', '..', 'site', 'src', 'pages')

describe('the navbar of the main site', () => {
  it('has the menus and links of www.openmercato.com (27 Nov) in its order', () => {
    expect(MAIN_SITE_MENUS.map((m) => m.label)).toEqual(['Product', 'Developers', 'Enterprise'])
    expect(MAIN_SITE_MENUS[1]!.items.map((i) => i.label)).toEqual([
      'Docs',
      'Architecture',
      'Modules',
      'How to contribute',
      'For Agencies & Software Houses',
    ])
    expect(MAIN_SITE_MENUS.map((m) => m.items.length)).toEqual([5, 5, 3])
    expect(MAIN_SITE_LINKS.map((l) => [l.label, l.url.replace(MAIN_SITE_ORIGIN, '')])).toEqual([
      ['Pricing', '/pricing'],
      ['Clients', '/case-studies'],
      ['Blog', '/blog'],
      ['Contact', '/contact'],
      ['GitHub', 'https://github.com/open-mercato/open-mercato'],
    ])
    expect(MAIN_SITE_LINKS.at(-1)!.variant).toBe('is-github')
    expect(MAIN_SITE_MENUS[1]!.items[0]!.url).toBe('https://docs.openmercato.com/')
    expect(MAIN_SITE_MENUS[1]!.items[2]!.run).toBe('/')
  })

  it('hides the GitHub text link in the header of every page, as the main site does', () => {
    const header = readFileSync(
      join(import.meta.dirname, '..', '..', 'site', 'src', 'components', 'Header.astro'),
      'utf8',
    )
    expect(header).toMatch(/\.navbar_link\.is-github \{\s*display: none;/)
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

describe('the navbar and the footer as content files (Strapi CMS spec, Step 1.1)', () => {
  const read = (name: string): unknown =>
    JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'www', 'content', name), 'utf8'))

  it('re-exports www/content/navigation.json and footer.json as they are', () => {
    expect(navigationSchema().parse(read('navigation.json'))).toEqual({
      menus: MAIN_SITE_MENUS,
      links: MAIN_SITE_LINKS,
      sandbox: MAIN_SITE_SANDBOX,
    })
    expect(footerSchema().parse(read('footer.json'))).toEqual({
      links: MAIN_SITE_FOOTER,
      other: MAIN_SITE_FOOTER_OTHER,
      note: MAIN_SITE_FOOTER_NOTE,
    })
  })

  it('refuses an icon the navbar cannot draw, a link that is not https and an unknown key', () => {
    const nav = read('navigation.json') as { menus: { items: Record<string, unknown>[] }[]; sandbox: object }
    const withIcon = structuredClone(nav)
    withIcon.menus[0]!.items[0]!.icon = 'rocket'
    expect(navigationSchema().safeParse(withIcon).success).toBe(false)
    const withUrl = structuredClone(nav)
    withUrl.menus[0]!.items[0]!.url = 'http://www.openmercato.com/crm'
    expect(navigationSchema().safeParse(withUrl).success).toBe(false)
    expect(navigationSchema().safeParse({ ...nav, extra: true }).success).toBe(false)
    expect(footerSchema().safeParse({ ...(read('footer.json') as object), note: ' ' }).success).toBe(false)
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
      // the home page is a route injected at the home path (astro.config.ts), so its file is not named by its address
      const file = i.path === '/' ? '_home.astro' : `${i.path.slice(1)}.astro`
      expect(existsSync(join(PAGES, file)), i.path).toBe(true)
    }
  })

  it('writes its own texts without long dashes (AGENTS.md 7)', () => {
    for (const i of RUN_MENU.items) expect(findBannedChars(`${i.label} ${i.description}`), i.label).toEqual([])
  })
})
