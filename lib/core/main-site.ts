// The navbar and the footer of the main site, https://www.openmercato.com (Webflow), copied into the catalog. The
// catalog is the Run section of that site, www.openmercato.com/run, so a visitor must not feel they left the main site: one navbar,
// the same as there (Product, Developers and Enterprise open panels of icon, name and description; Pricing; Clients;
// Blog; Contact; a GitHub text link its styles hide; the GitHub button with the star count; Launch sandbox), plus one
// menu the main site gets too: Run, after Enterprise, with the pages of the catalog (RUN_MENU). The live Developers
// panel links Modules to modules.openmercato.com, the catalog's old host; here that row is the catalog's home page.
// The menus, the plain links, the sandbox button and the footer are content (Strapi CMS spec 2026-11-27-www-strapi-cms.md,
// Phase 1): www/content/navigation.json and footer.json, checked by the schemas of lib/schema/www-content.ts when this
// module loads. Keep them in step with the Webflow navbar: when the menu changes there, change them (docs/RUNBOOK.md).
// RUN_MENU, the origin, the GitHub address and the star fallback stay code: the layout check and the catalog depend on them.
// Main-site addresses are absolute, so they hold on every host that serves the build. The layout check
// (lib/emit/pages-layout.ts) accepts exactly these addresses on the origin of the main site and still flags any other
// link there that misses the base path. Run items are site paths of the catalog: the header builds them with href(),
// so `/` (Modules) is the home page wherever HOME_PATH puts it (`/run/modules`).
// The texts of RUN_MENU are for people: `yarn om check-text` reads this file. Isomorphic: no Node APIs.
import footerFile from '../../www/content/footer.json' with { type: 'json' }
import navigationFile from '../../www/content/navigation.json' with { type: 'json' }
import { footerSchema, navigationSchema, type NAV_ICONS } from '../schema/www-content.ts'

/** Origin of the main site. */
export const MAIN_SITE_ORIGIN = 'https://www.openmercato.com'

export interface MainSiteLink {
  label: string
  url: string
  /** A class next to `navbar_link`: `is-github`, which the main site's styles hide, as they do there. */
  variant?: 'is-github'
}

/** Names of the 22 px stroke icons of the navbar panels (site/src/components/nav-icons.ts draws them). */
export type NavIcon = (typeof NAV_ICONS)[number]

/** A row of a navbar panel: icon, name and a one-sentence description. */
export interface MainSiteMenuItem extends MainSiteLink {
  description: string
  icon: NavIcon
  /** A site path of the catalog the header links instead of `url` (built with href(), like the Run rows). */
  run?: string
}

/** A menu of the navbar that opens a panel; the label also heads the panel. */
export interface MainSiteMenu {
  label: string
  items: readonly MainSiteMenuItem[]
}

/** A row of the Run panel: a site path of the catalog instead of an address. */
export interface RunMenuItem {
  label: string
  path: string
  description: string
  icon: NavIcon
}

/** Home of the main site (the Open Mercato logo). */
export const MAIN_SITE_HOME = `${MAIN_SITE_ORIGIN}/`

/** The Open Mercato repository (the GitHub button and the footer). */
export const MAIN_SITE_GITHUB = 'https://github.com/open-mercato/open-mercato'

const navigation = navigationSchema().parse(navigationFile)
const footer = footerSchema().parse(footerFile)

/** The dark call to action of the main navbar. */
export const MAIN_SITE_SANDBOX: MainSiteLink = navigation.sandbox

/** The star count the main site prints before its script asks GitHub (its markup of 13 Nov). */
export const MAIN_SITE_STARS_FALLBACK = '1,914'

/** The menus of the main navbar with a panel, in its order. */
export const MAIN_SITE_MENUS: readonly MainSiteMenu[] = navigation.menus

/** The new menu of the navbar, after Enterprise: the pages of the catalog. */
export const RUN_MENU: { label: string; items: readonly RunMenuItem[] } = {
  label: 'Run',
  items: [
    {
      label: 'Modules',
      path: '/',
      description: 'Ready-made modules that add features to your Open Mercato app.',
      icon: 'run-modules',
    },
    {
      label: 'Templates',
      path: '/templates',
      description: 'Start from a ready-made app instead of an empty one.',
      icon: 'run-templates',
    },
    {
      label: 'Compatibility',
      path: '/compat',
      description: 'See which modules install and work on each Open Mercato version.',
      icon: 'run-compat',
    },
    {
      label: 'Radar',
      path: '/radar',
      description: 'See which modules the next Open Mercato version may break.',
      icon: 'run-radar',
    },
    {
      label: 'Quality',
      path: '/quality',
      description: 'How modules are checked and what each badge means.',
      icon: 'run-quality',
    },
    {
      label: 'For agents',
      path: '/for-agents',
      description: 'Connect a coding agent through MCP, a Claude Code plugin or plain files.',
      icon: 'run-agents',
    },
  ],
}

/**
 * The plain links of the main navbar, after the menus, as the live navbar of 27 Nov 2026 has them: Pricing, Clients
 * (the case studies), Blog, Contact and a GitHub text link its styles hide. The one header shows them on the main
 * site and on the /run pages alike, and keeps the Run menu on both, because after the switch /run is part of the site
 * (owner's decision of 25 Nov 2026, www migration Phase 6).
 */
export const MAIN_SITE_LINKS: readonly MainSiteLink[] = navigation.links

/** Footer links of the main site, in its order. */
export const MAIN_SITE_FOOTER: readonly MainSiteLink[] = footer.links

/** The licence line on the right of the main site's footer. */
export const MAIN_SITE_FOOTER_NOTE: string = footer.note

/** The groups of the folded "Other" list of the main site's footer, in its order. */
export const MAIN_SITE_FOOTER_OTHER: readonly { label: string; links: readonly MainSiteLink[] }[] = footer.other

const KNOWN = new Set([
  MAIN_SITE_HOME,
  ...MAIN_SITE_MENUS.flatMap((m) => m.items.map((i) => i.url)),
  ...MAIN_SITE_LINKS.map((l) => l.url),
  ...MAIN_SITE_FOOTER.map((l) => l.url),
  ...MAIN_SITE_FOOTER_OTHER.flatMap((g) => g.links.map((l) => l.url)),
])

/** True for an absolute address of the main site that the header or the footer links on purpose. */
export function isMainSiteLink(url: string): boolean {
  return KNOWN.has(url)
}
