// The template gallery and pages (docs/specs/2026-10-29-templates.md, UI/UX): use case labels, the Open Mercato line
// badge, the verification state, the gallery order and the create command. Pure: every value comes from the published
// `/templates.json` and `/t/<owner>/<repo>.json` (rule 8).
import type { TemplateDetail, TemplateIndexEntry } from '../../../lib/schema/published/templates.ts'
import { TemplateUseCase, templatePagePath, templatePath } from '../../../lib/schema/template.ts'

/** Names of the closed use case list (A3), in its order. */
export const USE_CASE_LABELS: Record<TemplateUseCase, string> = {
  crm: 'CRM',
  commerce: 'Commerce',
  'b2b-portal': 'B2B portal',
  'partner-portal': 'Partner portal',
  operations: 'Operations',
  'field-service': 'Field service',
  'internal-tools': 'Internal tools',
  starter: 'Starter',
}

/**
 * `create-mercato-app --template` ships in Phase 4 (open-mercato/open-mercato). Until then a page shows the command as
 * planned text with no copy button, the rule of the Phase 0 page and of the Markdown twin. Phase 4 sets this to true.
 */
export const TEMPLATE_OPTION_RELEASED = false

/** The create command of an entry, or null for `hold` (hold policy: no create command). */
export function createCommand(t: Pick<TemplateIndexEntry, 'slug' | 'github' | 'status'>): string | null {
  return t.status === 'hold' ? null : `npx create-mercato-app my-app --template ${t.slug ?? t.github}`
}

export interface LineBadge {
  /** `Built on 0.9.x`, or `Line unknown` when yarn.lock pins no core. */
  text: string
  /** `2 lines behind`, null on the latest line or across a major. */
  behind: string | null
  title: string
}

const lines = (n: number): string => `${n} ${n === 1 ? 'line' : 'lines'}`

/** The Open Mercato line badge of one sha; null while its archive was not read. */
export function lineBadge(
  f: { omLine: string | null; linesBehind: number | null; latestStable?: string | null } | null,
): LineBadge | null {
  if (!f) return null
  if (!f.omLine)
    return { text: 'Line unknown', behind: null, title: 'yarn.lock of this commit pins no @open-mercato/core.' }
  const text = `Built on ${f.omLine}.x`
  const latest = f.latestStable ? ` The latest stable release is ${f.latestStable}.` : ''
  if (f.linesBehind !== null && f.linesBehind > 0)
    return {
      text,
      behind: `${lines(f.linesBehind)} behind`,
      title: `Pins @open-mercato/core ${f.omLine}.x, ${lines(f.linesBehind)} behind the latest line.${latest}`,
    }
  return { text, behind: null, title: `Pins @open-mercato/core ${f.omLine}.x.${latest}` }
}

/** The verification state of an entry (Phase 1b fills `verified`; until then every entry is not verified, D10). */
export function verification(v: TemplateIndexEntry['verified']): { text: string; title: string; ok: boolean } {
  return v
    ? {
        text: `Verified on ${v.omVersion}`,
        title: `The nightly template smoke passed on ${v.sha.slice(0, 12)}.`,
        ok: true,
      }
    : { text: 'Not verified', title: 'The nightly template smoke has not run on this commit.', ok: false }
}

export interface GalleryCard {
  /** `owner/repo` in lower case. */
  path: string
  /** Site path of the page, `/t/<owner>/<repo>`. */
  page: string
  github: string
  owner: string
  name: string
  useCase: TemplateUseCase
  useCaseLabel: string
  summary: string
  status: TemplateIndexEntry['status']
  reason: string | null
  featured: boolean
  archived: boolean
  verified: ReturnType<typeof verification>
  badge: LineBadge | null
  /** null while the archive of the sha was not read. */
  enterprise: boolean | null
  stars: number | null
  pushedAt: string | null
  shot: { src: string; alt: string } | null
}

/**
 * The gallery (UI/UX): `active` and `hold` entries; `unmaintained` ones keep their page but leave the gallery. Sorted
 * by featured, then a green smoke, then the last push. A `hold` entry gets no boost, so it follows every active one.
 */
export function galleryCards(
  index: readonly TemplateIndexEntry[],
  detail: (path: string) => TemplateDetail | null,
): GalleryCard[] {
  const cards: GalleryCard[] = []
  for (const t of index) {
    if (t.status === 'unmaintained') continue
    const path = templatePath(t.github)
    const d = detail(path)
    const [owner = '', name = ''] = t.github.split('/')
    cards.push({
      path,
      page: templatePagePath(t.github),
      github: t.github,
      owner,
      name,
      useCase: t.useCase,
      useCaseLabel: USE_CASE_LABELS[t.useCase],
      summary: t.summary,
      status: t.status,
      reason: t.reason,
      featured: d?.entry.featured ?? false,
      archived: t.archived,
      verified: verification(t.verified),
      badge: lineBadge(t.verified?.facts ?? t.source.facts),
      enterprise: (t.verified?.facts ?? t.source.facts)?.requiresEnterprise ?? null,
      stars: d?.repo?.stars ?? null,
      pushedAt: d?.repo?.pushedAt ?? null,
      shot: d?.entry.screenshots?.[0] ?? null,
    })
  }
  const held = (c: GalleryCard): number => (c.status === 'hold' ? 1 : 0)
  const boost = (c: GalleryCard, on: boolean): number => (c.status !== 'hold' && on ? 0 : 1)
  return cards.sort(
    (a, b) =>
      held(a) - held(b) ||
      boost(a, a.featured) - boost(b, b.featured) ||
      boost(a, a.verified.ok) - boost(b, b.verified.ok) ||
      (b.pushedAt ?? '').localeCompare(a.pushedAt ?? '') ||
      a.path.localeCompare(b.path),
  )
}

/** The use case filter: every use case with a card, in the order of the closed list, with its count. */
export function useCaseFilter(cards: readonly GalleryCard[]): { id: TemplateUseCase; label: string; count: number }[] {
  return TemplateUseCase.options
    .map((id) => ({ id, label: USE_CASE_LABELS[id], count: cards.filter((c) => c.useCase === id).length }))
    .filter((u) => u.count > 0)
}
