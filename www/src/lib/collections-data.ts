// The Phase 4 collections as the pages read them (astro:content): published case studies, partners and jobs, and the
// dictionaries they reference. Build only; the selection rules live in case-studies.ts, partners.ts and jobs.ts.
import { getCollection } from 'astro:content'
import { MAIN_SITE_ORIGIN } from '../../../lib/core/main-site.ts'
import { servesFixed } from '../../body-links.ts'
import type { LinkRules } from './body-html.ts'
import { publishedCaseStudies, type CaseStudyEntry, type PartnerIndex } from './case-studies.ts'
import { publishedJobs, type JobEntry } from './jobs.ts'
import { publishedPartners, type Dictionaries, type Dictionary, type PartnerEntry } from './partners.ts'

async function dictionary(name: string): Promise<Dictionary> {
  const entries = (await getCollection(name as never)) as unknown as {
    id: string
    data: { name: string; order?: number }
  }[]
  return new Map(entries.map((e) => [e.id, { name: e.data.name, order: e.data.order }]))
}

export interface CaseStudyData {
  published: CaseStudyEntry[]
  categories: Map<string, string>
  partners: PartnerIndex
}

export async function caseStudyData(): Promise<CaseStudyData> {
  const all = (await getCollection('caseStudies')) as unknown as CaseStudyEntry[]
  const categories = new Map([...(await dictionary('caseStudyCategories'))].map(([id, d]) => [id, d.name]))
  const partners = (await getCollection('partners')) as unknown as PartnerEntry[]
  return {
    published: publishedCaseStudies(all),
    categories,
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
    serves: servesFixed,
  }
}

export async function jobData(): Promise<JobEntry[]> {
  return publishedJobs((await getCollection('jobs')) as unknown as JobEntry[])
}
