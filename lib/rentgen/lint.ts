// Lint rules of spec 6.6, each anchored in OM documentation. Module findings are stored in
// ModuleFacts.lint; package-level findings (scripts, peers, license, tests, AGENTS.md) are added to
// every module of the package and are also available through `lintPackage` for packages without
// modules (providers, libraries, tools), which have no ModuleFacts to carry them.
import { createRequire } from 'node:module'
import { countedInstallScripts } from '../core/signals.ts'
import type { BuiltinData, LintFinding, ModuleFacts, Src } from '../schema/data/facts.ts'
import { hostDeclared } from './hosts.ts'

type Severity = LintFinding['severity']

// semver ships no type declarations and the dependency list is frozen (spec 3.3): typed locally.
interface SemverLite {
  valid(v: string): string | null
  validRange(r: string): string | null
  satisfies(v: string, r: string, o?: { includePrerelease?: boolean }): boolean
  minVersion(r: string): { version: string } | null
}
const semver = createRequire(import.meta.url)('semver') as SemverLite

export const LINT_RULES: Readonly<Record<string, { severity: Severity; anchor: string | null }>> = {
  'module-id-format': { severity: 'error', anchor: 'AGENTS.md:204' },
  'collision-core': { severity: 'error', anchor: 'spec #7289' },
  'acl-guards': { severity: 'error', anchor: 'module-development.md:49' },
  'install-scripts': { severity: 'error', anchor: 'w2 §3' },
  'invalid-identifier': { severity: 'warn', anchor: null },
  'event-prefix': { severity: 'warn', anchor: 'AGENTS.md:206' },
  'setup-default-role-features': { severity: 'warn', anchor: 'module-development.md:48' },
  'unresolved-extension-target': { severity: 'warn', anchor: 'module-facts extensionSurfaces.unresolved' },
  'peer-exact-pin': { severity: 'warn', anchor: 'i2 §1.4' },
  'host-dependency-duplication': { severity: 'warn', anchor: 'spike §2' },
  'license-mismatch': { severity: 'warn', anchor: 'i1 §7.4' },
  'undeclared-hosts': { severity: 'warn', anchor: 'K1 §3.4' },
  'peer-range-behind': { severity: 'info', anchor: 'w4 §4.2' },
  'route-openapi': { severity: 'info', anchor: 'module-development.md:44' },
  'public-routes': { severity: 'info', anchor: null },
  'version-drift': { severity: 'info', anchor: null },
  'ships-tests': { severity: 'info', anchor: null },
  'no-agents-md': { severity: 'info', anchor: 'g3 §3' },
  'likely-example': { severity: 'info', anchor: 'spec 4.3' },
}

export function finding(
  code: keyof typeof LINT_RULES,
  message: string,
  src: Src | null = null,
  severity?: Severity,
): LintFinding {
  const rule = LINT_RULES[code] as { severity: Severity; anchor: string | null }
  return { code, severity: severity ?? rule.severity, message: message.slice(0, 300), anchor: rule.anchor, src }
}

/** Packages the app template pins; a module bundling another version breaks types (D34). */
export const HOST_DEPENDENCIES = /^(@tanstack\/.+|react|react-dom|next|@mikro-orm\/.+|zod)$/

export interface PackageLintInput {
  packageName: string
  packageVersion: string
  scripts: Record<string, string>
  /** `binding.gyp` in the tarball (npm runs node-gyp at install). */
  bindingGyp: boolean
  omPeers: Record<string, string>
  dependencies: Record<string, string>
  license: { value: string | null; mismatch: boolean; sources: Record<string, string | null> }
  /** Tarball ships `__tests__` folders or *.test.* files. */
  shipsTests: boolean
  agentsMd: boolean
  /** Descriptor fields (optional: absent when Rentgen runs without a descriptor). */
  descriptor?: { scriptsRequired?: { reason: string } | undefined } | null
  /** Where the package comes from: `prepare` counts only for a GitHub archive (E3). Omitted: counted (strict). */
  source?: 'npm-tarball' | 'github-archive'
  /** Version of the `latest` line (`lines.json`), for peer-range-behind. */
  latestOm?: string | null
  /** Dependency versions of the create-mercato-app template of the latest line. */
  templateDeps?: Record<string, string> | null
  /** OM version the template deps belong to (for the message). */
  templateOm?: string | null
}

function safeMin(range: string): string {
  try {
    return semver.minVersion(range)?.version ?? range
  } catch {
    return range
  }
}

const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall', 'prepare'] as const

