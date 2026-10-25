// lib/core runs in Node, the browser and the MCP Worker (spec 3.2, 8.1): no node:* imports, and a browser
// bundle built by Vite has no module externalized for browser compatibility.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { build, createLogger } from 'vite'
import { describe, expect, it } from 'vitest'
import { ROOT, walk } from './helpers.ts'

const CORE = join(ROOT, 'lib', 'core')
const NODE = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)])

/** Import specifiers of a TS file (static, dynamic and re-exports). */
function specifiers(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  const out: string[] = []
  for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g))
    out.push(m[1] as string)
  for (const m of src.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)) out.push(m[1] as string)
  for (const m of src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1] as string)
  for (const m of src.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1] as string)
  return out
}

async function browserBundle(entry: string, root: string) {
  const warnings: string[] = []
  const logger = createLogger('warn', { allowClearScreen: false })
  logger.warn = (m) => void warnings.push(m)
  logger.warnOnce = (m) => void warnings.push(m)
  const out = await build({
    configFile: false,
    root,
    logLevel: 'warn',
    customLogger: logger,
    build: { write: false, minify: false, target: 'es2022', lib: { entry, formats: ['es'], fileName: 'core' } },
  })
  const res = Array.isArray(out) ? out[0] : out
  const code = (res as { output: { type: string; code?: string }[] }).output
    .map((o) => (o.type === 'chunk' ? (o.code ?? '') : ''))
    .join('\n')
  const external =
    warnings.some((w) => /externalized for browser compatibility/.test(w)) || /__vite[_-]browser[_-]external/.test(code)
  return { code, warnings, external }
}

describe('lib/core is isomorphic', () => {
  it('no file under lib/core or lib/schema imports node:* or a Node built-in', () => {
    const seen = new Set<string>()
    const queue = walk(CORE).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    const offenders: string[] = []
    while (queue.length > 0) {
      const f = queue.pop() as string
      if (seen.has(f)) continue
      seen.add(f)
      for (const s of specifiers(f)) {
        if (NODE.has(s) || s.startsWith('node:')) offenders.push(`${f}: ${s}`)
        if (s.startsWith('.')) queue.push(resolve(dirname(f), s))
      }
    }
    expect(offenders).toEqual([])
    expect([...seen].some((f) => f.includes(`${join('lib', 'schema')}`))).toBe(true)
  })

  it('bundles for the browser with Vite without externalized Node modules', async () => {
    const r = await browserBundle(join(CORE, 'index.ts'), ROOT)
    expect(r.external, r.warnings.join('\n')).toBe(false)
    expect(r.code).not.toMatch(/from\s*["']node:/)
    expect(r.code).toContain('searchModules')
  }, 60_000)

  it('the bundle check catches a node:fs import (negative control)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wp08-iso-'))
    try {
      writeFileSync(
        join(dir, 'bad.ts'),
        "import { readFileSync } from 'node:fs'\nexport const x = () => readFileSync('a')\n",
      )
      const r = await browserBundle(join(dir, 'bad.ts'), dir)
      expect(r.external).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
