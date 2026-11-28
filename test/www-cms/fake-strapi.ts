// A fake Strapi 5 for the tests of www-push and www-pull (Strapi CMS spec, Steps 3.1 and 3.2): a node:http server on
// 127.0.0.1 at a random port that answers the REST routes the two commands use, as Strapi 5.64.0 answers them.
// Documents are kept as written (the body of a create or an update) with a draft and a published version and are
// answered in the read shape of a fully populated GET (every field present, null or a list when unset, components with
// their `id`, relations as the related document with its `documentId` and `slug`, media as the upload's file object;
// a published read relates only to published documents). The Media Library has folders (`namePath`) and uploads served
// under /uploads/ without a token. Every request is logged with the token it carried (test tokens only).
import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { COMPONENTS, TYPES, type Field, type StrapiType } from '../../lib/www-cms/model.ts'

export type TokenKind = 'full' | 'read' | 'drafts'

export interface FakeUpload {
  id: number
  documentId: string
  name: string
  url: string
  ext: string
  mime: string
  hash: string
  size: number
  updatedAt: string
  folder: number | null
  bytes: Uint8Array
  [key: string]: unknown
}

interface FakeFolder {
  id: number
  documentId: string
  name: string
  path: string
  namePath: string
}

interface FakeDoc {
  documentId: string
  draft: Record<string, unknown>
  published: Record<string, unknown> | null
  updatedAt: string
}

export interface LogLine {
  method: string
  path: string
  query: URLSearchParams
  token: string | undefined
  status: number
  /** The `data` of a JSON body (a create or an update). */
  data?: Record<string, unknown>
}

/** An answer of the override hook: a status and a JSON body, or raw bytes. */
export type Override = { status: number; body?: unknown; raw?: string } | undefined

export interface FakeOptions {
  tokens?: Record<string, TokenKind>
  /** The `pageSize` the fake answers with instead of the asked one (a changed `maxLimit`). */
  pageSize?: number
  /** The Public role has `find`: an anonymous GET of the content API answers 200. */
  publicOpen?: boolean
  /** Media Library folders that exist, by name path (`/media/blog`); parents are made too. */
  folders?: readonly string[]
  /** Answers a request before the fake does (a recorded fixture, a corrupt answer). */
  override?: (method: string, url: URL, token: string | undefined) => Override
}

export interface FakeStrapi {
  url: string
  log: LogLine[]
  docs: Map<string, FakeDoc[]>
  uploads: FakeUpload[]
  folders: FakeFolder[]
  /** POST /api/upload per site path, replacements included. */
  uploadCount: Map<string, number>
  /** A document in the store as a create of the REST API would write it. */
  seed(apiId: string, data: Record<string, unknown>, published: boolean): string
  /** An upload in a folder (made when missing), with fields of a recorded file object when given. */
  addUpload(folderPath: string, name: string, bytes: Uint8Array, fields?: Partial<FakeUpload>): FakeUpload
  close(): Promise<void>
}

const typeOfRoute = (path: string): { type: StrapiType; id?: string } | undefined => {
  for (const type of TYPES) {
    if (path === type.route) return { type }
    if (type.kind === 'collection' && path.startsWith(`${type.route}/`))
      return { type, id: decodeURIComponent(path.slice(type.route.length + 1)) }
  }
  return undefined
}

const docIdOf = (): string => {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return [...randomBytes(24)].map((b) => a[b % a.length]).join('')
}

const send = (res: ServerResponse, status: number, body?: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

const error = (status: number, name: string, message: string, details: unknown = {}) => ({
  data: null,
  error: { status, name, message, details },
})

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return Buffer.concat(chunks)
}

