// Shared helpers of the importer tests: the fixture export, a fake CDN, and a reader of the written tree.
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runImport, type ImportOptions } from '../../lib/import-webflow/run.ts'

export const ROOT = fileURLToPath(new URL('../..', import.meta.url))
export const FIXTURE = join(ROOT, 'test/fixtures/webflow')
export const DOCS_SITEMAP = join(FIXTURE, 'docs-sitemap.xml')

/** The smallest bytes each extension's signature check accepts. */
const BYTES: Record<string, { type: string; bytes: Uint8Array }> = {
  png: { type: 'image/png', bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]) },
  jpg: { type: 'image/jpeg', bytes: new Uint8Array([255, 216, 255, 224, 0, 16]) },
  jpeg: { type: 'image/jpeg', bytes: new Uint8Array([255, 216, 255, 224, 0, 16]) },
  svg: { type: 'image/svg+xml', bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>') },
  webp: { type: 'image/webp', bytes: new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ') },
  gif: { type: 'image/gif', bytes: new TextEncoder().encode('GIF89a') },
}

/** A fake fetch for the CDN: a tiny file of the right type per extension; `fail` URLs answer 403. */
export function fakeCdn(fail: (url: string) => boolean = () => false): typeof fetch & { calls: string[] } {
  const calls: string[] = []
  const f = (async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    if (fail(url)) return new Response('Forbidden', { status: 403, headers: { 'content-type': 'text/html' } })
    const ext = /\.([a-z0-9]+)$/i.exec(new URL(url).pathname)?.[1]?.toLowerCase() ?? ''
    const b = BYTES[ext]
    if (!b) return new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })
    return new Response(b.bytes as unknown as BodyInit, { status: 200, headers: { 'content-type': b.type } })
  }) as typeof fetch & { calls: string[] }
  f.calls = calls
  return f
}

export function tempDir(name: string): string {
  return mkdtempSync(join(tmpdir(), `om-import-${name}-`))
}

/** Runs the importer on the fixture with the fake CDN and the fixture docs sitemap. */
export function importFixture(over: Partial<ImportOptions> & { target: string; mediaCache: string }) {
  return runImport({
    exportDir: FIXTURE,
    repoRoot: ROOT,
    offline: false,
    check: false,
    force: new Set(),
    docsSitemap: DOCS_SITEMAP,
    fetch: fakeCdn(),
    ...over,
  })
}

/** Every file under `dir`, `/`-separated paths, with its bytes. */
export function tree(dir: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else out.set(relative(dir, p).split(sep).join('/'), readFileSync(p))
    }
  }
  walk(dir)
  return out
}
