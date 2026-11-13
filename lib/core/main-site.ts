// The links of the main site in the header and the footer (look of 13 Nov: the catalog is a section of
// https://www.openmercato.com, so it carries the navbar and the footer links of that site). Absolute addresses, so
// they hold on every host that serves the build. Each menu with a dropdown on the main site links its overview page,
// or its first item when it has none; the catalog has no dropdowns and no JavaScript in the header.
// The layout check (lib/emit/pages-layout.ts) accepts exactly these addresses on the origin of the main site and
// still flags any other link there that misses the base path. Isomorphic: no Node APIs.

/** Origin of the main site. */
export const MAIN_SITE_ORIGIN = 'https://www.openmercato.com'

export interface MainSiteLink {
  label: string
  url: string
}

/** Home of the main site (the Open Mercato logo). */
export const MAIN_SITE_HOME = `${MAIN_SITE_ORIGIN}/`

/** The Open Mercato repository (the GitHub button and the footer). */
export const MAIN_SITE_GITHUB = 'https://github.com/open-mercato/open-mercato'

/** The dark call to action of the main navbar. */
export const MAIN_SITE_SANDBOX: MainSiteLink = {
  label: 'Launch sandbox',
  url: 'https://app.openmercatocloud.com/signup?template=mercato',
}

/** Navbar of the main site, in its order: Product, Developers and Enterprise open their overview or first page. */
export const MAIN_SITE_NAV: readonly MainSiteLink[] = [
  { label: 'Product', url: `${MAIN_SITE_ORIGIN}/product` },
  { label: 'Developers', url: `${MAIN_SITE_ORIGIN}/architecture` },
  { label: 'Enterprise', url: `${MAIN_SITE_ORIGIN}/partners` },
  { label: 'Contact', url: `${MAIN_SITE_ORIGIN}/contact` },
  { label: 'Case Studies', url: `${MAIN_SITE_ORIGIN}/case-studies` },
]

/** Footer links of the main site, in its order. */
export const MAIN_SITE_FOOTER: readonly MainSiteLink[] = [
  { label: 'GitHub', url: MAIN_SITE_GITHUB },
  { label: 'Discord', url: 'https://discord.gg/f4qwPtJ3qA' },
  { label: 'Docs', url: 'https://docs.openmercato.com/' },
  { label: 'Demo', url: 'https://openmercatocloud.com/demo' },
  { label: 'Blog', url: `${MAIN_SITE_ORIGIN}/blog` },
  { label: 'Team', url: `${MAIN_SITE_ORIGIN}/team` },
  { label: 'Contact', url: `${MAIN_SITE_ORIGIN}/contact` },
  { label: 'Terms', url: `${MAIN_SITE_ORIGIN}/terms-conditions` },
]

const KNOWN = new Set([MAIN_SITE_HOME, ...MAIN_SITE_NAV.map((l) => l.url), ...MAIN_SITE_FOOTER.map((l) => l.url)])

/** True for an absolute address of the main site that the header or the footer links on purpose. */
export function isMainSiteLink(url: string): boolean {
  return KNOWN.has(url)
}
