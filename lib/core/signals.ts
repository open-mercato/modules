// Signals of spec 6.2 (`health.signals`) and the license classification of 6.1. Isomorphic: no Node APIs.
import type { LicenseKind } from '../schema/common.ts'
import type { Descriptor } from '../schema/descriptor.ts'
import type { Facts, LintFinding } from '../schema/data/facts.ts'
import type { FitCell } from '../schema/data/fit.ts'
import type { Signals } from '../schema/data/health.ts'
import type { SyncRecord } from '../schema/data/sync.ts'
import { daysBetween, type LineInfo } from './lines.ts'
import { fixedInText } from './policy.ts'
import { parseSpdx } from './spdx.ts'

const DAY_MS = 86_400_000

/**
 * Install scripts that count for Supply chain and lint `install-scripts` (orchestrator decision E3, errata to spec
 * 6.2 and 6.6): npm does not run `prepare` when it installs a package from the registry, so `prepare` counts only
 * for a GitHub source (archive or git install), never for an npm tarball.
 */
export function countedInstallScripts<T extends string>(scripts: readonly T[], source: 'npm' | 'github'): T[] {
  return source === 'npm' ? scripts.filter((s) => s !== 'prepare') : [...scripts]
}

/** License value to its kind (spec 6.1): UNLICENSED/PROPRIETARY = proprietary, SEE LICENSE IN in enterprise. */
export function licenseKind(value: string | null | undefined, enterprise: boolean): LicenseKind {
  if (!value || !value.trim()) return 'unknown'
  const v = value.trim()
  if (/^(UNLICENSED|PROPRIETARY)$/i.test(v)) return 'proprietary'
  if (/^SEE LICEN[CS]E IN/i.test(v)) return enterprise ? 'enterprise' : 'proprietary'
  // only a value that parses as an SPDX expression is one (finding of 25 Oct: any `(...)` passed, `</script>` too)
  return parseSpdx(v) ? 'osi' : 'unknown'
}

/** Identity license of an entry: facts (four sources) first, then the packument, then the GitHub repo. */
export function identityLicense(
  facts: Facts | null,
  sync: SyncRecord | null,
  enterprise: boolean,
): { spdx: string | null; kind: LicenseKind; mismatch: boolean } {
  const value = facts?.license.value ?? sync?.npm?.license ?? sync?.github?.license ?? null
  const kind = facts ? facts.license.kind : licenseKind(value, enterprise)
  return { spdx: kind === 'osi' ? value : null, kind, mismatch: facts?.license.mismatch ?? false }
}

/** 7 organs: highest value per position of the module glyphs. */
export function unionGlyph(facts: Facts | null): string {
  const out = [0, 0, 0, 0, 0, 0, 0]
  for (const m of facts?.modules ?? [])
    for (let i = 0; i < 7; i++) out[i] = Math.max(out[i] as number, Number(m.glyph[i] ?? 0))
  return out.join('')
}

/**
 * SIG-ANA. An integration.ts the catalog could not read keeps it `partial` (finding of 25 Oct: sync-shopify read as
 * full while its credentials and its table were missing).
 */
export function anatomySignal(facts: Facts | null, enterprise: boolean): Signals['anatomy'] {
  if (enterprise) return 'hidden'
  if (!facts) return 'none'
  const organs = [...unionGlyph(facts)].filter((c) => c !== '0').length
  const src = facts.gate.modules.some((m) => m.src)
  const read = facts.coverage.integrationTs !== 'unparsed'
  return organs >= 3 && src && read && facts.coverage.routesAuthResolved >= 0.9 ? 'full' : 'partial'
}

