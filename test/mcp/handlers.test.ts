// Pure parts of the agent layer: presets rebuilt from published data, the 100 KB cap, the catalog source.
import { describe, expect, it } from 'vitest'
import type { GetChangesOutput, GetModuleOutput, SearchModulesOutput } from '../../lib/schema/tools.ts'
import { capResponse, presetsFrom, RESPONSE_MAX_BYTES, runTool, WEB_TOOL_NAMES } from '../../mcp/handlers.ts'
import { baseOf, createCatalogSource } from '../../mcp/index-cache.ts'
import { fixtureData } from '../emit/helpers.ts'
import { presetsOrFallback } from '../../lib/core/lines.ts'
import { ENV, fixtureSource, KSEF, NOW, siteStub } from './helpers.ts'

const big = (n: number) => 'x'.repeat(n)

describe('presetsFrom', () => {
  it('rebuilds the core part of both presets from built-in.json inPresets and inEmptyPreset (24 Oct)', async () => {
    const c = await fixtureSource().catalog()
    const real = presetsOrFallback(fixtureData().presets, c.lines, NOW)
    const coreIds = new Set((c.builtIn?.modules ?? []).map((m) => m.id))
    const pick = (list: readonly { id: string; from: string }[] | undefined) =>
      (list ?? [])
        .filter((m) => m.from === '@open-mercato/core' && coreIds.has(m.id))
        .map((m) => m.id)
        .sort()
    const rebuilt = presetsFrom(c) ?? {}
    for (const l of c.lines) {
      expect(pick(rebuilt[l.key]?.classic ?? []), l.key).toEqual(pick(real[l.key]?.classic))
      expect(pick(rebuilt[l.key]?.empty ?? []), l.key).toEqual(pick(real[l.key]?.empty))
    }
  })

  it('adds catalog modules a new app registers (compat.inPresets) and those of the empty preset', async () => {
    const stub = siteStub()
    const bi = JSON.parse(String(stub.files.get('built-in.json'))) as {
      modules: { id: string; inPresets: string[]; inEmptyPreset?: string[] }[]
    }
    bi.modules[0]!.inPresets = ['0.9', 'next']
    bi.modules[0]!.inEmptyPreset = ['0.9']
    const idx = JSON.parse(String(stub.files.get('modules.json'))) as {
      entries: { npm: string | null; moduleIds: string[]; compat: { inPresets?: string[]; inEmptyPreset?: string[] } }[]
    }
    // data from before modules.json published `lines[].presets`: the lists are rebuilt from the fields below
    const lines = (idx as unknown as { lines: Record<string, unknown>[] }).lines
    for (const l of lines) delete l['presets']
    const e = idx.entries.find((x) => x.npm === '@open-mercato/gateway-stripe')!
    e.compat.inPresets = ['0.9']
    e.compat.inEmptyPreset = []
    stub.files.set('built-in.json', JSON.stringify(bi))
    stub.files.set('modules.json', JSON.stringify(idx))
    const p = presetsFrom(await fixtureSource(stub).catalog())
    expect(p?.['0.9']?.classic).toContainEqual({ id: bi.modules[0]!.id, from: '@open-mercato/core' })
    for (const id of e.moduleIds)
      expect(p?.['0.9']?.classic).toContainEqual({ id, from: '@open-mercato/gateway-stripe' })
    expect(p?.['0.9']?.empty).toEqual([{ id: bi.modules[0]!.id, from: '@open-mercato/core' }])
    expect(p?.['next']?.empty?.some((m) => m.id === bi.modules[0]!.id)).toBe(false)
  })

  it('the lists modules.json publishes per line win (24 Oct)', async () => {
    const c = await fixtureSource().catalog()
    const p = presetsFrom(c)
    expect(p?.['0.9']?.classic?.some((m) => m.id === 'integrations')).toBe(true)
    expect(p?.['0.9']?.empty?.some((m) => m.id === 'integrations')).toBe(false)
  })

  it('a plan without app context marks preset core modules as enabled', async () => {
    const src = fixtureSource()
    const c = await src.catalog()
    const r = await runTool('plan_install', { refs: [KSEF] }, src, NOW)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const preset = new Set((presetsFrom(c)?.['0.9']?.empty ?? []).map((m) => m.id))
    for (const b of r.value.builtInNeeded) if (preset.has(b.id)) expect(b.enabled, b.id).not.toBe(false)
  })
})

