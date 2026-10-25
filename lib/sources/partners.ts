// Certified partners of Open Mercato (D25, D-OPEN-6): `partners[].company` and `partners[].contributors[]` from
// open-mercato/open-mercato/.github/certified-partners.yml, read through raw.githubusercontent.com on every sync.
// The file has no `owners` field; contributors are GitHub logins of people.
import { parse } from 'yaml'
import { z } from 'zod'
import type { Http } from './http.ts'
import { HttpError } from './http.ts'

export const PARTNERS_URL =
  'https://raw.githubusercontent.com/open-mercato/open-mercato/main/.github/certified-partners.yml'

export const PartnersFile = z.object({
  partners: z.array(
    z.object({
      company: z.string().min(1).max(100),
      contributors: z.array(z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/)).default([]),
    }),
  ),
})
export type PartnersFile = z.output<typeof PartnersFile>

export interface Partners {
  companies: string[]
  /** lower-case login -> company */
  contributors: Map<string, string>
}

export function parsePartners(text: string): Partners {
  const file = PartnersFile.parse(parse(text))
  const contributors = new Map<string, string>()
  for (const p of file.partners) for (const c of p.contributors) contributors.set(c.toLowerCase(), p.company)
  return { companies: file.partners.map((p) => p.company), contributors }
}

export async function fetchPartners(http: Http, url = PARTNERS_URL): Promise<Partners> {
  const res = await http.request(url, { text: true })
  if (res.status !== 200) throw new HttpError(`HTTP ${res.status} for ${url}`, url, res.status)
  return parsePartners(res.text)
}

/** True when `company` is a certified partner (case and spacing insensitive). */
export function isPartnerCompany(p: Partners, company: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  return p.companies.some((c) => norm(c) === norm(company))
}
