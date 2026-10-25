// Result shapes of `yarn om validate` (spec 5.2 validate.yml steps 1-10). Also written to out/validate.json.

/** Steps of spec 5.2, in order. The first hard error stops the entry. */
export const STEPS = [
  'schema', // 1. Zod Descriptor, path = locator, category
  'locator', // 2. package or repository exists, stable, not deprecated or archived
  'tarball', // 3. download with SRI, filtered unpack, kind gate
  'license', // 4. four sources, mismatch = warning
  'texts', // 5. PlainText, lengths, `Use when `, injection flags
  'name', // 6. typosquat and reserved names
  'anatomy', // 7. Rentgen and Fit of the PR version
  'lint', // 8. lint 6.6 incl. host-dependency-duplication and collision-core
  'claim', // 9. preliminary claim, curator fields
  'builtin', // 10. policy/builtin-categories.yml coverage
] as const
export type StepId = (typeof STEPS)[number]

export type Severity = 'error' | 'warning' | 'info'

export interface Finding {
  step: StepId
  severity: Severity
  /** Stable code, e.g. `schema`, `path`, `not-found`, `typosquat`. */
  code: string
  /** Human text (English, may contain author-controlled fragments: escape before rendering). */
  message: string
}

export interface Row {
  check: string
  result: string
}

export interface EntryResult {
  /** Repo-relative descriptor path. */
  file: string
  locator: string | null
  /** Version that was checked (latest stable, preview or tag), when known. */
  version: string | null
  status: 'pass' | 'fail'
  findings: Finding[]
  /** Steps not run, with the reason (offline, missing data, earlier error). */
  skipped: { step: StepId; reason: string }[]
  /** Summary table rows (spec 5.2 example), most important first. */
  rows: Row[]
  durationMs: number
}

export interface ValidateReport {
  generatedAt: string
  offline: boolean
  /** Base ref of `--changed`, if any. */
  changedFrom: string | null
  entries: EntryResult[]
  /** Removed descriptors (informational). */
  removed: string[]
  /** Findings that belong to no single entry (policy files, built-in coverage, stray files). */
  global: Finding[]
  notes: string[]
}

export const errorsOf = (findings: readonly Finding[]): Finding[] => findings.filter((f) => f.severity === 'error')
