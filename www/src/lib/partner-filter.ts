// The partner filter of /certified-partners (spec docs/specs/2026-11-24-www-site-migration.md, UI/UX, Partner filter):
// seven facets; within a facet any selected value matches, across facets all must match. The state lives in the query
// string, one parameter per selected value, named after its facet
// (`?tier=ai-native-agency&industry=finance&industry=retail`), so a filtered view can be shared and Back works.
// Isomorphic and free of the schemas (the filter island bundles it).

/** The facets, in the order the filter shows them; each name is also its query parameter. */
export const FACETS = ['tier', 'industry', 'location', 'language', 'service', 'budget', 'availability'] as const
export type Facet = (typeof FACETS)[number]

export const FACET_LABELS: Record<Facet, string> = {
  tier: 'Partner type',
  industry: 'Industry',
  location: 'Location',
  language: 'Language',
  service: 'Services offered',
  budget: 'Budget',
  availability: 'Availability',
}

/** What the live template shows for a partner without a logo: Webflow's default image of the field, the site's logo. */
export const PARTNER_LOGO_PLACEHOLDER = '/files/site/69a9d816d9a3677cacfb527d_open-mercato-logo-dark.svg'

/** The headings of the facets in the filter of the live list page, as Webflow writes them. */
export const FILTER_HEADINGS: Record<Facet, string> = {
  tier: 'PARTNER TYPE',
  industry: 'Industry',
  location: 'Location',
  language: 'LANGUAGE',
  service: 'SERVICES OFFERED',
  budget: 'Budget',
  availability: 'AVAILABILITY',
}

/** The headings of the facts in the summary of the live partner page, as Webflow writes them. */
export const PROFILE_HEADINGS: Record<Facet, string> = {
  tier: 'PARTNER TYPE',
  industry: 'Industry',
  location: 'LOCATION',
  language: 'LANGUAGE',
  service: 'SERVICES OFFERED',
  budget: 'BUDGET',
  availability: 'AVAILABILITY',
}

/** The values of each facet:dictionary ids, or the option keys of budget and availability. */
export type FacetValues = Record<Facet, string[]>
/** The selected values per facet; a facet with none selected does not filter. */
export type Selection = Record<Facet, string[]>

export const emptySelection = (): Selection =>
  Object.fromEntries(FACETS.map((f) => [f, [] as string[]])) as unknown as Selection

/** Whether a partner with `values` shows under `selection`: any value within a facet, all facets across. */
export function matchesSelection(values: FacetValues, selection: Selection): boolean {
  return FACETS.every((f) => selection[f].length === 0 || selection[f].some((v) => values[f].includes(v)))
}

/** The number of selected values. */
export const selectedCount = (selection: Selection): number => FACETS.reduce((n, f) => n + selection[f].length, 0)

/** The known values of each facet, in the order the filter shows them. */
export type FacetOptions = Record<Facet, readonly string[]>

/** The selection `search` (a location.search) names: known values only, in the order of `options`. */
export function readSelection(search: string, options: FacetOptions): Selection {
  const params = new URLSearchParams(search)
  const s = emptySelection()
  for (const f of FACETS) {
    const asked = new Set(params.getAll(f))
    s[f] = options[f].filter((v) => asked.has(v))
  }
  return s
}

/** `search` with the facet parameters replaced by `selection` (other parameters kept); `''` when nothing is left. */
export function writeSelection(search: string, selection: Selection): string {
  const params = new URLSearchParams(search)
  for (const f of FACETS) params.delete(f)
  for (const f of FACETS) for (const v of selection[f]) params.append(f, v)
  const q = params.toString()
  return q === '' ? '' : `?${q}`
}

/** `selection` with `value` of `facet` added, or removed when it was there. */
export function toggleValue(selection: Selection, facet: Facet, value: string, options: FacetOptions): Selection {
  const next = new Set(selection[facet])
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return { ...selection, [facet]: options[facet].filter((v) => next.has(v)) }
}

/** One value of a facet as the filter offers it. */
export interface FacetOption {
  value: string
  label: string
  /** The inline style of a tier's label, its Webflow colours (tier options only). */
  style?: string
  /** Published partners with the value. */
  count: number
}

/** What a list shows of a partner, with its facet values for the filter (partnerCard() of partners.ts). */
export interface PartnerCardData {
  slug: string
  href: string
  name: string
  description: string
  tier: string
  /** The inline style of the tier's label, its Webflow colours. */
  tierStyle: string
  location: string
  industries: string[]
  availability: string
  logo?: { src: string; alt: string }
  /** The facet values, for the filter. */
  values: FacetValues
}
