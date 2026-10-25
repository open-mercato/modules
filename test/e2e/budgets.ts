// The performance budget of spec 7.11, in one place for the Playwright checks (perf.spec.ts) and the Lighthouse
// run (lighthouse.ts).
const KB = 1024

export const BUDGET = {
  /** JS on / (gzip), with Preact and MiniSearch. */
  jsHome: 60 * KB,
  /** /search-index.json (gzip), fetched at the first interaction. */
  searchIndex: 100 * KB,
  /** CSS (gzip) per page. */
  css: 25 * KB,
  /** HTML of / (gzip). */
  htmlHome: 60 * KB,
  fontFiles: 3,
  fonts: 150 * KB,
  fontPreloads: 1,
  thirdParty: 0,
  /** Lighthouse mobile. */
  lcpMs: 1800,
  cls: 0.05,
  tbtMs: 150,
  performance: 0.9,
  accessibility: 1,
  bestPractices: 0.95,
} as const

export const kb = (n: number): string => `${(n / KB).toFixed(1)} KB`
