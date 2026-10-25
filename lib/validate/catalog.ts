// What `validate` compares a descriptor with: every descriptor in the tree, the policy files, and (read only)
// the `data` branch checkout for lines and built-in modules. Missing data is not an error: the first PR of the
// catalog runs before the data branch exists, so built-in facts then come from the pinned @open-mercato/cli.
import { existsSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { parse } from 'yaml'
import { engineVersion } from '../rentgen/extract.ts'
import { builtinFromModuleFacts, loadModuleFactsJson } from '../rentgen/builtin.ts'
import {
  BuiltinData,
  CategoriesFile,
  CommunityFile,
  Descriptor,
  IgnoreFile,
  Lines,
  OfficialMaintainersFile,
  ReservedFile,
  descriptorLocator,
  type BuiltinData as BuiltinDataT,
  type CommunityFile as CommunityFileT,
  type Descriptor as DescriptorT,
  type IgnoreFile as IgnoreFileT,
  type Lines as LinesT,
} from '../schema/index.ts'
import { OfficialCoverageFile } from '../schema/data/coverage.ts'
import { curatorsFrom } from '../sources/entries.ts'
import { yamlFiles } from './format.ts'

export interface CatalogEntry {
  /** Repo-relative path, `modules/...yml`. */
  file: string
  locator: string
  d: DescriptorT
}

export interface Catalog {
  root: string
  /** Every descriptor on disk that parses, by lower-case locator. */
  entries: Map<string, CatalogEntry>
  categoryAliases: Map<string, string>
  reserved: string[]
  ignore: IgnoreFileT
  builtinCategories: Record<string, string> | null
  community: CommunityFileT | null
  /** Curators (owners of /modules/ in CODEOWNERS): their PRs never claim. */
  curators: string[]
  lines: LinesT | null
  builtin: BuiltinDataT | null
  /** Where `builtin` came from, for the summary. */
  builtinSource: string | null
  /** `@open-mercato/*` package names known to the catalog (entries plus data/official-coverage.json). */
  officialNames: string[]
  notes: string[]
}

export const rel = (root: string, file: string): string => relative(root, file).split(sep).join('/')

function readYaml(file: string): unknown {
  return existsSync(file) ? parse(readFileSync(file, 'utf8')) : undefined
}

function readJson(file: string): unknown {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as unknown) : undefined
}

/** Loads the catalog context. `dataDir` is the read-only checkout of the data branch (may be missing or empty). */
export async function loadCatalog(root: string, dataDir: string | null): Promise<Catalog> {
  const notes: string[] = []
  const entries = new Map<string, CatalogEntry>()
  for (const abs of yamlFiles([join(root, 'modules')])) {
    try {
      const d = Descriptor.parse(parse(readFileSync(abs, 'utf8')))
      const locator = descriptorLocator(d)
      entries.set(locator.toLowerCase(), { file: rel(root, abs), locator, d })
    } catch {
      // an invalid descriptor is reported when it is validated itself
    }
  }
  const pol = (name: string) => join(root, 'policy', name)
  const safe = <T>(name: string, fn: () => T, fallback: T): T => {
    try {
      return fn()
    } catch (err) {
      notes.push(`policy/${name} does not parse: ${(err as Error).message.split('\n')[0]}`)
      return fallback
    }
  }
  const categories = safe('categories.yml', () => CategoriesFile.parse(readYaml(pol('categories.yml'))), null)
  const categoryAliases = new Map<string, string>()
  for (const c of categories?.categories ?? []) for (const a of c.aliases) categoryAliases.set(a, c.id)
  const reserved = safe('reserved.yml', () => ReservedFile.parse(readYaml(pol('reserved.yml'))).names, [] as string[])
  const ignore = safe('ignore.yml', () => IgnoreFile.parse(readYaml(pol('ignore.yml')) ?? []), [] as IgnoreFileT)
  const bc = readYaml(pol('builtin-categories.yml'))
  const builtinCategories = bc && typeof bc === 'object' ? (bc as Record<string, string>) : null
  const community = safe('community.yml', () => CommunityFile.parse(readYaml(pol('community.yml')) ?? {}), null)
  safe('official-maintainers.yml', () => OfficialMaintainersFile.parse(readYaml(pol('official-maintainers.yml'))), null)

  let lines: LinesT | null = null
  let builtin: BuiltinDataT | null = null
  let builtinSource: string | null = null
  const officialNames = new Set<string>()
  for (const e of entries.values()) if (e.d.npm?.startsWith('@open-mercato/')) officialNames.add(e.d.npm)
  if (dataDir && existsSync(dataDir)) {
    const l = Lines.safeParse(readJson(join(dataDir, 'lines.json')))
    if (l.success) lines = l.data
    else if (existsSync(join(dataDir, 'lines.json'))) notes.push('data/lines.json does not match the Lines schema')
    if (lines) {
      const b = BuiltinData.safeParse(readJson(join(dataDir, 'builtin', `${lines.coreLatest}.json`)))
      if (b.success) {
        builtin = b.data
        builtinSource = `data/builtin/${lines.coreLatest}.json`
      }
    }
    const cov = OfficialCoverageFile.safeParse(readJson(join(dataDir, 'official-coverage.json')))
    if (cov.success) for (const n of cov.data.packages) officialNames.add(n)
  }
  if (!builtin) {
    // No data branch yet: the pinned @open-mercato/cli ships module-facts.v2.json of its own core version.
    try {
      const cli = engineVersion()
      if (!lines || lines.coreLatest === cli) {
        const json = await loadModuleFactsJson(cli, { offline: true })
        builtin = builtinFromModuleFacts(json, cli, cli, new Date(0).toISOString())
        builtinSource = `@open-mercato/cli@${cli} (pinned; no data/builtin)`
      }
    } catch (err) {
      notes.push(`built-in modules unknown: ${(err as Error).message.split('\n')[0]}`)
    }
  }
  return {
    root,
    entries,
    categoryAliases,
    reserved,
    ignore,
    builtinCategories,
    community,
    curators: curatorsFrom(root),
    lines,
    builtin,
    builtinSource,
    officialNames: [...officialNames].sort(),
    notes,
  }
}