/** SIG-SUP. */
export function supplyChainSignal(
  sync: SyncRecord | null,
  descriptor: Pick<Descriptor, 'scriptsRequired'> | null,
  now: string,
): Signals['supplyChain'] {
  const fail: string[] = []
  const warn: string[] = []
  const scripts = countedInstallScripts(sync?.npm?.installScripts ?? [], 'npm')
  if (scripts.length > 0) {
    if (descriptor?.scriptsRequired) warn.push(`Declares install scripts: ${scripts.join(', ')}.`)
    else fail.push(`Undeclared install scripts: ${scripts.join(', ')}.`)
  }
  const deps = sync?.npm?.dependencies ?? {}
  const offRegistry = Object.entries(deps)
    .filter(([, r]) => /^(git\+|git:|github:|https?:|file:|link:)/.test(r) || /^[\w-]+\/[\w.-]+(#.*)?$/.test(r))
    .map(([n]) => n)
  if (offRegistry.length > 0) fail.push(`Dependencies outside the registry: ${offRegistry.slice(0, 5).join(', ')}.`)
  // every advisory of the sync affects the version it queried (OSV `querybatch` by version, finding of 25 Oct):
  // `fixedIn` names a release with the fix, it does not close the advisory for the version the catalog lists
  for (const a of sync?.advisories ?? []) {
    const fix = fixedInText(a.fixedIn)
    if (a.severity === 'high' || a.severity === 'critical') {
      const age = (Date.parse(now) - Date.parse(a.publishedAt)) / DAY_MS
      if (age > 30) fail.push(`Open ${a.severity} advisory ${a.id} for more than 30 days${fix}.`)
      else warn.push(`Open ${a.severity} advisory ${a.id}${fix}.`)
    } else if (a.severity === 'moderate') warn.push(`Open moderate advisory ${a.id}${fix}.`)
  }
  if (sync?.provenance.status === 'lost') warn.push('Provenance lost: the previous release had it.')
  const status = fail.length > 0 ? 'fail' : warn.length > 0 ? 'warn' : 'ok'
  return { status, reasons: [...fail, ...warn].slice(0, 10).map((r) => r.slice(0, 160)) }
}

/** Lint findings that count for Hygiene: facts lint plus Fit host duplicates and undeclared install scripts. */
export function hygieneFindings(
  facts: Facts | null,
  latestFit: FitCell | null | undefined,
  sync: SyncRecord | null,
  descriptor: Pick<Descriptor, 'scriptsRequired' | 'replaces'> | null,
): Pick<LintFinding, 'code' | 'severity'>[] {
  const out: Pick<LintFinding, 'code' | 'severity'>[] = []
  for (const m of facts?.modules ?? []) for (const l of m.lint) out.push({ code: l.code, severity: l.severity })
  if (latestFit && latestFit.hostDuplicates.length > 0)
    out.push({ code: 'host-dependency-duplication', severity: 'warn' })
  if (countedInstallScripts(sync?.npm?.installScripts ?? [], 'npm').length > 0 && !descriptor?.scriptsRequired)
    out.push({ code: 'install-scripts', severity: 'error' })
  // collision-core is an error only without `replaces` (spec 6.6)
  const replaces = (descriptor?.replaces ?? []).length > 0
  return out.filter((f) => !(replaces && f.code === 'collision-core'))
}

/** SIG-HYG: fail on any error, warn on any warn; failing lists error and warn codes once. */
export function hygieneSignal(findings: readonly Pick<LintFinding, 'code' | 'severity'>[]): Signals['hygiene'] {
  const failing: string[] = []
  for (const f of findings)
    if ((f.severity === 'error' || f.severity === 'warn') && !failing.includes(f.code)) failing.push(f.code)
  const status = findings.some((f) => f.severity === 'error')
    ? 'fail'
    : findings.some((f) => f.severity === 'warn')
      ? 'warn'
      : 'ok'
  return { status, failing: failing.slice(0, 30) }
}

/** SIG-MNT. `catchUpDays` needs Open Mercato release dates, which the data branch does not hold yet: null. */
export function maintenanceSignal(
  sync: SyncRecord | null,
  receipt: Record<string, string>,
  lines: readonly LineInfo[],
  now: string,
): Signals['maintenance'] {
  const n = sync?.npm
  const current = n ? (n.latestStable ?? n.preview) : null
  const releasedAt = (current && n?.publishedAt[current]) || sync?.github?.pushedAt || null
  // a push is no release (finding of 25 Oct: treg had lastRelease 2026-10-08 with no tag and no release): a GitHub
  // date counts once the repository has a tag; the age below still reads the last push
  const released =
    (current && n?.publishedAt[current]) || ((sync?.github?.tags.length ?? 0) > 0 ? sync?.github?.pushedAt : null)
  const lastRelease = released ? released.slice(0, 10) : null
  const latest = lines.find((l) => l.source === 'latest')?.key
  const previous = lines.find((l) => l.source === 'previous')?.key
  const verifiedLatest = latest !== undefined && receipt[latest] === 'verified'
  const verifiedPrevious = previous !== undefined && receipt[previous] === 'verified'
  const base = { lastRelease, catchUpDays: null }
  if (n?.deprecated) return { status: 'deprecated', ...base }
  if (sync?.github?.archived) return { status: 'archived', ...base }
  const age = releasedAt ? daysBetween(releasedAt, now) : Number.POSITIVE_INFINITY
  if (verifiedLatest || age <= 180) return { status: 'current', ...base }
  if (verifiedPrevious) return { status: 'behind', ...base }
  if (age > 365) return { status: 'stale', ...base }
  return { status: 'behind', ...base }
}

/**
 * SIG-DEC: Built for (peer ranges) against Verified on (receipts), and declared hosts/env against Anatomy.
 * `peers: 'none'`: the version declares no Open Mercato peer range, so nothing is "built for" a line (no peers reject
 * any line, which made every line look declared: `Built for 0.8, 0.9, next` beside a card saying `no Open Mercato
 * peer range`, finding of 25 Oct). `installed: false`: the catalog never installs the entry (a provider, library or
 * tool), so there is no receipt to compare a declaration with.
 */
export function declaredVsObservedSignal(
  builtFor: readonly string[],
  verifiedOn: readonly string[],
  facts: Facts | null,
  descriptor: Pick<Descriptor, 'declares'> | null,
  opts: { peers?: 'range' | 'none' | 'unread'; installed?: boolean } = {},
): Signals['declaredVsObserved'] {
  const notes: string[] = []
  const v = verifiedOn.length > 0 ? verifiedOn.join(', ') : 'no line'
  if (opts.installed === false) {
    // nothing to compare: no receipts by design
  } else if (opts.peers === 'none') notes.push(`No Open Mercato peer range; verified on ${v}.`)
  else if (!(builtFor.length === verifiedOn.length && builtFor.every((l) => verifiedOn.includes(l)))) {
    const b = builtFor.length > 0 ? builtFor.join(', ') : 'no tested line'
    notes.push(`Built for ${b}; verified on ${v}.`)
  }
  if (descriptor?.declares && facts) {
    const hosts = [...new Set(facts.modules.flatMap((m) => m.network.undeclared))]
    if (hosts.length > 0) notes.push(`Undeclared hosts: ${hosts.slice(0, 5).join(', ')}.`.slice(0, 160))
    const declaredEnv = new Set(descriptor.declares.env)
    const env = [...new Set(facts.modules.flatMap((m) => m.config.env.map((e) => e.name)))].filter(
      (e) => !declaredEnv.has(e),
    )
    if (descriptor.declares.env.length > 0 && env.length > 0)
      notes.push(`Undeclared env: ${env.slice(0, 5).join(', ')}.`.slice(0, 160))
  }
  return { status: notes.length > 0 ? 'mismatch' : 'match', notes: notes.slice(0, 10) }
}
