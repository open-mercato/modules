// Fit of many module versions against several OM versions: unpack the OM packages once per version, build one
// program per imported package, evaluate every module, then assemble FitCells (drift against latest,
// declared peers, host duplicates against the create-mercato-app template of that version).
import type { FitCell } from '../schema/index.ts'
import type { TarballStore, TemplateDeps } from './om-tarballs.ts'
import { ensureOmPackages, getPackument, resolveAppVersion, templateDeps } from './om-tarballs.ts'
import type { ImportMap, StaticResult } from './static.ts'
import {
  checkImports,
  createWorld,
  fitCell,
  hostDuplicates,
  isHostPackage,
  omPackagesOf,
  preparePrograms,
} from './static.ts'

export interface FitModule {
  /** Cell key: `<locator>@<version>`. */
  key: string
  locator: string
  version: string
  imports: ImportMap
  omPeers: Readonly<Record<string, string>>
  dependencies: Readonly<Record<string, string>>
}

export type Log = (msg: string) => void

/** Static results of every module against one OM version. */
export async function computeStatic(
  store: TarballStore,
  version: string,
  modules: readonly FitModule[],
  log: Log = () => {},
): Promise<Map<string, StaticResult>> {
  const t0 = Date.now()
  const all = modules.map((m) => m.imports)
  const dirs = await ensureOmPackages(store, version, omPackagesOf(all))
  const world = createWorld({ version, dirs })
  preparePrograms(world, all)
  const out = new Map<string, StaticResult>()
  for (const m of modules) out.set(m.key, checkImports(world, m.imports))
  const missingPkgs = [...dirs].filter(([, d]) => d === null).map(([p]) => p)
  log(
    `fit ${version}: ${modules.length} modules, ${dirs.size} OM packages` +
      (missingPkgs.length ? ` (not published: ${missingPkgs.join(', ')})` : '') +
      `, ${Date.now() - t0} ms`,
  )
  return out
}

/** Versions a fresh app of this template resolves for the host packages the modules bundle. */
export async function appVersions(
  store: TarballStore,
  template: TemplateDeps | null,
  modules: readonly FitModule[],
  asOf: Date,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  if (!template) return out
  const names = new Set<string>()
  for (const m of modules) for (const n of Object.keys(m.dependencies)) if (isHostPackage(n)) names.add(n)
  for (const name of [...names].sort()) {
    if (!(name in template.dependencies) && !(name in template.devDependencies) && !(name in template.resolutions)) {
      out.set(name, null)
      continue
    }
    const pack = await getPackument(store, name)
    out.set(name, resolveAppVersion(template, name, pack, asOf))
  }
  return out
}

export interface ComputeFitOptions {
  versions: readonly string[]
  /** Version of the `latest` line; drift is computed against it. Null: no drift. */
  latest: string | null
  modules: readonly FitModule[]
  /** Moment a fresh app resolves its dependencies (host duplicates). */
  asOf: Date
  log?: Log
}

/** FitCells per OM version: `version -> cell key -> FitCell`. */
export async function computeFit(
  store: TarballStore,
  opts: ComputeFitOptions,
): Promise<Map<string, Record<string, FitCell>>> {
  const log = opts.log ?? (() => {})
  const latestRes = opts.latest ? await computeStatic(store, opts.latest, opts.modules, log) : null
  const out = new Map<string, Record<string, FitCell>>()
  for (const version of opts.versions) {
    const res =
      version === opts.latest && latestRes ? latestRes : await computeStatic(store, version, opts.modules, log)
    const template = await templateDeps(store, version)
    if (!template) log(`fit ${version}: no create-mercato-app@${version} template, host duplicates skipped`)
    const app = await appVersions(store, template, opts.modules, opts.asOf)
    const cells: Record<string, FitCell> = {}
    for (const m of opts.modules) {
      const result = res.get(m.key) as StaticResult
      const latest = version !== opts.latest && latestRes ? (latestRes.get(m.key) ?? null) : null
      cells[m.key] = fitCell({
        result,
        latest,
        omPeers: m.omPeers,
        omVersion: version,
        hostDuplicates: hostDuplicates(m.dependencies, (n) => app.get(n) ?? null),
      })
    }
    out.set(version, cells)
  }
  return out
}