/** Package-level findings (spec 6.6). */
export function lintPackage(p: PackageLintInput): LintFinding[] {
  const out: LintFinding[] = []
  const scripts = countedInstallScripts(
    INSTALL_SCRIPTS.filter((s) => typeof p.scripts[s] === 'string'),
    p.source === 'npm-tarball' ? 'npm' : 'github',
  )
  if ((scripts.length > 0 || p.bindingGyp) && !p.descriptor?.scriptsRequired) {
    const what = [...scripts, ...(p.bindingGyp ? ['binding.gyp'] : [])].join(', ')
    out.push(
      finding('install-scripts', `Declares install scripts (${what}) without scriptsRequired in the descriptor.`, {
        file: 'package.json',
        line: 1,
      }),
    )
  }
  const exact = Object.entries(p.omPeers).filter(([, r]) => semver.valid(r.replace(/^=/, '')) !== null)
  if (exact.length > 0)
    out.push(
      finding(
        'peer-exact-pin',
        // the fact and its effect, no advice (finding of 25 Oct: `Use a range.` stood on every module that
        // create-mercato-module publishes, and its publish writes exact peers whatever the author sets)
        `Peer dependencies pin Open Mercato exactly (${exact[0]?.[0]} ${exact[0]?.[1]}${exact.length > 1 ? ` and ${exact.length - 1} more` : ''}), so an app on any other release of Open Mercato gets a Yarn peer warning.`,
      ),
    )
  if (p.latestOm) {
    const latest = p.latestOm
    const behind = Object.entries(p.omPeers).filter(([, r]) => {
      try {
        return semver.validRange(r) !== null && !semver.satisfies(latest, r, { includePrerelease: false })
      } catch {
        return false
      }
    })
    if (behind.length > 0)
      out.push(finding('peer-range-behind', `Built for ${behind[0]?.[1]} does not include Open Mercato ${latest}.`))
  }
  if (p.templateDeps) {
    const om = p.templateOm ?? p.latestOm ?? null
    for (const [name, range] of Object.entries(p.dependencies)) {
      if (!HOST_DEPENDENCIES.test(name)) continue
      const app = p.templateDeps[name]
      if (!app) continue
      const appVer = safeMin(app)
      let same = false
      try {
        same = semver.satisfies(appVer, range)
      } catch {
        same = false
      }
      if (!same) {
        const modVer = safeMin(range)
        out.push(
          finding(
            'host-dependency-duplication',
            `Bundles ${name} ${modVer} while Open Mercato${om ? ` ${om}` : ''} ships ${appVer}. Two copies break types. Move it to peerDependencies.`,
            { file: 'package.json', line: 1 },
          ),
        )
      }
    }
  }
  if (p.license.mismatch) {
    const parts = Object.entries(p.license.sources)
      .map(([k, v]) => `${k}: ${v ?? 'none'}`)
      .join(', ')
    out.push(finding('license-mismatch', `License sources disagree (${parts}).`))
  }
  if (p.shipsTests) out.push(finding('ships-tests', 'The tarball ships test files.'))
  if (!p.agentsMd) out.push(finding('no-agents-md', 'No AGENTS.md in the package.'))
  return out
}

export interface ModuleLintInput {
  facts: Omit<ModuleFacts, 'lint' | 'glyph'>
  /** First route or page that declares requireRoles (deprecated, not enforced). */
  requireRolesSrc: Src | null
  /** ACL features referenced by routes and pages. */
  referencedFeatures: { feature: string; src: Src | null }[]
  /** Versions declared in integration.ts and ModuleInfo, if any. */
  declaredVersions: { where: string; version: string; src: Src | null }[]
  packageVersion: string
  extensionUnresolved: number
  extensionUnresolvedSrc: Src | null
  /** api/ and data/ folders exist in the module. */
  hasApiDir: boolean
  hasDataDir: boolean
  firstEventSrc: Src | null
  firstNoOpenApiSrc: Src | null
  firstPublicSrc: Src | null
  setupSrc: Src | null
  /** Official package (`@open-mercato/*`): lint `likely-example` is skipped (orchestrator decision E4). */
  official?: boolean
  builtin?: BuiltinData | null
  descriptor?: {
    replaces?: string[] | undefined
    declares?: { hosts: string[]; env: string[] } | undefined
    whenToUse?: string | undefined
  } | null
}

