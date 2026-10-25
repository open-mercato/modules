// Lighthouse mobile against the 7.11 budget (WP16): Performance >= 90, Accessibility = 100, Best Practices >= 95,
// LCP < 1.8 s, CLS < 0.05, TBT < 150 ms. Lighthouse is not a dependency of the repo: it runs through a pinned
// `npx -y lighthouse@12.8.2` (default mobile emulation, simulated slow 4G and 4x CPU) on the Chromium of
// Playwright. Serves out/e2e/real itself (gzip, like Pages) unless E2E_BASE_URL is set. Median of LH_RUNS runs.
//   node test/e2e/lighthouse.ts          (on a shared machine: lockf -k /tmp/om-shots.lock node test/e2e/lighthouse.ts)
// Env: LH_RUNS (default 3), LH_PAGES (comma-separated site paths, default the five pages of 7.9), LH_VERSION,
// CHROME_PATH, E2E_BASE_URL, E2E_DIST. Output: out/e2e/lighthouse/<page>-<n>.json and summary.json. Exit 1 over budget.
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
import { BUDGET } from './budgets.ts'
import { E2E, PAGES, url } from './env.ts'
import { startServer } from './serve.ts'

const VERSION = process.env.LH_VERSION ?? '12.8.2'
const RUNS = Number(process.env.LH_RUNS ?? 3)
const paths = process.env.LH_PAGES ? process.env.LH_PAGES.split(',') : PAGES.map((p) => p.path)
const outDir = join(E2E.root, 'out', 'e2e', 'lighthouse')

interface Run {
  performance: number
  accessibility: number
  bestPractices: number
  lcp: number
  cls: number
  tbt: number
  fcp: number
  si: number
  failing: string[]
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2
}

async function lighthouse(target: string, file: string, chrome: string): Promise<Run> {
  // async: the server of this process must keep answering while Lighthouse loads the page
  const child = spawn(
    'npx',
    [
      '-y',
      `lighthouse@${VERSION}`,
      target,
      '--quiet',
      '--chrome-flags=--headless=new',
      '--only-categories=performance,accessibility,best-practices',
      '--output=json',
      `--output-path=${file}`,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, CHROME_PATH: chrome } },
  )
  const status = await new Promise<number | null>((resolve) => child.on('close', resolve))
  if (status !== 0) throw new Error(`lighthouse exited with ${status} on ${target}`)
  const d = JSON.parse(readFileSync(file, 'utf8')) as {
    categories: Record<string, { score: number; auditRefs: { id: string; weight: number }[] }>
    audits: Record<string, { numericValue?: number; score: number | null; title: string }>
  }
  const num = (id: string): number => d.audits[id]?.numericValue ?? NaN
  const failing: string[] = []
  for (const cat of ['accessibility', 'best-practices'])
    for (const ref of d.categories[cat]?.auditRefs ?? []) {
      const a = d.audits[ref.id]
      if (ref.weight > 0 && a && a.score !== null && a.score < 1) failing.push(`${cat}: ${ref.id} (${a.title})`)
    }
  return {
    performance: d.categories['performance']?.score ?? NaN,
    accessibility: d.categories['accessibility']?.score ?? NaN,
    bestPractices: d.categories['best-practices']?.score ?? NaN,
    lcp: num('largest-contentful-paint'),
    cls: num('cumulative-layout-shift'),
    tbt: num('total-blocking-time'),
    fcp: num('first-contentful-paint'),
    si: num('speed-index'),
    failing,
  }
}

function overBudget(m: Omit<Run, 'failing'>): string[] {
  const out: string[] = []
  if (!(m.performance >= BUDGET.performance)) out.push(`Performance ${Math.round(m.performance * 100)} < 90`)
  if (!(m.accessibility >= BUDGET.accessibility)) out.push(`Accessibility ${Math.round(m.accessibility * 100)} < 100`)
  if (!(m.bestPractices >= BUDGET.bestPractices)) out.push(`Best Practices ${Math.round(m.bestPractices * 100)} < 95`)
  if (!(m.lcp < BUDGET.lcpMs)) out.push(`LCP ${Math.round(m.lcp)} ms >= ${BUDGET.lcpMs} ms`)
  if (!(m.cls < BUDGET.cls)) out.push(`CLS ${m.cls.toFixed(3)} >= ${BUDGET.cls}`)
  if (!(m.tbt < BUDGET.tbtMs)) out.push(`TBT ${Math.round(m.tbt)} ms >= ${BUDGET.tbtMs} ms`)
  return out
}

mkdirSync(outDir, { recursive: true })
const server = E2E.external ? null : startServer(E2E.dist, E2E.port + 9, E2E.basePath)
const base = E2E.external ? E2E.base : `http://127.0.0.1:${E2E.port + 9}${E2E.basePath}`
const chrome = process.env.CHROME_PATH ?? chromium.executablePath()
const summary: Record<string, unknown> = {}
let failed = false
try {
  for (const path of paths) {
    const name = path === '/' ? 'home' : path.replace(/^\/+/, '').replace(/[^a-z0-9@.-]+/gi, '_')
    const runs: Run[] = []
    for (let i = 1; i <= RUNS; i++)
      runs.push(await lighthouse(url(path, base), join(outDir, `${name}-${i}.json`), chrome))
    const med = {
      performance: median(runs.map((r) => r.performance)),
      accessibility: median(runs.map((r) => r.accessibility)),
      bestPractices: median(runs.map((r) => r.bestPractices)),
      lcp: median(runs.map((r) => r.lcp)),
      cls: median(runs.map((r) => r.cls)),
      tbt: median(runs.map((r) => r.tbt)),
      fcp: median(runs.map((r) => r.fcp)),
      si: median(runs.map((r) => r.si)),
    }
    const over = overBudget(med)
    const audits = [...new Set(runs.flatMap((r) => r.failing))]
    if (over.length) failed = true
    summary[path] = { runs: runs.length, median: med, overBudget: over, failingAudits: audits }
    console.log(
      `${path}: Performance ${Math.round(med.performance * 100)}, Accessibility ${Math.round(med.accessibility * 100)}, ` +
        `Best Practices ${Math.round(med.bestPractices * 100)}, LCP ${Math.round(med.lcp)} ms, CLS ${med.cls.toFixed(3)}, ` +
        `TBT ${Math.round(med.tbt)} ms, FCP ${Math.round(med.fcp)} ms (median of ${runs.length})` +
        (over.length ? `\n  over budget: ${over.join('; ')}` : '') +
        (audits.length ? `\n  failing audits: ${audits.join('; ')}` : ''),
    )
  }
} finally {
  server?.close()
}
writeFileSync(
  join(outDir, 'summary.json'),
  `${JSON.stringify({ lighthouse: VERSION, chrome, base, at: new Date().toISOString(), pages: summary }, null, 2)}\n`,
)
process.exit(failed ? 1 : 0)
