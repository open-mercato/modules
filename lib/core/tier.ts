// Levels of spec 6.3: Listed (LST-1..6) and Verified (VER-1..5), recomputed by machine; OM Quality is human only.
// One source for health, emit and the /quality page (TIER_RULES). Isomorphic: no Node APIs.
import type { Receipt } from '../schema/data/receipt.ts'
import type { Health, Signals } from '../schema/data/health.ts'
import type { SyncRecord } from '../schema/data/sync.ts'
import type { Facts } from '../schema/data/facts.ts'
import {
  daysBetween,
  decisiveReceipt,
  isInstallable,
  isPreapproved,
  latestLine,
  sortReceipts,
  VERIFIED_MAX_AGE_DAYS,
  versionStatus,
  type LineInfo,
} from './lines.ts'
import {
  brokenText,
  fixedInText,
  notJudgedText,
  otherVersionText,
  shortDate,
  untestedText,
  type IsolationOf,
} from './policy.ts'
import { compareVersions, isStable, isVersion, maxVersion } from './semver.ts'

export type Rule = Health['rules'][number]

/** Rule texts as rendered on /quality (spec 6.3). */
export const TIER_RULES: readonly { id: string; level: 'listed' | 'verified'; text: string }[] = [
  { id: 'LST-1', level: 'listed', text: 'The descriptor is valid: schema, path, category and texts.' },
  {
    id: 'LST-2',
    level: 'listed',
    text: 'The package exists, has a stable version (official: a preview is enough) and is not deprecated.',
  },
  {
    id: 'LST-3',
    level: 'listed',
    text: 'The tarball confirms the kind: a module has the src/modules and dist/modules pair.',
  },
  { id: 'LST-4', level: 'listed', text: 'The license is detected or shown as unknown. Always passes, always visible.' },
  { id: 'LST-5', level: 'listed', text: 'No known malware and no open critical advisory.' },
  { id: 'LST-6', level: 'listed', text: 'The name is not a typo of an existing one. Checked in the pull request.' },
  {
    id: 'VER-1',
    level: 'verified',
    text: 'A verified receipt on the latest line, at most 14 days old, with a green baseline, for the newest installable stable version.',
  },
  { id: 'VER-2', level: 'verified', text: 'Fits statically on the latest line: ok or drift.' },
  { id: 'VER-3', level: 'verified', text: 'Supply chain: ok.' },
  { id: 'VER-4', level: 'verified', text: 'Hygiene: no lint rule of weight error.' },
  {
    id: 'VER-5',
    level: 'verified',
    text: 'Source integrity: the tarball repository is the listed repository, and a package that names no repository does not pass; GitHub-only entries are tested on a pinned tag.',
  },
]

const rule = (id: string, pass: boolean, detail: string): Rule => ({ id, pass, detail: detail.slice(0, 200) })

export interface ListedInput {
  source: 'npm' | 'github'
  type: Health['identity']['type']
  descriptorIssues: readonly string[] | null
  sync: SyncRecord | null
  facts: Facts | null
  kind: 'module' | 'provider' | 'library' | 'tool'
  license: Health['identity']['license']
  /** Raw license value, shown in the LST-4 detail. */
  licenseValue?: string | null
  /** GitHub-only: a version tag exists (an archive to scan). */
  githubTagged?: boolean
}

