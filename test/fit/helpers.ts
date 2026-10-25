// Helpers for test/fit: temp dirs, a fake published OM package tree, a minimal tar writer for trap tarballs.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const FIT_FIXTURES = join(ROOT, 'test', 'fit', 'fixtures')
export const DATA_FIXTURE = join(ROOT, 'test', 'fixtures', 'data')

export function tempDir(prefix = 'om-fit-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

export function writeTree(root: string, files: Record<string, string>): void {
  for (const [rel, text] of Object.entries(files)) {
    const p = join(root, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, text)
  }
}

/** `@open-mercato/shared` at two versions: B changes a signature, drops a type and a subpath. */
export function fakeShared(version: 'A' | 'B'): Record<string, string> {
  return {
    'package.json': JSON.stringify({
      name: '@open-mercato/shared',
      version: version === 'A' ? '1.0.0' : '1.1.0',
      exports: {
        './lib/css': './styles.css',
        './*': { types: './src/*.ts', default: './dist/*.js' },
      },
    }),
    'styles.css': 'a{}',
    'src/lib/di/container.ts':
      version === 'A'
        ? 'export function createRequestContainer(a: string): number { return 1 }\nexport type AppContainer = { x: number }\n'
        : 'export function createRequestContainer(a: string, b?: number): number { return 2 }\n',
    'src/lib/all.ts': "export * from './not-published'\nexport const known = 1\n",
    'src/lib/complete.ts': "export * from './di/container'\n",
    ...(version === 'A' ? { 'src/lib/gone.ts': 'export const x = 1\n' } : {}),
    // the runtime files of the `default` condition, as a published package has them (static fit checks both)
    'dist/lib/di/container.js': 'export function createRequestContainer() { return 1 }\n',
    'dist/lib/all.js': 'export const known = 1\n',
    'dist/lib/complete.js': "export * from './di/container.js'\n",
    ...(version === 'A' ? { 'dist/lib/gone.js': 'export const x = 1\n' } : {}),
  }
}

// ---- tar

function octal(n: number, width: number): string {
  return n.toString(8).padStart(width - 1, '0') + '\0'
}

export interface TarEntry {
  name: string
  type?: '0' | '2' | '5' // file, symlink, directory
  body?: string
  linkname?: string
}

/** A gzip tarball built byte by byte (allows `..`, absolute paths and links, which real packers refuse). */
export function makeTgz(entries: readonly TarEntry[]): Uint8Array {
  const blocks: Buffer[] = []
  for (const e of entries) {
    const body = Buffer.from(e.body ?? '')
    const h = Buffer.alloc(512, 0)
    h.write(e.name, 0, 100, 'utf8')
    h.write(octal(e.type === '5' ? 0o755 : 0o644, 8), 100, 'ascii')
    h.write(octal(0, 8), 108, 'ascii')
    h.write(octal(0, 8), 116, 'ascii')
    h.write(octal(e.type === '0' || e.type === undefined ? body.length : 0, 12), 124, 'ascii')
    h.write(octal(0, 12), 136, 'ascii')
    h.write('        ', 148, 'ascii')
    h.write(e.type ?? '0', 156, 'ascii')
    if (e.linkname) h.write(e.linkname, 157, 100, 'utf8')
    h.write('ustar\0', 257, 'ascii')
    h.write('00', 263, 'ascii')
    let sum = 0
    for (const b of h) sum += b
    h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii')
    blocks.push(h)
    if ((e.type ?? '0') === '0' && body.length > 0) {
      const padded = Buffer.alloc(Math.ceil(body.length / 512) * 512, 0)
      body.copy(padded)
      blocks.push(padded)
    }
  }
  blocks.push(Buffer.alloc(1024, 0))
  return new Uint8Array(gzipSync(Buffer.concat(blocks)))
}
