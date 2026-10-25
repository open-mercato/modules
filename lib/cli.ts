// `yarn om <cmd>`: loads lib/commands/<cmd>.ts on demand (spec 5.4). Each WP owns its command files.
// Exit codes: 0 ok, 1 validation error, 2 environment error.
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

export interface CommonFlags {
  /** --data <dir>, default `.data` (checkout of the `data` branch). */
  data: string
  /** --out <dir>, default `out`. */
  out: string
  /** --offline: no network, fixtures only. */
  offline: boolean
  /** --json: result as JSON on stdout. */
  json: boolean
}

export interface CommandContext {
  /** Arguments after the command name, without the common flags. */
  args: string[]
  flags: CommonFlags
  /** Repo root (directory that holds package.json). */
  root: string
}

/** Contract of lib/commands/<cmd>.ts: a default export (or named `run`) that returns the exit code. */
export interface CommandModule {
  run?: (ctx: CommandContext) => Promise<number | void> | number | void
  default?: (ctx: CommandContext) => Promise<number | void> | number | void
  description?: string
}

export const EXIT_OK = 0
export const EXIT_VALIDATION = 1
export const EXIT_ENV = 2

/** Commands of spec 5.4 with a one-line description; a command is available once its file exists. */
export const COMMANDS: readonly { name: string; owner: string; description: string }[] = [
  { name: 'seed', owner: 'WP03', description: 'write descriptors and policy maps from the i4 inventory (once)' },
  { name: 'validate', owner: 'WP10', description: 'validate descriptors; PR summary and out/validate.json' },
  { name: 'format', owner: 'WP10', description: 'normalize descriptor YAML (key order, Prettier)' },
  { name: 'describe-local', owner: 'WP10', description: 'propose a descriptor and gate result for a local package' },
  { name: 'triage', owner: 'WP10', description: 'one line per open new-entry PR; batch merge after confirmation' },
  { name: 'sync', owner: 'WP04', description: 'packuments, GitHub, deps.dev, OSV, claims into .data/sync' },
  { name: 'discover', owner: 'WP04', description: 'find unlisted packages; out/discover.md' },
  { name: 'watch', owner: 'WP04', description: 'resolve lines and new versions; .data/lines.json, out/queue.json' },
  { name: 'scan', owner: 'WP05', description: 'Anatomy (static facts) of tarballs or built-in modules' },
  { name: 'fit', owner: 'WP06', description: 'static fit of modules against Open Mercato versions' },
  { name: 'radar', owner: 'WP06', description: 'next-snapshot radar; .data/radar/next.json' },
  { name: 'health', owner: 'WP08', description: 'identity, signals, tier and agent policy; .data/health' },
  { name: 'hive', owner: 'WP11', description: 'stable Hive slots; .data/hive.json' },
  { name: 'plan-matrix', owner: 'WP07', description: 'cells for the nightly install; out/matrix.json' },
  { name: 'collect', owner: 'WP07', description: 'receipts from a nightly run; .data/receipts' },
  {
    name: 'cells-local',
    owner: 'WP07',
    description: 'preview: run matrix cells in Docker (local or ssh host) for collect --local',
  },
  { name: 'emit', owner: 'WP09', description: 'published files and site data from .data' },
  { name: 'plugin-sync', owner: 'WP14', description: 'copy the skill and .mcp.json into the Claude Code plugin' },
  { name: 'check-text', owner: 'WP01', description: 'ban long dashes and control characters in texts' },
]

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const COMMANDS_DIR = join(ROOT, 'lib', 'commands')
const NAME_RE = /^[a-z][a-z0-9-]{0,40}$/

export function commandFile(name: string): string | null {
  if (!NAME_RE.test(name)) return null
  const file = join(COMMANDS_DIR, `${name}.ts`)
  return existsSync(file) ? file : null
}

export function parseCommon(argv: string[]): { flags: CommonFlags; rest: string[] } {
  const flags: CommonFlags = { data: '.data', out: 'out', offline: false, json: false }
  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string
    const eq = a.indexOf('=')
    const key = eq > 0 ? a.slice(0, eq) : a
    const inline = eq > 0 ? a.slice(eq + 1) : undefined
    if (key === '--data' || key === '--out') {
      const v = inline ?? argv[++i]
      if (v === undefined || v === '') throw new Error(`${key} needs a directory`)
      if (key === '--data') flags.data = v
      else flags.out = v
    } else if (a === '--offline') flags.offline = true
    else if (a === '--json') flags.json = true
    else rest.push(a)
  }
  return { flags, rest }
}

export function usage(): string {
  const width = Math.max(...COMMANDS.map((c) => c.name.length))
  const lines = COMMANDS.map((c) => {
    const state = commandFile(c.name) ? '' : ` (not built yet, ${c.owner})`
    return `  ${c.name.padEnd(width)}  ${c.description}${state}`
  })
  return [
    'Usage: yarn om <command> [args] [--data <dir>] [--out <dir>] [--offline] [--json]',
    '',
    'Commands:',
    ...lines,
    '',
    'Exit codes: 0 ok, 1 validation error, 2 environment error.',
  ].join('\n')
}

export async function main(argv: string[]): Promise<number> {
  const [name, ...tail] = argv
  if (name === undefined || name === 'help' || name === '--help' || name === '-h') {
    console.log(usage())
    return EXIT_OK
  }
  const file = commandFile(name)
  if (!file) {
    const known = COMMANDS.find((c) => c.name === name)
    console.error(known ? `om: command "${name}" is not built yet (${known.owner}).` : `om: unknown command "${name}".`)
    console.error(usage())
    return EXIT_ENV
  }
  let parsed: { flags: CommonFlags; rest: string[] }
  try {
    parsed = parseCommon(tail)
  } catch (err) {
    console.error(`om: ${(err as Error).message}`)
    return EXIT_ENV
  }
  const mod = (await import(pathToFileURL(file).href)) as CommandModule
  const fn = mod.default ?? mod.run
  if (typeof fn !== 'function') {
    console.error(`om: lib/commands/${name}.ts has no default export or run()`)
    return EXIT_ENV
  }
  const code = await fn({ args: parsed.rest, flags: parsed.flags, root: ROOT })
  return typeof code === 'number' ? code : EXIT_OK
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code
    },
    (err: unknown) => {
      console.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
      process.exitCode = EXIT_ENV
    },
  )
}
