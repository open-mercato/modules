// Static archive check of a template (docs/specs/2026-10-29-templates.md, Phase 1a step 3): the GitHub tarball of the
// one sha an entry names, read in memory and never unpacked or run. Within the catalog's own tarball limits, no links
// or special entries, no `.template` files (the importer refuses them), a standalone Open Mercato app on Yarn 4 with
// one framework line in `yarn.lock`, a `src/modules.ts` the module inventory can read, and no stock create-mercato-app
// README. `engines` and `mercato-template.json` are read; the manifest is a hint, so a manifest that is invalid or
// differs from what the catalog reads is a warning, never an error. Messages name paths, packages and versions, never file content.
import { createHash } from 'node:crypto'
import { MAX_PARSE_BYTES } from '../rentgen/ast.ts'
import { LICENSE_FILE_NAME, licenseIdOfText, normalizeLicense } from '../rentgen/license.ts'
import {
  TEMPLATE_MANIFEST_FILE,
  TemplateManifest,
  type TemplateManifest as TemplateManifestT,
} from '../schema/template.ts'
import { inspectTarball, LIMITS, readTarballFiles } from '../sources/tarball.ts'
import {
  CORE_PACKAGE,
  descriptorName,
  ENTERPRISE_PACKAGE,
  entriesNamed,
  frameworkNames,
  isRegistryEntry,
  LockfileError,
  MAX_LOCKFILE_BYTES,
  omDependencies,
  parseLockfile,
  rangeLookup,
  resolveDependency,
  resolveModulePackage,
  versionLine,
  type Lockfile,
} from './lockfile.ts'
import { MODULES_TS_PATH, modulesFromModulesTs, type ModulesTsEntry, type ModulesTsInventory } from './modules-ts.ts'

export interface ArchiveFinding {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
}

export interface ArchiveFacts {
  /** Regular files and their unpacked size. */
  files: number
  bytes: number
  /** `package.json` `packageManager`, `engines` (string values only). */
  packageManager: string | null
  engines: Record<string, string> | null
  /** The pinned `@open-mercato/core` from `yarn.lock`. */
  openMercato: { version: string; line: string } | null
  /** The module inventory of `src/modules.ts`, null when the file is missing. */
  modules: ModulesTsInventory | null
  /** `mercato-template.json`: absent, valid, or present but invalid. */
  manifest: { state: 'absent' } | { state: 'valid'; data: TemplateManifestT } | { state: 'invalid' }
  /** License sources inside the archive: the LICENSE* file (SPDX id or `custom`) and `package.json` `license`. */
  license: { file: string | null; packageJson: string | null }
  /**
   * The version yarn.lock resolves for each npm `from` of the inventory other than `@open-mercato/core` (the manifest's
   * `package` rule), by name. A name that does not resolve to one entry is absent.
   */
  packages: Record<string, string>
  /** `package.json` or `yarn.lock` names `@open-mercato/enterprise` (D5: recorded, never the Enterprise mark alone). */
  enterpriseDependency: boolean
}

export interface ArchiveResult {
  findings: ArchiveFinding[]
  facts: ArchiveFacts
}

export interface ArchiveOptions {
  /** Unpacked size and file limits, the catalog's own (lib/sources/tarball.ts) by default. */
  limits?: { maxBytes: number; maxFiles: number }
  /** Env names of the entry's `declares.env`, compared with the manifest `env`. */
  declaredEnv?: readonly string[]
  /** sha256 values of stock READMEs, STOCK_READMES by default. */
  stockReadmes?: readonly string[]
}

/**
 * sha256 of the root README.md of each stable create-mercato-app release that ships one: the stock README is an error
 * in catalog validation (spec, file policy item 9). None of 0.4.5 to 0.9.0 ships one. The save tool's stock table,
 * read from the npm tarballs, has no README for any of them, and `packages/create-app/template/` of open-mercato
 * v0.9.0 has no README.md (checked on 2026-11-04). Add the hash, as the save tool hashes it, when a release adds one.
 */
