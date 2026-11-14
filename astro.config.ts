// Astro config (spec 3.4). Static site from site/src; published data files come from `yarn om emit` through the
// omData() integration of WP09 (lib/emit/astro-integration.ts), loaded only when that file exists.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import preact from '@astrojs/preact'
import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'
import type { AstroIntegration } from 'astro'
import { DEFAULT_BASE_PATH, DEFAULT_HOME_PATH, DEFAULT_SITE_ORIGIN } from './lib/core/home.ts'
import { homeConfig } from './lib/core/site-host.ts'
import { pagesLayout } from './lib/emit/pages-layout.ts'

const root = fileURLToPath(new URL('.', import.meta.url))
const emitIntegration = new URL('./lib/emit/astro-integration.ts', import.meta.url)

async function loadOmData(): Promise<AstroIntegration[]> {
  if (!existsSync(fileURLToPath(emitIntegration))) return []
  const mod = (await import(/* @vite-ignore */ emitIntegration.href)) as {
    omData?: () => AstroIntegration
    default?: () => AstroIntegration
  }
  const factory = mod.omData ?? mod.default
  return factory ? [factory()] : []
}

/** The design gallery (site/src/pages/_dev/gallery.astro) exists only in `astro dev`, or in a build with OM_DEV_GALLERY=1. */
function devGallery(): AstroIntegration {
  return {
    name: 'om-dev-gallery',
    hooks: {
      'astro:config:setup': ({ command, injectRoute }) => {
        if (command === 'dev' || process.env.OM_DEV_GALLERY === '1')
          injectRoute({ pattern: '/_dev/gallery', entrypoint: './site/src/pages/_dev/gallery.astro', prerender: true })
      },
    },
  }
}

/**
 * Path of the home page under the base (HOME_PATH, lib/core/site-host.ts): `/` by default, `/modules` for the Run
 * section of the main site (`/run/modules`). A value the layout cannot hold stops the build here.
 */
const home = homeConfig(process.env.HOME_PATH ?? DEFAULT_HOME_PATH, process.env.BASE_PATH ?? DEFAULT_BASE_PATH)

/**
 * The home page (site/src/pages/_home.astro) is the one page whose address is configured, so its route is injected at
 * the home path instead of coming from a file name: `/` by default (dist/index.html, as an index.astro gives), or
 * `/modules` under the base. Astro then knows the real address, so the sitemap and `astro dev` have it too.
 */
function homeRoute(): AstroIntegration {
  return {
    name: 'om-home-route',
    hooks: {
      'astro:config:setup': ({ injectRoute }) => {
        injectRoute({ pattern: home, entrypoint: './site/src/pages/_home.astro', prerender: true })
      },
    },
  }
}

/** client:painted (site/src/directives/painted.ts, spec 7.11): islands hydrate after the first paint. */
function paintedDirective(): AstroIntegration {
  return {
    name: 'om-client-painted',
    hooks: {
      'astro:config:setup': ({ addClientDirective }) => {
        addClientDirective({
          name: 'painted',
          entrypoint: fileURLToPath(new URL('./site/src/directives/painted.ts', import.meta.url)),
        })
      },
    },
  }
}

export default defineConfig({
  root,
  srcDir: './site/src',
  publicDir: './site/public',
  outDir: './dist',
  site: process.env.SITE_URL ?? DEFAULT_SITE_ORIGIN,
  base: process.env.BASE_PATH ?? DEFAULT_BASE_PATH,
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [
    preact(),
    paintedDirective(),
    sitemap({ filter: (page) => !page.includes('/_dev/') }),
    devGallery(),
    homeRoute(),
    ...(await loadOmData()),
    // last: under a base path the site goes to dist/<base>/ and the Pages root files are laid out after everything
    // else has written (lib/emit/pages-layout.ts); at the domain root it does nothing
    pagesLayout(),
  ],
  devToolbar: { enabled: false },
  vite: {
    // href('/') of site/src/lib/url.ts reads it, in pages and islands alike
    define: { 'import.meta.env.OM_HOME_PATH': JSON.stringify(home) },
    server: { fs: { allow: [root] } },
    // express (via the MCP SDK) hoists cookie@0.7 to the root; Astro's prerender bundle needs its own cookie@2,
    // so bundle it instead of resolving the bare import from the project root at render time.
    ssr: { noExternal: ['cookie'] },
    environments: { prerender: { resolve: { noExternal: ['cookie'] } } },
  },
})