/** LST-1..6. */
export function listedRules(i: ListedInput): Rule[] {
  const out: Rule[] = []
  const issues = i.descriptorIssues
  out.push(
    issues === null
      ? rule('LST-1', false, 'No descriptor.')
      : issues.length === 0
        ? rule('LST-1', true, 'Descriptor is valid.')
        : rule('LST-1', false, `Descriptor: ${issues[0]}`),
  )

  if (i.source === 'npm') {
    const n = i.sync?.npm
    if (!n) out.push(rule('LST-2', false, 'No npm packument yet.'))
    else if (n.deprecated) out.push(rule('LST-2', false, 'Package is deprecated on npm.'))
    else if (n.latestStable) out.push(rule('LST-2', true, 'Stable version exists and is not deprecated.'))
    else if (i.type === 'official' && n.preview) out.push(rule('LST-2', true, 'Official package with a preview only.'))
    else out.push(rule('LST-2', false, 'No stable version.'))
  } else {
    const g = i.sync?.github
    if (!g) out.push(rule('LST-2', false, 'No GitHub repository data yet.'))
    else if (g.archived) out.push(rule('LST-2', false, 'Repository is archived.'))
    else out.push(rule('LST-2', true, 'Repository exists and is not archived.'))
  }

  // GitHub-only without a tag has no archive to scan: nothing to confirm yet. An npm package always has a
  // tarball, so missing facts fail until the scan runs.
  if (!i.facts && i.source === 'github' && !i.githubTagged)
    out.push(rule('LST-3', true, 'Kind not confirmed yet: no pinned tag to scan.'))
  else if (!i.facts) out.push(rule('LST-3', false, 'Kind not confirmed: no facts yet.'))
  else if (i.kind === 'module') {
    out.push(
      i.facts.gate.installable
        ? rule('LST-3', true, 'src/modules and dist/modules pair found.')
        : rule(
            'LST-3',
            false,
            `No src/modules and dist/modules pair${i.facts.gate.reason ? `: ${i.facts.gate.reason}` : '.'}`,
          ),
    )
  } else out.push(rule('LST-3', true, `Kind ${i.kind} read from package.json.`))

  const lic = i.license.spdx ?? i.licenseValue ?? i.license.kind
  out.push(rule('LST-4', true, `License: ${lic}${i.license.mismatch ? ' (sources differ)' : ''}.`))

  // an advisory of the sync affects the listed version; `fixedIn` only names a release with the fix
  const critical = (i.sync?.advisories ?? []).filter((a) => a.severity === 'critical')
  out.push(
    critical[0]
      ? rule('LST-5', false, `Open critical advisory ${critical[0].id}${fixedInText(critical[0].fixedIn)}.`)
      : rule('LST-5', true, 'No known malware or open critical advisory.'),
  )
  out.push(rule('LST-6', true, 'Name reviewed at merge.'))
  return out
}

export interface VerifiedInput {
  source: 'npm' | 'github'
  npm: string | null
  descriptorGithub: string | null
  sync: SyncRecord | null
  receipts: readonly Receipt[]
  lines: readonly LineInfo[]
  recommended: Record<string, string | null>
  /** Install version per line before receipts (`newestInstallable` with Fit, E5); absent: computed without Fit. */
  installableVersions?: Readonly<Record<string, string | null>>
  /** GitHub-only: version of the pinned tag. */
  githubVersion: string | null
  signals: Pick<Signals, 'receipt' | 'fit' | 'supplyChain' | 'hygiene'>
  /**
   * The version a new app ships on lines whose new app registers the package (`compat.ships`, 24 Oct): VER-1 judges
   * that version there. `receipts` are the main ones (classic preset).
   */
  ships?: Readonly<Record<string, string>>
  /** The signal `in isolation` per line (`compat.isolation`): VER-1 names it next to `not yet tested`. */
  isolation?: Readonly<Record<string, IsolationOf>>
  now: string
}

type FitStatusOn = 'ok' | 'drift' | 'no-fit' | 'unknown'

/**
 * Static fit of one version on one line: its FitCell (status and whether its peers accept the line), its status
 * alone, or null/undefined when not computed.
 */
export type FitOn = (
  version: string,
) => FitStatusOn | { status: FitStatusOn; declared?: { satisfied: boolean } | null } | null | undefined

/**
 * Newest stable version a fresh app can install today on the line (age gate applied). With `fitOn` (the Fit of a
 * version on this line), the newest candidate that does not fail Fit on the line wins (orchestrator decision E5,
 * errata to spec 4.6 and D46): before any receipt, line 0.8 judges the lockstep official 0.8.0, not 0.9.0, which
 * imports paths 0.8.0 does not have. Among the candidates that fit, one whose peers accept the line wins over a newer
 * one built for another line (finding of 25 Oct: storage-s3, telemetry and channel-discord 0.9.0 only `drift` on 0.8,
 * so the 0.8 cells tested 0.9.0 although 0.8.0 exists), and the lockstep release of the line (`X.Y.0` of a line on
 * Open Mercato X.Y.0) wins over both. A candidate whose Fit is not computed yet counts as fitting;
 * when every candidate is `no-fit`, the newest one stays.
 */
