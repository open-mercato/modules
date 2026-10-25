// Built-in modules of @open-mercato/core (spec 4.6 `BuiltInIndex`, 11.2): facts from
// `dist/agentic/guides/module-facts.v2.json` in the tarball of `@open-mercato/cli@<coreVersion>`,
// filtered to `sourcePackage == "@open-mercato/core"`. The count comes from the data (0.9.0: 46).
// Routes are not in that file (`apiRoutes` is empty in the publish build), so `routesMeasured: false`.
// Categories come from policy/builtin-categories.yml; a core module outside the map gets
// `operations` and a warning, a map ID outside the data gets a warning (spec 4.4). Never an error.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { CategoryId, type CategoryId as CategoryIdT } from '../schema/common.ts'
import { BuiltinData } from '../schema/data/facts.ts'
import { BuiltinCategoriesFile, BuiltinUpcomingFile } from '../schema/policy.ts'
import { isFile } from './ast.ts'
import { glyphOf } from './diff.ts'
import { engineVersion, mapModule, sortLint } from './extract.ts'
import type { OmModuleFacts } from './om-cli.d.ts'
import { fetchNpmTarball, npmManifest, removeDir, tempDir, unpackTarball } from './unpack.ts'

export const MODULE_FACTS_PATH = 'dist/agentic/guides/module-facts.v2.json'
export const CORE_PACKAGE = '@open-mercato/core'

export type ModuleFactsJson = Record<string, OmModuleFacts>

/** Built-in data from a parsed module-facts.v2.json. */
export function builtinFromModuleFacts(
  json: ModuleFactsJson,
  coreVersion: string,
  cliVersion: string,
  computedAt: string,
): BuiltinData {
  const diagnostics: string[] = []
  const ids = Object.keys(json)
    .filter((id) => json[id]?.sourcePackage === CORE_PACKAGE)
    .sort()
  const versions = new Set(ids.map((id) => json[id]?.sourceVersion).filter(Boolean))
  if (versions.size > 1 || (versions.size === 1 && !versions.has(coreVersion)))
    diagnostics.push(`module-facts.v2.json describes core ${[...versions].join(', ')}, requested ${coreVersion}`)
  const coreIds = new Set(ids)
  const modules = []
  for (const id of ids) {
    if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(id)) {
      diagnostics.push(`core module ${id.slice(0, 60)} fails the module ID pattern and was skipped`)
      continue
    }
    const m = mapModule(
      id,
      json[id] as OmModuleFacts,
      { pkgRoot: null, moduleRoot: null, routes: null, integration: null, env: [], hosts: [], imports: {} },
      coreIds,
      null,
    )
    modules.push({ ...m.facts, glyph: glyphOf(m.facts), lint: sortLint(m.sanitizer.findings()) })
  }
  const data = {
    factsVersion: 1 as const,
    coreVersion,
    extractor: {
      engine: `@open-mercato/cli@${cliVersion}`,
      factsContractVersion: 2 as const,
      source: 'module-facts.v2.json' as const,
      cliVersion,
    },
    computedAt,
    routesMeasured: false,
    modules,
    diagnostics: ['Routes, migrations, env and hosts are not in module-facts.v2.json.', ...diagnostics].slice(0, 50),
  }
  return BuiltinData.parse(data)
}

export interface CategoryMapping {
  categories: Record<string, CategoryIdT>
  /** Human-readable warnings for $GITHUB_STEP_SUMMARY and the discovery issue. */
  warnings: string[]
}

/** Category per built-in module from policy/builtin-categories.yml (unknown = operations + warning). */
export function builtinCategories(
  data: BuiltinData,
  map: Record<string, string> | null,
  upcoming: readonly string[] = [],
): CategoryMapping {
  const categories: Record<string, CategoryIdT> = {}
  const warnings: string[] = []
  const known = map ?? {}
  if (!map) warnings.push('policy/builtin-categories.yml is missing: every core module is in operations.')
  for (const m of data.modules) {
    const c = CategoryId.safeParse(known[m.id])
    if (c.success) categories[m.id] = c.data
    else {
      categories[m.id] = 'operations'
      if (map)
        warnings.push(
          `Core module ${m.id} (${data.coreVersion}) is not in policy/builtin-categories.yml: placed in operations.`,
        )
    }
  }
  const ids = new Set(data.modules.map((m) => m.id))
  for (const id of Object.keys(known).sort())
    if (!ids.has(id) && !upcoming.includes(id))
      warnings.push(`policy/builtin-categories.yml lists ${id}, which is not a core module of ${data.coreVersion}.`)
  for (const id of [...upcoming].sort())
    if (ids.has(id))
      warnings.push(`policy/builtin-upcoming.yml lists ${id}, which core ${data.coreVersion} ships: remove it there.`)
  return { categories, warnings }
}

/** IDs of policy/builtin-upcoming.yml ([] when the file does not exist). */
export function readBuiltinUpcoming(root: string): string[] {
  const file = join(root, 'policy', 'builtin-upcoming.yml')
  if (!isFile(file)) return []
  return Object.keys(BuiltinUpcomingFile.parse(parseYaml(readFileSync(file, 'utf8')) ?? {}))
}

/** Parse policy/builtin-categories.yml (null when the file does not exist). */
export function readBuiltinCategories(root: string): Record<string, string> | null {
  const file = join(root, 'policy', 'builtin-categories.yml')
  if (!isFile(file)) return null
  return BuiltinCategoriesFile.parse(parseYaml(readFileSync(file, 'utf8')) ?? {})
}

/** module-facts.v2.json of `@open-mercato/cli@<cliVersion>`: the installed copy when versions match, else the npm tarball. */
export async function loadModuleFactsJson(
  cliVersion: string,
  opts: { offline?: boolean } = {},
): Promise<ModuleFactsJson> {
  if (engineVersion() === cliVersion) {
    const local = join(dirname(fileURLToPath(import.meta.resolve('@open-mercato/cli'))), '..', MODULE_FACTS_PATH)
    if (isFile(local)) return JSON.parse(readFileSync(local, 'utf8')) as ModuleFactsJson
  }
  if (opts.offline)
    throw new Error(`module-facts.v2.json of @open-mercato/cli@${cliVersion} is not installed and --offline is set`)
  const manifest = await npmManifest('@open-mercato/cli', cliVersion)
  const buf = await fetchNpmTarball(manifest)
  const dir = tempDir('om-builtin-')
  try {
    await unpackTarball(buf, dir, { only: (p) => p === MODULE_FACTS_PATH })
    const file = join(dir, MODULE_FACTS_PATH)
    if (!isFile(file)) throw new Error(`@open-mercato/cli@${cliVersion} has no ${MODULE_FACTS_PATH}`)
    return JSON.parse(readFileSync(file, 'utf8')) as ModuleFactsJson
  } finally {
    removeDir(dir)
  }
}
