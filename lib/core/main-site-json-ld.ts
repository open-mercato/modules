// The site-wide JSON-LD of the main site (www site migration spec, SEO: "Organization and WebSite site-wide"). Every
// page of www.openmercato.com carries the same Organization object today (live HTML of 25 Nov 2026); it is kept as it
// stands there, except its logo, which is the site's own copy (D5, www/public/files/) instead of the Webflow CDN, and
// WebSite is added. The shared layout writes it on every page of the main site, after the page's own JSON-LD, and on
// no page of the catalog. Isomorphic.

/** The Organization and WebSite of the main site at `origin`. */
export function mainSiteJsonLd(origin: string): Record<string, unknown> {
  const url = new URL('/', origin).origin
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${url}/#organization`,
        name: 'Open Mercato',
        url,
        logo: `${url}/files/open-mercato-logo-dark.svg`,
        description:
          'AI-supportive CRM/ERP foundation framework. Modular, extensible, designed for teams that want strong defaults with room to customize everything.',
        sameAs: ['https://github.com/openmercato', 'https://twitter.com/openmercato'],
        contactPoint: { '@type': 'ContactPoint', contactType: 'technical support', url: `${url}/contact` },
      },
      {
        '@type': 'WebSite',
        '@id': `${url}/#website`,
        name: 'Open Mercato',
        url,
        publisher: { '@id': `${url}/#organization` },
        inLanguage: 'en',
      },
    ],
  }
}
