// What the Astro pages (WP12, WP13) read at build time. `emit` writes the published files to
// site/.generated/public (the same files the site serves) and page-only data to site/.generated/data:
//   data/site.json      SiteMeta (below)
//   data/hive.json      HiveCell[] with site paths in `href` (Hive.astro adds the base path)
//   data/plans.json     { [locator]: { [lineKey]: InstallPlan | null } }, a new app of each line (the classic preset,
//                       `emptyPreset` for an app from the empty preset)
//   data/receipts.json  every receipt, baseline included, oldest first (pages /r/<id>)
//   data/files.json     [{ path, bytes }] of the published files
// The readers below are the only supported way to load them (Node, build time only).
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { HiveCell } from '../hive/render.ts'
import type { Receipt } from '../schema/data/index.ts'
import type { BuiltInIndex } from '../schema/published/builtin.ts'
import type { CompatIndex } from '../schema/published/compat.ts'
import type { Change } from '../schema/data/index.ts'
import type { ModuleDetail, ModuleReceipts, ModulesIndex } from '../schema/published/modules.ts'
import type { Radar, Surface } from '../schema/published/radar.ts'
import type { InstallPlan } from '../schema/tools.ts'
import { LocPath } from '../schema/common.ts'

export interface SiteMeta {
  schemaVersion: 1
  /** Site root plus base path, no trailing slash. */
  site: string
  base: string
  generatedAt: string
  dataVersion: string
  dataAsOf: ModulesIndex['dataAsOf']
  features: ModulesIndex['features']
  /** MCP endpoint, or null before the first Worker deploy (pages then hide the `claude mcp add` line). */
  mcpUrl: string | null
  /** WebMCP origin trial token valid today for the site's origin (5.6 item 8), or null. */
  originTrial: { token: string; expires: string } | null
  counts: ModulesIndex['counts']
  coreVersion: string
  /** The /compat sentence from data, e.g. `Peer ranges reject 53 of 62 combinations that fit statically.` */
  peersSentence: string
  /** No nightly receipt yet: `First run tonight at 02:17 UTC.` */
  firstNight: boolean
  /**
   * The `Receipts on next` tile of /radar (review r9): the radar's population by the state of its next line, so the
   * parts sum up to `population`. Absent without a radar.
   */
  radarNext?: {
    population: number
    verified: number
    broken: number
    quarantine: number
    notJudged: number
    queued: number
    skipped: number
  }
}

/** Default output folder of `emit` relative to the repo root. */
export const GENERATED_DIR = 'site/.generated'

export class SiteDataMissing extends Error {}

export interface SiteData {
  root: string
  meta: SiteMeta
  modules: ModulesIndex
  builtIn: BuiltInIndex
  compat: CompatIndex
  changes: Change[]
  radar: Radar | null
  surface: Surface | null
  hive: HiveCell[]
  plans: Record<string, Record<string, InstallPlan | null>>
  receipts: Receipt[]
  /** `/m/<path>.json` of one entry. */
  detail(path: string): ModuleDetail | null
  /** `/m/<path>/receipts.json` of one entry. */
  moduleReceipts(path: string): ModuleReceipts | null
  /** Text of `/m/<path>.md` (the Agent view of the page). */
  card(path: string): string | null
}

function read<T>(file: string): T {
  if (!existsSync(file)) throw new SiteDataMissing(`${file} is missing. Run yarn om emit first.`)
  return JSON.parse(readFileSync(file, 'utf8')) as T
}

function readOptional<T>(file: string): T | null {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : null
}

const cache = new Map<string, SiteData>()

/** Loads the generated data once per folder (`generated` defaults to <cwd>/site/.generated). */
export function loadSiteData(generated: string = resolve(GENERATED_DIR)): SiteData {
  const hit = cache.get(generated)
  if (hit) return hit
  const pub = join(generated, 'public')
  const dat = join(generated, 'data')
  const data: SiteData = {
    root: generated,
    meta: read<SiteMeta>(join(dat, 'site.json')),
    modules: read<ModulesIndex>(join(pub, 'modules.json')),
    builtIn: read<BuiltInIndex>(join(pub, 'built-in.json')),
    compat: read<CompatIndex>(join(pub, 'compat.json')),
    changes: read<Change[]>(join(pub, 'changes.json')),
    radar: readOptional<Radar>(join(pub, 'radar', 'next.json')),
    surface: readOptional<Surface>(join(pub, 'surface.json')),
    hive: read<HiveCell[]>(join(dat, 'hive.json')),
    plans: read<Record<string, Record<string, InstallPlan | null>>>(join(dat, 'plans.json')),
    receipts: read<Receipt[]>(join(dat, 'receipts.json')),
    // paths are checked against LocPath, so a route parameter can never leave site/.generated
    detail: (path) =>
      LocPath.safeParse(path).success ? readOptional<ModuleDetail>(join(pub, 'm', `${path}.json`)) : null,
    moduleReceipts: (path) =>
      LocPath.safeParse(path).success ? readOptional<ModuleReceipts>(join(pub, 'm', path, 'receipts.json')) : null,
    card: (path) => {
      if (!LocPath.safeParse(path).success) return null
      const f = join(pub, 'm', `${path}.md`)
      return existsSync(f) ? readFileSync(f, 'utf8') : null
    },
  }
  cache.set(generated, data)
  return data
}