export const STOCK_READMES: readonly string[] = []

const PACKAGE_JSON = 'package.json'
const YARN_LOCK = 'yarn.lock'
const MONOREPO_CORE = 'packages/core/package.json'
const README = /^readme\.md$/i
const MAX_LISTED = 5
/** An npm package name as a module `from` (not `@app`, not a path). */
const NPM_FROM = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

/** `a, b, c and 2 more`. */
export function listed(items: readonly string[], max = MAX_LISTED): string {
  const head = items.slice(0, max).join(', ')
  return items.length > max ? `${head} and ${items.length - max} more` : head
}

/** The path inside the app: GitHub archives put every entry under one `<repo>-<sha>/` directory. */
export function archivePath(raw: string): string {
  const parts = raw.replace(/\\/g, '/').split('/')
  return parts.slice(1).join('/')
}

/** Text files the check reads: the root files, the license, and sources next to `src/modules.ts` for its import. */
function wanted(path: string): boolean {
  return (
    path === PACKAGE_JSON ||
    path === YARN_LOCK ||
    path === TEMPLATE_MANIFEST_FILE ||
    path === MONOREPO_CORE ||
    README.test(path) ||
    LICENSE_FILE_NAME.test(path) ||
    /^src\/[^/]+\.(?:ts|tsx|mts)$/.test(path) ||
    (/^src\/[^/]+\/index\.ts$/.test(path) && !path.startsWith('src/modules/'))
  )
}

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

function readJson(text: string | undefined): Json | null {
  if (text === undefined) return null
  try {
    const v: unknown = JSON.parse(text.replace(/^﻿/, ''))
    return isObject(v) ? v : null
  } catch {
    return null
  }
}

/** True for a `packageManager` of Yarn 4 (`yarn@4.12.0`, with or without a `+sha...` hash). */
export function isYarn4(packageManager: unknown): boolean {
  return typeof packageManager === 'string' && /^yarn@4\.\d+\.\d+/.test(packageManager)
}

/** `src/modules.ts` cannot be read at all (syntax error, size or nesting): the inventory has nothing but that line. */
export function unreadableModulesTs(inv: ModulesTsInventory): string | null {
  const first = inv.unparsed[0]
  if (inv.entries.length > 0 || inv.unparsed.length !== 1 || !first) return null
  return /^src\/modules\.ts (?:has a syntax error|is larger than|is nested too deeply)/.test(first.reason)
    ? first.reason
    : null
}

