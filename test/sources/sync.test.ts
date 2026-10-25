import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Claims, Stats, SyncRecord } from '../../lib/schema/index.ts'
import { OfficialCoverageFile } from '../../lib/sources/coverage.ts'
import { firstAddedAt } from '../../lib/sources/entries.ts'
import { createHttp, type Http, HttpError } from '../../lib/sources/http.ts'
import { checkLinks, runSync } from '../../lib/sources/sync.ts'
import { EXPECTED_TYPES, HTTP_FIXTURES, MODULES, NOW, offlineHttp, POLICY, ROOT, tempDir } from './helpers.ts'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((c) => c()))

async function sync(http: Http = offlineHttp(), dataDir?: string, now = NOW, only: Set<string> | null = null) {
  const t = tempDir('sync')
  cleanups.push(t.cleanup)
  const data = dataDir ?? join(t.dir, 'data')
  const res = await runSync({
    http,
    root: ROOT,
    modulesDir: MODULES,
    policyDir: POLICY,
    dataDir: data,
    outDir: join(t.dir, 'out'),
    now,
    only,
    modulesRepo: 'wojciechszyjka/modules',
    claims: false,
  })
  return { res, data, out: join(t.dir, 'out') }
}

const rec = (data: string, path: string) =>
  SyncRecord.parse(JSON.parse(readFileSync(join(data, 'sync', `${path}.json`), 'utf8')))

