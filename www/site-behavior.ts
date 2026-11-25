// What every page of the main site does besides its content (www site migration spec, Phase 7, D9), added by the build
// to each page of this Astro project and to no page of the catalog's (/run keeps what it loads today):
// - Analytics: the GA4 snippet in the head (www/src/lib/analytics.ts);
// - CTA tracking: the live CTA events from data-cta attributes (www/src/scripts/cta-tracking.ts);
// - ConsentBanner: the live cookie banner and its stylesheet (www/src/lib/consent.ts, www/src/scripts/consent-banner.ts,
//   www/src/styles/webflow/consent.css).
// An integration rather than a layout, so a page cannot leave them out: the pages of later phases get them too.
import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'
import { gaHeadScript } from './src/lib/analytics.ts'

const file = (path: string): string => JSON.stringify(fileURLToPath(new URL(path, import.meta.url)))

export function siteBehavior(): AstroIntegration {
  return {
    name: 'om-www-site-behavior',
    hooks: {
      'astro:config:setup': ({ injectScript }) => {
        injectScript('head-inline', gaHeadScript())
        injectScript(
          'page',
          `import ${file('./src/scripts/cta-tracking.ts')};import ${file('./src/scripts/consent-banner.ts')}`,
        )
        injectScript('page-ssr', `import ${file('./src/styles/webflow/consent.css')}`)
      },
    },
  }
}