/** Checks the GitHub archive of one template sha. Never throws on archive content; findings say what is wrong. */
export async function checkTemplateArchive(bytes: Uint8Array, opts: ArchiveOptions = {}): Promise<ArchiveResult> {
  const limits = opts.limits ?? LIMITS
  const findings: ArchiveFinding[] = []
  const facts: ArchiveFacts = {
    files: 0,
    bytes: 0,
    packageManager: null,
    engines: null,
    openMercato: null,
    modules: null,
    manifest: { state: 'absent' },
    license: { file: null, packageJson: null },
    packages: {},
    enterpriseDependency: false,
  }
  const err = (code: string, message: string) => findings.push({ severity: 'error', code, message })
  const warn = (code: string, message: string) => findings.push({ severity: 'warning', code, message })
  const done = (): ArchiveResult => ({ findings, facts })

  if (bytes.length > limits.maxBytes) {
    err('archive-limit', `the archive is ${bytes.length} bytes, the limit is ${limits.maxBytes}`)
    return done()
  }
  let ins: Awaited<ReturnType<typeof inspectTarball>>
  try {
    ins = await inspectTarball(bytes)
  } catch {
    err('archive-unreadable', 'the archive is not a readable tar.gz file')
    return done()
  }
  facts.files = ins.files
  facts.bytes = ins.bytes
  if (ins.files > limits.maxFiles) err('archive-limit', `${ins.files} files, the limit is ${limits.maxFiles}`)
  if (ins.bytes > limits.maxBytes) err('archive-limit', `${ins.bytes} bytes unpacked, the limit is ${limits.maxBytes}`)
  if (findings.length > 0) return done()

  // links, devices, absolute paths and `..`: the importer would refuse the archive (spec, Untrusted archives)
  const rejected = ins.rejected.map((r) => `${archivePath(r.path) || r.path} (${r.reason})`)
  if (rejected.length > 0)
    err('archive-entry', `only regular files and directories are allowed: ${listed(rejected.sort())}`)
  const paths = ins.entries.filter((e) => e.type !== 'Directory').map((e) => archivePath(e.path))
  const dotTemplate = paths.filter((p) => p.endsWith('.template')).sort()
  if (dotTemplate.length > 0)
    err('template-file', `create-mercato-app refuses paths ending in .template: ${listed(dotTemplate)}`)

  const raw = await readTarballFiles(bytes, (p) => wanted(archivePath(p)), MAX_LOCKFILE_BYTES)
  const files = new Map<string, string>()
  for (const [p, text] of raw) files.set(archivePath(p), text)

  // the license sources, for the license step
  const licenseName = [...files.keys()].filter((p) => LICENSE_FILE_NAME.test(p)).sort()[0]
  if (licenseName) facts.license.file = licenseIdOfText(files.get(licenseName) ?? '')

  const stock = new Set(opts.stockReadmes ?? STOCK_READMES)
  for (const name of [...files.keys()].filter((p) => README.test(p)).sort())
    if (
      stock.has(
        createHash('sha256')
          .update(files.get(name) ?? '')
          .digest('hex'),
      )
    )
      err('default-readme', `${name} is the stock create-mercato-app README; describe what the template is for`)

  if (readJson(files.get(MONOREPO_CORE))?.name === CORE_PACKAGE)
    err('monorepo', 'this is the Open Mercato framework monorepo, not an app made with create-mercato-app')

  const pkg = readJson(files.get(PACKAGE_JSON))
  if (pkg === null) {
    err(
      'package-json',
      files.has(PACKAGE_JSON) ? 'the root package.json is not a JSON object' : 'the app has no root package.json',
    )
  } else {
    facts.license.packageJson = normalizeLicense(pkg.license)
    const deps = pkg.dependencies
    if (!isObject(deps) || !Object.hasOwn(deps, CORE_PACKAGE))
      err('not-om-app', `package.json does not depend on ${CORE_PACKAGE}: this is not an Open Mercato app`)
    if (!isYarn4(pkg.packageManager)) err('package-manager', 'package.json packageManager must be Yarn 4 (yarn@4.x)')
    facts.packageManager = typeof pkg.packageManager === 'string' ? pkg.packageManager.slice(0, 100) : null
    if (isObject(pkg.engines))
      facts.engines = Object.fromEntries(
        Object.entries(pkg.engines)
          .filter((e): e is [string, string] => typeof e[1] === 'string')
          .map(([k, v]) => [k.slice(0, 40), v.slice(0, 100)]),
      )
  }

  let lockfile: Lockfile | null = null
  const lockText = files.get(YARN_LOCK)
  if (lockText === undefined) err('yarn-lock', 'the app has no root yarn.lock')
  else
    try {
      lockfile = parseLockfile(lockText)
    } catch (e) {
      if (!(e instanceof LockfileError)) throw e
      err('yarn-lock', `yarn.lock is not a Yarn 4 lockfile: ${e.message}`)
    }
  if (lockfile) checkLines(lockfile, pkg, facts, err)

  const modulesTs = files.get(MODULES_TS_PATH)
  if (modulesTs === undefined) err('modules-ts', `the app has no ${MODULES_TS_PATH}`)
  else {
    const others = new Map(
      [...files].filter(([p, t]) => p.startsWith('src/') && Buffer.byteLength(t) <= MAX_PARSE_BYTES),
    )
    others.delete(MODULES_TS_PATH)
    const inv = modulesFromModulesTs(modulesTs, others)
    facts.modules = inv
    const unreadable = unreadableModulesTs(inv)
    if (unreadable)
      err('modules-ts', /syntax error/.test(unreadable) ? `${unreadable} at line ${inv.unparsed[0]?.line}` : unreadable)
    else if (inv.unparsed.length > 0)
      warn(
        'modules-ts-unparsed',
        `${MODULES_TS_PATH}: the module list cannot read ${listed(
          inv.unparsed.map((u) => `line ${u.line} (${u.reason})`),
          3,
        )}`,
      )
  }

  if (lockfile) {
    for (const e of facts.modules?.entries ?? []) {
      if (e.from === CORE_PACKAGE || Object.hasOwn(facts.packages, e.from) || !NPM_FROM.test(e.from)) continue
      const entry = resolveModulePackage(pkg, lockfile, e.from)
      if (entry) facts.packages[e.from] = entry.version
    }
    facts.packages = Object.fromEntries(Object.entries(facts.packages).sort(([a], [b]) => (a < b ? -1 : 1)))
  }
  facts.enterpriseDependency =
    (pkg !== null &&
      ['dependencies', 'devDependencies'].some((k) => {
        const block = pkg[k]
        return isObject(block) && Object.hasOwn(block, ENTERPRISE_PACKAGE)
      })) ||
    (lockfile !== null && entriesNamed(lockfile, ENTERPRISE_PACKAGE).length > 0)

  const manifestText = files.get(TEMPLATE_MANIFEST_FILE)
  if (manifestText !== undefined) checkManifest(manifestText, facts, lockfile, opts.declaredEnv, warn)
  return done()
}

