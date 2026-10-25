// HTTP client for the read-only sources of sync, watch and discover (spec 5.2: p-limit(10), 100 ms gap,
// 3 retries). Three modes:
// - live: real requests;
// - record: live requests, each response also written to a fixture directory (test/fixtures/http/);
// - offline (`--offline`): no network, responses replayed from that directory; a missing recording is an error.
// Only api.github.com gets the token. Nothing here writes to a remote service except POST bodies that are
// read-only queries (GitHub GraphQL, OSV querybatch).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import pLimit from 'p-limit'
import { USER_AGENT_HOME } from '../core/home.ts'

export interface HttpResponse {
  status: number
  /** Parsed JSON when the response is JSON, otherwise null. */
  json: unknown
  /** Raw text (empty for JSON responses replayed from a fixture). */
  text: string
}

export interface RequestOptions {
  method?: 'GET' | 'HEAD' | 'POST' | 'PUT'
  body?: unknown
  headers?: Record<string, string>
  /** Expect a text body (YAML, Markdown) instead of JSON. */
  text?: boolean
}

export interface Http {
  request(url: string, opts?: RequestOptions): Promise<HttpResponse>
  /** Raw bytes (tarballs). Never recorded; offline mode throws. */
  bytes(url: string): Promise<Uint8Array>
  readonly mode: 'live' | 'record' | 'offline'
  readonly fixturesDir: string | null
}

export class HttpError extends Error {
  readonly url: string
  readonly status: number | null
  constructor(message: string, url: string, status: number | null) {
    super(message)
    this.url = url
    this.status = status
  }
}

export class OfflineMissError extends HttpError {}

/** A slimmer shrinks a recorded body without changing what the sources compute from it. */
export type Slimmer = (url: string, json: unknown) => unknown

export interface HttpOptions {
  offline?: boolean
  /** Directory of recordings (replayed offline, written in record mode). */
  fixturesDir?: string | null
  record?: boolean
  githubToken?: string | null
  concurrency?: number
  gapMs?: number
  retries?: number
  /** Back-off unit for a 429 without a positive Retry-After (npm search sends `retry-after: 0`); default 2000 ms. */
  rateLimitMs?: number
  fetchImpl?: typeof fetch
  slimmers?: Slimmer[]
  userAgent?: string
}

interface Recording {
  request: { method: string; url: string; bodySha256?: string }
  response: { status: number; json?: unknown; text?: string }
}

const RETRY_STATUS = new Set([429, 500, 502, 503, 504])

