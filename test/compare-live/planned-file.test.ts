// The committed `--planned` file of compare-live (www/compare-live-planned.yaml, RUNBOOK step C6): it parses, names
// each URL and field once, gives every entry its reason, and plans only migrated pages (the landings since Phase 5),
// never a docs redirect or a unique page (those fail until they are migrated). Each URL is a published entry of the
// content or a list page, so a renamed or unpublished entry cannot leave a stale plan behind.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePlanned } from '../../lib/commands/compare-live.ts'
import { postPath, publishedPosts } from '../../www/src/lib/blog.ts'
import { caseStudyPath, publishedCaseStudies } from '../../www/src/lib/case-studies.ts'
import { landingPath, publishedLandings } from '../../www/src/lib/landings.ts'
import { jobPath, publishedJobs } from '../../www/src/lib/jobs.ts'
import { partnerPath, publishedPartners } from '../../www/src/lib/partners.ts'
import { pagePath } from '../../www/src/lib/pages.ts'
import { parse } from 'yaml'
import { ROOT } from '../emit/helpers.ts'
import { blogEntries } from '../www/blog-content.ts'
import { caseStudyEntries, jobEntries, partnerEntries } from '../www/collections-content.ts'
import { landingEntries } from '../www/landings-content.ts'

const FILE = 'www/compare-live-planned.yaml'
const planned = parsePlanned(readFileSync(join(ROOT, FILE), 'utf8'), FILE)
const PAGES = join(ROOT, 'www', 'content', 'pages')
/** The site paths of the published unique pages (www/content/pages, Phase 6). */
const uniquePages = readdirSync(PAGES)
  .filter(
    (f) => f.endsWith('.yaml') && (parse(readFileSync(join(PAGES, f), 'utf8')) as { draft?: boolean }).draft !== true,
  )
  .map((f) => pagePath(f.slice(0, -5)))

describe('the committed planned differences', () => {
  it('name each URL and field once, each with a reason', () => {
    expect(planned.length).toBeGreaterThan(0)
    const keys = planned.map((p) => `${p.url} ${p.field}`)
    expect(new Set(keys).size).toBe(keys.length)
    for (const p of planned) expect(p.note?.trim(), `${p.url} ${p.field}`).toMatch(/\.$/)
  })

  it('plan only published migrated pages, unique pages and lists, never a prefix', () => {
    const pages = new Set([
      '/blog',
      '/case-studies',
      '/certified-partners',
      ...publishedPosts(blogEntries()).map((p) => postPath(p.id)),
      ...publishedCaseStudies(caseStudyEntries()).map((c) => caseStudyPath(c.id)),
      ...publishedPartners(partnerEntries()).map((p) => partnerPath(p.id)),
      ...publishedJobs(jobEntries()).map((j) => jobPath(j.id)),
      ...publishedLandings(landingEntries()).map((l) => landingPath(l.id)),
      ...uniquePages,
    ])
    for (const p of planned) expect(pages.has(p.url), p.url).toBe(true)
  })

  it('plan no redirect or status difference: those are failures to fix', () => {
    for (const p of planned) expect(['request', 'status', 'redirect'], `${p.url} ${p.field}`).not.toContain(p.field)
  })
})
