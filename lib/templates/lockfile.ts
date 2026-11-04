// Yarn 4 lockfiles of templates (docs/specs/2026-10-29-templates.md, Phase 1a step 3, File policy item 1). A port of
// create-mercato-template `src/lockfile.ts` and the root rules of `src/policy/root.ts`, so a template the save tool
// accepts passes the catalog for the same reasons: the pinned `@open-mercato/core`, every `@open-mercato/*` dependency
// resolved, and one line for the framework's lockstep set. The file is YAML, parsed with the failsafe schema (every
// scalar stays a string) into Maps (no key reaches an object prototype); aliases are refused. Nothing is fetched.
import { parseDocument, visit } from 'yaml'

/** The largest `yarn.lock` that is read. Real app lockfiles are a few MB. */
export const MAX_LOCKFILE_BYTES = 16 * 1024 * 1024

export const CORE_PACKAGE = '@open-mercato/core'
export const ENTERPRISE_PACKAGE = '@open-mercato/enterprise'
const SCOPE = '@open-mercato/'

export interface LockEntry {
  /** The descriptors of the entry key, for example `@open-mercato/core@npm:0.9.0`. */
  descriptors: string[]
  /** The package name, from `resolution`. */
  name: string
  version: string
  resolution: string
  /** The names under `dependencies` and `peerDependencies`. */
  dependencies: string[]
}

export interface Lockfile {
  /** `__metadata.version` (8 or later for Yarn 4). */
  metadataVersion: string | null
  entries: LockEntry[]
}

/** A file that is not a readable Yarn 2+ lockfile. The message names the reason, never file content. */
export class LockfileError extends Error {}

/** The package name of a descriptor or locator (`@scope/name@npm:1` gives `@scope/name`). */
export function descriptorName(descriptor: string): string {
  const at = descriptor.indexOf('@', descriptor.startsWith('@') ? 1 : 0)
  return at <= 0 ? descriptor : descriptor.slice(0, at)
}

/** The range or reference after the name (`@scope/name@npm:1` gives `npm:1`). */
export function descriptorRange(descriptor: string): string {
  const name = descriptorName(descriptor)
  return descriptor.length > name.length ? descriptor.slice(name.length + 1) : ''
}

const isMap = (v: unknown): v is Map<unknown, unknown> => v instanceof Map

/** Parses a Yarn 2+ lockfile. Throws LockfileError on anything else (a Yarn 1 lockfile has no `__metadata`). */
export function parseLockfile(text: string): Lockfile {
  if (Buffer.byteLength(text) > MAX_LOCKFILE_BYTES)
    throw new LockfileError(`it is larger than ${MAX_LOCKFILE_BYTES / 1024 / 1024} MB`)
  let root: unknown
  try {
    const doc = parseDocument(text, { schema: 'failsafe', uniqueKeys: true, prettyErrors: false })
    if (doc.errors.length > 0) throw new LockfileError('it is not valid YAML')
    let alias = false
    visit(doc, {
      Alias() {
        alias = true
        return visit.BREAK
      },
    })
    if (alias) throw new LockfileError('it uses YAML aliases, which Yarn never writes')
    root = doc.toJS({ mapAsMap: true })
  } catch (err) {
    if (err instanceof LockfileError) throw err
    throw new LockfileError('it is not valid YAML')
  }
  if (!isMap(root)) throw new LockfileError('it is not a YAML map')
  const metadata = root.get('__metadata')
  if (!isMap(metadata)) throw new LockfileError('it has no __metadata (a Yarn 1 lockfile is not supported)')
  const metadataVersion = metadata.get('version')
  const entries: LockEntry[] = []
  for (const [key, value] of root) {
    if (key === '__metadata') continue
    if (typeof key !== 'string' || !isMap(value)) throw new LockfileError('an entry is not a map')
    const version = value.get('version')
    const resolution = value.get('resolution')
    if (typeof version !== 'string' || typeof resolution !== 'string')
      throw new LockfileError('an entry has no version or resolution')
    const dependencies: string[] = []
    for (const field of ['dependencies', 'peerDependencies']) {
      const block = value.get(field)
      if (isMap(block)) for (const name of block.keys()) if (typeof name === 'string') dependencies.push(name)
    }
    entries.push({
      descriptors: key
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== ''),
      name: descriptorName(resolution),
      version,
      resolution,
      dependencies,
    })
  }
  return { metadataVersion: typeof metadataVersion === 'string' ? metadataVersion : null, entries }
}

/** The descriptor Yarn writes for a `package.json` range: no protocol gets `npm:`, a protocol stays as is. */
export function lockDescriptor(name: string, range: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(range) ? `${name}@${range}` : `${name}@npm:${range}`
}

export function entriesNamed(lockfile: Lockfile, name: string): LockEntry[] {
  return lockfile.entries.filter((e) => e.name === name)
}

/** A descriptor without the `::locator=...` suffix Yarn adds to `patch:`, `file:` and `link:` descriptors. */
export function withoutLocator(descriptor: string): string {
  const at = descriptor.indexOf('::')
  return at >= 0 ? descriptor.slice(0, at) : descriptor
}

/**
 * The entry a dependency resolves to. With a range: the entry listing its descriptor, or null (the lockfile does not
 * match package.json). With `range` null: the only entry for the name, else the one with the highest version.
 */
export function resolveDependency(lockfile: Lockfile, name: string, range: string | null): LockEntry | null {
  if (range !== null) {
    const descriptor = withoutLocator(lockDescriptor(name, range))
    return lockfile.entries.find((e) => e.descriptors.some((d) => withoutLocator(d) === descriptor)) ?? null
  }
  const named = entriesNamed(lockfile, name)
  if (named.length === 0) return null
  return [...named].sort((a, b) => compareVersions(b.version, a.version))[0] ?? null
}