/** Every `@open-mercato/*` dependency resolves, and the framework's lockstep set is on one line (File policy item 1). */
function checkLines(
  lockfile: Lockfile,
  pkg: Json | null,
  facts: ArchiveFacts,
  err: (code: string, message: string) => void,
): void {
  const rangeOf = rangeLookup(pkg)
  if (pkg !== null)
    for (const dep of omDependencies(pkg)) {
      if (resolveDependency(lockfile, dep.name, rangeOf(dep.name, dep.range)) !== null) continue
      err(
        'om-unresolved',
        entriesNamed(lockfile, dep.name).length > 0
          ? `${dep.name}: the package.json range has no entry in yarn.lock (yarn.lock is out of date)`
          : `${dep.name} has no entry in yarn.lock`,
      )
    }
  const framework = frameworkNames(lockfile)
  const lines = new Map<string, Set<string>>()
  for (const e of lockfile.entries) {
    if (!framework.has(e.name) || !isRegistryEntry(e)) continue
    const line = versionLine(e.version)
    if (line !== null) lines.set(line, (lines.get(line) ?? new Set()).add(e.name))
  }
  if (lines.size > 1)
    err(
      'om-lines',
      `the @open-mercato framework packages in yarn.lock span ${lines.size} lines (${[...lines.keys()].sort().join(', ')}); keep them on one major.minor line`,
    )
  const deps = pkg && isObject(pkg.dependencies) ? pkg.dependencies : null
  const coreRange = deps?.[CORE_PACKAGE]
  const core = resolveDependency(
    lockfile,
    CORE_PACKAGE,
    rangeOf(CORE_PACKAGE, typeof coreRange === 'string' ? coreRange : null),
  )
  const line = core ? versionLine(core.version) : null
  if (core && line !== null && isRegistryEntry(core) && descriptorName(core.resolution) === CORE_PACKAGE)
    facts.openMercato = { version: core.version, line }
}

const moduleKey = (m: Pick<ModulesTsEntry, 'id' | 'from'>) => `${m.id} from ${m.from}`

