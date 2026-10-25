// Test helpers for Rentgen: real tarballs pinned by integrity (downloaded once, cached in the OS temp
// dir), synthetic tarballs written byte by byte (so traps like `..` and links can be built), and
// golden normalization.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import type { Facts } from '../../lib/schema/data/facts.ts'
import { checkIntegrity, fetchBytes } from '../../lib/rentgen/unpack.ts'

export const ROOT = new URL('../../', import.meta.url).pathname.replace(/\/$/, '')
const CACHE = join(tmpdir(), 'om-rentgen-test-cache')

/** Real npm tarballs used by the golden tests (immutable versions, pinned integrity). */
export const REAL = {
  visits: {
    locator: 'npm:@piotrkarwatka/visits',
    url: 'https://registry.npmjs.org/@piotrkarwatka/visits/-/visits-0.1.0.tgz',
    integrity: 'sha512-TqJBZSugVSmqYNBvDJmEgk1WKgBIjqbvNR+MVhPj61aP6NSmRZs0RREekWzc02o8r29kMRzt2xG3YLux6qrsqg==',
  },
  ksef: {
    locator: 'npm:@fastwhitecat/integration-ksef-direct',
    url: 'https://registry.npmjs.org/@fastwhitecat/integration-ksef-direct/-/integration-ksef-direct-0.1.8.tgz',
    integrity: 'sha512-S/WTfqYPGCe4qSyCzAa6Fg+eMGdLd92HB09unoaqdgBgYBcp9YxQL63GDcq1kA7/wm8CokntXpg9l7jkt106RA==',
  },
  ksef017: {
    locator: 'npm:@fastwhitecat/integration-ksef-direct',
    url: 'https://registry.npmjs.org/@fastwhitecat/integration-ksef-direct/-/integration-ksef-direct-0.1.7.tgz',
    integrity: 'sha512-ANbZjaazQGgJZnPhCeFuoCSbKquydruTuE24w/hQp7L8gn2ykPM7eHhS9cfxOFuQLrs6yZJr6dztVBxgRDDt9w==',
  },
  stripe: {
    locator: 'npm:@open-mercato/gateway-stripe',
    url: 'https://registry.npmjs.org/@open-mercato/gateway-stripe/-/gateway-stripe-0.9.0.tgz',
    integrity: 'sha512-U/tlIjnj/V5AuSB+fEEIh4Ta9Uftzrzr5iUb6nSWLcd7W8W7mzPHd6Ngg3ZYPH9g98cSUayH1e6nOga2E3Iqag==',
  },
  exa: {
    locator: 'npm:@open-mercato/web-research-exa',
    url: 'https://registry.npmjs.org/@open-mercato/web-research-exa/-/web-research-exa-0.9.0.tgz',
    integrity: 'sha512-CfgMXxR/T+OZ20jffdUb1F0CpNJAjeGfouq2DYN0JG87GURN+Pewr+UUjDt4jbXDw2cAQ3Z96yGi6bJlcxEyyw==',
  },
} as const

export type RealKey = keyof typeof REAL

/** Bytes of a real tarball; verified against the pinned integrity when one is set. */
export async function realTarball(key: RealKey): Promise<Uint8Array> {
  const r = REAL[key]
  mkdirSync(CACHE, { recursive: true })
  const file = join(CACHE, r.url.split('/').pop() as string)
  let buf: Uint8Array
  if (existsSync(file)) buf = new Uint8Array(readFileSync(file))
  else {
    buf = await fetchBytes(r.url)
    writeFileSync(file, buf)
  }
  if (r.integrity && !checkIntegrity(buf, r.integrity)) throw new Error(`${r.url}: integrity mismatch`)
  return buf
}

// ---------------------------------------------------------------- synthetic tarballs

export type TarEntry =
  | { path: string; content: string }
  | { path: string; type: 'dir' }
  | { path: string; type: 'symlink' | 'hardlink'; target: string }
  | { path: string; type: 'fifo' }

function header(name: string, size: number, typeflag: string, linkname = ''): Buffer {
  const h = Buffer.alloc(512, 0)
  const put = (s: string, off: number, len: number): void => {
    h.write(s.slice(0, len), off, len, 'utf8')
  }
  const oct = (n: number, len: number): string => `${n.toString(8).padStart(len - 1, '0')}\0`
  let prefix = ''
  let base = name
  if (Buffer.byteLength(name) > 100) {
    const cut = name.lastIndexOf('/', 155)
    prefix = name.slice(0, cut)
    base = name.slice(cut + 1)
  }
  put(base, 0, 100)
  put(oct(0o644, 8), 100, 8)
  put(oct(0, 8), 108, 8)
  put(oct(0, 8), 116, 8)
  put(oct(size, 12), 124, 12)
  put(oct(0, 12), 136, 12)
  h.fill(0x20, 148, 156)
  put(typeflag, 156, 1)
  put(linkname, 157, 100)
  put('ustar\0', 257, 6)
  put('00', 263, 2)
  put(prefix, 345, 155)
  let sum = 0
  for (const b of h) sum += b
  put(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8)
  return h
}

/** A gzipped ustar archive with exactly the given entries (no normalization of names). */
export function makeTarball(entries: readonly TarEntry[]): Uint8Array {
  const parts: Buffer[] = []
  for (const e of entries) {
    if ('content' in e) {
      const data = Buffer.from(e.content, 'utf8')
      parts.push(header(e.path, data.length, '0'))
      parts.push(data, Buffer.alloc((512 - (data.length % 512)) % 512, 0))
    } else if (e.type === 'dir') parts.push(header(e.path, 0, '5'))
    else if (e.type === 'symlink') parts.push(header(e.path, 0, '2', e.target))
    else if (e.type === 'hardlink') parts.push(header(e.path, 0, '1', e.target))
    else parts.push(header(e.path, 0, '6'))
  }
  parts.push(Buffer.alloc(1024, 0))
  return new Uint8Array(gzipSync(Buffer.concat(parts)))
}

/** Files of a minimal module package under `package/`. */
export function modulePackage(opts: {
  name: string
  version?: string
  id: string
  files?: Record<string, string>
  pkg?: Record<string, unknown>
  dist?: boolean
}): TarEntry[] {
  const pj = { name: opts.name, version: opts.version ?? '1.0.0', license: 'MIT', ...opts.pkg }
  const out: TarEntry[] = [{ path: 'package/package.json', content: JSON.stringify(pj, null, 2) }]
  const files: Record<string, string> = {
    [`src/modules/${opts.id}/index.ts`]: `export const metadata = { title: 'Test module', description: 'A module for tests.' }\n`,
    ...opts.files,
  }
  for (const [p, c] of Object.entries(files)) out.push({ path: `package/${p}`, content: c })
  if (opts.dist !== false) out.push({ path: `package/dist/modules/${opts.id}/index.js`, content: 'export {}\n' })
  return out
}

/** Facts with run-dependent fields zeroed, for golden files. */
export function normalize(f: Facts): Facts {
  return { ...f, extractor: { ...f.extractor, durationMs: 0 } }
}
