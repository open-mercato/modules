// The jobs of the main site (spec 2026-11-24-www-site-migration.md of PR #23, Phase 4): which jobs route at
// /careers-jobs/<slug> and the SEO of a job page, with `JobPosting` JSON-LD for an open job. The list of jobs is part of
// /careers, a unique page of the `pages` collection (Phase 6). A draft is validated
// but never routed, linked or put in a sitemap (D6). Isomorphic.
import { canonicalUrl, SITE_NAME } from './blog.ts'
import { breadcrumbJsonLd, publishedEntries } from './entries.ts'

export type EmploymentTypeKey = 'full-time' | 'part-time' | 'contract' | 'internship'

/** A job entry: its id (the slug) and its frontmatter after the schema (jobSchema). */
export interface JobEntry {
  id: string
  data: {
    webflowId?: string
    title: string
    description: string
    location: string
    employmentType: EmploymentTypeKey
    department?: string
    salary?: string
    techStack?: string
    applyUrl: string
    open: boolean
    order?: number
    datePosted: Date
    validThrough?: Date
    draft: boolean
  }
}

export const CAREERS_PATH = '/careers'
export const JOB_PREFIX = '/careers-jobs/'

/** The site path of a job. */
export const jobPath = (slug: string): string => `${JOB_PREFIX}${slug}`

/** The jobs the site routes: every entry that is not a draft, open or not (a closed job says so), in list order. */
export function publishedJobs<T extends JobEntry>(all: readonly T[]): T[] {
  return publishedEntries(all)
}

/** schema.org's employmentType of each key. */
export const JOB_POSTING_EMPLOYMENT: Record<EmploymentTypeKey, string> = {
  'full-time': 'FULL_TIME',
  'part-time': 'PART_TIME',
  contract: 'CONTRACTOR',
  internship: 'INTERN',
}

/** Whether a job's location text offers remote work. */
export const isRemote = (location: string): boolean => /\bremote\b/i.test(location)

/**
 * The link of "Apply now": an e-mail address gets the subject the live template writes (`Application: <title>`), unless
 * it has a query of its own; any other address is kept.
 */
export function applyHref(applyUrl: string, title: string): string {
  if (!applyUrl.startsWith('mailto:') || applyUrl.includes('?')) return applyUrl
  return `${applyUrl}?subject=${encodeURIComponent(`Application: ${title}`)}`
}

export interface JobSeo {
  title: string
  description: string
  canonical: string
}

/**
 * The title suffix of a job page as the Webflow template writes it (`seo.title` of the template page:
 * `{name} | Careers <long dash> Open Mercato`), with the long dash written `-` as every migrated text (spec A5,
 * AGENTS.md rule 7; the `--planned` file of compare-live lists the difference). The live titles are the rule (owner's
 * decision of 25 Nov 2026), not the spec's `<title> | Open Mercato`.
 */
export const JOB_TITLE_SUFFIX = ' | Careers - Open Mercato'

export function jobSeo(job: JobEntry, origin: string): JobSeo {
  return {
    title: `${job.data.title}${JOB_TITLE_SUFFIX}`,
    description: job.data.description,
    canonical: canonicalUrl(origin, jobPath(job.id)),
  }
}

/**
 * `JobPosting` (only while the job is open) and `BreadcrumbList` (Home, Careers, the job) of a job page, as one JSON-LD
 * graph. `bodyHtml` is the job's body as HTML, the full description JobPosting asks for; without it the short
 * description stands in. The salary is free text in the content, so it stays out of `baseSalary`.
 */
export function jobJsonLd(job: JobEntry, origin: string, bodyHtml?: string): Record<string, unknown> {
  const seo = jobSeo(job, origin)
  const d = job.data
  const graph: Record<string, unknown>[] = []
  if (d.open) {
    const posting: Record<string, unknown> = {
      '@type': 'JobPosting',
      '@id': `${seo.canonical}#job`,
      title: d.title,
      description: bodyHtml && bodyHtml.trim() !== '' ? bodyHtml : d.description,
      url: seo.canonical,
      datePosted: d.datePosted.toISOString(),
      employmentType: JOB_POSTING_EMPLOYMENT[d.employmentType],
      hiringOrganization: { '@type': 'Organization', name: SITE_NAME, url: canonicalUrl(origin, '/') },
      jobLocation: { '@type': 'Place', name: d.location },
      directApply: false,
    }
    if (isRemote(d.location)) posting.jobLocationType = 'TELECOMMUTE'
    if (d.validThrough) posting.validThrough = d.validThrough.toISOString()
    if (d.department) posting.occupationalCategory = d.department
    if (d.techStack) posting.skills = d.techStack
    graph.push(posting)
  }
  graph.push(
    breadcrumbJsonLd(origin, [
      { name: 'Home', path: '/' },
      { name: 'Careers', path: CAREERS_PATH },
      { name: d.title, path: jobPath(job.id) },
    ]),
  )
  return { '@context': 'https://schema.org', '@graph': graph }
}