export function newestInstallable(
  sync: SyncRecord | null,
  line: LineInfo | null,
  now: string,
  fitOn?: FitOn,
  /** No age gate applies (a tool that runs with npx, `runsWithNpx`): every stable release is installable. */
  ungated = false,
): string | null {
  const n = sync?.npm
  if (!n) return null
  const pre = ungated || isPreapproved(n.name, line?.preapproved)
  const candidates = [n.latestStable, n.previousStable].filter(
    (v): v is string => !!v && isStable(v) && isInstallable(n.publishedAt[v], pre, now),
  )
  const newest = maxVersion(candidates)
  if (!fitOn || newest === null) return newest
  const cell = (v: string) => {
    const f = fitOn(v)
    return f && typeof f === 'object' ? f : { status: f ?? null, declared: null }
  }
  const fitting = candidates.filter((v) => cell(v).status !== 'no-fit')
  // a lockstep release of the line (telemetry 0.8.0 on 0.8, no Open Mercato peers to read) is the one built for it,
  // once its Fit on the line is known
  if (line && fitting.includes(line.version) && cell(line.version).status) return line.version
  const accepted = fitting.filter((v) => cell(v).declared?.satisfied === true)
  return maxVersion(accepted) ?? maxVersion(fitting) ?? newest
}

/**
 * VER-1 detail when no receipt decides the line (review r4): `untested` only when the version has no realistic
 * receipt on the line at all. A first red night is named with its step and the confirmation it still needs, a night
 * that judged nothing with what stopped it, so the rule never reads `untested` next to a red square. The sentences are
 * the ones of the strip and the agent policy (review r6), and a line whose only receipt judged another version says so.
 */
function undecidedDetail(
  receipts: readonly Receipt[],
  line: string,
  versions: readonly (string | null)[],
  npmLatest: string | null = null,
  iso: IsolationOf | null = null,
): string {
  const realistic = sortReceipts(receipts).filter((r) => r.om.line === line && r.harness.mode === 'realistic')
  const own = realistic.filter((r) => versions.includes(r.module?.version ?? null))
  const last = own.at(-1)
  if (!last) {
    const other = realistic.at(-1)
    const installs = versions.find((v): v is string => !!v) ?? null
    if (other?.module && installs && ['verified', 'broken', 'harness-red', 'infra-error'].includes(other.result.status))
      return otherVersionText(line, installs, {
        moduleVersion: other.module.version,
        status: other.result.status,
        step: other.result.failedStep,
        at: other.run.at,
        // the words of the strip for a release the npm data does not list yet (review r7)
        ahead:
          !!npmLatest &&
          isVersion(other.module.version) &&
          isStable(other.module.version) &&
          compareVersions(other.module.version, npmLatest) > 0,
      })
    return untestedText(line, iso ? { ...iso, finding: null } : null, installs)
  }
  const on = shortDate(last.run.at)
  switch (last.result.status) {
    case 'broken':
      return `${brokenText(line, last.result.failedStep, null, last.run.at, false).slice(0, -1)}; a second night confirms it.`
    case 'harness-red':
    case 'infra-error':
      return notJudgedText(line, last.result.status, last.run.at)
    case 'quarantine':
      // a dependency held back by the age gate (a failed install or add step) is a night that judged nothing (r13)
      return last.result.failedStep
        ? notJudgedText(line, 'quarantine', last.run.at)
        : `Receipt on ${line}: new release in the install age gate on ${on}.`
    default:
      return `Receipt on ${line}: ${last.result.status} on ${on}.`
  }
}

