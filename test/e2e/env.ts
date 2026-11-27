// Shared settings of the e2e suite (WP16): where the site under test lives, the pages it checks, the viewports and
// the theme switch. Read by playwright.config.ts and every spec. See the config header for the variables.
import { resolve } from 'node:path'
import type { Browser, BrowserContext, BrowserContextOptions } from '@playwright/test'
import { DEFAULT_BASE_PATH, DEFAULT_HOME_PATH } from '../../lib/core/home.ts'
import { isBuilt } from './serve.ts'

const root = resolve(import.meta.dirname, '..', '..')
// the same default as emit and astro.config.ts (domain root since the Cloudflare move, 28 Oct), so a plain
// `node test/e2e/build.ts` is served where it was built; '' when the site sits at the root
const basePath = `/${(process.env.BASE_PATH ?? DEFAULT_BASE_PATH).replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '')
// the home page under the base, as the sites were built (HOME_PATH): '/' or e.g. '/modules'
const homePath = `/${(process.env.HOME_PATH ?? DEFAULT_HOME_PATH).replace(/^\/+|\/+$/g, '')}`
const port = 4410
const stalePort = 4411
const templatesPort = 4412
const external = !!process.env.E2E_BASE_URL
const staleDistRaw = resolve(root, process.env.E2E_STALE_DIST ?? 'out/e2e/stale')
const templatesDistRaw = resolve(root, process.env.E2E_TEMPLATES_DIST ?? 'out/e2e/templates')
const templatesBuilt = !external && isBuilt(templatesDistRaw, basePath)

export const E2E = {
  root,
  basePath,
  /** Path of the home page under the base: '/' or '/modules' (HOME_PATH). */
  homePath,
  port,
  stalePort,
  /** The site is served from elsewhere (CI against a deploy): no local servers. */
  external,
  dist: resolve(root, process.env.E2E_DIST ?? 'out/e2e/real'),
  /** The stale variant to serve locally, or null when it was not built. */
  staleDist: !external && isBuilt(staleDistRaw, basePath) ? staleDistRaw : null,
  /** Site under test, with the base path and without a trailing slash. */
  base: (process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}${basePath}`).replace(/\/+$/, ''),
  /** The stale variant, or null when there is none to test. */
  staleBase: process.env.E2E_STALE_URL
    ? process.env.E2E_STALE_URL.replace(/\/+$/, '')
    : !external && isBuilt(staleDistRaw, basePath)
      ? `http://127.0.0.1:${stalePort}${basePath}`
      : null,
  shots: resolve(root, process.env.E2E_SHOTS ?? 'out/e2e/shots'),
  templatesPort,
  /** The template fixture variant to serve locally, or null when it was not built. */
  templatesDist: templatesBuilt ? templatesDistRaw : null,
  /** The template fixture variant, or null when there is none to test. */
  templatesBase: process.env.E2E_TEMPLATES_URL
    ? process.env.E2E_TEMPLATES_URL.replace(/\/+$/, '')
    : templatesBuilt
      ? `http://127.0.0.1:${templatesPort}${basePath}`
      : null,
}

/** The module every page check uses (spec 7.9 and 12.2). */
export const KSEF = '/m/@fastwhitecat/integration-ksef-direct'

/** The five pages of the axe check (spec 7.9) and of the screenshots. */
export const PAGES = [
  { name: 'home', path: '/' },
  { name: 'ksef', path: KSEF },
  { name: 'compat', path: '/compat' },
  { name: 'submit', path: '/submit' },
  { name: 'for-agents', path: '/for-agents' },
] as const

/**
 * URL of a site path. `/` is the home page: the base with its slash (under a base path, the bare base answers 301),
 * or the home path under the base when the site was built with one (`/run/modules`).
 */
export function url(path: string, base: string = E2E.base): string {
  return path === '/' ? `${base}${E2E.homePath}` : `${base}${path}`
}

/** The colour scheme of the visitor's system. The site has one theme (light, like openmercato.com) and ignores it. */
export type Theme = 'light' | 'dark'

export const DESKTOP: BrowserContextOptions = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }

/** A phone: 390 x 844 by default (spec 7.10 checks 360 and 390). */
export function phone(width = 390): BrowserContextOptions {
  return { viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
}

/** A context with the given system colour scheme; the page must render the same light theme in both. */
export async function themed(browser: Browser, theme: Theme, opts: BrowserContextOptions): Promise<BrowserContext> {
  return browser.newContext({ ...opts, colorScheme: theme, reducedMotion: 'reduce' })
}