/** True when the entry came from the registry (`npm:`, or a `patch:` of an npm package), not a workspace or link. */
export function isRegistryEntry(entry: LockEntry): boolean {
  const ref = descriptorRange(entry.resolution)
  return ref.startsWith('npm:') || ref.startsWith('patch:')
}

/** The `major.minor` line of a version (`0.9.0-canary.1` gives `0.9`), or null. */
export function versionLine(version: string): string | null {
  const m = /^(\d+)\.(\d+)\.\d+/.exec(version)
  return m ? `${Number(m[1])}.${Number(m[2])}` : null
}

/** Numeric `major.minor.patch` first; a release is newer than its prereleases; then the text. */
export function compareVersions(left: string, right: string): number {
  const parse = (v: string) => {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-([^+]*))?/.exec(v)
    return m ? { n: [m[1], m[2], m[3]].map(Number), pre: m[4] ?? null } : null
  }
  const a = parse(left)
  const b = parse(right)
  if (!a || !b) return a ? 1 : b ? -1 : left.localeCompare(right)
  for (let i = 0; i < 3; i++) if (a.n[i] !== b.n[i]) return (a.n[i] as number) - (b.n[i] as number)
  if (a.pre === b.pre) return 0
  if (a.pre === null) return 1
  if (b.pre === null) return -1
  return a.pre.localeCompare(b.pre, 'en', { numeric: true })
}

/**
 * The framework's lockstep set: `@open-mercato/core` and every `@open-mercato/*` name linked to it, in either
 * direction, through `dependencies` and `peerDependencies`, plus any `@open-mercato/*` registry entry on core's line.
 * A package released on its own line that no framework package links (`@open-mercato/client`) is not in it.
 */
export function frameworkNames(lockfile: Lockfile): Set<string> {
  const edges = new Map<string, Set<string>>()
  const link = (a: string, b: string) => edges.set(a, (edges.get(a) ?? new Set()).add(b))
  for (const e of lockfile.entries) {
    if (!e.name.startsWith(SCOPE)) continue
    for (const dep of e.dependencies)
      if (dep.startsWith(SCOPE)) {
        link(e.name, dep)
        link(dep, e.name)
      }
  }
  const found = new Set([CORE_PACKAGE])
  const queue = [CORE_PACKAGE]
  for (let next = queue.pop(); next !== undefined; next = queue.pop())
    for (const n of edges.get(next) ?? [])
      if (!found.has(n)) {
        found.add(n)
        queue.push(n)
      }
  const coreLines = new Set(
    entriesNamed(lockfile, CORE_PACKAGE)
      .filter(isRegistryEntry)
      .map((e) => versionLine(e.version)),
  )
  for (const e of lockfile.entries)
    if (e.name.startsWith(SCOPE) && isRegistryEntry(e) && coreLines.has(versionLine(e.version))) found.add(e.name)
  return found
}

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

/** `dependencies` and `devDependencies` named `@open-mercato/*`, with their range (null when not a string). */
export function omDependencies(packageJson: Json): { name: string; range: string | null }[] {
  const seen = new Map<string, string | null>()
  for (const field of ['dependencies', 'devDependencies']) {
    const block = packageJson[field]
    if (!isObject(block)) continue
    for (const [name, range] of Object.entries(block))
      if (name.startsWith(SCOPE) && !seen.has(name)) seen.set(name, typeof range === 'string' ? range : null)
  }
  return [...seen].map(([name, range]) => ({ name, range }))
}

/** Names `package.json` `resolutions` overrides (`b`, `a/b`, `@s/a/@s/b`, `a@1/b@2`): looked up by name only. */
function resolutionNames(packageJson: Json | null): Set<string> {
  const names = new Set<string>()
  if (packageJson === null || !isObject(packageJson.resolutions)) return names
  for (const key of Object.keys(packageJson.resolutions)) {
    const parts = key.split('/')
    const last = parts.at(-1) ?? key
    const previous = parts.at(-2)
    names.add(descriptorName(previous?.startsWith('@') ? `${previous}/${last}` : last))
  }
  return names
}

/** A registry range or a protocol whose descriptor Yarn writes as is (`npm:`, `workspace:`, `link:` and so on). */
export function isPlainRange(range: string): boolean {
  const protocol = /^([a-z][a-z0-9+.-]*):/i.exec(range)?.[1]
  if (protocol) return ['npm', 'workspace', 'link', 'portal', 'file', 'patch'].includes(protocol)
  return !range.includes('/')
}

/** The range to look a dependency up by: the package.json range, or null (by name) when Yarn may record it otherwise. */
export function rangeLookup(packageJson: Json | null): (name: string, range: string | null) => string | null {
  const overridden = resolutionNames(packageJson)
  return (name, range) => (overridden.has(name) || (range !== null && !isPlainRange(range)) ? null : range)
}

/**
 * The lockfile entry of a module's npm package: the package.json descriptor (`dependencies`, then `devDependencies`)
 * looked up in yarn.lock, else the single entry for that name. Null when neither gives one entry.
 */
export function resolveModulePackage(packageJson: Json | null, lockfile: Lockfile, name: string): LockEntry | null {
  const rangeOf = rangeLookup(packageJson)
  for (const field of ['dependencies', 'devDependencies']) {
    const block = packageJson?.[field]
    if (!isObject(block) || !Object.hasOwn(block, name)) continue
    const range = block[name]
    const entry = resolveDependency(lockfile, name, rangeOf(name, typeof range === 'string' ? range : null))
    if (entry !== null) return entry
  }
  const named = entriesNamed(lockfile, name)
  return named.length === 1 ? (named[0] ?? null) : null
}
