// `yarn om discover` (spec 5.4, 5.2 sync.yml step 3): out/discover.md (body of the one "Discovered packages" issue,
// edited in place by the workflow) and out/discover.json. Extra flags: --modules <dir>, --policy <dir>, --record.
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK } from '../cli.ts'
import { modulesRepo, makeHttp, now, parseSourceFlags } from '../sources/command.ts'
import { runDiscover } from '../sources/discover.ts'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const description = 'find unlisted packages; out/discover.md'

export default async function discover(ctx: CommandContext): Promise<number> {
  let f
  try {
    f = parseSourceFlags(ctx)
  } catch (err) {
    console.error(`discover: ${(err as Error).message}`)
    return EXIT_ENV
  }
  try {
    const r = await runDiscover({
      http: makeHttp(ctx, f),
      root: ctx.root,
      modulesDir: f.modulesDir,
      policyDir: f.policyDir,
      dataDir: f.dataDir,
      outDir: f.outDir,
      now: now(),
      modulesRepo: modulesRepo(),
      log: (l) => console.error(l),
    })
    mkdirSync(f.outDir, { recursive: true })
    writeFileSync(join(f.outDir, 'discover.md'), r.markdown)
    if (ctx.flags.json)
      console.log(
        JSON.stringify(
          {
            proposals: r.proposals.map((p) => p.locator),
            missingOfficial: r.missingOfficial.map((m) => m.name),
            skipped: r.skipped,
            errors: r.errors,
          },
          null,
          2,
        ),
      )
    else {
      console.log(
        `discover: ${r.proposals.length} proposals: ${r.proposals.map((p) => p.locator).join(', ') || 'none'}`,
      )
      console.log(`missing official: ${r.missingOfficial.map((m) => m.name).join(', ') || 'none'}`)
      for (const e of r.errors) console.log(`error: ${e}`)
    }
    return EXIT_OK
  } catch (err) {
    console.error(`discover: ${(err as Error).message}`)
    return EXIT_ENV
  }
}