/** Module-level findings (spec 6.6). */
export function lintModule(m: ModuleLintInput): LintFinding[] {
  const f = m.facts
  const out: LintFinding[] = []
  const id = f.id

  // collision-core: ID, table, ACL feature or event shared with a built-in module of the line
  if (m.builtin) {
    const replaced = new Set((m.descriptor?.replaces ?? []).map((r) => r.replace(/^core:/, '')))
    const coreIds = new Set(m.builtin.modules.map((b) => b.id))
    const coreTables = new Map<string, string>()
    const coreAcl = new Map<string, string>()
    const coreEvents = new Map<string, string>()
    for (const b of m.builtin.modules) {
      for (const e of b.data.entities) if (e.table) coreTables.set(e.table, b.id)
      for (const a of b.security.aclFeatures) coreAcl.set(a, b.id)
      for (const e of b.events.emits) coreEvents.set(e.id, b.id)
    }
    const hits: { what: string; core: string }[] = []
    if (coreIds.has(id)) hits.push({ what: `module ID ${id}`, core: id })
    for (const t of f.collisionKeys.tables)
      if (coreTables.has(t)) hits.push({ what: `table ${t}`, core: coreTables.get(t) as string })
    for (const a of f.collisionKeys.aclFeatures)
      if (coreAcl.has(a)) hits.push({ what: `ACL feature ${a}`, core: coreAcl.get(a) as string })
    for (const e of f.collisionKeys.eventIds)
      if (coreEvents.has(e)) hits.push({ what: `event ${e}`, core: coreEvents.get(e) as string })
    if (hits.length > 0) {
      const cores = [...new Set(hits.map((h) => h.core))]
      const covered = cores.every((c) => replaced.has(c))
      const first = hits[0] as { what: string; core: string }
      const more = hits.length > 1 ? ` and ${hits.length - 1} more` : ''
      out.push(
        covered
          ? finding(
              'collision-core',
              `Replaces core ${cores.join(', ')} (declared): shares ${first.what}${more}.`,
              null,
              'info',
            )
          : finding(
              'collision-core',
              `Collides with core ${first.core} ${m.builtin.coreVersion}: ${first.what}${more}. Declare replaces or rename.`,
            ),
      )
    }
  }

  // acl-guards: features outside acl.ts (own) or the core of the line; requireRoles (not enforced)
  const own = new Set(f.security.aclFeatures)
  const core = new Set(m.builtin ? m.builtin.modules.flatMap((b) => b.security.aclFeatures) : [])
  const unknown = m.referencedFeatures.filter(({ feature }) => {
    if (own.has(feature) || core.has(feature)) return false
    if (feature.endsWith('.*') || feature === '*') return false
    const prefix = feature.split('.')[0]
    // without core facts, features of other modules cannot be checked, and a module without its own
    // acl.ts (e.g. a drop-in replacement of a core module) reuses the core's features
    return m.builtin != null || (prefix === id && own.size > 0)
  })
  if (unknown.length > 0) {
    const u = unknown[0] as { feature: string; src: Src | null }
    out.push(
      finding(
        'acl-guards',
        `requireFeatures uses ${u.feature}, which acl.ts does not declare${unknown.length > 1 ? ` (and ${unknown.length - 1} more)` : ''}.`,
        u.src,
      ),
    )
  }
  if (m.requireRolesSrc)
    out.push(
      finding(
        'acl-guards',
        'Uses requireRoles, which the runtime does not enforce. Use requireFeatures.',
        m.requireRolesSrc,
      ),
    )

  const badEvents = f.events.emits.filter((e) => !e.id.startsWith(`${id}.`))
  if (badEvents.length > 0)
    out.push(
      finding(
        'event-prefix',
        `${badEvents.length} of ${f.events.emits.length} event IDs do not start with ${id}. (for example ${badEvents[0]?.id}).`,
        badEvents[0]?.src ?? m.firstEventSrc,
      ),
    )
  if (f.security.aclFeatures.length > 0 && !f.security.setupDefaultRoleFeatures)
    out.push(
      finding(
        'setup-default-role-features',
        'acl.ts declares features but setup.ts has no defaultRoleFeatures.',
        m.setupSrc,
      ),
    )
  if (m.extensionUnresolved > 0)
    out.push(
      finding(
        'unresolved-extension-target',
        m.extensionUnresolved === 1
          ? '1 extension contribution targets a host that is not found.'
          : `${m.extensionUnresolved} extension contributions target a host that is not found.`,
        m.extensionUnresolvedSrc,
      ),
    )

  const declares = m.descriptor?.declares
  if (declares) {
    const undeclared = f.network.hosts.filter((h) => h.confidence === 'high' && !hostDeclared(h.host, declares.hosts))
    if (undeclared.length > 0)
      out.push(
        finding(
          'undeclared-hosts',
          `Talks to ${undeclared[0]?.host}${undeclared.length > 1 ? ` and ${undeclared.length - 1} more hosts` : ''} not listed in declares.hosts.`,
          undeclared[0]?.src ?? null,
        ),
      )
  }

  const noOpenApi = f.http.routes.filter((r) => !r.hasOpenApi).length
  if (noOpenApi > 0)
    out.push(
      finding('route-openapi', `${noOpenApi} of ${f.http.routes.length} routes have no openApi.`, m.firstNoOpenApiSrc),
    )
  const pub = f.http.routes.filter((r) => r.requireAuth === false).length
  if (pub > 0)
    out.push(
      finding(
        'public-routes',
        `${pub} of ${f.http.routes.length} routes do not require authentication.`,
        m.firstPublicSrc,
      ),
    )

  const drift = m.declaredVersions.find((d) => d.version !== m.packageVersion)
  if (drift)
    out.push(
      finding(
        'version-drift',
        `${drift.where} says ${drift.version}, package.json says ${m.packageVersion}.`,
        drift.src,
      ),
    )

  // E4: the example hint is noise for official packages (channel-* and other thin official modules)
  const shortUse = m.descriptor?.whenToUse !== undefined && m.descriptor.whenToUse.length < 60
  if (!m.official && (shortUse || (!m.hasApiDir && !m.hasDataDir)))
    out.push(
      finding(
        'likely-example',
        shortUse
          ? 'whenToUse is shorter than 60 characters. Consider the example tag.'
          : `Module has no api/ and no data/ folder. Consider the example tag if this is an exercise.`,
      ),
    )
  return out
}
