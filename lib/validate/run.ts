// `validate` orchestration (spec 5.2 validate.yml): which descriptors to check (`--changed=<ref>`, `--files`, or
// all), the ten steps per entry in order (the first hard error stops the entry), policy files and the built-in
// category map, and the report for $GITHUB_STEP_SUMMARY and out/validate.json.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import type { z } from 'zod'
import {
  BuiltinCategoriesFile,
  CategoriesFile,
  CommunityFile,
  HarnessLinesFile,
  IgnoreFile,
  OfficialMaintainersFile,
  ReservedFile,
  SiteFile,
} from '../schema/index.ts'
import type { Catalog } from './catalog.ts'
import { checkLocal } from './local.ts'
import { checkRemote, type RemoteDeps } from './remote.ts'
import { errorsOf, STEPS, type EntryResult, type Finding, type StepId, type ValidateReport } from './types.ts'

export interface ChangedFiles {
  /** Added or modified descriptor files (`modules/**`), repo-relative. */
  descriptors: string[]
  removed: string[]
  /** Changed files under policy/ (and harness/lines.yml). */
  policy: string[]
}

function git(root: string, args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

/** Files changed between `ref` and HEAD (merge base, like a PR diff). Throws when the ref is unknown. */
export function changedFiles(root: string, ref: string): ChangedFiles {
  const out = git(root, ['diff', '--name-status', '--no-renames', '-z', `${ref}...HEAD`])
  const parts = out.split('\0').filter((p) => p !== '')
  const res: ChangedFiles = { descriptors: [], removed: [], policy: [] }
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const status = parts[i] as string
    const file = parts[i + 1] as string
    if (file.startsWith('modules/')) (status === 'D' ? res.removed : res.descriptors).push(file)
    else if ((file.startsWith('policy/') || file === 'harness/lines.yml') && status !== 'D') res.policy.push(file)
  }
  return res
}

/** Content of a file at a ref, or null when it did not exist there. */
export function textAt(root: string, ref: string, file: string): string | null {
  try {
    return git(root, ['show', `${ref}:${file}`])
  } catch {
    return null
  }
}

const POLICY_SCHEMAS: Record<string, z.ZodType> = {
  'policy/categories.yml': CategoriesFile,
  'policy/builtin-categories.yml': BuiltinCategoriesFile,
  'policy/community.yml': CommunityFile,
  'policy/official-maintainers.yml': OfficialMaintainersFile,
  'policy/reserved.yml': ReservedFile,
  'policy/site.yml': SiteFile,
  'policy/ignore.yml': IgnoreFile,
  'harness/lines.yml': HarnessLinesFile,
}

const g = (step: StepId, severity: Finding['severity'], code: string, message: string): Finding => ({
  step,
  severity,
  code,
  message,
})

/** Schema of each given policy file (all known policy files when `files` is null). */
export function checkPolicyFiles(root: string, files: readonly string[] | null): Finding[] {
  const out: Finding[] = []
  const list = files ?? Object.keys(POLICY_SCHEMAS).filter((f) => existsSync(join(root, f)))
  for (const file of list) {
    const schema = POLICY_SCHEMAS[file]
    if (!schema) {
      if (file.startsWith('policy/'))
        out.push(g('schema', 'warning', 'policy-unknown', `${file} is not a known policy file`))
      continue
    }
    let data: unknown
    try {
      data = parse(readFileSync(join(root, file), 'utf8'))
    } catch (err) {
      out.push(g('schema', 'error', 'policy-yaml', `${file}: ${(err as Error).message.split('\n')[0]}`))
      continue
    }
    const r = schema.safeParse(data ?? (file === 'policy/ignore.yml' ? [] : {}))
    if (!r.success)
      for (const i of r.error.issues.slice(0, 5))
        out.push(g('schema', 'error', 'policy', `${file}: ${i.path.join('.') || '(root)'}: ${i.message}`))
  }
  return out
}

