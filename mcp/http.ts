// HTTP handler of the remote MCP server (spec 8.3, D19): stateless Streamable HTTP on `/mcp`, `GET /` to the site's
// /for-agents page, and the server card. Read-only, no auth, no state, CORS `*`; requests up to 64 KB.
// Web APIs only, so tests run the same handler in Node. mcp/worker.ts is the Worker entry (a Worker module may
// export handlers only).
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { baseOf, createCatalogSource, type CatalogSource, type FetchLike } from './index-cache.ts'
import { createServer, serverCard, toolsFromHeader } from './tools.ts'

export interface Env {
  /** URL of the site's /modules.json (wrangler.toml [vars]). */
  MODULES_INDEX_URL: string
  /** URL of the site's /built-in.json; default: next to modules.json. */
  BUILTIN_INDEX_URL?: string
}

/** Largest request body (spec 8.3). */
export const MAX_BODY_BYTES = 64 * 1024
export const SERVER_CARD = '/.well-known/mcp/server-card.json'

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers':
    'content-type, accept, authorization, mcp-session-id, mcp-protocol-version, last-event-id, x-mcp-tools',
  'access-control-expose-headers': 'mcp-session-id, mcp-protocol-version',
  'access-control-max-age': '86400',
}

function withCors(res: Response): Response {
  const out = new Response(res.body, res)
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v)
  return out
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  })
}

const rpcError = (status: number, code: number, message: string, headers: Record<string, string> = {}) =>
  json({ jsonrpc: '2.0', error: { code, message }, id: null }, status, headers)

/** One catalog source per index URL and isolate: the 10-minute memo survives between requests. */
const sources = new Map<string, CatalogSource>()

export function sourceFor(env: Env, fetchImpl?: FetchLike): CatalogSource {
  const key = `${env.MODULES_INDEX_URL}|${env.BUILTIN_INDEX_URL ?? ''}`
  let s = sources.get(key)
  if (!s || fetchImpl) {
    s = createCatalogSource({
      indexUrl: env.MODULES_INDEX_URL,
      builtInUrl: env.BUILTIN_INDEX_URL || undefined,
      fetch: fetchImpl,
    })
    if (!fetchImpl) sources.set(key, s)
  }
  return s
}

export interface HandleOptions {
  /** Catalog source (tests); default: the memoized source for `env`. */
  source?: CatalogSource
  now?: () => string
}

async function readBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; res: Response }> {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > MAX_BODY_BYTES) return { ok: false, res: rpcError(413, -32600, 'Request body is larger than 64 KB.') }
  const buf = new Uint8Array(await request.arrayBuffer())
  if (buf.byteLength > MAX_BODY_BYTES)
    return { ok: false, res: rpcError(413, -32600, 'Request body is larger than 64 KB.') }
  try {
    return { ok: true, body: JSON.parse(new TextDecoder().decode(buf)) as unknown }
  } catch {
    return { ok: false, res: rpcError(400, -32700, 'Parse error: the body is not JSON.') }
  }
}

async function mcp(request: Request, env: Env, opts: HandleOptions): Promise<Response> {
  // Stateless server: no server-initiated messages, so no GET stream (the transport would hold it open).
  if (request.method === 'GET')
    return rpcError(405, -32000, 'Method not allowed. This server is stateless: POST JSON-RPC to /mcp.', {
      allow: 'POST, DELETE, OPTIONS',
    })
  let parsedBody: unknown
  if (request.method === 'POST') {
    const b = await readBody(request)
    if (!b.ok) return b.res
    parsedBody = b.body
  }
  const src = opts.source ?? sourceFor(env)
  const server = createServer(src, { tools: toolsFromHeader(request.headers.get('x-mcp-tools')), now: opts.now })
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  try {
    return await transport.handleRequest(request, parsedBody === undefined ? undefined : { parsedBody })
  } finally {
    void server.close()
  }
}

/** The fetch handler (exported for tests). */
export async function handle(request: Request, env: Env, opts: HandleOptions = {}): Promise<Response> {
  if (!env.MODULES_INDEX_URL) return withCors(json({ error: 'MODULES_INDEX_URL is not set.' }, 500))
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  if (path === '/mcp') return withCors(await mcp(request, env, opts))
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return withCors(json({ error: 'Method not allowed.' }, 405, { allow: 'GET, OPTIONS' }))
  if (path === '/') {
    const site = baseOf(env.MODULES_INDEX_URL).replace(/\/$/, '')
    return withCors(new Response(null, { status: 302, headers: { location: `${site}/for-agents` } }))
  }
  if (path === SERVER_CARD)
    return withCors(json(serverCard(`${url.origin}/mcp`), 200, { 'cache-control': 'public, max-age=600' }))
  return withCors(json({ error: 'Not found. The MCP endpoint is /mcp.' }, 404))
}
