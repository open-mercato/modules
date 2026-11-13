// The deploy layout of dist for Cloudflare Pages (move of 13 Nov, lib/core/site-host.ts). At the domain root (the
// default) nothing here runs: Astro writes the site to dist as before. Under a base path the Astro integration
// pagesLayout() writes the site to dist/<base>/ (so the Pages project serves the prefix itself and the proxy of the main
// site passes /modules/* through unchanged), then finishNestedLayout() leaves at the root of dist only what Pages and
// the fixed addresses need: 404.html, _routes.json, _redirects, schema/, templates.json and picker.json.
// checkPagesLayout() proves a built dist matches its config (`yarn om pages-site --check`, pages.yml).
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { AstroIntegration } from 'astro'
import { DEFAULT_SITE_ORIGIN, schemaUrl } from '../core/home.ts'
import {
  FIXED_ROOT_FILES,
  isNested,
  pagesRedirects,
  pagesRoutes,
  SCHEMA_DIR,
  siteConfig,
  siteDir,
  type SiteConfig,
} from '../core/site-host.ts'
import { PUBLISHED_SCHEMAS } from '../schema/json-schema.ts'

/** Files of the Pages project root that the nested layout keeps outside the site folder. */
export const ROOT_FILES = ['404.html', '_routes.json', '_redirects'] as const

/** Pages reads these only at the root of the upload; inside the site folder they would be stray files. */
const ROOT_ONLY = ['_routes.json', '_redirects'] as const

/**
 * Lays dist out for a nested site: `root` is the upload folder (dist), the site is already in root/<base>/. Moves the
 * Pages config files to the root (rewritten for the base), copies 404.html there (Pages needs a top-level 404.html, or
 * it treats the upload as a single-page app), and copies schema/, templates.json and picker.json there, so the fixed
 * $id addresses and the addresses released create-mercato-app versions fetch answer on the Pages host. The site keeps
 * its own copies of all of them (the 404 page under the base, the WebMCP script fetching tools-1.json from its own
 * origin, and the data files of the site).
 */
export function finishNestedLayout(root: string, c: SiteConfig): void {
  const site = join(root, siteDir(c))
  for (const f of ROOT_ONLY) rmSync(join(site, f), { force: true })
  writeFileSync(join(root, '_routes.json'), `${JSON.stringify(pagesRoutes(c.base), null, 2)}\n`)
  writeFileSync(join(root, '_redirects'), pagesRedirects(c.base))
  if (existsSync(join(site, '404.html'))) cpSync(join(site, '404.html'), join(root, '404.html'))
  if (existsSync(join(site, SCHEMA_DIR))) cpSync(join(site, SCHEMA_DIR), join(root, SCHEMA_DIR), { recursive: true })
  for (const f of FIXED_ROOT_FILES) if (existsSync(join(site, f))) cpSync(join(site, f), join(root, f))
}

/**
 * Astro integration, listed last in astro.config.ts so it runs after the sitemap and the published files. Under a base
 * path it moves outDir to <outDir>/<base> (the configured outDir and `astro build --outDir` alike), empties the whole
 * upload folder when a build starts (Astro empties only its own outDir, and a root file of an earlier build must not
 * ship), and finishes the layout when the build is done. At the domain root it changes nothing.
 */
