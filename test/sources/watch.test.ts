import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Lines } from '../../lib/schema/index.ts'
import { pickLines, preapprovedFrom } from '../../lib/sources/lines.ts'
import type { Packument } from '../../lib/sources/npm.ts'
import { KEEPALIVE_WORKFLOWS, keepaliveDue, keepaliveWorkflows, QueueFile, runWatch } from '../../lib/sources/watch.ts'
import type { Http, RequestOptions } from '../../lib/sources/http.ts'
import { MODULES, NOW, offlineHttp, ROOT, tempDir } from './helpers.ts'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((c) => c()))

async function watch(data?: string) {
  const t = tempDir('watch')
  cleanups.push(t.cleanup)
  const dataDir = data ?? join(t.dir, 'data')
  const r = await runWatch({
    http: offlineHttp(),
    root: ROOT,
    modulesDir: MODULES,
    dataDir,
    outDir: join(t.dir, 'out'),
    now: NOW,
  })
  return { ...r, dataDir, out: join(t.dir, 'out') }
}

describe('yarn om watch --offline', () => {
  it('lines.json: 0.9 -> 0.9.0, 0.8 -> 0.8.0, next -> 0.10.1-develop.*', async () => {
    const { dataDir } = await watch()
    const lines = Lines.parse(JSON.parse(readFileSync(join(dataDir, 'lines.json'), 'utf8')))
    expect(lines.coreLatest).toBe('0.9.0')
    expect(lines.lines.map((l) => [l.key, l.version, l.source, l.cadence])).toEqual([
      ['0.9', '0.9.0', 'latest', 'nightly'],
      ['0.8', '0.8.0', 'previous', 'weekly'],
      ['next', expect.stringMatching(/^0\.10\.1-develop\./), 'develop', 'nightly'],
    ])
    for (const l of lines.lines) {
      expect(l.preapproved).toEqual(['@open-mercato/*'])
      expect(l.createApp).toBe(`create-mercato-app@${l.version}`)
    }
  })

  it('queues versions without facts and skips the ones already scanned', async () => {
    const first = await watch()
    const q = QueueFile.parse(JSON.parse(readFileSync(join(first.out, 'queue.json'), 'utf8')))
    expect(q.lines).toEqual({ changed: ['0.9', '0.8', 'next'], coreLatest: '0.9.0', coreChanged: true })
    const stripe = q.items.filter((i) => i.locator === 'npm:@open-mercato/gateway-stripe').map((i) => i.version)
    expect(stripe).toEqual(['0.9.0', '0.8.0'])
    expect(q.items.find((i) => i.locator === 'npm:@open-mercato/gateway-tpay')?.version).toBe(
      '0.8.1-develop.7442.1.4c1dbf1f0e',
    )
    // treg has no tags: nothing to scan (spec 6.5 UNPINNED_GIT)
    expect(q.items.some((i) => i.locator.startsWith('github:'))).toBe(false)
    for (const i of q.items) expect(i.integrity).toMatch(/^sha512-/)
    mkdirSync(join(first.dataDir, 'facts', '@open-mercato', 'gateway-stripe'), { recursive: true })
    writeFileSync(join(first.dataDir, 'facts', '@open-mercato', 'gateway-stripe', '0.9.0.json'), '{}')
    const second = await watch(first.dataDir)
    expect(
      second.queue.items.filter((i) => i.locator === 'npm:@open-mercato/gateway-stripe').map((i) => i.version),
    ).toEqual(['0.8.0'])
    expect(second.queue.lines.changed).toEqual([])
    expect(second.queue.lines.coreChanged).toBe(false)
  })

  it('picks the previous minor or a latest-X.Y tag', () => {
    const v = (...vs: string[]) => Object.fromEntries(vs.map((x) => [x, {}]))
    const p: Packument = {
      name: 'create-mercato-app',
      'dist-tags': { latest: '0.9.0', develop: '0.10.1-develop.1' },
      versions: v('0.7.0', '0.8.0', '0.8.1', '0.9.0', '0.10.1-develop.1'),
    }
    expect(pickLines(p)).toEqual({ latest: '0.9.0', previous: '0.8.1', develop: '0.10.1-develop.1' })
    expect(pickLines({ ...p, 'dist-tags': { ...p['dist-tags'], 'latest-0.8': '0.8.0' } }).previous).toBe('0.8.0')
  })

  it('reads npmPreapprovedPackages from the template and decides keepalive', () => {
    expect(
      preapprovedFrom('npmMinimalAgeGate: 5d\nnpmPreapprovedPackages:\n  - "@open-mercato/*"\n{{REGISTRY_CONFIG}}\n'),
    ).toEqual(['@open-mercato/*'])
    expect(preapprovedFrom('npmPreapprovedPackages: "@a/*"\n')).toEqual(['@a/*'])
    expect(keepaliveDue(null, NOW)).toBe(true)
    expect(keepaliveDue('2026-10-01T00:00:00Z', NOW)).toBe(false)
    expect(keepaliveDue('2026-09-20T00:00:00Z', NOW)).toBe(true)
  })
})

describe('keepalive', () => {
  /** A GitHub API that answers each workflow's state and records the enable calls. */
  function api(states: Record<string, string | number>): { http: Http; enabled: string[] } {
    const enabled: string[] = []
    const http: Http = {
      mode: 'live',
      fixturesDir: null,
      bytes: () => Promise.reject(new Error('no bytes')),
      async request(url: string, o: RequestOptions = {}) {
        const wf = /workflows\/([^/]+?)(\/enable)?$/.exec(url)
        const name = wf?.[1] ?? ''
        if (o.method === 'PUT') {
          enabled.push(name)
          return { status: 204, json: null, text: '' }
        }
        const st = states[name]
        if (typeof st === 'number') return { status: st, json: null, text: '' }
        return { status: 200, json: { state: st }, text: '' }
      },
    }
    return { http, enabled }
  }

  it('enables active and inactivity-disabled workflows, never one disabled by hand (finding of 25 Oct)', async () => {
    const { http, enabled } = api({
      'nightly.yml': 'disabled_manually',
      'watch.yml': 'active',
      'sync.yml': 'disabled_inactivity',
      'collect.yml': 'active',
    })
    const log: string[] = []
    const r = await keepaliveWorkflows(http, 'open-mercato/modules', (l) => log.push(l))
    expect(enabled).toEqual(['watch.yml', 'sync.yml', 'collect.yml'])
    expect(r).toEqual({ ok: true, errors: [], leftOff: ['nightly.yml'] })
    expect(log).toEqual(['keepalive: nightly.yml was disabled by hand; left off'])
  })

  it('a workflow whose state cannot be read is never enabled, and the keepalive is not marked done', async () => {
    const { http, enabled } = api({
      'nightly.yml': 403,
      'watch.yml': 'active',
      'sync.yml': 'active',
      'collect.yml': 'active',
    })
    const r = await keepaliveWorkflows(http, 'open-mercato/modules')
    expect(enabled).not.toContain('nightly.yml')
    expect(r.ok).toBe(false)
    expect(r.errors).toEqual(['keepalive nightly.yml: state not read (HTTP 403)'])
    expect(KEEPALIVE_WORKFLOWS).toContain('nightly.yml')
  })
})
