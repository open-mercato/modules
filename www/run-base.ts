// The om-run-base Vite plugin of www/astro.config.ts. href() of site/src/lib/url.ts links under the Astro base, `/`
// for the main site's build; the shared header, footer and fonts link the catalog, so in this build only the base
// that url.ts reads becomes the catalog's (`/run`). The catalog's own source and bundles stay as they are.

/** The expression of site/src/lib/url.ts that reads the base of the build. */
export const URL_BASE = 'normalizeBase(env?.BASE_URL)'

/** Whether a module id (with or without a query) is site/src/lib/url.ts. */
export function isUrlModule(id: string): boolean {
  return (id.split('?')[0] ?? '').endsWith('/site/src/lib/url.ts')
}

/** The plugin for the catalog base `base`; it stops the build when url.ts no longer reads the base as URL_BASE. */
export function runBasePlugin(base: string) {
  return {
    name: 'om-run-base',
    enforce: 'pre' as const,
    transform(code: string, id: string): string | null {
      if (!isUrlModule(id)) return null
      if (!code.includes(URL_BASE)) throw new Error(`om-run-base: site/src/lib/url.ts no longer has ${URL_BASE}`)
      return code.replace(URL_BASE, `normalizeBase(${JSON.stringify(base)})`)
    },
  }
}