describe('yarn om sync --offline on recorded responses (16 real entries)', () => {
  it('writes valid records with the expected types (11.1, D-OPEN-6 = no)', async () => {
    const { res, data } = await sync()
    expect(res.records).toHaveLength(16)
    expect(Object.fromEntries(res.records.map((r) => [r.locator, r.type]))).toEqual(EXPECTED_TYPES)
    for (const r of res.records) {
      expect(SyncRecord.parse(r)).toEqual(r)
      expect(r.checkedAt).toBe('2026-10-23T04:17:00Z')
      expect(r.firstSeenAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    }
    Stats.parse(JSON.parse(readFileSync(join(data, 'stats.json'), 'utf8')))
    Claims.parse(JSON.parse(readFileSync(join(data, 'claims.json'), 'utf8')))
  })

  it('reads the real edge cases', async () => {
    const { data, out } = await sync()
    const stripe = rec(data, '@open-mercato/gateway-stripe')
    expect(stripe.npm).toMatchObject({ latestStable: '0.9.0', previousStable: '0.8.0', preview: null })
    expect(stripe.errors[0]).toContain('highest stable 1.0.1 is deprecated')
    expect(stripe.provenance).toMatchObject({ status: 'verified', sourceRepo: 'open-mercato/open-mercato' })
    expect(stripe.github?.repo).toBe('open-mercato/open-mercato')
    const tpay = rec(data, '@open-mercato/gateway-tpay')
    expect(tpay.npm).toMatchObject({ latestStable: null, preview: '0.8.1-develop.7442.1.4c1dbf1f0e' })
    const ksef = rec(data, '@fastwhitecat/integration-ksef-direct')
    expect(ksef.npm).toMatchObject({
      latestStable: '0.1.8',
      previousStable: '0.1.7',
      license: 'MIT',
      maintainers: ['bernard-fwc', 'lbajsarowicz'],
    })
    expect(ksef.provenance).toMatchObject({ status: 'verified', sourceRepo: 'FastWhiteCat/openmercato-module-ksef' })
    const durable = rec(data, '@fullstackhouse/open-mercato-durable-work')
    expect(durable.github).toBeNull()
    expect(durable.errors).toEqual(['github: fullstackhouse/open-mercato-durable returns 404 (2026-10-23)'])
    expect(rec(data, '@piotrkarwatka/visits').typeReason).toBe(
      'Repository pkarw/visits-example returns 404; npm scope @piotrkarwatka is listed in policy/community.yml.',
    )
    const treg = rec(data, 'github/chmarusso/open-mercato-enrichment-treg')
    expect(treg.npm).toBeNull()
    expect(treg.github).toMatchObject({ repo: 'Chmarusso/open-mercato-enrichment-treg', tags: [], ownerType: 'User' })
    expect(rec(data, 'create-mercato-module').typeReason).toContain('D38')
    const stats = Stats.parse(JSON.parse(readFileSync(join(data, 'stats.json'), 'utf8')))
    expect(stats.entries['npm:@open-mercato/gateway-stripe']).toEqual({ downloads30d: 46377, stars: null })
    expect(stats.entries['npm:@fastwhitecat/integration-ksef-direct']?.stars).toBe(1)
    const report = JSON.parse(readFileSync(join(out, 'sync-report.json'), 'utf8')) as { errors: string[] }
    expect(report.errors).toEqual([])
  })

  it('computes officialCoverage from the npm org listing and the scope search', async () => {
    const { res, data } = await sync()
    const cov = OfficialCoverageFile.parse(JSON.parse(readFileSync(join(data, 'official-coverage.json'), 'utf8')))
    expect(res.coverage).toEqual(cov)
    // the subset lists gateway-stripe, gateway-tpay, web-research-exa and readiness-scanner (renamedFrom)
    expect(cov.listed).toBe(4)
    expect(cov.packages).toHaveLength(38)
    expect(cov.missing).toContain('@open-mercato/events')
    expect(cov.packages).not.toContain('@open-mercato/core')
    expect(cov.packages).not.toContain('@open-mercato/shared')
    expect(cov.packages.some((p) => p.startsWith('@open-mercato/cezar'))).toBe(false)
  })

  it('keeps firstSeenAt and the previous value of a failing source', async () => {
    const first = await sync()
    const before = rec(first.data, '@fastwhitecat/integration-ksef-direct')
    const failing = createHttp({ offline: true, fixturesDir: HTTP_FIXTURES })
    const flaky: Http = {
      mode: failing.mode,
      fixturesDir: failing.fixturesDir,
      bytes: (u) => failing.bytes(u),
      request: (url, o) =>
        url.includes('integration-ksef-direct') && url.startsWith('https://registry.npmjs.org/')
          ? Promise.reject(new HttpError('HTTP 503', url, 503))
          : failing.request(url, o),
    }
    const later = new Date('2026-10-30T04:17:00Z')
    const second = await sync(flaky, first.data, later)
    const after = second.res.records.find((r) => r.locator === 'npm:@fastwhitecat/integration-ksef-direct')
    expect(after?.firstSeenAt).toBe(before.firstSeenAt)
    expect(after?.checkedAt).toBe('2026-10-30T04:17:00Z')
    expect(after?.npm).toEqual(before.npm)
    expect(after?.errors.some((e) => e.startsWith('npm: HTTP 503'))).toBe(true)
  })

  it('a sync of named entries (watch.yml needsSync) leaves every other record, claim and stat as it was', async () => {
    const first = await sync()
    const file = (p: string) => readFileSync(join(first.data, p), 'utf8')
    const others = (readdirSync(join(first.data, 'sync'), { recursive: true, encoding: 'utf8' }) as string[])
      .filter((p) => p.endsWith('.json') && p !== join('@dainamite', 'cpq.json'))
      .sort()
    expect(others).toHaveLength(15)
    const before = Object.fromEntries(others.map((p) => [p, file(join('sync', p))]))
    const claims = file('claims.json')
    const stats = Stats.parse(JSON.parse(file('stats.json')))
    const later = new Date('2026-10-23T10:17:00Z')
    const second = await sync(offlineHttp(), first.data, later, new Set(['npm:@dainamite/cpq']))
    expect(second.res.records.map((r) => r.locator)).toEqual(['npm:@dainamite/cpq'])
    expect(rec(first.data, '@dainamite/cpq').checkedAt).toBe('2026-10-23T10:17:00Z')
    for (const p of others) expect(file(join('sync', p)), p).toBe(before[p])
    expect(file('claims.json')).toBe(claims)
    expect(Stats.parse(JSON.parse(file('stats.json'))).entries).toEqual(stats.entries)
  })
})

describe('firstSeenAt seed from git history', () => {
  it('is the author date of the commit that added the descriptor, in UTC', () => {
    const t = tempDir('git')
    cleanups.push(t.cleanup)
    const g = (...a: string[]) =>
      execFileSync('git', ['-C', t.dir, ...a], {
        env: {
          ...process.env,
          GIT_AUTHOR_DATE: '2026-10-24T10:00:00+02:00',
          GIT_COMMITTER_DATE: '2026-10-24T10:00:00+02:00',
        },
      })
    g('init', '--quiet')
    mkdirSync(join(t.dir, 'modules', '@a'), { recursive: true })
    writeFileSync(join(t.dir, 'modules', '@a', 'b.yml'), 'npm: "@a/b"\n')
    g('add', '-A')
    g('-c', 'user.name=x', '-c', 'user.email=x@example.org', 'commit', '--quiet', '-m', 'add')
    expect(firstAddedAt(t.dir, 'modules/@a/b.yml')).toBe('2026-10-24T08:00:00Z')
    expect(firstAddedAt(t.dir, 'modules/@a/missing.yml')).toBeNull()
  })
})

describe('descriptor links (spec 4.3)', () => {
  it('reports links that answer with an error; falls back to GET when HEAD is refused', async () => {
    const seen: string[] = []
    const f = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      seen.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.endsWith('/gone')) return new Response('', { status: 404 })
      if (url.endsWith('/nohead') && init?.method === 'HEAD') return new Response('', { status: 405 })
      return new Response('ok', { status: 200 })
    }) as typeof fetch
    const http = createHttp({ fetchImpl: f, gapMs: 0, retries: 0 })
    const entry = {
      locator: 'npm:x',
      path: 'x',
      file: 'modules/x.yml',
      declaredRepo: null,
      d: {
        links: {
          docs: 'https://example.org/gone',
          demo: 'https://example.org/nohead',
          support: 'mailto:a@example.org',
        },
      },
    } as unknown as Parameters<typeof checkLinks>[1]
    expect(await checkLinks(http, entry)).toEqual(['links.docs: https://example.org/gone answers HTTP 404'])
    expect(seen).toEqual([
      'HEAD https://example.org/gone',
      'HEAD https://example.org/nohead',
      'GET https://example.org/nohead',
    ])
  })
})
