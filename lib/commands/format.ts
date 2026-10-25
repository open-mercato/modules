// `yarn om format [<paths>] [--check]` (spec 5.4, 3.4): normalizes descriptor YAML (key order with the `yaml`
// library, writing through Prettier). Default path: `modules`. A file that does not parse is skipped with a
// message (validate explains it); `--check` writes nothing and exits 1 when a file would change or cannot be read.
// autofix.yml runs `yarn om format modules` on pull requests.
import { readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import type { CommandContext } from '../cli.ts'
import { EXIT_OK, EXIT_VALIDATION } from '../cli.ts'
import { FormatError, formatDescriptorText, readCategoryAliases, yamlFiles } from '../validate/format.ts'

export const description = 'normalize descriptor YAML (key order, Prettier)'

export default async function format(ctx: CommandContext): Promise<number> {
  const check = ctx.args.includes('--check')
  const paths = ctx.args.filter((a) => !a.startsWith('--'))
  const unknown = ctx.args.filter((a) => a.startsWith('--') && a !== '--check')
  if (unknown.length > 0) {
    console.error(`format: unknown option ${unknown[0]}`)
    return 2
  }
  const files = yamlFiles((paths.length > 0 ? paths : ['modules']).map((p) => resolve(p)))
  const aliases = readCategoryAliases(ctx.root)
  const rel = (f: string) => relative(process.cwd(), f).split(sep).join('/')
  let changed = 0
  let failed = 0
  const report: { file: string; changed: boolean; notes: string[]; error?: string }[] = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    try {
      const res = await formatDescriptorText(text, file, { categoryAliases: aliases })
      report.push({ file: rel(file), changed: res.changed, notes: res.notes })
      if (!res.changed) continue
      changed++
      if (!check) writeFileSync(file, res.text)
      if (!ctx.flags.json) {
        console.log(`${check ? 'would format' : 'formatted'} ${rel(file)}`)
        for (const n of res.notes) console.log(`  ${n}`)
      }
    } catch (err) {
      if (!(err instanceof FormatError)) throw err
      failed++
      report.push({ file: rel(file), changed: false, notes: [], error: err.message })
      if (!ctx.flags.json) console.error(`skipped ${rel(file)}: ${err.message}`)
    }
  }
  if (ctx.flags.json) console.log(JSON.stringify({ files: files.length, changed, failed, report }, null, 2))
  else
    console.log(
      `format: ${files.length} file(s), ${changed} ${check ? 'would change' : 'changed'}` +
        (failed ? `, ${failed} skipped (YAML does not parse)` : '') +
        '.',
    )
  return check && (changed > 0 || failed > 0) ? EXIT_VALIDATION : EXIT_OK
}
