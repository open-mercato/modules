// The navbar and the footer of the main site, https://www.openmercato.com (Webflow), copied into the catalog. The
// catalog is the Run section of that site, www.openmercato.com/run, so a visitor must not feel they left the main site: one navbar,
// the same as there (Product, Developers and Enterprise open panels of icon, name and description; Contact; Case
// Studies; the GitHub button with the star count; Launch sandbox), plus one menu the main site gets too: Run, after
// Enterprise, with the pages of the catalog (RUN_MENU). Keep this file in step with the Webflow navbar: when the menu
// changes there, change it here (docs/RUNBOOK.md).
// Main-site addresses are absolute, so they hold on every host that serves the build. The layout check
// (lib/emit/pages-layout.ts) accepts exactly these addresses on the origin of the main site and still flags any other
// link there that misses the base path. Run items are site paths of the catalog: the header builds them with href(),
// so `/` (Modules) is the home page wherever HOME_PATH puts it (`/run/modules`).
// The texts are the main site's own words, copied as they stand there (two of them carry its long dash, written as
// — so this file stays plain ASCII). Isomorphic: no Node APIs.

/** Origin of the main site. */
export const MAIN_SITE_ORIGIN = 'https://www.openmercato.com'

export interface MainSiteLink {
  label: string
  url: string
}

/** Names of the 22 px stroke icons of the navbar panels (site/src/components/nav-icons.ts draws them). */
export type NavIcon =
  | 'crm'
  | 'foundation-framework'
  | 'agent-orchestrator'
  | 'cloud-sandboxes'
  | 'cezar'
  | 'architecture'
  | 'how-to-contribute'
  | 'agencies'
  | 'partners'
  | 'certified-partners'
  | 'enterprise-level-support'
  | 'run-modules'
  | 'run-templates'
  | 'run-compat'
  | 'run-radar'
  | 'run-quality'
  | 'run-agents'

