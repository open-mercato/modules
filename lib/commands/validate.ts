// `yarn om validate [--changed=<ref>] [--files <f>...] [--summary <file>]` (spec 5.2, 5.4).
// Checks descriptors in the order of spec 5.2 (schema, locator, tarball, license, texts, names, Rentgen + Fit,
// lint, preliminary claim, built-in map) and writes a markdown summary (at most 10 lines per entry) plus
// out/validate.json. Without --changed and --files every descriptor in modules/ is checked.
// Extra flags: --labels <a,b> (PR labels; env PR_LABELS), --author <login> (PR author; env PR_AUTHOR),
// --no-fit (skip Fit), --cache <dir> (OM tarballs for Fit, default <out>/om-tarballs).
// --offline runs only the steps without network (1, 5, 6, curator fields, 10). Exit 0 ok, 1 invalid, 2 environment.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK, EXIT_VALIDATION } from '../cli.ts'
import { createStore } from '../fit/om-tarballs.ts'
import { githubToken } from '../sources/github.ts'
import { createHttp } from '../sources/http.ts'
import { loadCatalog, rel } from '../validate/catalog.ts'
import { yamlFiles } from '../validate/format.ts'
import { changedFiles, reportFailed, runValidate } from '../validate/run.ts'
import { renderSummary, renderText } from '../validate/summary.ts'

export const description = 'validate descriptors; PR summary and out/validate.json'

interface Flags {
  changed: string | null
  files: string[]
  summary: string | null
  labels: string[]
  author: string | null
  fit: boolean
  cache: string | null
}

export function parseFlags(args: readonly string[]): Flags {
  const f: Flags = {
    changed: null,
    files: [],
    summary: null,
    labels: (process.env.PR_LABELS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    author: process.env.PR_AUTHOR || null,
    fit: true,
    cache: null,
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    const eq = a.indexOf('=')
    const key = a.startsWith('--') && eq > 0 ? a.slice(0, eq) : a
    const inline = a.startsWith('--') && eq > 0 ? a.slice(eq + 1) : undefined
    const value = (): string => {
      const v = inline ?? args[++i]
      if (v === undefined || v === '') throw new Error(`${key} needs a value`)
      return v
    }
    if (key === '--changed') f.changed = value()
    else if (key === '--summary') f.summary = value()
    else if (key === '--labels')
      f.labels = value()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    else if (key === '--author') f.author = value() || null
    else if (key === '--cache') f.cache = value()
    else if (key === '--no-fit') f.fit = false
    else if (key === '--files') {
      if (inline) f.files.push(inline)
      while (i + 1 < args.length && !(args[i + 1] as string).startsWith('--')) f.files.push(args[++i] as string)
    } else if (a.startsWith('--')) throw new Error(`unknown option ${a}`)
    else f.files.push(a)
  }
  return f
}

export default async function validate(ctx: CommandContext): Promise<number> {
  let flags: Flags
  try {
    flags = parseFlags(ctx.args)
  } catch (err) {
    console.error(`validate: ${(err as Error).message}`)
    return EXIT_ENV
  }
  const root = ctx.root
  let files: string[]
  let removed: string[] = []
  let policyFiles: string[] | null = null
  let qualityFiles: string[] | null = null
  let builtinCheck = true
  if (flags.changed) {
    try {
      const ch = changedFiles(root, flags.changed)
      files = ch.descriptors
      removed = ch.removed
      policyFiles = ch.policy
      qualityFiles = ch.quality
      builtinCheck = ch.policy.includes('policy/builtin-categories.yml')
    } catch (err) {
      console.error(`validate: cannot diff against ${flags.changed}: ${(err as Error).message.split('\n')[0]}`)
      return EXIT_ENV
    }
    files.push(...flags.files.map((f) => rel(root, resolve(f))))
  } else if (flags.files.length > 0) {
    files = yamlFiles(flags.files.map((f) => resolve(f))).map((f) => rel(root, f))
    if (files.length === 0) files = flags.files.map((f) => rel(root, resolve(f)))
    policyFiles = []
    qualityFiles = []
    builtinCheck = false
  } else {
    files = yamlFiles([join(root, 'modules')]).map((f) => rel(root, f))
  }
  files = [...new Set(files)].sort()

  const now = process.env.OM_NOW ? new Date(process.env.OM_NOW) : new Date()
  const dataDir = resolve(ctx.flags.data)
  const outDir = resolve(ctx.flags.out)
  const log = (l: string) => console.error(l)
  const catalog = await loadCatalog(root, dataDir)
  const remote = ctx.flags.offline
    ? null
    : {
        http: createHttp({ githubToken: githubToken() }),
        store: flags.fit ? createStore(resolve(flags.cache ?? join(outDir, 'om-tarballs'))) : null,
        now,
        author: flags.author,
        log,
      }
  const report = await runValidate({
    root,
    catalog,
    files,
    baseRef: flags.changed,
    removed,
    policyFiles,
    qualityFiles,
    builtinCheck,
    labels: flags.labels,
    remote,
    now,
    log,
  })
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'validate.json'), `${JSON.stringify(report, null, 2)}\n`)
  if (flags.summary) appendFileSync(flags.summary, renderSummary(report))
  if (ctx.flags.json) console.log(JSON.stringify(report, null, 2))
  else console.log(renderText(report))
  return reportFailed(report) ? EXIT_VALIDATION : EXIT_OK
}
