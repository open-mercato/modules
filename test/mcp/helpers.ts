// MCP tests: the fixture emit (WP09) served as the site, the Worker handler in-process, and an MCP SDK client.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { fixtureEmit, NOW, SITE } from '../emit/helpers.ts'
import { createCatalogSource, type CatalogSource, type FetchLike } from '../../mcp/index-cache.ts'
import { handle, type Env } from '../../mcp/http.ts'

export { NOW, SITE }
export const MCP = 'https://om-modules.example.workers.dev/mcp'
export const ENV: Env = { MODULES_INDEX_URL: `${SITE}/modules.json` }
export const KSEF = 'npm:@fastwhitecat/integration-ksef-direct'

export interface SiteStub {
  fetch: FetchLike
  /** URLs fetched so far. */
  calls: string[]
  /** Paths that answer 500 (simulated outage). */
  failing: Set<string>
  files: Map<string, string | Uint8Array>
}

/** The fixture's published files as a site under SITE. */
export function siteStub(overrides: Record<string, string | null> = {}): SiteStub {
  const files = new Map(fixtureEmit().public)
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) files.delete(k)
    else files.set(k, v)
  }
  const calls: string[] = []
  const failing = new Set<string>()
  const prefix = `${SITE}/`
  const fetch: FetchLike = async (input) => {
    calls.push(input)
    if (!input.startsWith(prefix)) return new Response('not found', { status: 404 })
    const path = decodeURIComponent(input.slice(prefix.length))
    if (failing.has(path)) return new Response('boom', { status: 500 })
    const body = files.get(path)
    if (body === undefined) return new Response('not found', { status: 404 })
    return new Response(typeof body === 'string' ? body : new Uint8Array(body), { status: 200 })
  }
  return { fetch, calls, failing, files }
}

export function fixtureSource(stub: SiteStub = siteStub(), clock?: () => number): CatalogSource {
  return createCatalogSource({ indexUrl: ENV.MODULES_INDEX_URL, fetch: stub.fetch, clock })
}

/** An MCP SDK client talking to the Worker handler in-process (no network). */
export async function connect(
  source: CatalogSource = fixtureSource(),
  headers: Record<string, string> = {},
): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(MCP), {
    requestInit: { headers },
    fetch: (url, init) => handle(new Request(url, init), ENV, { source, now: () => NOW }),
  })
  const client = new Client({ name: 'om-modules-test', version: '1.0.0' })
  await client.connect(transport)
  return client
}

/** A raw request to the Worker handler. */
export function call(path: string, init: RequestInit = {}, source: CatalogSource = fixtureSource()): Promise<Response> {
  return handle(new Request(`https://om-modules.example.workers.dev${path}`, init), ENV, { source, now: () => NOW })
}

export const rpc = (method: string, params: unknown = {}, id = 1) =>
  JSON.stringify({ jsonrpc: '2.0', id, method, params })

export const MCP_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  'mcp-protocol-version': '2025-06-18',
}