function repoOf(url: string | null | undefined): string | null {
  if (!url) return null
  const m = /github\.com[/:]([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:[#/].*)?$/.exec(url)
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null
}

/** VER-5 detail of an npm entry without a descriptor repository whose tarball the sync has not read yet. */
export const VER5_NOT_READ =
  'Not checked: the sync has not read the tarball yet, and the descriptor names no repository.'

/** VER-1..5. */
export function verifiedRules(i: VerifiedInput): Rule[] {
  const out: Rule[] = []
  const latest = latestLine(i.lines)
  if (!latest) out.push(rule('VER-1', false, 'No latest line.'))
  else {
    const L = latest.key
    const skipped = i.signals.receipt[L] === 'skipped'
    let version =
      i.source === 'github'
        ? i.githubVersion
        : (i.ships?.[L] ??
          (i.installableVersions && L in i.installableVersions
            ? (i.installableVersions[L] ?? null)
            : newestInstallable(i.sync, latest, i.now)))
    const judged = version
    let r = version ? decisiveReceipt(i.receipts, L, version) : null
    // until the first night after a release leaves the age gate, `recommended` counts (D46)
    const rec = i.recommended[L] ?? null
    if (!r && rec && rec !== version) {
      version = rec
      r = decisiveReceipt(i.receipts, L, rec)
    }
    if (skipped) out.push(rule('VER-1', false, `Receipt on ${L}: skipped.`))
    else if (!version) out.push(rule('VER-1', false, `No installable version on ${L}.`))
    else if (!r)
      out.push(
        rule(
          'VER-1',
          false,
          undecidedDetail(
            i.receipts,
            L,
            [judged, version],
            i.sync?.npm?.latestStable ?? null,
            i.isolation?.[L] ?? null,
          ),
        ),
      )
    else if (r.result.status === 'broken') {
      // the sentence of the strip and the agent policy (review r6), its first red night from the version's run
      const st = versionStatus(i.receipts, L, version)
      out.push(rule('VER-1', false, brokenText(L, r.result.failedStep, st?.since ?? r.run.at.slice(0, 10))))
    } else if (r.result.status !== 'verified') out.push(rule('VER-1', false, `Receipt on ${L}: ${r.result.status}.`))
    else if (r.baseline === null)
      out.push(rule('VER-1', false, `Receipt on ${L}: verified, but no baseline run of that night was linked.`))
    else if (
      r.baseline.status !== 'verified' &&
      // a red baseline held against packages a new app ships, this one not among them: the pass is this module's own
      // (lib/receipts/state.ts, review of 24 Oct)
      !(
        r.baseline.status === 'harness-red' &&
        (r.baseline.culprits?.length ?? 0) > 0 &&
        !(r.module && r.baseline.culprits?.includes(r.module.locator.replace(/^npm:/, '')))
      )
    )
      out.push(rule('VER-1', false, `Receipt on ${L}: verified, but the baseline was not green.`))
    else {
      const age = daysBetween(r.run.at, i.now)
      out.push(
        age > VERIFIED_MAX_AGE_DAYS
          ? rule(
              'VER-1',
              false,
              `Receipt on ${L}: verified ${Math.floor(age)} days ago (max ${VERIFIED_MAX_AGE_DAYS}).`,
            )
          : rule('VER-1', true, `Receipt on ${L}: verified (${version}).`),
      )
    }
  }

  const fitL = latest ? (i.signals.fit[latest.key] ?? 'unknown') : 'unknown'
  out.push(rule('VER-2', fitL === 'ok' || fitL === 'drift', `Fits statically on ${latest?.key ?? 'latest'}: ${fitL}.`))
  out.push(rule('VER-3', i.signals.supplyChain.status === 'ok', `Supply chain: ${i.signals.supplyChain.status}.`))
  out.push(
    i.signals.hygiene.status === 'fail'
      ? rule('VER-4', false, `Lint errors: ${i.signals.hygiene.failing.join(', ')}.`)
      : rule('VER-4', true, 'No lint errors.'),
  )

  if (i.source === 'github') {
    const tagged = i.githubVersion !== null
    out.push(rule('VER-5', tagged, tagged ? 'Tested on a pinned tag.' : 'No pinned tag.'))
  } else if (i.descriptorGithub) {
    const want = i.descriptorGithub.toLowerCase()
    const got = repoOf(i.sync?.npm?.repositoryUrl)
    const redirected = i.sync?.github?.redirectedFrom?.toLowerCase() ?? null
    const ok = got !== null && (got === want || got === redirected || got === i.sync?.github?.repo.toLowerCase())
    out.push(
      rule(
        'VER-5',
        ok,
        ok ? 'Tarball repository.url matches the descriptor.' : `Tarball repository.url is ${got ?? 'missing'}.`,
      ),
    )
  } else if (!i.sync?.npm)
    // no sync record: whether the tarball names a repository is unknown, so the sentence does not claim it (review of
    // 25 Oct)
    out.push(rule('VER-5', false, VER5_NOT_READ))
  else if (!i.sync.npm.repositoryUrl)
    // nothing names a source, so nothing is checked: not a pass (finding of 25 Oct, a repo-less package had it free)
    out.push(rule('VER-5', false, 'Not checked: neither the descriptor nor the tarball names a repository.'))
  else out.push(rule('VER-5', true, 'No repository in the descriptor to compare.'))
  return out
}

/** Level from the rules: null for hold/delisted, enterprise, or a failed LST rule. */
export function tierFrom(
  rules: readonly Rule[],
  state: Health['state'],
  enterprise: boolean,
): 'listed' | 'verified' | null {
  if (state === 'hold' || state === 'delisted' || enterprise) return null
  if (rules.some((r) => r.id.startsWith('LST-') && !r.pass)) return null
  const ver = rules.filter((r) => r.id.startsWith('VER-'))
  return ver.length > 0 && ver.every((r) => r.pass) ? 'verified' : 'listed'
}
