// Astro config (spec 3.4). Static site from site/src; published data files come from `yarn om emit` through the
// omData() integration of WP09 (lib/emit/astro-integration.ts), loaded only when that file exists.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import preact from '@astrojs/preact'
import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'
import type { AstroIntegration } from 'astro'
import { DEFAULT_BASE_PATH, DEFAULT_SITE_ORIGIN } from './lib/core/home.ts'

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
    ...(await loadOmData()),
  ],
  devToolbar: { enabled: false },
  vite: {
    server: { fs: { allow: [root] } },
    // express (via the MCP SDK) hoists cookie@0.7 to the root; Astro's prerender bundle needs its own cookie@2,
    // so bundle it instead of resolving the bare import from the project root at render time.
    ssr: { noExternal: ['cookie'] },
    environments: { prerender: { resolve: { noExternal: ['cookie'] } } },
  },
})
