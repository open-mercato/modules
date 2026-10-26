// Astro integration `omData()` (spec 3.4, 7.1): the published files of `yarn om emit` live in
// site/.generated/public and are the only source of /modules.json, /m/<path>.md, /m/<path>.json and the rest of
// spec 4.6. `astro:server:setup` serves them in `astro dev` under the base path; `astro:build:done` copies them
// into dist/ and fails on a file that a page or site/public already wrote (one author per file). It also adds the
// WebMCP origin trial meta to `/`, `/m/*` and `/for-agents` (not to the redirect pages emit wrote) when emit found a
// valid token for the site's origin (spec 5.6 item 8), unless the layout already printed it.
import {
  createReadStream,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
} from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import type { AstroIntegration } from 'astro'
import type { SiteMeta } from './site-data.ts'
import { localPathLeaks } from './local-paths.ts'

export const CONTENT_TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/atom+xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.html': 'text/html; charset=utf-8',
  // screenshots the catalog hosts (shots/, 26 Oct)
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
}

export interface OmDataOptions {
  /** Folder written by `yarn om emit` (default <root>/site/.generated). */
  generated?: string
}

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, acc)
    else acc.push(p)
  }
  return acc
}

const toPosix = (p: string): string => p.split(sep).join('/')

/** Relative paths present in both trees (a collision between emit and site/public). */
export function collisions(generatedPublic: string, other: string): string[] {
  const mine = new Set(walk(generatedPublic).map((f) => toPosix(relative(generatedPublic, f))))
  return walk(other)
    .map((f) => toPosix(relative(other, f)))
    .filter((p) => mine.has(p))
    .sort()
}

/**
 * Copies every file of `from` into `to`. A file that already exists in `to` is a collision: the build fails,
 * because two authors for one published path would make the result depend on the copy order.
 */
export function copyGenerated(from: string, to: string): { copied: number; collisions: string[] } {
  const clash: string[] = []
  let copied = 0
  for (const f of walk(from)) {
    const rel = relative(from, f)
    const dest = join(to, rel)
    if (existsSync(dest)) {
      clash.push(toPosix(rel))
      continue
    }
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(f, dest)
    copied++
  }
  return { copied, collisions: clash.sort() }
}

/**
 * Pages that load WebMCP (spec 8.4) and so carry the origin trial meta. `emitted` holds the paths (relative to
 * dist, POSIX) that emit wrote itself, such as the redirect pages of renamed entries under `m/`: they do not load
 * WebMCP and are left alone.
 */
export function originTrialPages(dist: string, emitted: ReadonlySet<string> = new Set()): string[] {
  return walk(dist)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => {
      const rel = toPosix(relative(dist, f))
      if (emitted.has(rel)) return false
      return rel === 'index.html' || rel === 'for-agents.html' || rel.startsWith('m/')
    })
}

/**
 * Adds the meta unless an origin-trial meta is already there. It goes right after the charset meta, so a long token
 * never pushes the charset declaration past the first 1024 bytes the browser scans; without a charset meta it goes
 * just before `</head>`.
 */
