// The Phase 4 collections as the pages read them (astro:content): published case studies, partners and jobs, and the
// dictionaries they reference. Build only; the selection rules live in case-studies.ts, partners.ts and jobs.ts.
import { getCollection } from 'astro:content'
import { MAIN_SITE_ORIGIN } from '../../../lib/core/main-site.ts'
import { fileURLToPath } from 'node:url'
import { servesSite } from '../../body-links.ts'
import type { LinkRules } from './body-html.ts'
import { newestFirst, publishedCaseStudies, type CaseStudyEntry, type PartnerIndex } from './case-studies.ts'
import { publishedJobs, type JobEntry } from './jobs.ts'
import { publishedPartners, type Dictionaries, type Dictionary, type PartnerEntry } from './partners.ts'

type DictionaryEntry = {
  id: string
  data: { name: string; order?: number; webflowId?: string; backgroundColor?: string; textColor?: string }
}

async function dictionary(name: string): Promise<Dictionary> {
  const entries = (await getCollection(name as never)) as unknown as DictionaryEntry[]
  return new Map(
    entries.map((e) => [
      e.id,
      {
        name: e.data.name,
        order: e.data.order,
        ...(e.data.backgroundColor ? { backgroundColor: e.data.backgroundColor } : {}),
        ...(e.data.textColor ? { textColor: e.data.textColor } : {}),
      },
    ]),
  )
}

export interface CaseStudyData {
  published: CaseStudyEntry[]
  categories: Map<string, string>
  /** The category ids in the order of Webflow's list of them, newest first. */
  categoryOrder: string[]
  partners: PartnerIndex
}

export async function caseStudyData(): Promise<CaseStudyData> {
  const all = (await getCollection('caseStudies')) as unknown as CaseStudyEntry[]
  const categoryEntries = (await getCollection('caseStudyCategories')) as unknown as DictionaryEntry[]
  const categories = new Map(categoryEntries.map((c) => [c.id, c.data.name]))
  const partners = (await getCollection('partners')) as unknown as PartnerEntry[]
  return {
    published: publishedCaseStudies(all),
    categories,
    categoryOrder: newestFirst(categoryEntries.map((c) => ({ id: c.id, webflowId: c.data.webflowId }))),
    partners: {
      names: new Map(partners.map((p) => [p.id, p.data.name])),
      published: new Set(publishedPartners(partners).map((p) => p.id)),
    },
  }
}

export interface PartnerData {
  published: PartnerEntry[]
  dict: Dictionaries
}

export async function partnerData(): Promise<PartnerData> {
  const all = (await getCollection('partners')) as unknown as PartnerEntry[]
  return {
    published: publishedPartners(all),
    dict: {
      tiers: await dictionary('partnerTiers'),
      industries: await dictionary('partnerIndustries'),
      locations: await dictionary('partnerLocations'),
      languages: await dictionary('partnerLanguages'),
      services: await dictionary('partnerServices'),
    },
  }
}

/**
 * The link rules of Markdown bodies (body-html.ts) for a Markdown field a page renders itself (a case study's
 * technology stack), from the collections this build routes: the rules www/body-links.ts gives Astro's Markdown
 * processor, without reading files.
 */
export async function linkRules(): Promise<LinkRules> {
  const posts = (await getCollection('blog')) as unknown as { id: string; data: { draft: boolean } }[]
  const cases = await caseStudyData()
  const partners = await partnerData()
  const jobs = await jobData()
  const ids = (xs: { id: string }[]): Set<string> => new Set(xs.map((x) => x.id))
  return {
    origin: MAIN_SITE_ORIGIN,
    details: new Map([
      ['blog-posts', ids(posts.filter((p) => !p.data.draft))],
      ['case-studies', ids(cases.published)],
      ['certified-partners', ids(partners.published)],
      ['careers-jobs', ids(jobs)],
    ]),
    // from the repository root, as counts.ts reads the catalog's output: the same path from the source file and from
    // the bundled chunk of the build (dist-www/.prerender/chunks/)
    serves: servesSite(fileURLToPath(new URL('../../../www/content/', import.meta.url))),
  }
}

export async function jobData(): Promise<JobEntry[]> {
  return publishedJobs((await getCollection('jobs')) as unknown as JobEntry[])
}
