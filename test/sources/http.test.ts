import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createHttp, fixtureFile, OfflineMissError } from '../../lib/sources/http.ts'
import { tempDir } from './helpers.ts'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((c) => c()))

function fakeFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = []
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init: init ?? {} })
    return handler(url, init ?? {})
  }) as typeof fetch
  return { f, calls }
}

describe('http record and replay (--offline)', () => {
  it('names fixtures stably by method, URL and body', () => {
    const a = fixtureFile('GET', 'https://registry.npmjs.org/@open-mercato%2Fgateway-stripe')
    expect(a).toBe(fixtureFile('GET', 'https://registry.npmjs.org/@open-mercato%2Fgateway-stripe'))
    expect(a.startsWith('registry.npmjs.org/@open-mercato_gateway-stripe-')).toBe(true)
    expect(fixtureFile('POST', 'https://api.github.com/graphql', { b: 1, a: 2 })).toBe(
      fixtureFile('POST', 'https://api.github.com/graphql', { a: 2, b: 1 }),
    )
    expect(fixtureFile('POST', 'https://api.github.com/graphql', { a: 1 })).not.toBe(
      fixtureFile('POST', 'https://api.github.com/graphql', { a: 2 }),
    )
  })

  it('records a slimmed body and replays it offline; a missing recording is an error', async () => {
    const t = tempDir('http')
    cleanups.push(t.cleanup)
    const { f } = fakeFetch(
      () =>
        new Response(JSON.stringify({ keep: 1, drop: 2 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const rec = createHttp({
      record: true,
      fixturesDir: t.dir,
      fetchImpl: f,
      gapMs: 0,
      slimmers: [(_u, j) => ({ keep: (j as { keep: number }).keep })],
    })
    expect((await rec.request('https://example.org/a')).json).toEqual({ keep: 1, drop: 2 })
    const off = createHttp({ offline: true, fixturesDir: t.dir })
    expect((await off.request('https://example.org/a')).json).toEqual({ keep: 1 })
    await expect(off.request('https://example.org/b')).rejects.toBeInstanceOf(OfflineMissError)
    await expect(off.bytes('https://example.org/x.tgz')).rejects.toBeInstanceOf(OfflineMissError)
  })

  it('retries rate limits and never records them', async () => {
    const t = tempDir('http429')
    cleanups.push(t.cleanup)
    let n = 0
    const { f } = fakeFetch(() =>
      ++n < 2
        ? new Response('slow down', { status: 429, headers: { 'retry-after': '0' } })
        : new Response('{"ok":true}', { status: 200 }),
    )
    const rec = createHttp({ record: true, fixturesDir: t.dir, fetchImpl: f, gapMs: 0, rateLimitMs: 0 })
    expect((await rec.request('https://example.org/r')).json).toEqual({ ok: true })
    expect(n).toBe(2)
    const file = join(t.dir, fixtureFile('GET', 'https://example.org/r'))
    expect(JSON.parse(readFileSync(file, 'utf8')).response.status).toBe(200)
    const { f: always429 } = fakeFetch(() => new Response('no', { status: 429, headers: { 'retry-after': '0' } }))
    const rec2 = createHttp({
      record: true,
      fixturesDir: t.dir,
      fetchImpl: always429,
      gapMs: 0,
      retries: 1,
      rateLimitMs: 0,
    })
    expect((await rec2.request('https://example.org/never')).status).toBe(429)
    expect(existsSync(join(t.dir, fixtureFile('GET', 'https://example.org/never')))).toBe(false)
  })

  it('backs off on a 429 with retry-after 0 (npm search) instead of retrying at once', async () => {
    const times: number[] = []
    const { f } = fakeFetch(() => {
      times.push(performance.now())
      return times.length < 3
        ? new Response('slow down', { status: 429, headers: { 'retry-after': '0' } })
        : new Response('{"ok":true}', { status: 200 })
    })
    const http = createHttp({ fetchImpl: f, gapMs: 0, rateLimitMs: 40 })
    expect((await http.request('https://registry.npmjs.org/-/v1/search?text=x')).json).toEqual({ ok: true })
    expect(times).toHaveLength(3)
    // 40 ms after the first 429, 80 ms after the second
    expect((times[1] as number) - (times[0] as number)).toBeGreaterThanOrEqual(35)
    expect((times[2] as number) - (times[1] as number)).toBeGreaterThanOrEqual(75)
  })

  it('sends the GitHub token only to api.github.com', async () => {
    const { f, calls } = fakeFetch(() => new Response('{}', { status: 200 }))
    const http = createHttp({ fetchImpl: f, githubToken: 'secret', gapMs: 0 })
    await http.request('https://api.github.com/repos/a/b')
    await http.request('https://registry.npmjs.org/a')
    const auth = calls.map((c) => (c.init.headers as Record<string, string>).authorization)
    expect(auth).toEqual(['Bearer secret', undefined])
  })
})