/** A row of a navbar panel: icon, name and a one-sentence description. */
export interface MainSiteMenuItem extends MainSiteLink {
  description: string
  icon: NavIcon
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

/** The dark call to action of the main navbar. */
export const MAIN_SITE_SANDBOX: MainSiteLink = {
  label: 'Launch sandbox',
  url: 'https://app.openmercatocloud.com/signup?template=mercato',
}

/** The star count the main site prints before its script asks GitHub (its markup of 13 Nov). */
export const MAIN_SITE_STARS_FALLBACK = '1,914'

const at = (path: string): string => `${MAIN_SITE_ORIGIN}${path}`

/** The menus of the main navbar with a panel, in its order. */
export const MAIN_SITE_MENUS: readonly MainSiteMenu[] = [
  {
    label: 'Product',
    items: [
      {
        label: 'CRM',
        url: at('/crm'),
        description: 'Contacts, deals and workflows in a CRM you can make your own.',
        icon: 'crm',
      },
      {
        label: 'Foundation Framework',
        url: at('/product'),
        description: 'Start with 80% of CRM/ERP done — modular monolith, OCP overlays, and AI-native extensibility.',
        icon: 'foundation-framework',
      },
      {
        label: 'Agent Orchestrator',
        url: at('/agent-orchestrator'),
        description:
          'Run AI agents in production with workflow integration, audit trails, and human-in-the-loop controls.',
        icon: 'agent-orchestrator',
      },
      {
        label: 'Cloud Sandboxes',
        url: 'https://openmercatocloud.com/demo',
        description: 'Boot a ready Open Mercato workspace in 30 seconds and build with AI agents — no local setup.',
        icon: 'cloud-sandboxes',
      },
      {
        label: 'Cezar',
        url: 'https://cezar.run/',
        description:
          'Run Claude Code, Codex and other coding agents in parallel, 24/7, on the subscriptions you already pay for.',
        icon: 'cezar',
      },
    ],
  },
  {
    label: 'Developers',
    items: [
      {
        label: 'Architecture',
        url: at('/architecture'),
        description: 'Learn the Modular Monolith, Overlay system (OCP), DI, and request flow.',
        icon: 'architecture',
      },
      {
        label: 'How to contribute',
        url: at('/how-to-contribute'),
        description: 'Install Open Mercato and run a working environment in minutes.',
        icon: 'how-to-contribute',
      },
      {
        label: 'For Agencies & Software Houses',
        url: at('/agencies'),
        description: 'Deliver fixed-scope projects faster with reusable overlays and better margins.',
        icon: 'agencies',
      },
    ],
  },
  {
    label: 'Enterprise',
    items: [
      {
        label: 'Implementation Partners',
        url: at('/partners'),
        description: 'Certified software houses trained in the Open Mercato Way for enterprise delivery.',
        icon: 'partners',
      },
      {
        label: 'Certified Partners',
        url: at('/certified-partners'),
        description: 'Browse and hire a certified agency matched to your industry, scope, and budget.',
        icon: 'certified-partners',
      },
      {
        label: 'Enterprise Level Support',
        url: at('/enterprise-level-support'),
        description: 'Community and commercial support tiers for mission-critical deployments.',
        icon: 'enterprise-level-support',
      },
    ],
  },
]

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

/** The plain links of the main navbar, after the menus: Contact, then Case Studies pushed to the right. */
export const MAIN_SITE_LINKS: readonly MainSiteLink[] = [
  { label: 'Contact', url: at('/contact') },
  { label: 'Case Studies', url: at('/case-studies') },
]

/** Footer links of the main site, in its order. */
export const MAIN_SITE_FOOTER: readonly MainSiteLink[] = [
  { label: 'GitHub', url: MAIN_SITE_GITHUB },
  { label: 'Discord', url: 'https://discord.gg/f4qwPtJ3qA' },
  { label: 'Docs', url: 'https://docs.openmercato.com/' },
  { label: 'Demo', url: 'https://openmercatocloud.com/demo' },
  { label: 'Blog', url: at('/blog') },
  { label: 'Team', url: at('/team') },
  { label: 'Contact', url: at('/contact') },
  { label: 'Terms', url: at('/terms-conditions') },
]

/** The licence line on the right of the main site's footer. */
export const MAIN_SITE_FOOTER_NOTE = 'MIT License · Supported by Catch The Tornado'

/** The groups of the folded "Other" list of the main site's footer, in its order. */
export const MAIN_SITE_FOOTER_OTHER: readonly { label: string; links: readonly MainSiteLink[] }[] = [
  {
    label: 'Compare',
    links: [
      { label: 'Salesforce Alternative', url: at('/salesforce-alternative') },
      { label: 'HubSpot Alternative', url: at('/hubspot-alternative') },
      { label: 'Odoo Alternative', url: at('/odoo-alternative') },
      { label: 'Pipedrive Alternative', url: at('/pipedrive-alternative') },
      { label: 'Zoho CRM Alternative', url: at('/zoho-crm-alternative') },
      { label: 'Attio Alternative', url: at('/attio-alternative') },
      { label: 'Insightly Alternative', url: at('/insightly-alternative') },
      { label: 'Dynamics 365 Sales Alternative', url: at('/dynamics-365-alternative') },
      { label: 'monday CRM Alternative', url: at('/monday-crm-alternative') },
      { label: 'Freshsales Alternative', url: at('/freshsales-alternative') },
      { label: 'Copper Alternative', url: at('/copper-crm-alternative') },
      { label: 'Close Alternative', url: at('/close-crm-alternative') },
    ],
  },
  {
    label: 'More comparisons',
    links: [
      { label: 'Nutshell Alternative', url: at('/nutshell-crm-alternative') },
      { label: 'Capsule CRM Alternative', url: at('/capsule-crm-alternative') },
      { label: 'Bitrix24 Alternative', url: at('/bitrix24-alternative') },
      { label: 'Keap Alternative', url: at('/keap-alternative') },
      { label: 'Agile CRM Alternative', url: at('/agile-crm-alternative') },
      { label: 'Salesmate Alternative', url: at('/salesmate-alternative') },
      { label: 'SugarCRM Alternative', url: at('/sugarcrm-alternative') },
      { label: 'Zendesk Sell Alternative', url: at('/zendesk-sell-alternative') },
      { label: 'Twenty CRM Alternative', url: at('/twenty-crm-alternative') },
      { label: 'Vtiger Alternative', url: at('/vtiger-alternative') },
      { label: 'SuiteCRM Alternative', url: at('/suitecrm-alternative') },
    ],
  },
  {
    label: 'CRM solutions',
    links: [
      { label: 'Self-Hosted CRM', url: at('/self-hosted-crm') },
      { label: 'Custom CRM Development', url: at('/custom-crm-development') },
      { label: 'CRM for Manufacturing', url: at('/crm-for-manufacturing') },
      { label: 'CRM for Wholesale Distributors', url: at('/crm-for-wholesale-distributors') },
    ],
  },
  {
    label: 'Operations',
    links: [
      { label: 'B2B Order Management', url: at('/b2b-order-management') },
      { label: 'LOT Traceability Software', url: at('/lot-traceability-software') },
      { label: 'Senior Care Operations', url: at('/senior-care-operations') },
      { label: 'Base / BaseLinker Alternative', url: at('/baselinker-alternative') },
      { label: 'Alternatywa dla BaseLinkera', url: at('/baselinker-alternatywa') },
    ],
  },
]

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
