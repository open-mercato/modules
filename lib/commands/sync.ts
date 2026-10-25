// `yarn om sync [--changed=<ref>] [--all] [<locator>...]` (spec 5.4, 5.2 sync.yml): npm, GitHub, deps.dev, OSV,
// downloads, partners, type and claims -> .data/sync/**, claims.json, stats.json, official-coverage.json;
// out/sync-report.json for discover. Extra flags: --modules <dir>, --policy <dir>, --record, --commit <message>.
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK, EXIT_VALIDATION } from '../cli.ts'
import { modulesRepo, makeHttp, now, parseSourceFlags, withData } from '../sources/command.ts'
import { changedDescriptorFiles, loadEntries } from '../sources/entries.ts'
import { runSync, type SyncResult } from '../sources/sync.ts'
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
  let only: Set<string> | null = null
  if (f.positional.length) only = new Set(f.positional)
  else if (f.changed && !f.all) {
    try {
      const files = new Set(changedDescriptorFiles(ctx.root, f.changed))
      only = new Set(
        loadEntries(f.modulesDir)
          .entries.filter((e) => files.has(relative(ctx.root, e.file).split('\\').join('/')))
          .map((e) => e.locator),
      )
    } catch (err) {
      console.error(`sync: cannot diff against ${f.changed}: ${(err as Error).message}`)
      return EXIT_ENV
    }
  }
  const http = makeHttp(ctx, f)
  let result: SyncResult | null = null
  try {
    await withData(f, async () => {
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
    })
  } catch (err) {
    console.error(`sync: ${(err as Error).message}`)
    return EXIT_ENV
  }
  const r = result as SyncResult | null
  if (!r) return EXIT_ENV
  if (ctx.flags.json)
    console.log(
      JSON.stringify(
        {
          records: r.records.length,
          claims: Object.keys(r.claims).length,
          coverage: r.coverage,
          attention: r.attention,
          errors: r.errors,
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
  }
  return r.errors.some((e) => e.startsWith('descriptor ')) ? EXIT_VALIDATION : EXIT_OK
}