/** Stable fixture file for a request: `<host>/<sanitized path and query>-<10 hex of the key>.json`. */
export function fixtureFile(method: string, url: string, body?: unknown): string {
  const u = new URL(url)
  const bodyHash = body === undefined ? '' : sha256(stableJson(body)).slice(0, 16)
  const key = `${method} ${u.href}${bodyHash ? ` ${bodyHash}` : ''}`
  const slug = decodeURIComponent(u.pathname + u.search)
    .replace(/[^A-Za-z0-9._@-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 90)
  return join(
    u.host,
    `${method === 'GET' ? '' : `${method.toLowerCase()}-`}${slug || 'root'}-${sha256(key).slice(0, 10)}.json`,
  )
}

export function sha256(s: string | Uint8Array): string {
  return createHash('sha256').update(s).digest('hex')
}

/** JSON with sorted object keys, so equal bodies hash equally. */
export function stableJson(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(
          Object.entries(val as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : val,
  )
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function createHttp(opts: HttpOptions = {}): Http {
  const offline = opts.offline ?? false
  const record = !offline && (opts.record ?? false)
  const fixturesDir = opts.fixturesDir ?? null
  if ((offline || record) && !fixturesDir) throw new Error('offline and record modes need a fixtures directory')
  const limit = pLimit(opts.concurrency ?? 10)
  const gap = opts.gapMs ?? 100
  const retries = opts.retries ?? 3
  const rateLimitMs = opts.rateLimitMs ?? 2000
  const doFetch = opts.fetchImpl ?? fetch
  const slimmers = opts.slimmers ?? []
  const ua = opts.userAgent ?? `open-mercato-modules-sync (${USER_AGENT_HOME})`

  function headersFor(url: string, extra: Record<string, string> | undefined, text: boolean): Record<string, string> {
    const h: Record<string, string> = { 'user-agent': ua, accept: text ? '*/*' : 'application/json', ...extra }
    const host = new URL(url).host
    if (host === 'api.github.com') {
      h['x-github-api-version'] = '2022-11-28'
      if (opts.githubToken) h.authorization = `Bearer ${opts.githubToken}`
    }
    return h
  }

  async function live(url: string, o: RequestOptions): Promise<HttpResponse> {
    const method = o.method ?? 'GET'
    let lastErr: unknown = null
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(gap * 2 ** attempt)
      try {
        const res = await doFetch(url, {
          method,
          headers: {
            ...headersFor(url, o.headers, o.text ?? false),
            ...(o.body !== undefined ? { 'content-type': 'application/json' } : {}),
          },
          body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
          redirect: 'follow',
          signal: AbortSignal.timeout(60_000),
        })
        if (RETRY_STATUS.has(res.status) && attempt < retries) {
          lastErr = new HttpError(`HTTP ${res.status}`, url, res.status)
          // rate limits (npm search, GitHub): honour a positive Retry-After, else back off by seconds, not
          // milliseconds (npm search answers 429 with `retry-after: 0`, and an immediate retry fails again)
          const ra = res.headers.get('retry-after')
          const after = ra === null ? Number.NaN : Number(ra)
          if (res.status === 429)
            await sleep(Number.isFinite(after) && after > 0 ? Math.min(after, 60) * 1000 : rateLimitMs * 2 ** attempt)
          continue
        }
        const text = await res.text()
        const ct = res.headers.get('content-type') ?? ''
        let json: unknown = null
        if (!o.text && (ct.includes('json') || /^\s*[[{]/.test(text))) {
          try {
            json = text === '' ? null : (JSON.parse(text) as unknown)
          } catch {
            json = null
          }
        }
        return { status: res.status, json, text }
      } catch (err) {
        lastErr = err
      }
    }
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr)
    throw new HttpError(`request failed after ${retries + 1} attempts: ${msg}`, url, null)
  }

  function replay(url: string, o: RequestOptions): HttpResponse {
    const file = join(fixturesDir as string, fixtureFile(o.method ?? 'GET', url, o.body))
    if (!existsSync(file))
      throw new OfflineMissError(`offline: no recorded response for ${o.method ?? 'GET'} ${url}`, url, null)
    const rec = JSON.parse(readFileSync(file, 'utf8')) as Recording
    const json = rec.response.json ?? null
    const text = rec.response.text ?? (json !== null ? JSON.stringify(json) : '')
    return { status: rec.response.status, json, text }
  }

  function save(url: string, o: RequestOptions, res: HttpResponse): void {
    const method = o.method ?? 'GET'
    const file = join(fixturesDir as string, fixtureFile(method, url, o.body))
    let json = res.json
    if (json !== null) for (const s of slimmers) json = s(url, json)
    const rec: Recording = {
      request: { method, url, ...(o.body !== undefined ? { bodySha256: sha256(stableJson(o.body)) } : {}) },
      response: json !== null ? { status: res.status, json } : { status: res.status, text: res.text },
    }
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify(rec, null, 2)}\n`)
  }

  return {
    mode: offline ? 'offline' : record ? 'record' : 'live',
    fixturesDir,
    request(url, o = {}) {
      if (offline) return Promise.resolve().then(() => replay(url, o))
      return limit(async () => {
        const res = await live(url, o)
        await sleep(gap)
        // a rate limit or server error is never recorded: offline runs would replay the outage
        if (record && !RETRY_STATUS.has(res.status)) save(url, o, res)
        return res
      })
    },
    bytes(url) {
      if (offline)
        return Promise.reject(new OfflineMissError(`offline: binary downloads are not recorded (${url})`, url, null))
      return limit(async () => {
        for (let attempt = 0; ; attempt++) {
          try {
            const res = await doFetch(url, {
              headers: { 'user-agent': ua },
              redirect: 'follow',
              signal: AbortSignal.timeout(120_000),
            })
            if (!res.ok) throw new HttpError(`HTTP ${res.status}`, url, res.status)
            return new Uint8Array(await res.arrayBuffer())
          } catch (err) {
            if (attempt >= retries || (err instanceof HttpError && err.status === 404)) throw err
            await sleep(gap * 2 ** (attempt + 1))
          }
        }
      })
    },
  }
}

/** Throws unless the response is 2xx JSON; returns the parsed body. */
export async function getJson<T = unknown>(http: Http, url: string, opts?: RequestOptions): Promise<T> {
  const res = await http.request(url, opts)
  if (res.status < 200 || res.status >= 300) throw new HttpError(`HTTP ${res.status} for ${url}`, url, res.status)
  if (res.json === null) throw new HttpError(`not JSON: ${url}`, url, res.status)
  return res.json as T
}

/** Short error text for SyncRecord.errors (max 300 characters). */
export function errText(source: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return `${source}: ${msg}`.replace(/\s+/g, ' ').slice(0, 300)
}
