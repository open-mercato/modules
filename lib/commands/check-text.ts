// `yarn om check-text`: no U+2014, U+2013 or control characters in human texts (spec 0.7, 3.5).
// Scope: site/src/**, modules/**, policy/**, quality/**, .github/**, skills/**, plugins/** and every *.md,
// except test/fixtures/** and generated or vendored directories. Optional args restrict the check to given files.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { CommandContext } from '../cli.ts'
import { EXIT_OK, EXIT_VALIDATION } from '../cli.ts'
import { findBannedChars } from '../core/text.ts'

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  '.data',
  '.astro',
  '.yarn',
  '.wrangler',
  'test-results',
  'playwright-report',
])
const SKIP_PREFIXES = ['test/fixtures/', 'site/.generated/']
const TEXT_DIRS = ['site/src/', 'modules/', 'policy/', 'quality/', '.github/', 'skills/', 'plugins/']
const TEXT_EXT = /\.(md|mdx|ya?ml|astro|tsx?|jsx?|css|html|json|txt|svg)$/

export const description = 'ban long dashes and control characters in texts'

/** Whether a repo-relative path is in scope of check-text. */
export function inScope(rel: string): boolean {
  if (SKIP_PREFIXES.some((p) => rel.startsWith(p))) return false
  if (rel.endsWith('.md')) return true
  return TEXT_DIRS.some((d) => rel.startsWith(d)) && TEXT_EXT.test(rel)
}

function walk(root: string, dir: string, acc: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(root, join(dir, entry.name), acc)
    } else if (entry.isFile()) {
      const rel = relative(root, join(dir, entry.name)).split(sep).join('/')
      if (inScope(rel)) acc.push(rel)
    }
  }
}

export default function checkText(ctx: CommandContext): number {
  const files: string[] = []
  if (ctx.args.length > 0) {
    for (const a of ctx.args) if (statSync(join(ctx.root, a)).isFile()) files.push(a)
  } else walk(ctx.root, ctx.root, files)
  let count = 0
  const report: { file: string; line: number; column: number; name: string }[] = []
  for (const rel of files.sort()) {
    const hits = findBannedChars(readFileSync(join(ctx.root, rel), 'utf8'))
    for (const h of hits) {
      count++
      report.push({ file: rel, ...h })
      if (!ctx.flags.json) console.error(`${rel}:${h.line}:${h.column} ${h.name}`)
    }
  }
  if (ctx.flags.json) console.log(JSON.stringify({ files: files.length, hits: report }, null, 2))
  else if (count === 0) console.log(`check-text: ${files.length} files, no banned characters.`)
  else console.error(`check-text: ${count} banned characters. Use "-" or rewrite the sentence.`)
  return count === 0 ? EXIT_OK : EXIT_VALIDATION
}