/** Reads the manifest and compares it with what the catalog reads itself: every difference is a warning. */
function checkManifest(
  text: string,
  facts: ArchiveFacts,
  lockfile: Lockfile | null,
  declaredEnv: readonly string[] | undefined,
  warn: (code: string, message: string) => void,
): void {
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    facts.manifest = { state: 'invalid' }
    warn('manifest', `${TEMPLATE_MANIFEST_FILE} is not valid JSON; the catalog reads the app itself`)
    return
  }
  const parsed = TemplateManifest.safeParse(data)
  if (!parsed.success) {
    facts.manifest = { state: 'invalid' }
    const where = [...new Set(parsed.error.issues.map((i) => i.path.map(String).join('.') || '(root)'))]
    warn(
      'manifest',
      `${TEMPLATE_MANIFEST_FILE} is not a valid manifest (mercato-template-1.json, plain-text description) at ${listed(where, 3)}`,
    )
    return
  }
  const m = parsed.data
  facts.manifest = { state: 'valid', data: m }

  // modules: the catalog's own parse of src/modules.ts is what the page shows
  if (facts.modules && unreadableModulesTs(facts.modules) === null) {
    const own = new Map(facts.modules.entries.map((e) => [moduleKey(e), e]))
    const listedIn = new Map(m.modules.map((e) => [moduleKey(e), e]))
    const missing = [...own.keys()].filter((k) => !listedIn.has(k))
    const extra = [...listedIn.keys()].filter((k) => !own.has(k))
    const when = [...own.entries()]
      .filter(([k, e]) => listedIn.has(k) && (listedIn.get(k)?.when ?? null) !== (e.when ?? null))
      .map(([k]) => k)
    const parts: string[] = []
    if (missing.length > 0) parts.push(`not listed: ${listed(missing)}`)
    if (extra.length > 0) parts.push(`not registered in ${MODULES_TS_PATH}: ${listed(extra)}`)
    if (when.length > 0) parts.push(`another when: ${listed(when)}`)
    if (parts.length > 0)
      warn('manifest-modules', `${TEMPLATE_MANIFEST_FILE} modules differ from ${MODULES_TS_PATH}; ${parts.join('; ')}`)
  }

  // `package` is `<name>@<version>` as yarn.lock resolved it
  if (lockfile) {
    const stale = m.modules
      .filter((e) => e.package !== undefined)
      .filter((e) => {
        const p = e.package as string
        const at = p.lastIndexOf('@')
        const name = p.slice(0, at)
        const version = p.slice(at + 1)
        return !entriesNamed(lockfile, name).some((x) => x.version === version)
      })
      .map((e) => e.package as string)
    if (stale.length > 0)
      warn('manifest-package', `${TEMPLATE_MANIFEST_FILE} names packages yarn.lock does not resolve: ${listed(stale)}`)
  }

  if (m.openMercato !== undefined && facts.openMercato && m.openMercato !== `${facts.openMercato.line}.x`)
    warn(
      'manifest-open-mercato',
      `${TEMPLATE_MANIFEST_FILE} says openMercato ${m.openMercato}, yarn.lock pins ${CORE_PACKAGE} ${facts.openMercato.version}`,
    )

  if (declaredEnv !== undefined) {
    const inManifest = (m.env ?? []).map((e) => e.name)
    const notDeclared = inManifest.filter((n) => !declaredEnv.includes(n))
    const notInManifest = declaredEnv.filter((n) => !inManifest.includes(n))
    const parts: string[] = []
    if (notDeclared.length > 0) parts.push(`missing from declares.env: ${listed(notDeclared)}`)
    if (notInManifest.length > 0) parts.push(`missing from ${TEMPLATE_MANIFEST_FILE}: ${listed(notInManifest)}`)
    if (parts.length > 0) warn('manifest-env', `env keys differ; ${parts.join('; ')}`)
  }
}
