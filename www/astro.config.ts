// Astro config of the main site www.openmercato.com (spec docs/specs/2026-11-24-www-site-migration.md, Phase 1a):
// a second Astro project next to the catalog, built to dist-www/. `yarn om pages-site --merge` then lays dist-www/ at
// the root of dist/ and the catalog's dist-run/ under its base (lib/emit/pages-merge.ts). The pages use the
// catalog's Base layout, header, footer, fonts and styles (site/src/), which link the catalog under its base: the
// same BASE_PATH and HOME_PATH the catalog is built with when they nest it, else `/run` and `/modules`
// (mainSiteRun()), through the om-run-base plugin (www/run-base.ts).
import { fileURLToPath } from 'node:url'
import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'
import { MAIN_SITE_ORIGIN } from '../lib/core/main-site.ts'
import { mainSiteRun } from '../lib/core/site-host.ts'
import { runBasePlugin } from './run-base.ts'

const repo = fileURLToPath(new URL('..', import.meta.url))
const run = mainSiteRun(process.env)

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
  integrations: [sitemap({ filter: (page) => !/\/404\/?$/.test(page) })],
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
