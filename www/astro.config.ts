// Astro config of the main site www.openmercato.com (spec docs/specs/2026-11-24-www-site-migration.md, Phase 1a):
// a second Astro project next to the catalog, built to dist-www/. `yarn om pages-site --merge` then lays dist-www/ at
// the root of dist/ and the catalog's dist-run/ under its base (lib/emit/pages-merge.ts). The pages use the
// catalog's Base layout, header, footer, fonts and styles (site/src/), which link the catalog under its base: the
// same BASE_PATH and HOME_PATH the catalog is built with when they nest it, else `/run` and `/modules`
// (mainSiteRun()), through the om-run-base plugin (www/run-base.ts).
import { fileURLToPath } from 'node:url'
import preact from '@astrojs/preact'
import sitemap from '@astrojs/sitemap'
import type { AstroIntegration } from 'astro'
import { defineConfig } from 'astro/config'
import { MAIN_SITE_ORIGIN } from '../lib/core/main-site.ts'
import { mainSiteRun } from '../lib/core/site-host.ts'
import { bodyLinkRules } from './body-links.ts'
import { runBasePlugin } from './run-base.ts'
import { bodyHtmlPlugin } from './src/lib/body-html.ts'

const repo = fileURLToPath(new URL('..', import.meta.url))
const run = mainSiteRun(process.env)

/** client:painted of the catalog (site/src/directives/painted.ts): islands hydrate after the first paint. */
function paintedDirective(): AstroIntegration {
  return {
    name: 'om-client-painted',
    hooks: {
      'astro:config:setup': ({ addClientDirective }) => {
        addClientDirective({
          name: 'painted',
          entrypoint: fileURLToPath(new URL('../site/src/directives/painted.ts', import.meta.url)),
        })
      },
    },
  }
}

/**
 * The hast plugin of Markdown bodies (www/src/lib/body-html.ts: video embeds, links to drafts and to pages still on
 * Webflow, tables), added to Astro's Markdown processor (satteri), whose options integrations may extend.
 */
function bodyHtml(): AstroIntegration {
  return {
    name: 'om-www-body',
    hooks: {
      'astro:config:setup': ({ config, logger }) => {
        const processor = config.markdown.processor as { name: string; options: { hastPlugins?: unknown[] } }
        if (processor.name !== 'satteri' || !Array.isArray(processor.options.hastPlugins))
          throw new Error(`om-www-body: the Markdown processor is ${processor.name}, not satteri with hastPlugins`)
        const rules = bodyLinkRules(fileURLToPath(new URL('./content/', import.meta.url)))
        processor.options.hastPlugins.push(bodyHtmlPlugin(rules, (m) => logger.warn(m)))
      },
    },
  }
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  srcDir: './src',
  // the site's own files (www/public/) arrive with the importer
  publicDir: './public',
  outDir: '../dist-www',
  site: MAIN_SITE_ORIGIN,
  base: '/',
  trailingSlash: 'never',
  build: { format: 'file' },
  // a draft is never routed, so it never reaches the sitemap either (D6)
  integrations: [preact(), paintedDirective(), bodyHtml(), sitemap({ filter: (page) => !/\/404\/?$/.test(page) })],
  devToolbar: { enabled: false },
  vite: {
    // href('/') of site/src/lib/url.ts: the catalog's home page under its base (/run/modules)
    define: { 'import.meta.env.OM_HOME_PATH': JSON.stringify(run.home) },
    plugins: [runBasePlugin(run.base)],
    server: { fs: { allow: [repo] } },
    // as in the catalog's astro.config.ts: Astro's prerender bundle needs its own cookie@2
    ssr: { noExternal: ['cookie'] },
    environments: { prerender: { resolve: { noExternal: ['cookie'] } } },
  },
})
