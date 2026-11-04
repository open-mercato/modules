// Facts of one template sha (docs/specs/2026-10-29-templates.md, Data Model "Never typed by hand", Phase 1a step 5):
// what the static archive check read, plus the values sync derives from catalog data, the lines behind the latest
// stable line and the Enterprise mark (D5, revision 7). Pure: the caller reads the archive and the catalog.
import type { LicenseKind } from '../schema/common.ts'
import type { TemplateFacts } from '../schema/data/templates.ts'
import type { TemplateModule } from '../schema/template.ts'
import { templateLicense } from '../validate/template-remote.ts'
import type { ArchiveResult } from './archive.ts'
import { ENTERPRISE_PACKAGE } from './lockfile.ts'
import { DEFAULT_FROM } from './modules-ts.ts'

/** The catalog's license kind of an npm package at a version, or null when the catalog has no facts for it. */
export type LicenseKindOf = (name: string, version: string | null) => LicenseKind | null

/** How many inventory lines a facts file keeps (the parser has no cap; the data file does). */
export const MAX_UNPARSED = 100

/**
 * Lines `version` is behind `latest` (both `major.minor.patch`): 0 on the latest line or a newer one, null when either
 * is missing or the majors differ (no line count across a major).
 */
export function linesBehind(version: string | null, latest: string | null): number | null {
  const v = /^(\d+)\.(\d+)\./.exec(version ?? '')
  const l = /^(\d+)\.(\d+)\./.exec(latest ?? '')
  if (!v || !l || v[1] !== l[1]) return null
  return Math.max(0, Number(l[2]) - Number(v[2]))
}

/**
 * The unconditional modules whose package has the enterprise license kind in the catalog (D5, revision 7). A module
 * behind `when` never counts, so the stock scaffolds, which register every enterprise module behind
 * `OM_ENABLE_ENTERPRISE_MODULES`, are not marked. A package the catalog has no facts for counts only when it is
 * `@open-mercato/enterprise`, the package whose kind the catalog's license rule names (lib/rentgen/license.ts).
 */
export function enterpriseModules(
  modules: readonly TemplateModule[],
  packages: Readonly<Record<string, string>>,
  kindOf: LicenseKindOf,
): string[] {
  const out: string[] = []
  for (const m of modules) {
    if (m.when !== undefined || m.from === DEFAULT_FROM) continue
    const kind = kindOf(m.from, packages[m.from] ?? null) ?? (m.from === ENTERPRISE_PACKAGE ? 'enterprise' : null)
    if (kind === 'enterprise' && !out.includes(m.id)) out.push(m.id)
  }
  return out
}

export interface TemplateFactsInput {
  github: string
  sha: string
  /** ISO date-time of the read. */
  readAt: string
  archive: ArchiveResult
  /** The SPDX id GitHub detects for the repository, null for none. */
  githubLicense: string | null
  /** The latest stable `@open-mercato/core` (data/lines.json `coreLatest`), null without one. */
  latestStable: string | null
  kindOf: LicenseKindOf
}

const clip = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 3)}...` : s)

/** The facts file of one sha from its archive check. */
export function templateFacts(i: TemplateFactsInput): TemplateFacts {
  const a = i.archive.facts
  const inv = a.modules
  const modules: TemplateModule[] = (inv?.entries ?? []).map((e) => ({
    id: e.id,
    from: e.from,
    ...(Object.hasOwn(a.packages, e.from) ? { package: `${e.from}@${a.packages[e.from]}` } : {}),
    ...(e.when !== undefined ? { when: e.when } : {}),
  }))
  const lic = templateLicense(a, i.githubLicense)
  const manifest = a.manifest
  const facts: TemplateFacts = {
    factsVersion: 1,
    github: i.github,
    sha: i.sha,
    readAt: i.readAt,
    archive: { files: a.files, bytes: a.bytes },
    omVersion: a.openMercato?.version ?? null,
    omLine: a.openMercato?.line ?? null,
    linesBehind: null,
    latestStable: null,
    engines: a.engines,
    packageManager: a.packageManager,
    requiresEnterprise: false,
    enterpriseModules: [],
    enterpriseDependency: a.enterpriseDependency,
    modules: inv
      ? {
          entries: modules,
          unparsed: inv.unparsed.slice(0, MAX_UNPARSED).map((u) => ({ line: u.line, reason: clip(u.reason, 300) })),
        }
      : null,
    manifest: manifest.state,
    manifestEnv: manifest.state === 'valid' ? (manifest.data.env ?? []) : null,
    license: {
      value: lic.value,
      kind: lic.kind as LicenseKind,
      sources: { licenseFile: a.license.file, packageJson: a.license.packageJson, github: i.githubLicense },
    },
    findings: i.archive.findings
      .slice(0, 50)
      .map((x) => ({ severity: x.severity, code: x.code, message: clip(x.message, 300) })),
  }
  return withDerived(facts, i.latestStable, i.kindOf)
}

/**
 * The values of a facts file that depend on catalog data rather than on the archive: lines behind the latest stable
 * line and the Enterprise mark. Sync recomputes them on every run, so a stored sha needs no second download.
 */
export function withDerived(f: TemplateFacts, latestStable: string | null, kindOf: LicenseKindOf): TemplateFacts {
  const entries = f.modules?.entries ?? []
  const packages: Record<string, string> = {}
  for (const m of entries)
    if (m.package !== undefined) packages[m.from] = m.package.slice(m.package.lastIndexOf('@') + 1)
  const enterprise = enterpriseModules(entries, packages, kindOf)
  return {
    ...f,
    linesBehind: linesBehind(f.omVersion, latestStable),
    latestStable,
    requiresEnterprise: enterprise.length > 0,
    enterpriseModules: enterprise,
  }
}
