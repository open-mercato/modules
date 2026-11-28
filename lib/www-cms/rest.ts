// The REST client of `yarn om www-push` and `yarn om www-pull` (Strapi CMS spec 2026-11-27-www-strapi-cms.md, API
// Contracts): the token from the caller as a bearer header and nowhere else (never in a message), at most 4 requests at
// a time, 30 seconds each, 3 tries with backoff on a network error, a timeout or a 5xx; paged reads at exactly the
// page size of cms/config/api.ts (100), failing when an answer pages otherwise, so a changed limit can never drop
// documents silently. Isomorphic: fetch only, no Node APIs.

/** The page size of every paged read: `rest.maxLimit` of cms/config/api.ts. */
export const PAGE_SIZE = 100

/** Why a request failed: no answer (or a 5xx after every try), the token refused, or an answer the client cannot use. */
export type FailKind = 'unreachable' | 'refused' | 'answer'

/** A failed request, with the method and path (no query, no token) in its message. */
export class StrapiError extends Error {
  readonly kind: FailKind
  readonly status: number | undefined
  /** Strapi's error details (`error.details`), for a refused value: the path of the field and the message. */
  readonly details: unknown
  constructor(kind: FailKind, message: string, status?: number, details?: unknown) {
    super(message)
    this.name = 'StrapiError'
    this.kind = kind
    this.status = status
    this.details = details
  }
}

/**
 * A query as Strapi's qs parser reads it: nested objects and lists in brackets
 * (`populate[seo][populate][ogImage]=true`, `fields[0]=slug`), keys and values URI-encoded.
 */