/** Step 10: policy/builtin-categories.yml covers every core module of the latest line (error only here, spec 4.4). */
export function checkBuiltinCoverage(catalog: Catalog): Finding[] {
  const out: Finding[] = []
  if (!catalog.builtin) {
    out.push(
      g('builtin', 'warning', 'builtin-unknown', 'built-in modules unknown (no data/builtin): coverage not checked'),
    )
    return out
  }
  const map = catalog.builtinCategories ?? {}
  const ids = catalog.builtin.modules.map((m) => m.id)
  const missing = ids.filter((id) => !(id in map))
  if (missing.length > 0)
    out.push(
      g(
        'builtin',
        'error',
        'builtin-missing',
        `policy/builtin-categories.yml misses core ${catalog.builtin.coreVersion} module${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
      ),
    )
  const extra = Object.keys(map).filter((id) => !ids.includes(id))
  if (extra.length > 0)
    out.push(
      g(
        'builtin',
        'info',
        'builtin-extra',
        `policy/builtin-categories.yml lists ${extra.join(', ')}, not in core ${catalog.builtin.coreVersion} (${catalog.builtinSource})`,
      ),
    )
  return out
}

export interface ValidateOptions {
  root: string
  catalog: Catalog
  /** Descriptor files to check, repo-relative. */
  files: readonly string[]
  /** Base ref for curator-field comparison; null when not validating a diff. */
  baseRef: string | null
  removed?: readonly string[]
  /** Policy files to check (null: all). */
  policyFiles?: readonly string[] | null
  /** Run step 10 (coverage of the built-in category map). */
  builtinCheck: boolean
  labels: readonly string[]
  /** Network dependencies; null = offline (steps 2-4 and 7-9 skipped). */
  remote: RemoteDeps | null
  now: Date
  log?: (line: string) => void
}

/** Validates one descriptor file through the ten steps. */
export async function validateEntry(file: string, opts: ValidateOptions): Promise<EntryResult> {
  const t0 = Date.now()
  const abs = join(opts.root, file)
  const result: EntryResult = {
    file,
    locator: null,
    version: null,
    status: 'pass',
    findings: [],
    skipped: [],
    rows: [],
    durationMs: 0,
  }
  const finish = (): EntryResult => {
    result.status = errorsOf(result.findings).length > 0 ? 'fail' : 'pass'
    result.durationMs = Date.now() - t0
    return result
  }
  if (!existsSync(abs)) {
    result.findings.push(g('schema', 'error', 'missing', `${file} does not exist`))
    return finish()
  }
  const text = readFileSync(abs, 'utf8')
  const local = checkLocal(
    {
      file,
      text,
      labels: opts.labels,
      ...(opts.baseRef !== null ? { baseText: textAt(opts.root, opts.baseRef, file) } : {}),
    },
    opts.catalog,
  )
  result.locator = local.locator
  result.findings.push(...local.findings)
  const network: StepId[] = ['locator', 'tarball', 'license', 'anatomy', 'lint']
  if (!local.d || errorsOf(local.findings).some((x) => x.step === 'schema')) {
    for (const s of STEPS.slice(1)) if (s !== 'builtin') result.skipped.push({ step: s, reason: 'schema error' })
    return finish()
  }
  if (!opts.remote) {
    for (const s of [...network, 'claim' as const]) result.skipped.push({ step: s, reason: 'offline' })
    result.rows.push({ check: 'Kind', result: `${local.d.kind} (declared; tarball not read offline)` })
    return finish()
  }
  opts.log?.(`validate: ${local.locator}`)
  const remote = await checkRemote(local.d, local.locator as string, opts.catalog, opts.remote)
  result.version = remote.version
  result.findings.push(...remote.findings)
  result.skipped.push(...remote.skipped)
  result.rows.push(...remote.rows)
  return finish()
}

export async function runValidate(opts: ValidateOptions): Promise<ValidateReport> {
  const entries: EntryResult[] = []
  for (const file of opts.files) entries.push(await validateEntry(file, opts))
  const global: Finding[] = [...checkPolicyFiles(opts.root, opts.policyFiles ?? null)]
  if (opts.builtinCheck) global.push(...checkBuiltinCoverage(opts.catalog))
  return {
    generatedAt: opts.now.toISOString(),
    offline: opts.remote === null,
    changedFrom: opts.baseRef,
    entries,
    removed: [...(opts.removed ?? [])],
    global,
    notes: [...opts.catalog.notes],
  }
}

export const reportFailed = (r: ValidateReport): boolean =>
  r.entries.some((e) => e.status === 'fail') || r.global.some((x) => x.severity === 'error')
