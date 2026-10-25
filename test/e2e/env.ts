// Shared settings of the e2e suite (WP16): where the site under test lives, the pages it checks, the viewports and
// the theme switch. Read by playwright.config.ts and every spec. See the config header for the variables.
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Browser, BrowserContext, BrowserContextOptions } from '@playwright/test'

const root = resolve(import.meta.dirname, '..', '..')
const basePath = `/${(process.env.BASE_PATH ?? '/modules').replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '')
const port = 4410
const stalePort = 4411
const external = !!process.env.E2E_BASE_URL
const staleDistRaw = resolve(root, process.env.E2E_STALE_DIST ?? 'out/e2e/stale')

export const E2E = {
  root,
  basePath,
  port,
  stalePort,
  /** The site is served from elsewhere (CI against a deploy): no local servers. */
  external,
  dist: resolve(root, process.env.E2E_DIST ?? 'out/e2e/real'),
  /** The stale variant to serve locally, or null when it was not built. */
  staleDist: !external && existsSync(join(staleDistRaw, 'index.html')) ? staleDistRaw : null,
  /** Site under test, with the base path and without a trailing slash. */
  base: (process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}${basePath}`).replace(/\/+$/, ''),
  /** The stale variant, or null when there is none to test. */
  staleBase: process.env.E2E_STALE_URL
    ? process.env.E2E_STALE_URL.replace(/\/+$/, '')
    : !external && existsSync(join(staleDistRaw, 'index.html'))
      ? `http://127.0.0.1:${stalePort}${basePath}`
      : null,
  shots: resolve(root, process.env.E2E_SHOTS ?? 'out/e2e/shots'),
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

/** URL of a site path; `/` is the base with its slash (Pages answers the bare base with a 301). */
export function url(path: string, base: string = E2E.base): string {
  return path === '/' ? `${base}/` : `${base}${path}`
}

export type Theme = 'light' | 'dark'

export const DESKTOP: BrowserContextOptions = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }

/** A phone: 390 x 844 by default (spec 7.10 checks 360 and 390). */
export function phone(width = 390): BrowserContextOptions {
  return { viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
}

/** A context in a theme: the OS preference and the site's own switch (localStorage `om-theme`) agree. */
export async function themed(browser: Browser, theme: Theme, opts: BrowserContextOptions): Promise<BrowserContext> {
  const ctx = await browser.newContext({ ...opts, colorScheme: theme, reducedMotion: 'reduce' })
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('om-theme', t)
    } catch {
      // storage blocked: the OS preference alone sets the theme
    }
  }, theme)
  return ctx
}
