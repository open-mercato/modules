// End-to-end suite of WP16 (spec 12.2): screenshots, axe, links, the stale-data banner, touch targets, horizontal
// scroll and the 7.11 budgets Playwright can measure, against a built static site. Build first:
//   E2E_DATA=<data dir> node test/e2e/build.ts      (out/e2e/real from real data, out/e2e/stale from a fixture variant)
//   yarn e2e
// The config serves both builds with test/e2e/serve.ts (static host lookup order, gzip). Env (all optional):
//   E2E_BASE_URL   site under test, with its base path (default http://127.0.0.1:4410); when set, nothing
//                  is served locally and the stale tests run only if E2E_STALE_URL is set too
//   E2E_STALE_URL  the stale variant (default http://127.0.0.1:4411)
//   E2E_DIST, E2E_STALE_DIST   built sites to serve (default out/e2e/real, out/e2e/stale)
//   E2E_SHOTS      where the 16 screenshots go (default out/e2e/shots; also attached to the report)
//   BASE_PATH      base path the sites were built with (default /, as for emit and astro since 28 Oct); set it
//                  for build.ts and here alike
import { defineConfig } from '@playwright/test'
import { E2E } from './test/e2e/env.ts'

const serve = (dist: string, port: number) => ({
  command: `node test/e2e/serve.ts ${dist} ${port} ${E2E.basePath}`,
  url: `http://127.0.0.1:${port}${E2E.basePath}/`,
  reuseExistingServer: !process.env.CI,
  timeout: 30_000,
  stdout: 'ignore' as const,
})

export default defineConfig({
  testDir: 'test/e2e',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results',
  fullyParallel: true,
  // a 16 GB machine shared with builds: two browsers at most
  workers: process.env.CI ? 2 : Number(process.env.E2E_WORKERS ?? 2),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    browserName: 'chromium',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: E2E.external
    ? undefined
    : [serve(E2E.dist, E2E.port), ...(E2E.staleDist ? [serve(E2E.staleDist, E2E.stalePort)] : [])],
})
