// `yarn om sync [--changed=<ref>] [--all] [<locator> | <owner/repo>...]` (spec 5.4, 5.2 sync.yml): npm, GitHub,
// deps.dev, OSV, downloads, partners, type and claims -> .data/sync/**, claims.json, stats.json,
// official-coverage.json; out/sync-report.json for discover. Templates (docs/specs/2026-10-29-templates.md, Phase 1a
// step 5): repository, ref and per-sha facts -> .data/sync/templates/**, .data/facts/templates/**;
// out/template-sync-report.json. A positional `owner/repo` (no `npm:` or `github:` prefix) names a template entry.
// Extra flags: --modules <dir>, --policy <dir>, --record, --commit <message>.
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK, EXIT_VALIDATION } from '../cli.ts'
import { modulesRepo, makeHttp, now, parseSourceFlags, withData } from '../sources/command.ts'
import { changedDescriptorFiles, loadEntries } from '../sources/entries.ts'
import { runSync, type SyncResult } from '../sources/sync.ts'
import { loadTemplateEntries, runTemplateSync, type TemplateSyncResult } from '../templates/sync.ts'
import { join, relative } from 'node:path'

export const description = 'packuments, GitHub, deps.dev, OSV, claims into .data/sync'

export default async function sync(ctx: CommandContext): Promise<number> {
  let f
  try {
    f = parseSourceFlags(ctx)
  } catch (err) {
    console.error(`sync: ${(err as Error).message}`)
    return EXIT_ENV
  }
  const templatesDir = join(ctx.root, 'templates')
  // no template entry yet: module sync behaves exactly as before templates existed
  const loaded = loadTemplateEntries(templatesDir, ctx.root)
  const hasTemplates = loaded.entries.length + loaded.errors.length > 0
  let only: Set<string> | null = null
  // templates to sync: null = all, an empty set = none
  let templates: Set<string> | null = null
  let modulesToo = true
  if (f.positional.length) {
    const locators = f.positional.filter((p) => p.includes(':'))
    templates = new Set(f.positional.filter((p) => !p.includes(':')).map((p) => p.toLowerCase()))
    only = new Set(locators)
    modulesToo = locators.length > 0
  } else if (f.changed && !f.all) {
    try {
      const files = new Set(changedDescriptorFiles(ctx.root, f.changed))
      only = new Set(
        loadEntries(f.modulesDir)
          .entries.filter((e) => files.has(relative(ctx.root, e.file).split('\\').join('/')))
          .map((e) => e.locator),
      )
      const changedTemplates = new Set(changedDescriptorFiles(ctx.root, f.changed, 'templates/'))
      templates = new Set(loaded.entries.filter((e) => changedTemplates.has(e.file)).map((e) => e.path))
    } catch (err) {
      console.error(`sync: cannot diff against ${f.changed}: ${(err as Error).message}`)
      return EXIT_ENV
    }
  }
  const http = makeHttp(ctx, f)
  let result: SyncResult | null = null
  let tresult: TemplateSyncResult | null = null
  try {
    await withData(f, async () => {
      if (modulesToo)
        result = await runSync({
          http,
          root: ctx.root,
          modulesDir: f.modulesDir,
          policyDir: f.policyDir,
          dataDir: f.dataDir,
          outDir: f.outDir,
          now: now(),
          only,
          modulesRepo: modulesRepo(),
          log: (l) => console.error(l),
        })
      // with no entry at all, only a template named on the command line runs it (and is reported as missing)
      if (templates === null ? hasTemplates : templates.size > 0)
        tresult = await runTemplateSync({
          http,
          root: ctx.root,
          templatesDir,
          dataDir: f.dataDir,
          outDir: f.outDir,
          now: now(),
          only: templates,
          log: (l) => console.error(l),
        })
    })
  } catch (err) {
    console.error(`sync: ${(err as Error).message}`)
    return EXIT_ENV
  }
  const r = result as SyncResult | null
  const t = tresult as TemplateSyncResult | null
  if (!r && !t) return modulesToo ? EXIT_ENV : EXIT_OK
  const templateFailed = (t?.errors.length ?? 0) > 0
  if (!r) {
    printTemplates(t, ctx.flags.json === true)
    return templateFailed ? EXIT_VALIDATION : EXIT_OK
  }
  if (ctx.flags.json)
    console.log(
      JSON.stringify(
        {
          records: r.records.length,
          claims: Object.keys(r.claims).length,
          coverage: r.coverage,
          attention: r.attention,
          errors: r.errors,
          ...(t ? { templates: templateSummary(t) } : {}),
        },
        null,
        2,
      ),
    )
  else {
    const types = r.records.reduce<Record<string, number>>((m, x) => ((m[x.type] = (m[x.type] ?? 0) + 1), m), {})
    console.log(
      `sync: ${r.records.length} records (${Object.entries(types)
        .map(([k, v]) => `${v} ${k}`)
        .join(', ')}), ${Object.keys(r.claims).length} claims`,
    )
    if (r.coverage)
      console.log(`official coverage: ${r.coverage.listed} listed, missing: ${r.coverage.missing.join(', ') || 'none'}`)
    const withErrors = r.records.filter((x) => x.errors.length).length
    if (withErrors) console.log(`${withErrors} records carry source notes (see ${join(f.outDir, 'sync-report.json')})`)
    for (const e of r.errors) console.log(`error: ${e}`)
    printTemplates(t, false)
  }
  return r.errors.some((e) => e.startsWith('descriptor ')) || templateFailed ? EXIT_VALIDATION : EXIT_OK
}

function templateSummary(t: TemplateSyncResult) {
  return {
    records: t.records.length,
    facts: t.facts.length,
    attention: t.attention,
    errors: t.errors,
  }
}

function printTemplates(t: TemplateSyncResult | null, json: boolean): void {
  if (!t) return
  if (json) {
    console.log(JSON.stringify({ templates: templateSummary(t) }, null, 2))
    return
  }
  console.log(`sync: ${t.records.length} templates, facts written for ${t.facts.length} commits`)
  for (const a of t.attention) console.log(`template ${a.kind}: ${a.text}`)
  const withErrors = t.records.filter((x) => x.errors.length).length
  if (withErrors) console.log(`${withErrors} template records carry source notes (see out/template-sync-report.json)`)
  for (const e of t.errors) console.log(`error: ${e}`)
}
