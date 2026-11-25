// The Phase 4 entries of www/content/ as the build sees them: frontmatter and dictionaries through the schemas of
// lib/schema/www-content.ts (references are slugs here, slugRef).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import type { z } from 'zod'
import { caseStudySchema, jobSchema, partnerSchema } from '../../lib/schema/www-content.ts'
import type { CaseStudyEntry } from '../../www/src/lib/case-studies.ts'
import type { JobEntry } from '../../www/src/lib/jobs.ts'
import type { Dictionaries, Dictionary, PartnerEntry } from '../../www/src/lib/partners.ts'
import { frontmatter } from '../../www/body-links.ts'
import { CONTENT } from './blog-content.ts'

function entries<T>(dir: string, schema: z.ZodType): T[] {
  return readdirSync(join(CONTENT, dir))
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map(
      (f) =>
        ({ id: f.slice(0, -3), data: schema.parse(frontmatter(readFileSync(join(CONTENT, dir, f), 'utf8'))) }) as T,
    )
}

export const caseStudyEntries = (): CaseStudyEntry[] => entries('case-studies', caseStudySchema())
export const partnerEntries = (): PartnerEntry[] => entries('partners', partnerSchema())
export const jobEntries = (): JobEntry[] => entries('jobs', jobSchema())

export function dictionary(file: string): Dictionary {
  const data = parse(readFileSync(join(CONTENT, file), 'utf8')) as Record<string, { name: string; order?: number }>
  return new Map(Object.entries(data).map(([id, v]) => [id, { name: v.name, order: v.order }]))
}

export function dictionaries(): Dictionaries {
  return {
    tiers: dictionary('partner-tiers.yaml'),
    industries: dictionary('partner-industries.yaml'),
    locations: dictionary('partner-locations.yaml'),
    languages: dictionary('partner-languages.yaml'),
    services: dictionary('partner-services.yaml'),
  }
}
