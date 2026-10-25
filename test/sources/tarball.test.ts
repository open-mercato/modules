import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import {
  extractSafe,
  inspectTarball,
  readTarballFiles,
  tarballTextFiles,
  TarballError,
  verifyIntegrity,
} from '../../lib/sources/tarball.ts'
import { fetchPackument } from '../../lib/sources/npm.ts'
import { offlineHttp, tempDir } from './helpers.ts'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((c) => c()))

/** Minimal ustar writer, so a test can build entries `tar` itself would refuse to create. */
function header(path: string, type: string, size: number, link = ''): Buffer {
  const h = Buffer.alloc(512)
  h.write(path, 0, 100, 'utf8')
  h.write('0000644\0', 100)
  h.write('0000000\0', 108)
  h.write('0000000\0', 116)
  h.write(`${size.toString(8).padStart(11, '0')}\0`, 124)
  h.write('00000000000\0', 136)
  h.write('        ', 148)
  h.write(type, 156)
  h.write(link, 157, 100, 'utf8')
  h.write('ustar\0', 257)
  h.write('00', 263)
  let sum = 0
  for (const b of h) sum += b
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
  return h
}
function tgz(entries: { path: string; type?: string; body?: string; link?: string }[]): Uint8Array {
  const parts: Buffer[] = []
  for (const e of entries) {
    const body = Buffer.from(e.body ?? '')
    parts.push(header(e.path, e.type ?? '0', e.type && e.type !== '0' ? 0 : body.length, e.link))
    if (body.length && (!e.type || e.type === '0')) parts.push(body, Buffer.alloc((512 - (body.length % 512)) % 512))
  }
  parts.push(Buffer.alloc(1024))
  return new Uint8Array(gzipSync(Buffer.concat(parts)))
}

describe('tarball trap (spec 5.5)', () => {
  const trap = tgz([
    { path: 'package/package.json', body: '{"name":"x"}' },
    { path: 'package/src/modules/a/index.ts', body: 'export {}' },
    { path: 'package/evil-link', type: '2', link: '/etc/passwd' },
    { path: 'package/hard-link', type: '1', link: 'package/package.json' },
    { path: 'package/../../escape.txt', body: 'nope' },
    { path: '/abs.txt', body: 'nope' },
  ])

  it('lists unsafe entries with reasons', async () => {
    const ins = await inspectTarball(trap)
    expect(ins.rejected.map((r) => r.reason).sort()).toEqual([
      'absolute path',
      'parent directory segment',
      'type Link',
      'type SymbolicLink',
    ])
    expect(ins.files).toBe(2)
  })

  it('extracts only regular files and directories inside the target', async () => {
    const t = tempDir('tar')
    cleanups.push(t.cleanup)
    const dest = join(t.dir, 'out')
    await extractSafe(trap, dest)
    expect(readFileSync(join(dest, 'package/package.json'), 'utf8')).toBe('{"name":"x"}')
    expect(existsSync(join(dest, 'package/evil-link'))).toBe(false)
    expect(existsSync(join(dest, 'package/hard-link'))).toBe(false)
    expect(existsSync(join(t.dir, 'escape.txt'))).toBe(false)
    expect(existsSync(join(dest, 'abs.txt'))).toBe(false)
  })

  it('refuses tarballs over the file or size limits', async () => {
    const many = tgz(Array.from({ length: 6 }, (_, i) => ({ path: `package/f${i}`, body: 'x' })))
    await expect(
      extractSafe(many, '/nonexistent-never-written', { maxFiles: 5, maxBytes: 1e9 }),
    ).rejects.toBeInstanceOf(TarballError)
    const big = tgz([{ path: 'package/big', body: 'x'.repeat(2048) }])
    await expect(extractSafe(big, '/nonexistent-never-written', { maxFiles: 10, maxBytes: 1024 })).rejects.toThrow(
      /limit 1024/,
    )
  })

  it('reads small files in memory and checks SRI', async () => {
    const files = await readTarballFiles(trap, (p) => p === 'package/package.json' || p === 'package/evil-link')
    expect([...files.keys()]).toEqual(['package/package.json'])
    const sri = `sha512-${createHash('sha512').update(trap).digest('base64')}`
    expect(verifyIntegrity(trap, sri)).toBe(true)
    expect(verifyIntegrity(trap, 'sha512-AAAA')).toBe(false)
  })

  it('replays files of a verified tarball offline by integrity (create-mercato-app 0.9.0)', async () => {
    const http = offlineHttp()
    const p = await fetchPackument(http, 'create-mercato-app')
    const dist = p?.versions?.['0.9.0']?.dist
    expect(dist?.integrity).toMatch(/^sha512-/)
    const files = await tarballTextFiles(http, { url: dist?.tarball as string, integrity: dist?.integrity as string }, [
      'package/template/.yarnrc.yml.template',
    ])
    expect(files.get('package/template/.yarnrc.yml.template')).toContain('"@open-mercato/*"')
    await expect(
      tarballTextFiles(http, { url: dist?.tarball as string, integrity: 'sha512-AAAA' }, ['x']),
    ).rejects.toThrow(/no recorded tarball/)
  })
})
