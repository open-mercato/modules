// Words for the facts of a template sha (docs/specs/2026-10-29-templates.md), shared by the Markdown twin of
// `/t/<owner>/<repo>` (lib/emit/templates.ts) and the site page. Isomorphic: no Node APIs.

/** A missing `from` in `src/modules.ts` means core, as the scaffold's `ModuleEntry` type says. */
export const DEFAULT_FROM = '@open-mercato/core'
/** The `from` of a module the app itself holds. */
export const APP_FROM = '@app'

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

/** "Open Mercato 0.9.0 (0.9.x, the latest line)" or "Open Mercato 0.7.2 (0.7.x, 2 lines behind 0.9.0)". */
export function builtOn(f: {
  omVersion: string | null
  omLine: string | null
  linesBehind: number | null
  latestStable: string | null
}): string {
  if (!f.omVersion || !f.omLine) return 'unknown (@open-mercato/core is not pinned in yarn.lock)'
  const head = `Open Mercato ${f.omVersion} (${f.omLine}.x`
  if (f.latestStable === null) return `${head})`
  if (f.linesBehind === null) return `${head}, latest stable is ${f.latestStable})`
  if (f.linesBehind === 0)
    return f.latestStable.startsWith(`${f.omLine}.`)
      ? `${head}, the latest line)`
      : `${head}, newer than the latest stable ${f.latestStable})`
  return `${head}, ${plural(f.linesBehind, 'line')} behind ${f.latestStable})`
}