export function injectMeta(html: string, meta: string): string {
  if (/http-equiv=["']?origin-trial/i.test(html)) return html
  const charset = /<meta\s[^>]*charset\s*=[^>]*>/i.exec(html)
  const head = /<\/head\s*>/i.exec(html)
  if (charset && (!head || charset.index < head.index)) {
    const at = charset.index + charset[0].length
    return html.slice(0, at) + meta + html.slice(at)
  }
  if (head) return html.slice(0, head.index) + meta + html.slice(head.index)
  return html
}

/**
 * Request path to a file under `dir`; null when outside or missing. Vite strips the base path before the
 * middlewares run (`/modules/modules.json` arrives as `/modules.json`), so a path with or without the base works.
 */
export function resolveDevFile(dir: string, base: string, url: string): string | null {
  let pathname: string
  try {
    pathname = decodeURIComponent(url.split(/[?#]/)[0] ?? '')
  } catch {
    return null
  }
  const b = base === '/' ? '' : `/${base.replace(/^\/+|\/+$/g, '')}`
  if (b && (pathname === b || pathname.startsWith(`${b}/`))) pathname = pathname.slice(b.length)
  const rel = pathname.replace(/^\/+/, '')
  if (rel === '' || rel.split('/').includes('..')) return null
  const file = resolve(dir, rel)
  if (!file.startsWith(resolve(dir) + sep)) return null
  return existsSync(file) && statSync(file).isFile() ? file : null
}

/** Spec 7.11: the HTML of `/` is at most 60 KB gzip; the build warns from 90 % of it (review r3) and fails above it. */
export const HOME_HTML_MAX_GZIP = 60 * 1024
export const HOME_HTML_WARN_SHARE = 0.9
/** zlib's default, what a web server compresses with on the fly (review r4: level 9 hid 1.1 KB of the budget). */
export const HOME_HTML_GZIP_LEVEL = 6

/** Gzip size of `dist/index.html` against the budget, or null when there is no home page. */
export function homeHtmlBudget(dist: string): { gzip: number; max: number; share: number } | null {
  const file = join(dist, 'index.html')
  if (!existsSync(file)) return null
  const gzip = gzipSync(readFileSync(file), { level: HOME_HTML_GZIP_LEVEL }).length
  return { gzip, max: HOME_HTML_MAX_GZIP, share: gzip / HOME_HTML_MAX_GZIP }
}

/** The line the build prints for the home page budget, or null below the warning share. */
export function homeHtmlBudgetMessage(b: { gzip: number; max: number; share: number }): string | null {
  const kb = (n: number): string => `${(n / 1024).toFixed(1)} KB`
  if (b.share > 1) return `over budget: index.html ${kb(b.gzip)} gzip > ${kb(b.max)} (spec 7.11)`
  if (b.share >= HOME_HTML_WARN_SHARE)
    return `index.html ${kb(b.gzip)} gzip is ${Math.round(b.share * 100)}% of the ${kb(b.max)} budget (spec 7.11)`
  return null
}

const TEXT_FILES = new Set(['.html', '.json', '.md', '.txt', '.xml', '.svg', '.js', '.css', '.webmanifest'])

/** Text files of dist (POSIX path -> text), for checks over everything the site serves. */
export function* distTexts(dist: string): Generator<[string, string]> {
  for (const f of walk(dist))
    if (TEXT_FILES.has(extname(f))) yield [toPosix(relative(dist, f)), readFileSync(f, 'utf8')]
}

export function omData(opts: OmDataOptions = {}): AstroIntegration {
  let generated = opts.generated ?? ''
  let publicDir = ''
  let base = '/'
  return {
    name: 'om-data',
    hooks: {
      'astro:config:setup': ({ config, logger }) => {
        const root = fileURLToPath(config.root)
        generated = generated ? resolve(root, generated) : join(root, 'site', '.generated')
        publicDir = fileURLToPath(config.publicDir)
        base = config.base
        const pub = join(generated, 'public')
        if (!existsSync(pub)) {
          logger.warn(`${pub} does not exist; run yarn om emit first (published data files are missing)`)
          return
        }
        const clash = collisions(pub, publicDir)
        if (clash.length > 0)
          throw new Error(`om-data: site/public and the emitter both write: ${clash.slice(0, 10).join(', ')}`)
      },
      'astro:server:setup': ({ server }) => {
        const pub = join(generated, 'public')
        server.middlewares.use((req, res, next) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') return next()
          const file = resolveDevFile(pub, base, req.url ?? '')
          if (!file) return next()
          res.setHeader('Content-Type', CONTENT_TYPES[extname(file)] ?? 'application/octet-stream')
          res.setHeader('Cache-Control', 'no-store')
          if (req.method === 'HEAD') return res.end()
          createReadStream(file).pipe(res)
        })
      },
      'astro:build:done': ({ dir, logger }) => {
        const dist = fileURLToPath(dir)
        const budget = homeHtmlBudget(dist)
        const note = budget ? homeHtmlBudgetMessage(budget) : null
        // over the budget the build fails, so CI stops a growing catalog before / gets heavy (review r4)
        if (note && budget && budget.share > 1) throw new Error(`om-data: ${note}`)
        if (note) logger.warn(note)
        const pub = join(generated, 'public')
        if (!existsSync(pub)) {
          logger.warn(`${pub} does not exist; dist/ has no published data files (run yarn om emit)`)
          return
        }
        const r = copyGenerated(pub, dist)
        if (r.collisions.length > 0)
          throw new Error(`om-data: a page or site/public already wrote: ${r.collisions.slice(0, 10).join(', ')}`)
        logger.info(`copied ${r.copied} published files from ${toPosix(relative(process.cwd(), pub))}`)
        // no page, data file or script points into someone's machine (round 5: preview runs linked file:///Users/...)
        const leaks = localPathLeaks(distTexts(dist))
        if (leaks.length > 0)
          throw new Error(
            `om-data: ${leaks.length} files in dist contain a local path: ${leaks
              .slice(0, 5)
              .map((l) => `${l.path} (${l.hit})`)
              .join('; ')}`,
          )
        const metaFile = join(generated, 'data', 'site.json')
        const meta = existsSync(metaFile) ? (JSON.parse(readFileSync(metaFile, 'utf8')) as SiteMeta) : null
        if (meta?.originTrial) {
          const tag = `<meta http-equiv="origin-trial" content="${meta.originTrial.token.replace(/"/g, '&quot;')}">`
          const emitted = new Set(walk(pub).map((f) => toPosix(relative(pub, f))))
          for (const f of originTrialPages(dist, emitted)) writeFileSync(f, injectMeta(readFileSync(f, 'utf8'), tag))
        }
      },
    },
  }
}

export default omData
