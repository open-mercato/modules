// A tiny static server with the lookup order of the static host (spec 3.4, WP02 item 13), for the e2e suite (WP16).
// `/m/@x/y` answers with `m/@x/y.html` even when the folder `m/@x/y/` sits next to it, a folder without a trailing
// slash and with an index.html answers 301, and so does a base path without its slash (`/modules`), so the link
// check can see it; anything else answers 404 with 404.html. Serves only under the base. The base defaults to the
// domain root, as the site is built and deployed to Cloudflare Pages since 28 Oct; pass `/modules` (or set
// BASE_PATH) for a build made under a path.
//   node test/e2e/serve.ts <dist> [port] [base]      (defaults: out/e2e/real, 4410, BASE_PATH or /)
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { gzipSync } from 'node:zlib'
import { DEFAULT_BASE_PATH } from '../../lib/core/home.ts'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}

const isFile = (p: string): boolean => existsSync(p) && statSync(p).isFile()
const isDir = (p: string): boolean => existsSync(p) && statSync(p).isDirectory()

/** What Pages answers for a path below the base: a file to send, a redirect, or 404. */
export function lookup(
  root: string,
  rel: string,
): { kind: 'file'; file: string } | { kind: 'redirect'; to: string } | { kind: 'missing' } {
  const clean = normalize(decodeURIComponent(rel)).replace(/^([/\\])+/, '')
  const abs = resolve(root, clean)
  if (abs !== root && !abs.startsWith(root + sep)) return { kind: 'missing' }
  if (rel.endsWith('/')) {
    const index = join(abs, 'index.html')
    return isFile(index) ? { kind: 'file', file: index } : { kind: 'missing' }
  }
  if (isFile(abs)) return { kind: 'file', file: abs }
  if (isFile(`${abs}.html`)) return { kind: 'file', file: `${abs}.html` }
  if (isDir(abs) && isFile(join(abs, 'index.html'))) return { kind: 'redirect', to: `${rel}/` }
  return { kind: 'missing' }
}

/** Types Pages compresses (text); fonts and images go as they are. */
const COMPRESSIBLE = /^(text\/|application\/(json|xml|manifest\+json)|image\/svg\+xml)/

const gzCache = new Map<string, Buffer>()

function send(res: ServerResponse, status: number, file: string | null, head: boolean, gzip: boolean): void {
  const type = file ? (TYPES[extname(file)] ?? 'application/octet-stream') : 'text/plain; charset=utf-8'
  if (!file) {
    res.writeHead(status, { 'content-type': type })
    res.end(head ? undefined : 'Not found')
    return
  }
  // Pages sends gzip to a client that accepts it; transfer sizes (and Lighthouse's throttled timings) depend on it
  if (gzip && COMPRESSIBLE.test(type)) {
    let body = gzCache.get(file)
    if (!body) gzCache.set(file, (body = gzipSync(readFileSync(file))))
    res.writeHead(status, {
      'content-type': type,
      'content-encoding': 'gzip',
      'content-length': body.length,
      vary: 'Accept-Encoding',
      'cache-control': 'max-age=600',
    })
    res.end(head ? undefined : body)
    return
  }
  res.writeHead(status, { 'content-type': type, 'content-length': statSync(file).size, 'cache-control': 'max-age=600' })
  if (head) res.end()
  else createReadStream(file).pipe(res)
}

export function startServer(dist: string, port: number, basePath: string): ReturnType<typeof createServer> {
  const root = resolve(dist)
  const base = `/${basePath.replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '')
  const notFound = join(root, '404.html')
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const head = req.method === 'HEAD'
    const gzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))
    if (base && url.pathname !== base && !url.pathname.startsWith(`${base}/`)) {
      send(res, 404, isFile(notFound) ? notFound : null, head, gzip)
      return
    }
    // a base path without its slash (`/modules`) answers with a 301 to `/modules/`, as GitHub Pages did
    if (base && url.pathname === base) {
      res.writeHead(301, { location: `${base}/${url.search}` })
      res.end()
      return
    }
    const rel = url.pathname.slice(base.length)
    let hit: ReturnType<typeof lookup>
    try {
      hit = lookup(root, rel)
    } catch {
      hit = { kind: 'missing' }
    }
    if (hit.kind === 'file') send(res, 200, hit.file, head, gzip)
    else if (hit.kind === 'redirect') {
      res.writeHead(301, { location: `${base}${hit.to}${url.search}` })
      res.end()
    } else send(res, 404, isFile(notFound) ? notFound : null, head, gzip)
  })
  server.listen(port, '127.0.0.1')
  return server
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dist = process.argv[2] ?? 'out/e2e/real'
  const port = Number(process.argv[3] ?? 4410)
  const base = process.argv[4] ?? process.env.BASE_PATH ?? DEFAULT_BASE_PATH
  if (!isFile(join(dist, 'index.html'))) {
    console.error(`serve: ${join(dist, 'index.html')} not found; run yarn e2e:build first`)
    process.exit(2)
  }
  startServer(dist, port, base)
  console.log(`serve: ${resolve(dist)} on http://127.0.0.1:${port}${base}`)
}