describe('capResponse (100 KB, spec 8.3)', () => {
  it('passes small responses through', () => {
    const v: GetChangesOutput = { changes: [], truncated: false, generatedAt: NOW }
    expect(capResponse('get_changes', v)).toEqual({ ok: true, value: v })
  })

  it('get_module drops anatomy first, then the README, with warnings', () => {
    const v = {
      entry: null,
      candidates: [],
      anatomy: [{ blob: big(RESPONSE_MAX_BYTES) }],
      warnings: [],
      untrusted: { source: 'readme', notice: 'n', text: 'short' },
      card: 'https://x.test/m/a.md',
    } as unknown as GetModuleOutput
    const r = capResponse('get_module', v)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.anatomy).toBeNull()
    expect(r.value.untrusted?.text).toBe('short')
    expect(r.value.warnings[0]).toMatch(/^Anatomy cut: the response would exceed 100 KB\./)
  })

  it('get_changes cuts the list and sets truncated', () => {
    const changes = Array.from({ length: 2000 }, (_, i) => ({
      at: NOW,
      type: 'new-version' as const,
      locator: `npm:@scope/name-${i}-${big(60)}`,
      version: '1.0.0',
    }))
    const r = capResponse('get_changes', { changes, truncated: false, generatedAt: NOW })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.truncated).toBe(true)
    expect(r.value.changes.length).toBeLessThan(2000)
    expect(new TextEncoder().encode(JSON.stringify(r.value)).length).toBeLessThanOrEqual(RESPONSE_MAX_BYTES)
  })

  it('search_modules drops cards from the end', () => {
    const card = { locator: 'npm:a', summary: big(30_000) }
    const v = {
      results: [card, card, card, card, card],
      builtIn: [],
      total: 5,
      line: null,
      dataVersion: 'd',
      generatedAt: NOW,
    }
    const r = capResponse('search_modules', v as unknown as SearchModulesOutput)
    expect(r.ok && r.value.results.length).toBe(3)
  })
})

describe('runTool', () => {
  it('maps every failure to { ok: false } with candidates for unknown refs', async () => {
    const r = await runTool('check_compat', { refs: [], omVersion: '0.9.0' }, fixtureSource(), NOW)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/^Invalid input\. refs: /)
    const u = await runTool('get_module', { ref: 'durable' }, fixtureSource(), NOW)
    expect(u.ok).toBe(false)
    if (!u.ok) expect(u.candidates.length).toBeGreaterThan(0)
  })

  it('WebMCP exposes four tools: no get_changes in the browser (spec 8.4)', () => {
    expect(WEB_TOOL_NAMES).toEqual(['search_modules', 'get_module', 'check_compat', 'plan_install'])
  })
})

describe('catalog source', () => {
  it('derives sibling URLs from MODULES_INDEX_URL and refuses traversal', () => {
    expect(baseOf('https://a.test/modules/modules.json?x=1')).toBe('https://a.test/modules/')
    const src = createCatalogSource({ indexUrl: ENV.MODULES_INDEX_URL, fetch: siteStub().fetch })
    expect(src.url('m/@x/y.md')).toBe('https://wojciechszyjka.github.io/modules/m/@x/y.md')
    expect(() => src.url('m/../../etc')).toThrow(/Unsafe path/)
    expect(() => src.url('https://evil.test/x')).toThrow(/Unsafe path/)
  })

  it('shares one in-flight load between concurrent first requests', async () => {
    const stub = siteStub()
    const src = fixtureSource(stub)
    await Promise.all([src.catalog(), src.catalog(), src.catalog()])
    expect(stub.calls.filter((u) => u.endsWith('/modules.json'))).toHaveLength(1)
  })

  it('passes the edge cache TTL of 600 s to fetch (cf.cacheTtl)', async () => {
    const seen: unknown[] = []
    const stub = siteStub()
    const src = createCatalogSource({
      indexUrl: ENV.MODULES_INDEX_URL,
      fetch: (u, init) => {
        seen.push(init)
        return stub.fetch(u, init)
      },
    })
    await src.catalog()
    expect(seen[0]).toMatchObject({ cf: { cacheTtl: 600 } })
  })

  it('a missing built-in.json still serves modules; a broken modules.json is unavailable', async () => {
    const src = fixtureSource(siteStub({ 'built-in.json': null }))
    const c = await src.catalog()
    expect(c.builtIn).toBeNull()
    expect(c.index.entries.length).toBeGreaterThan(0)
    const bad = fixtureSource(siteStub({ 'modules.json': '{"schemaVersion":2}' }))
    await expect(bad.catalog()).rejects.toThrow(/does not match/)
  })
})
