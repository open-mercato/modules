// The meta description and og:description of a page (Base.astro). The catalog (section `run`) cuts its description at
// 155 characters, as it always has; the main site (section `main`) keeps Webflow's text whole, as the live pages have
// it (owner's decision of 25 Nov 2026, compare-live parity).

/** The longest description of a catalog page. */
export const CATALOG_DESCRIPTION_MAX = 155

export function metaDescription(description: string, section: 'run' | 'main'): string {
  return section === 'run' ? description.slice(0, CATALOG_DESCRIPTION_MAX) : description
}
