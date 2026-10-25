// `yarn om watch` (spec 5.4, 5.2 watch.yml): `.data/lines.json` from npm and `out/queue.json` with versions that
// have no facts yet. Extra flags: --keepalive (re-enable cron workflows every 30 days; needs GITHUB_REPOSITORY and
// a token), --modules <dir>, --record, --commit <message>.
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK } from '../cli.ts'
import { modulesRepo, makeHttp, now, parseSourceFlags, withData } from '../sources/command.ts'
import { runWatch, type WatchResult } from '../sources/watch.ts'

export const description = 'resolve lines and new versions; .data/lines.json, out/queue.json'

export default async function watch(ctx: CommandContext): Promise<number> {
  let f
  try {
    f = parseSourceFlags(ctx)
  } catch (err) {
    console.error(`watch: ${(err as Error).message}`)
    return EXIT_ENV
  }
  const http = makeHttp(ctx, f)
  let result: WatchResult | null = null
  try {
    await withData(f, async () => {
      result = await runWatch({
        http,
        root: ctx.root,
        modulesDir: f.modulesDir,
        dataDir: f.dataDir,
        outDir: f.outDir,
        now: now(),
        keepalive: f.keepalive && !ctx.flags.offline ? { repo: modulesRepo() } : null,
        log: (l) => console.error(l),
      })
    })
  } catch (err) {
    console.error(`watch: ${(err as Error).message}`)
    return EXIT_ENV
  }
  const r = result as WatchResult | null
  if (!r) return EXIT_ENV
  if (ctx.flags.json) console.log(JSON.stringify({ lines: r.lines, queue: r.queue }, null, 2))
  else {
    for (const l of r.lines?.lines ?? []) console.log(`${l.key.padEnd(5)} ${l.version} (${l.source}, ${l.cadence})`)
    console.log(`core ${r.lines?.coreLatest ?? 'unknown'}; ${r.queue.items.length} versions queued`)
    for (const e of r.queue.errors) console.log(`error: ${e}`)
  }
  return r.lines ? EXIT_OK : EXIT_ENV
}