export function encodeQuery(query: Readonly<Record<string, unknown>>): string {
  const parts: string[] = []
  const walk = (value: unknown, key: string): void => {
    if (value === undefined) return
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${key}[${i}]`))
    else if (typeof value === 'object' && value !== null)
      for (const [k, v] of Object.entries(value)) walk(v, `${key}[${k}]`)
    else
      parts.push(
        `${encodeURIComponent(key).replace(/%5B/g, '[').replace(/%5D/g, ']')}=${encodeURIComponent(String(value))}`,
      )
  }
  for (const [k, v] of Object.entries(query)) walk(v, k)
  return parts.join('&')
}

export interface ClientOptions {
  /** The Strapi origin, `https://cms.openmercato.com` (or a local http://127.0.0.1 address). */
  url: string
  /** The API token; absent for the anonymous check of the pull. */
  token?: string
  concurrency?: number
  timeoutMs?: number
  tries?: number
  backoffMs?: number
}

export interface JsonRequest {
  query?: Readonly<Record<string, unknown>>
  /** A JSON body. */
  body?: unknown
  /** A multipart body (an upload). */
  form?: FormData
  /** Sent without the token: the pull's check that the content API is closed to anonymous readers. */
  anonymous?: boolean
}

export interface Client {
  readonly url: string
  /** A JSON request; a 2xx answer's body, parsed. Throws a StrapiError otherwise. */
  json(method: string, path: string, req?: JsonRequest): Promise<unknown>
  /** The status of an answer, for the anonymous check: never throws for a 4xx. */
  status(path: string, req?: JsonRequest): Promise<number>
  /** The bytes of a file (a media file under /uploads/), with the token. */
  bytes(path: string): Promise<Uint8Array>
}

/** Runs at most `n` tasks at a time; a finishing task hands its slot to the next one waiting. */
function limiter(n: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let active = 0
  const waiting: (() => void)[] = []
  return async (fn) => {
    if (active < n) active++
    else await new Promise<void>((r) => waiting.push(r))
    try {
      return await fn()
    } finally {
      const next = waiting.shift()
      if (next) next()
      else active--
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The Strapi origin as given: https, or http on this machine only (a local instance of the tests or the rehearsal). */
export function strapiOrigin(url: string): string {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new Error(`--strapi ${url} is not an address`)
  }
  const local = u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost')
  if (u.protocol !== 'https:' && !local) throw new Error(`--strapi must be an https address, not ${u.protocol}`)
  if (u.pathname !== '/' || u.search || u.hash || u.username || u.password)
    throw new Error('--strapi is an origin only, without a path, query or credentials')
  return u.origin
}

/**
 * Why a token cannot go into a header, or undefined: the check runs before any request, so a header error (whose
 * message carries the value) never reaches a log.
 */
export function tokenProblem(name: string, token: string): string | undefined {
  return /^[\x21-\x7e]+$/.test(token)
    ? undefined
    : `${name} holds characters an HTTP header cannot carry (a space or a line break?)`
}

/** Strapi's error message of an answer, when it has one. */
function strapiMessage(body: unknown): { message?: string; details?: unknown } {
  const e = (body as { error?: { message?: unknown; details?: unknown } } | null)?.error
  return { message: typeof e?.message === 'string' ? e.message : undefined, details: e?.details }
}

export function createClient(opts: ClientOptions): Client {
  const origin = strapiOrigin(opts.url)
  const run = limiter(opts.concurrency ?? 4)
  const timeoutMs = opts.timeoutMs ?? 30_000
  const tries = opts.tries ?? 3
  const backoffMs = opts.backoffMs ?? 500

  async function send(method: string, path: string, req: JsonRequest, accept: (status: number) => boolean) {
    const at = `${method} ${path}`
    const qs = req.query ? encodeQuery(req.query) : ''
    // every target is resolved against the origin and must stay on it: the token never goes to another host, whatever
    // path (a file's url from Strapi included) it is given
    let target: URL
    try {
      target = new URL(path.startsWith('/') && !path.startsWith('//') ? `${origin}${path}` : path)
    } catch {
      throw new StrapiError('answer', `${method}: ${JSON.stringify(path.slice(0, 80))} is not a path of the instance`)
    }
    if (target.origin !== origin)
      throw new StrapiError('answer', `${method} of ${target.origin} refused: only ${origin} is read with the token`)
    if (qs) target.search = qs
    let last = ''
    for (let i = 1; i <= tries; i++) {
      const headers = new Headers()
      if (opts.token && !req.anonymous) headers.set('authorization', `Bearer ${opts.token}`)
      let body: BodyInit | undefined
      if (req.form) body = req.form
      else if (req.body !== undefined) {
        headers.set('content-type', 'application/json')
        body = JSON.stringify(req.body)
      }
      try {
        const answer = await run(async () => {
          const r = await fetch(target, {
            method,
            headers,
            body,
            redirect: 'error',
            signal: AbortSignal.timeout(timeoutMs),
          })
          return { status: r.status, bytes: new Uint8Array(await r.arrayBuffer()) }
        })
        if (answer.status >= 500 || answer.status === 429) last = `answered ${answer.status}`
        else if (accept(answer.status)) return answer
        else {
          const text = new TextDecoder().decode(answer.bytes)
          let parsed: unknown
          try {
            parsed = JSON.parse(text)
          } catch {
            parsed = undefined
          }
          const { message, details } = strapiMessage(parsed)
          if (answer.status === 401 || answer.status === 403)
            throw new StrapiError('refused', `${at} answered ${answer.status}: the token was refused`, answer.status)
          throw new StrapiError(
            'answer',
            `${at} answered ${answer.status}${message ? `: ${message}` : ''}`,
            answer.status,
            details,
          )
        }
      } catch (err) {
        if (err instanceof StrapiError) throw err
        last = (err as Error).name === 'TimeoutError' ? `no answer in ${timeoutMs / 1000} s` : (err as Error).message
      }
      if (i < tries) await sleep(backoffMs * 2 ** (i - 1))
    }
    throw new StrapiError('unreachable', `${at}: ${last} (${tries} tries)`)
  }

  return {
    url: origin,
    async json(method, path, req = {}) {
      const { status, bytes } = await send(method, path, req, (s) => s >= 200 && s < 300)
      if (status === 204 || bytes.length === 0) return null
      try {
        return JSON.parse(new TextDecoder().decode(bytes))
      } catch {
        throw new StrapiError('answer', `${method} ${path} answered ${status} without JSON`, status)
      }
    },
    async status(path, req = {}) {
      return (await send('GET', path, req, (s) => s < 500)).status
    },
    async bytes(path) {
      return (await send('GET', path, {}, (s) => s >= 200 && s < 300)).bytes
    },
  }
}

/** The pagination of a paged answer. */
interface Pagination {
  page: number
  pageSize: number
  pageCount: number
  total: number
}

/**
 * Every item of a paged read, page by page at PAGE_SIZE. Fails (an `answer` error, exit 2) when an answer's page size
 * is not PAGE_SIZE, its page is not the one asked for, or its page count and item count do not add up with its total.
 */
export async function readPages(
  client: Client,
  path: string,
  query: Readonly<Record<string, unknown>> = {},
): Promise<unknown[]> {
  const items: unknown[] = []
  for (let page = 1; ; page++) {
    const a = (await client.json('GET', path, {
      query: { ...query, pagination: { page, pageSize: PAGE_SIZE } },
    })) as { data?: unknown; meta?: { pagination?: Pagination } } | null
    const p = a?.meta?.pagination
    const data = a?.data
    const where = `GET ${path} page ${page}`
    if (!Array.isArray(data) || !p) throw new StrapiError('answer', `${where}: no list with its pagination`)
    if (p.pageSize !== PAGE_SIZE)
      throw new StrapiError(
        'answer',
        `${where}: page size ${p.pageSize}, not ${PAGE_SIZE}: check rest.maxLimit in cms/config/api.ts`,
      )
    const expectedCount = Math.ceil(p.total / PAGE_SIZE)
    const expectedItems = page < expectedCount ? PAGE_SIZE : p.total - PAGE_SIZE * (page - 1)
    if (p.page !== page || p.pageCount !== expectedCount || data.length !== Math.max(0, expectedItems))
      throw new StrapiError(
        'answer',
        `${where}: page ${p.page} of ${p.pageCount} with ${data.length} items does not add up to a total of ${p.total}`,
      )
    items.push(...data)
    if (page >= p.pageCount) return items
  }
}
