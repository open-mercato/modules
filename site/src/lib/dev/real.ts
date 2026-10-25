// Dev only (design gallery): the published data of a real `yarn om emit --data .data` run, read through
// loadSiteData() exactly as the pages read it. The gallery prefers it when site/.generated exists, so screenshots
// show real anatomy, real compat sentences and the real Hive. Receipts come from test/fixtures until the first
// nightly run has produced any (the gallery labels those sections).
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadSiteData } from '../../../../lib/emit/site-data.ts'
import type { Facts, IndexEntry, InstallPlan, Receipt } from '../../../../lib/schema/index.ts'

export const GENERATED = resolve('site/.generated')

/** True when `yarn om emit` has written the site data the gallery can render. */
export function hasGenerated(dir: string = GENERATED): boolean {
  return existsSync(join(dir, 'data', 'site.json')) && existsSync(join(dir, 'public', 'modules.json'))
}

export interface RealGallery {
  entries: IndexEntry[]
  lines: ReturnType<typeof loadSiteData>['modules']['lines']
  categories: { id: string; title: string; wedge: string }[]
  compat: ReturnType<typeof loadSiteData>['compat']
  builtIn: ReturnType<typeof loadSiteData>['builtIn']['modules']
  coreVersion: string
  radar: ReturnType<typeof loadSiteData>['radar']
  surface: ReturnType<typeof loadSiteData>['surface']
  hive: ReturnType<typeof loadSiteData>['hive']
  receipts: Receipt[]
  dataAsOf: { nightly: string | null; npm: string | null }
  peersSentence: string
  firstNight: boolean
  factsOf: (e: IndexEntry) => Facts | null
  planOf: (e: IndexEntry, line: string) => InstallPlan | null
}

export function realGallery(dir: string = GENERATED): RealGallery {
  const d = loadSiteData(dir)
  const facts = new Map<string, Facts | null>()
  return {
    entries: d.modules.entries,
    lines: d.modules.lines,
    categories: d.modules.categories.map((c) => ({ id: c.id, title: c.title, wedge: c.wedge })),
    compat: d.compat,
    builtIn: d.builtIn.modules,
    coreVersion: d.builtIn.coreVersion,
    radar: d.radar,
    surface: d.surface,
    hive: d.hive,
    receipts: d.receipts,
    dataAsOf: d.meta.dataAsOf,
    peersSentence: d.meta.peersSentence,
    firstNight: d.meta.firstNight,
    factsOf: (e) => {
      if (!facts.has(e.path)) facts.set(e.path, d.detail(e.path)?.facts ?? null)
      return facts.get(e.path) ?? null
    },
    planOf: (e, line) => d.plans[e.locator]?.[line] ?? null,
  }
}
