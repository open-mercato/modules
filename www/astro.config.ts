// Astro config of the main site www.openmercato.com (spec docs/specs/2026-11-24-www-site-migration.md, Phase 1a):
// a second Astro project next to the catalog, built to dist-www/. `yarn om pages-site --merge` then lays dist-www/ at
// the root of dist/ and the catalog's dist-run/ under its base (lib/emit/pages-merge.ts). The pages use the
// catalog's Base layout, header, footer, fonts and styles (site/src/), which link the catalog under its base: the
// same BASE_PATH and HOME_PATH the catalog is built with when they nest it, else `/run` and `/modules`
// (mainSiteRun()), through the om-run-base plugin below.
import { fileURLToPath } from 'node:url'
import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'
import { MAIN_SITE_ORIGIN } from '../lib/core/main-site.ts'
import { mainSiteRun } from '../lib/core/site-host.ts'

const repo = fileURLToPath(new URL('..', import.meta.url))
const run = mainSiteRun(process.env)

/** The expression of site/src/lib/url.ts that reads the base of the build, `/` here. */
const URL_BASE = 'normalizeBase(env?.BASE_URL)'

/**
 * href() of site/src/lib/url.ts links under the Astro base, which is `/` for this build. The shared header, footer
 * and fonts link the catalog, so in this build only its base becomes the catalog's (`/run`); the catalog's own source
 * and bundles stay as they are. Stops the build when url.ts no longer reads the base that way.
 */
function runBase() {
  return {
    name: 'om-run-base',
    enforce: 'pre' as const,
    transform(code: string, id: string): string | null {
      if (!(id.split('?')[0] ?? '').endsWith('/site/src/lib/url.ts')) return null
      if (!code.includes(URL_BASE)) throw new Error(`om-run-base: site/src/lib/url.ts no longer has ${URL_BASE}`)
      return code.replace(URL_BASE, `normalizeBase(${JSON.stringify(run.base)})`)
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
  integrations: [sitemap({ filter: (page) => !/\/404\/?$/.test(page) })],
  devToolbar: { enabled: false },
  vite: {
    // href('/') of site/src/lib/url.ts: the catalog's home page under its base (/run/modules)
    define: { 'import.meta.env.OM_HOME_PATH': JSON.stringify(run.home) },
    plugins: [runBase()],
    server: { fs: { allow: [repo] } },
    // as in the catalog's astro.config.ts: Astro's prerender bundle needs its own cookie@2
    ssr: { noExternal: ['cookie'] },
    environments: { prerender: { resolve: { noExternal: ['cookie'] } } },
  },
})