export function pagesLayout(): AstroIntegration {
  let config: SiteConfig | null = null
  let root = ''
  let building = false
  return {
    name: 'om-pages-layout',
    hooks: {
      'astro:config:setup': ({ config: astro, command, updateConfig }) => {
        if (astro.base.replace(/^\/+|\/+$/g, '') === '') return
        config = siteConfig(astro.site ?? DEFAULT_SITE_ORIGIN, astro.base)
        root = fileURLToPath(astro.outDir)
        const project = fileURLToPath(astro.root)
        if (resolve(project) === resolve(root) || !relative(resolve(root), resolve(project)).startsWith('..'))
          throw new Error(`om-pages-layout: outDir ${root} holds the project; refusing to lay the site out there`)
        building = command === 'build'
        updateConfig({ outDir: pathToFileURL(`${join(root, siteDir(config))}/`) })
      },
      'astro:build:start': () => {
        if (config && building) rmSync(root, { recursive: true, force: true })
      },
      'astro:build:done': ({ logger }) => {
        if (!config) return
        finishNestedLayout(root, config)
        logger.info(
          `site in ${siteDir(config)}/; ${[...ROOT_FILES, ...FIXED_ROOT_FILES].join(', ')} and ${SCHEMA_DIR}/ at the root of the upload`,
        )
      },
    },
  }
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

/** Values of href, src, srcset, poster and action, and the URL of a meta refresh, outside script and style bodies. */
export function htmlRefs(html: string): string[] {
  const tags = html
    .replace(/<script\b([^>]*)>[\s\S]*?<\/script\s*>/gi, '<script$1></script>')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
  const refs: string[] = []
  for (const m of tags.matchAll(/\s(href|src|srcset|poster|action|content)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const name = (m[1] ?? '').toLowerCase()
    const value = (m[2] ?? m[3] ?? '').replace(/&amp;/g, '&')
    if (name === 'srcset') refs.push(...value.split(',').map((s) => s.trim().split(/\s+/)[0] ?? ''))
    else if (name === 'content') {
      const refresh = /^\s*\d+\s*;\s*url\s*=\s*(.+)$/i.exec(value)?.[1]
      if (refresh) refs.push(refresh.trim())
    } else refs.push(value)
  }
  return refs.filter((r) => r !== '')
}

const NOT_A_PAGE = /^(?:#|mailto:|tel:|data:|javascript:|about:)/i
const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i

/**
 * Why a link of a page breaks under the base, or null when it holds. `page` is the page's path on the site's origin
 * (`/modules/m/@x/y`). A link is fine when it is absolute to another origin, or when it resolves under the base.
 */
export function linkProblem(ref: string, page: string, c: SiteConfig): string | null {
  if (NOT_A_PAGE.test(ref)) return null
  let resolved: URL
  try {
    resolved = new URL(ref, `${c.origin}${page}`)
  } catch {
    return `not a URL: ${ref}`
  }
  if (ABSOLUTE.test(ref) && resolved.origin !== c.origin) return null
  if (!isNested(c)) return null
  if (resolved.pathname === c.base || resolved.pathname.startsWith(`${c.base}/`)) return null
  return `outside ${c.base}: ${ref}`
}

/** Path of an HTML file of the site on its origin: `index.html` is the folder, other pages lose `.html`. */
function pagePath(rel: string, c: SiteConfig): string {
  const b = isNested(c) ? c.base : ''
  if (rel === 'index.html') return `${b}/`
  return `${b}/${rel.replace(/(?:^|\/)index\.html$/, '/').replace(/\.html$/, '')}`
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * What in `root` (a built dist) does not match the layout of `c`, as one line per problem (at most `max`). Checks the
 * root files and their content, the fixed `$id` of every schema at the root, the site files in their folder, the
 * `$schema` of modules.json and, nested, that templates.json and picker.json sit at the root as copies of the site's,
 * that nothing else sits at the root and every link of every page stays under the base.
 */
export function checkPagesLayout(root: string, c: SiteConfig, max = 50): string[] {
  const problems: string[] = []
  const say = (m: string): void => {
    if (problems.length < max) problems.push(m)
  }
  if (!existsSync(root)) return [`${root} does not exist`]
  const site = join(root, siteDir(c))
  const shown = (f: string): string => toPosix(relative(process.cwd(), f)) || '.'

  for (const f of ROOT_FILES) if (!existsSync(join(root, f))) say(`${shown(join(root, f))} is missing`)
  const routes = readJson(join(root, '_routes.json'))
  if (routes !== undefined && JSON.stringify(routes) !== JSON.stringify(pagesRoutes(c.base)))
    say(`${shown(join(root, '_routes.json'))} is not ${JSON.stringify(pagesRoutes(c.base))}`)
  if (existsSync(join(root, '_redirects')) && readFileSync(join(root, '_redirects'), 'utf8') !== pagesRedirects(c.base))
    say(`${shown(join(root, '_redirects'))} differs from pagesRedirects(${c.base})`)
  for (const name of PUBLISHED_SCHEMAS) {
    const file = join(root, SCHEMA_DIR, `${name}-1.json`)
    if (!existsSync(file)) {
      say(`${shown(file)} is missing`)
      continue
    }
    const id = (readJson(file) as { $id?: unknown } | undefined)?.$id
    if (id !== schemaUrl(name)) say(`${shown(file)}: $id is ${String(id)}, not ${schemaUrl(name)}`)
  }
  for (const f of ['index.html', 'modules.json', '404.html'])
    if (!existsSync(join(site, f))) say(`${shown(join(site, f))} is missing`)
  const index = readJson(join(site, 'modules.json')) as { $schema?: unknown } | undefined
  if (index && index.$schema !== schemaUrl('modules'))
    say(`${shown(join(site, 'modules.json'))}: $schema is ${String(index.$schema)}, not ${schemaUrl('modules')}`)

  if (!isNested(c)) return problems
  for (const f of FIXED_ROOT_FILES) {
    const copy = join(root, f)
    if (!existsSync(join(site, f))) say(`${shown(join(site, f))} is missing`)
    if (!existsSync(copy)) say(`${shown(copy)} is missing (released create-mercato-app versions fetch it there)`)
    else if (existsSync(join(site, f)) && !readFileSync(copy).equals(readFileSync(join(site, f))))
      say(`${shown(copy)} differs from ${shown(join(site, f))}`)
  }
  const top = siteDir(c).split('/')[0] as string
  const allowed = new Set<string>([...ROOT_FILES, SCHEMA_DIR, ...FIXED_ROOT_FILES, top])
  for (const name of readdirSync(root)) if (!allowed.has(name)) say(`${shown(join(root, name))} sits outside the site`)
  for (const f of ROOT_ONLY) if (existsSync(join(site, f))) say(`${shown(join(site, f))} belongs at the root`)
  const pages = [...walk(site).filter((f) => f.endsWith('.html')), join(root, '404.html')].filter((f) => existsSync(f))
  for (const f of pages) {
    const page = f === join(root, '404.html') ? '/404' : pagePath(toPosix(relative(site, f)), c)
    for (const ref of htmlRefs(readFileSync(f, 'utf8'))) {
      const p = linkProblem(ref, page, c)
      if (p) say(`${shown(f)}: ${p}`)
    }
  }
  return problems
}