export async function startFakeStrapi(opts: FakeOptions = {}): Promise<FakeStrapi> {
  const tokens = opts.tokens ?? { 'test-full': 'full', 'test-read': 'read', 'test-drafts': 'drafts' }
  const docs = new Map<string, FakeDoc[]>(TYPES.map((t) => [t.apiId, []]))
  const uploads: FakeUpload[] = []
  const folders: FakeFolder[] = []
  const uploadCount = new Map<string, number>()
  const log: LogLine[] = []
  let nextId = 1
  let clock = Date.parse('2026-11-28T00:00:00.000Z')
  const stamp = () => new Date((clock += 1000)).toISOString()

  function folderOf(namePath: string): FakeFolder {
    const found = folders.find((f) => f.namePath === namePath)
    if (found) return found
    const parts = namePath.split('/').filter(Boolean)
    const parent = parts.length > 1 ? folderOf(`/${parts.slice(0, -1).join('/')}`) : undefined
    const id = folders.length + 1
    const f = { id, documentId: docIdOf(), name: parts.at(-1)!, path: `${parent?.path ?? ''}/${id}`, namePath }
    folders.push(f)
    return f
  }
  for (const f of opts.folders ?? []) folderOf(f)

  const pathOfUpload = (u: FakeUpload) => `${folders.find((f) => f.id === u.folder)?.namePath ?? ''}/${u.name}`
  // as the content API of 5.64.0 answers a file: without its folder, which an API token cannot read
  const uploadJson = (u: FakeUpload) => {
    const { bytes: _b, folder: _f, ...rest } = u
    return { caption: null, ...rest }
  }

  /** A stored value (write shape) in the read shape of a populated GET. */
  function readShape(fields: readonly Field[], value: Record<string, unknown>, status: string) {
    const out: Record<string, unknown> = {}
    const comp = (uid: string, v: Record<string, unknown>) => ({
      id: nextId++,
      ...readShape(COMPONENTS[uid]!, v, status),
    })
    const rel = (target: string, id: unknown) => {
      const d = docs.get(target)?.find((x) => x.documentId === id)
      if (!d || (status === 'published' && !d.published)) return null
      return { id: nextId++, documentId: d.documentId, slug: d.draft.slug }
    }
    for (const f of fields) {
      switch (f.kind) {
        case 'scalar': {
          const n = f.name ?? f.key
          out[n] = value[n] ?? null
          break
        }
        case 'media': {
          const n = f.name ?? f.key
          const u = uploads.find((x) => x.id === value[n])
          out[n] = u ? uploadJson(u) : null
          break
        }
        case 'relation':
          out[f.key] = f.many
            ? ((value[f.key] as unknown[] | undefined) ?? []).map((id) => rel(f.target, id)).filter(Boolean)
            : rel(f.target, value[f.key])
          break
        case 'lines':
          out[f.key] = ((value[f.key] as { text: unknown }[] | undefined) ?? []).map((l) => ({
            id: nextId++,
            text: l.text,
          }))
          break
        case 'component': {
          const n = f.name ?? f.key
          const v = value[n]
          out[n] = f.repeatable
            ? ((v as Record<string, unknown>[] | undefined) ?? []).map((c) => comp(f.component, c))
            : v
              ? comp(f.component, v as Record<string, unknown>)
              : null
          break
        }
        case 'pair':
          for (const n of f.names) {
            const v = value[n]
            out[n] =
              v === undefined || v === null ? null : f.component ? comp(f.component, v as Record<string, unknown>) : v
          }
          break
        case 'flat':
          for (const [, n] of f.fields) out[n] = value[n] ?? null
          break
        case 'zone':
          out[f.key] = ((value[f.key] as Record<string, unknown>[] | undefined) ?? []).map((b) => ({
            id: nextId++,
            __component: b.__component,
            ...readShape(COMPONENTS[String(b.__component)]!, b, status),
          }))
          break
      }
    }
    return out
  }

  function docJson(type: StrapiType, d: FakeDoc, status: string) {
    const v = status === 'draft' ? d.draft : d.published!
    return {
      id: nextId++,
      documentId: d.documentId,
      ...(type.kind === 'collection' ? { slug: v.slug } : {}),
      ...readShape(type.fields, v, status),
      ...(type.body ? { body: v.body ?? null } : {}),
      createdAt: '2026-11-28T00:00:00.000Z',
      updatedAt: d.updatedAt,
      publishedAt: status === 'draft' ? null : d.updatedAt,
    }
  }

  /** The keys a body may carry: the Strapi names of the type's fields, its slug and its body. */
  function invalidKeys(type: StrapiType, data: Record<string, unknown>): string[] {
    const known = new Set<string>(['slug', 'body'])
    for (const f of type.fields) {
      if (f.kind === 'pair') f.names.forEach((n) => known.add(n))
      else if (f.kind === 'flat') f.fields.forEach(([, n]) => known.add(n))
      else known.add(f.kind === 'scalar' || f.kind === 'component' || f.kind === 'media' ? (f.name ?? f.key) : f.key)
    }
    return Object.keys(data).filter((k) => !known.has(k))
  }

  function paged<T>(res: ServerResponse, q: URLSearchParams, items: T[], map: (x: T) => unknown) {
    const page = Number(q.get('pagination[page]') ?? 1)
    const asked = Number(q.get('pagination[pageSize]') ?? 25)
    const pageSize = opts.pageSize ?? Math.min(asked, 100)
    const slice = items.slice((page - 1) * pageSize, page * pageSize)
    send(res, 200, {
      data: slice.map(map),
      meta: { pagination: { page, pageSize, pageCount: Math.ceil(items.length / pageSize), total: items.length } },
    })
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const method = req.method ?? 'GET'
    const auth = req.headers.authorization
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined
    const line: LogLine = { method, path: url.pathname, query: url.searchParams, token, status: 0 }
    log.push(line)
    const reply = (status: number, body?: unknown) => {
      line.status = status
      send(res, status, body)
    }
    const o = opts.override?.(method, url, token)
    if (o) {
      line.status = o.status
      res.writeHead(o.status, { 'content-type': 'application/json' })
      res.end(o.raw ?? JSON.stringify(o.body))
      return
    }

    // media files: served without a token, as the local provider of 5.64.0 does (spec, Risks)
    if (method === 'GET' && url.pathname.startsWith('/uploads/')) {
      const u = uploads.find((x) => x.url === url.pathname)
      if (!u) return reply(404, error(404, 'NotFoundError', 'Not Found'))
      line.status = 200
      res.writeHead(200, { 'content-type': u.mime })
      res.end(Buffer.from(u.bytes))
      return
    }
    if (!url.pathname.startsWith('/api/')) return reply(404, error(404, 'NotFoundError', 'Not Found'))
    const kind = token === undefined ? undefined : tokens[token]
    if (token !== undefined && kind === undefined)
      return reply(401, error(401, 'UnauthorizedError', 'Missing or invalid credentials'))
    if (kind === undefined && !(opts.publicOpen && method === 'GET'))
      return reply(403, error(403, 'ForbiddenError', 'Forbidden'))
    if (method !== 'GET' && kind !== 'full') return reply(403, error(403, 'ForbiddenError', 'Forbidden'))
    const q = url.searchParams

    if (method === 'GET') line.status = 200
    if (url.pathname === '/api/upload/folders' && method === 'GET') return paged(res, q, folders, (f) => f)
    // the list a read-only token reaches: a plain list without meta, paged by start and limit only
    if (url.pathname === '/api/upload/files' && method === 'GET') {
      const start = Number(q.get('start') ?? 0)
      const limit = Number(q.get('limit') ?? uploads.length)
      return reply(200, uploads.slice(start, start + limit).map(uploadJson))
    }
    // 5.64.0 keeps /files/page from read-only tokens
    if (url.pathname === '/api/upload/files/page' && method === 'GET' && kind !== 'full')
      return reply(403, error(403, 'ForbiddenError', 'Forbidden'))
    if (url.pathname === '/api/upload/files/page' && method === 'GET') {
      const refused = [...q.keys()].find((k) => /^(populate|filters|fields)\b.*\b(folder|folderPath)\b/.test(k))
      if (refused) return reply(400, error(400, 'ValidationError', 'Invalid key folder'))
      return paged(res, q, uploads, uploadJson)
    }
    if (url.pathname === '/api/upload' && method === 'POST') {
      const body = await readBody(req)
      const form = await new Request('http://127.0.0.1/', {
        method: 'POST',
        headers: { 'content-type': req.headers['content-type'] ?? '' },
        body: new Uint8Array(body),
      }).formData()
      const file = form.get('files') as File
      const info = JSON.parse(String(form.get('fileInfo') ?? '{}')) as { name?: string; caption?: string }
      const bytes = new Uint8Array(await file.arrayBuffer())
      const replace = q.get('id')
      if (replace) {
        const u = uploads.find((x) => String(x.id) === replace)
        if (!u) return reply(404, error(404, 'NotFoundError', 'file.notFound'))
        Object.assign(u, fileFields(info.name ?? file.name, bytes, file.type), {
          id: u.id,
          documentId: u.documentId,
          caption: info.caption ?? null,
        })
        uploadCount.set(pathOfUpload(u), (uploadCount.get(pathOfUpload(u)) ?? 0) + 1)
        return reply(201, uploadJson(u))
      }
      const folder = form.get('folder')
      if (folder !== null && !folders.some((f) => String(f.id) === folder))
        return reply(400, error(400, 'ValidationError', `Folder with id ${String(folder)} does not exist`))
      const u: FakeUpload = {
        id: uploads.length + 1,
        documentId: docIdOf(),
        ...fileFields(info.name ?? file.name, bytes, file.type),
        folder: folder === null ? null : Number(folder),
        caption: info.caption ?? null,
      }
      uploads.push(u)
      uploadCount.set(pathOfUpload(u), (uploadCount.get(pathOfUpload(u)) ?? 0) + 1)
      return reply(201, [uploadJson(u)])
    }

    const r = typeOfRoute(url.pathname)
    if (!r) return reply(404, error(404, 'NotFoundError', 'Not Found'))
    const { type } = r
    const list = docs.get(type.apiId)!
    const status = q.get('status') ?? 'published'
    if (method === 'GET') {
      const visible = status === 'draft' ? list : list.filter((d) => d.published)
      if (type.kind === 'single') {
        const d = visible[0]
        return d
          ? reply(200, { data: docJson(type, d, status), meta: {} })
          : reply(404, error(404, 'NotFoundError', 'Not Found'))
      }
      line.status = 200
      return paged(res, q, visible, (d) => docJson(type, d, status))
    }
    if (method !== 'POST' && method !== 'PUT')
      return reply(405, error(405, 'MethodNotAllowedError', 'Method Not Allowed'))
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}') as { data?: Record<string, unknown> }
    const data = body.data
    line.data = data
    if (!data || typeof data !== 'object')
      return reply(400, error(400, 'ValidationError', 'Missing "data" payload in the request body'))
    const bad = invalidKeys(type, data)
    if (bad.length > 0)
      return reply(
        400,
        error(400, 'ValidationError', `Invalid key ${bad[0]}`, {
          errors: bad.map((k) => ({ path: [k], message: `Invalid key ${k}` })),
        }),
      )
    let d: FakeDoc | undefined
    if (method === 'POST') {
      if (type.kind !== 'collection') return reply(405, error(405, 'MethodNotAllowedError', 'Method Not Allowed'))
      if (typeof data.slug !== 'string')
        return reply(
          400,
          error(400, 'ValidationError', 'slug must be defined', {
            errors: [{ path: ['slug'], message: 'slug must be defined' }],
          }),
        )
      d = { documentId: docIdOf(), draft: { ...data }, published: null, updatedAt: stamp() }
      list.push(d)
    } else {
      d = type.kind === 'single' ? list[0] : list.find((x) => x.documentId === r.id)
      if (!d && type.kind === 'single') {
        d = { documentId: docIdOf(), draft: {}, published: null, updatedAt: stamp() }
        list.push(d)
      }
      if (!d) return reply(404, error(404, 'NotFoundError', 'Not Found'))
      d.draft = { ...d.draft, ...data }
      d.updatedAt = stamp()
    }
    if (status === 'published') d.published = structuredClone(d.draft)
    return reply(method === 'POST' ? 201 : 200, {
      data: docJson(type, d, status === 'published' ? 'published' : 'draft'),
      meta: {},
    })
  }

  function fileFields(name: string, bytes: Uint8Array, mime = 'application/octet-stream') {
    const dot = name.lastIndexOf('.')
    const ext = dot > 0 ? name.slice(dot).toLowerCase() : ''
    const hash = `${name.slice(0, dot > 0 ? dot : undefined).replace(/[^a-z0-9]/gi, '_')}_${randomBytes(5).toString('hex')}`
    return {
      name,
      ext,
      mime,
      hash,
      url: `/uploads/${hash}${ext}`,
      size: Math.round(bytes.length / 10) / 100,
      updatedAt: stamp(),
      bytes,
    }
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      send(res, 500, error(500, 'InternalServerError', (err as Error).message))
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    log,
    docs,
    uploads,
    folders,
    uploadCount,
    seed(apiId, data, published) {
      const d = {
        documentId: docIdOf(),
        draft: { ...data },
        published: published ? { ...data } : null,
        updatedAt: stamp(),
      }
      docs.get(apiId)!.push(d)
      return d.documentId
    },
    addUpload(folderPath, name, bytes, fields = {}) {
      const u: FakeUpload = {
        id: uploads.length + 1,
        documentId: docIdOf(),
        ...fileFields(name, bytes),
        folder: folderOf(folderPath).id,
        caption: folderPath,
        ...fields,
        bytes,
      }
      uploads.push(u)
      return u
    },
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}
