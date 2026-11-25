// The jobs of the main site (spec docs/specs/2026-11-24-www-site-migration.md, Phase 4): which jobs route at
// /careers-jobs/<slug> and the SEO of a job page, with `JobPosting` JSON-LD for an open job. The list of jobs is part of
// /careers, a unique page of the `pages` collection (Phase 6), still served by Webflow until then. A draft is validated
// but never routed, linked or put in a sitemap (D6). Isomorphic.
import { canonicalUrl, SITE_NAME, TITLE_SUFFIX } from './blog.ts'
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

export interface JobSeo {
  title: string
  description: string
  canonical: string
}

export function jobSeo(job: JobEntry, origin: string): JobSeo {
  return {
    title: `${job.data.title}${TITLE_SUFFIX}`,
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
