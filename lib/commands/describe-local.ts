// `yarn om describe-local <dir|tgz> [--category <id>]` (spec 5.4): proposed descriptor and gate result for a local
// package, for authors, without network. Exit 0 when the gate passes, 1 when it fails, 2 on bad input.
import { resolve } from 'node:path'
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK, EXIT_VALIDATION } from '../cli.ts'
import { loadCatalog } from '../validate/catalog.ts'
import { describeLocal } from '../validate/describe.ts'

export const description = 'propose a descriptor and gate result for a local package'

export default async function describe(ctx: CommandContext): Promise<number> {
  const args = [...ctx.args]
  let category: string | undefined
  const ci = args.findIndex((a) => a === '--category' || a.startsWith('--category='))
  if (ci >= 0) {
    const a = args[ci] as string
    category = a.includes('=') ? a.slice(a.indexOf('=') + 1) : args[ci + 1]
    args.splice(ci, a.includes('=') ? 1 : 2)
  }
  const input = args.find((a) => !a.startsWith('--'))
  if (!input || args.some((a) => a.startsWith('--'))) {
    console.error('Usage: yarn om describe-local <package dir | package.tgz> [--category <id>] [--json]')
    return EXIT_ENV
  }
  let res
  try {
    const catalog = await loadCatalog(ctx.root, resolve(ctx.flags.data))
    res = await describeLocal(resolve(input), catalog, category ? { category } : {})
  } catch (err) {
    console.error(`describe-local: ${(err as Error).message.split('\n')[0]}`)
    return EXIT_ENV
  }
  if (ctx.flags.json) {
    const { facts: _facts, ...rest } = res
    console.log(JSON.stringify(rest, null, 2))
  } else {
    console.log(`${res.locator}@${res.facts.package.version}`)
    console.log(`Gate: ${res.gate.text}`)
    for (const r of res.report) console.log(`${r.check}: ${r.result}`)
    const shown = res.lint.filter((l) => l.severity !== 'info')
    for (const l of shown) console.log(`lint ${l.severity} ${l.code}: ${l.message}`)
    console.log('')
    console.log(`Proposed ${res.file}:`)
    console.log('')
    process.stdout.write(res.yaml)
    if (res.problems.length > 0) {
      console.log('')
      console.log('Fill before submitting:')
      for (const p of res.problems) console.log(`- ${p}`)
    }
    console.log('')
    console.log(`Then open a pull request that adds ${res.file}.`)
  }
  return res.gate.pass ? EXIT_OK : EXIT_VALIDATION
}
