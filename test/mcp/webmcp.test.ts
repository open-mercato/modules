// WebMCP (spec 8.4): at most 100 lines, feature detection on `document.modelContext` (not navigator), four
// read-only tools with schemas from /schema/tools-1.json, abort on pagehide, the same results as the MCP tools.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runTool } from '../../mcp/handlers.ts'
import { href } from '../../site/src/lib/url.ts'
import { fixtureEmit } from '../emit/helpers.ts'
import { fixtureSource, KSEF, siteStub } from './helpers.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FILE = join(ROOT, 'site', 'src', 'scripts', 'webmcp.ts')
const source = readFileSync(FILE, 'utf8')

interface Registered {
  tool: {
    name: string
    description: string
    inputSchema: Record<string, unknown>
    annotations: { readOnlyHint: boolean }
    execute(args: Record<string, unknown>): Promise<{ content: { text: string }[]; isError?: boolean }>
  }
  options?: { signal?: AbortSignal }
}

/** A browser-like global scope; paths follow href() (BASE_URL of the build, `/` under vitest). */
function browser(withModelContext: boolean) {
  const stub = siteStub()
  const registered: Registered[] = []
  const listeners = new Map<string, () => void>()
  const doc = withModelContext
    ? {
        modelContext: {
          registerTool: (tool: Registered['tool'], options?: Registered['options']) =>
            registered.push({ tool, options }),
        },
      }
    : {}
  // `document` itself stays undefined, so the module's own auto-run does nothing; tests pass `doc` explicitly
  vi.stubGlobal('location', new URL('http://localhost/modules/m/@x/y'))
  vi.stubGlobal('addEventListener', (type: string, fn: () => void) => listeners.set(type, fn))
  const fetched: string[] = []
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = new URL(String(input), 'http://localhost/')
    fetched.push(url.pathname)
    const site = 'https://wojciechszyjka.github.io/modules/'
    return stub.fetch(`${site}${url.pathname.replace(/^\/modules\//, '').replace(/^\//, '')}`)
  })
  return { registered, listeners, fetched, doc }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('site/src/scripts/webmcp.ts', () => {
  it('is at most 100 lines and detects document.modelContext, never navigator.modelContext', () => {
    expect(source.split('\n').length).toBeLessThanOrEqual(100)
    expect(source).toContain("if (!('modelContext' in doc)) return []")
    expect(source).not.toMatch(/navigator\.modelContext/)
    expect(source).not.toMatch(/[–—]/)
  })

  it('does nothing and loads nothing without document.modelContext', async () => {
    const env = browser(false)
    const { registerWebMcp } = await import('../../site/src/scripts/webmcp.ts')
    expect(await registerWebMcp(env.doc as unknown as Document)).toEqual([])
    expect(env.fetched).toEqual([])
  })

  it('registers four read-only tools with tools-1.json schemas and aborts them on pagehide', async () => {
    const env = browser(true)
    const { registerWebMcp } = await import('../../site/src/scripts/webmcp.ts')
    const names = await registerWebMcp(env.doc as unknown as Document)
    expect(names).toEqual(['search_modules', 'get_module', 'check_compat', 'plan_install'])
    const schema = JSON.parse(String(fixtureEmit().public.get('schema/tools-1.json'))) as {
      $defs: Record<string, unknown>
    }
    const search = env.registered.find((r) => r.tool.name === 'search_modules')!
    expect(search.tool.inputSchema).toEqual(schema.$defs['SearchModulesInput'])
    expect(search.tool.annotations).toEqual({ readOnlyHint: true })
    expect(search.tool.description).toMatch(/WHEN TO USE: /)
    // the module data waits for the first call
    expect(env.fetched).toEqual([href('/schema/tools-1.json')])
    const signal = search.options?.signal
    expect(signal?.aborted).toBe(false)
    env.listeners.get('pagehide')?.()
    expect(signal?.aborted).toBe(true)
  })

  it('a tool call returns the same JSON as the MCP tool; errors come back with isError', async () => {
    const env = browser(true)
    const { registerWebMcp } = await import('../../site/src/scripts/webmcp.ts')
    await registerWebMcp(env.doc as unknown as Document)
    const tool = (n: string) => env.registered.find((r) => r.tool.name === n)!.tool
    const res = await tool('check_compat').execute({ refs: [KSEF], omVersion: '0.9.0' })
    expect(env.fetched).toContain(href('/modules.json'))
    const mcp = await runTool('check_compat', { refs: [KSEF], omVersion: '0.9.0' }, fixtureSource())
    expect(mcp.ok).toBe(true)
    if (mcp.ok) expect(JSON.parse(res.content[0]!.text)).toEqual(JSON.parse(JSON.stringify(mcp.value)))
    const bad = await tool('get_module').execute({ ref: 'no-such-module-here' })
    expect(bad.isError).toBe(true)
    expect(JSON.parse(bad.content[0]!.text)).toMatchObject({ error: expect.stringMatching(/^Unknown module/) })
  })
})
