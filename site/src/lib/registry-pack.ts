// The registry rows as the island props carry them (review r4: the HTML of / was at 94 % of its 60 KB gzip budget
// and a fifth of it was these props). Astro wraps every value of a prop in a [type, value] pair, so the packed form
// drops what the locator already says (path, npm, github, the npm link), every null and default value, and uses
// short keys. `unpackEntry` gives back the same RegistryEntry on the server and in the browser, so the list the
// server renders and the list the island hydrates are one.
import type { CellStatus, IndexEntry, LicenseKind } from '../../../lib/schema/index.ts'
import type { RegistryEntry } from '../islands/Registry.tsx'

type Line = RegistryEntry['compat']['lines'][string]

export interface PackedEntry {
  /** locator */
  l: string
  k: IndexEntry['kind']
  t: IndexEntry['type']
  ti: string
  s: string
  c: string
  /** license: spdx, kind, mismatch */
  li: [string | null, LicenseKind, 0 | 1]
  /** sigil: glyph, phase, public routes */
  sg: [string, number, 0 | 1]
  /** lines: status, at, step */
  cl: Record<string, [CellStatus, string | null, Line['step']]>
  al: string
  cli: string
  tier: IndexEntry['tier']
  vo?: string[]
  /** lines whose new app (classic) already registers the package */
  ip?: string[]
  /** lines whose app from the empty preset registers it too */
  iep?: string[]
  /** the signal `in isolation` per line (24 Oct): status, at, step, module version, and 1 when the label names it */
  is?: Record<string, [CellStatus, string | null, Line['step'], string | null, 1?]>
  q?: NonNullable<IndexEntry['quality']>
  rec?: Record<string, string>
  pa?: string
  /** repository link of a GitHub-only entry */
  repo?: string
  /** an npm entry without its npm link */
  nn?: 1
  e?: 1
  ex?: 1
  st?: IndexEntry['status']
  nl?: 1
  f?: 1
  idle?: 'skip' | 'cannot'
  ln?: string
  /**
   * lines whose receipt judged another version (review r6): installs, receipt version, status, step, at, and 1 when
   * that version is newer than the npm data (review r7)
   */
  ov?: Record<string, [string, string | null, CellStatus, Line['step'], string | null, 1?]>
}

export function packEntry(e: RegistryEntry): PackedEntry {
  const rec = Object.fromEntries(Object.entries(e.version.recommended).filter((x): x is [string, string] => !!x[1]))
  return {
    l: e.locator,
    k: e.kind,
    t: e.type,
    ti: e.title,
    s: e.summary,
    c: e.category,
    li: [e.license.spdx, e.license.kind, e.license.mismatch ? 1 : 0],
    sg: [e.sigil.glyph, e.sigil.phase, e.sigil.publicRoutes ? 1 : 0],
    cl: Object.fromEntries(Object.entries(e.compat.lines).map(([k, c]) => [k, [c.status, c.at, c.step]])),
    al: e.anatomyLabel,
    cli: e.install.cli,
    tier: e.tier,
    ...(e.compat.verifiedOn.length ? { vo: e.compat.verifiedOn } : {}),
    ...(e.compat.inPresets?.length ? { ip: e.compat.inPresets } : {}),
    ...(e.compat.inEmptyPreset?.length ? { iep: e.compat.inEmptyPreset } : {}),
    ...(e.compat.isolation && Object.keys(e.compat.isolation).length
      ? {
          is: Object.fromEntries(
            Object.entries(e.compat.isolation).map(([k, c]) => [
              k,
              c.named ? [c.status, c.at, c.step, c.moduleVersion, 1] : [c.status, c.at, c.step, c.moduleVersion],
            ]),
          ) as NonNullable<PackedEntry['is']>,
        }
      : {}),
    ...(e.quality ? { q: e.quality } : {}),
    ...(Object.keys(rec).length ? { rec } : {}),
    ...(e.version.publishedAt ? { pa: e.version.publishedAt } : {}),
    ...(!e.npm && e.links.repo ? { repo: e.links.repo } : {}),
    ...(e.npm && !e.links.npm ? { nn: 1 as const } : {}),
    ...(e.enterprise ? { e: 1 as const } : {}),
    ...(e.tags.includes('example') ? { ex: 1 as const } : {}),
    ...(e.status !== 'active' ? { st: e.status } : {}),
    ...(!e.listed ? { nl: 1 as const } : {}),
    ...(e.featured ? { f: 1 as const } : {}),
    ...(e.idle ? { idle: e.idle } : {}),
    ...(e.levelNote ? { ln: e.levelNote } : {}),
    ...(e.others
      ? {
          ov: Object.fromEntries(
            Object.entries(e.others).map(([k, o]) => [
              k,
              [
                o.installs,
                o.other.moduleVersion,
                o.other.status,
                o.other.step,
                o.other.at,
                ...(o.other.ahead ? [1 as const] : []),
              ] as NonNullable<PackedEntry['ov']>[string],
            ]),
          ),
        }
      : {}),
  }
}

/** Inverse of packEntry for the fields a row, the filters and the sort read (RegistryEntry). */
export function unpackEntry(p: PackedEntry, lineKeys: readonly string[]): RegistryEntry {
  const npm = p.l.startsWith('npm:') ? p.l.slice(4) : null
  const github = npm ? null : p.l.slice(7)
  const [owner = '', repo = ''] = (github ?? '').split('/')
  return {
    locator: p.l,
    path: npm ?? `github/${owner.toLowerCase()}/${repo.toLowerCase()}`,
    npm,
    github,
    kind: p.k,
    type: p.t,
    enterprise: p.e === 1,
    title: p.ti,
    summary: p.s,
    category: p.c as RegistryEntry['category'],
    tags: p.ex ? ['example'] : [],
    status: p.st ?? 'active',
    listed: p.nl !== 1,
    featured: p.f === 1,
    license: { spdx: p.li[0], kind: p.li[1], mismatch: p.li[2] === 1 },
    tier: p.tier,
    quality: p.q ?? null,
    sigil: { glyph: p.sg[0], phase: p.sg[1], publicRoutes: p.sg[2] === 1 },
    version: {
      publishedAt: p.pa ?? null,
      recommended: Object.fromEntries(lineKeys.map((k) => [k, p.rec?.[k] ?? null])),
    },
    compat: {
      lines: Object.fromEntries(Object.entries(p.cl).map(([k, [status, at, step]]) => [k, { status, at, step }])),
      verifiedOn: p.vo ?? [],
      ...(p.ip ? { inPresets: p.ip } : {}),
      ...(p.iep ? { inEmptyPreset: p.iep } : {}),
      ...(p.is
        ? {
            isolation: Object.fromEntries(
              Object.entries(p.is).map(([k, [status, at, step, moduleVersion, named]]) => [
                k,
                { status, at, step, moduleVersion, named: named === 1 },
              ]),
            ),
          }
        : {}),
    },
    anatomyLabel: p.al,
    install: { cli: p.cli },
    links: { npm: npm && p.nn !== 1 ? `https://www.npmjs.com/package/${npm}` : null, repo: p.repo ?? null },
    idle: p.idle ?? null,
    ...(p.ln ? { levelNote: p.ln } : {}),
    ...(p.ov
      ? {
          others: Object.fromEntries(
            Object.entries(p.ov).map(([k, [installs, moduleVersion, status, step, at, ahead]]) => [
              k,
              { installs, other: { moduleVersion, status, step, at, ...(ahead ? { ahead: true } : {}) } },
            ]),
          ),
        }
      : {}),
  }
}
