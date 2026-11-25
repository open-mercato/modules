// The link rules of Markdown bodies (www/src/lib/body-html.ts) for this build, read from www/content/ when the Astro
// config loads: the published posts, case studies, partners and jobs a body may link, and the site paths the www build
// serves; and the posts the sitemap leaves out. Node only (the config).
// A collection adds its routes here when it gets them (pages and landings in Phase 5 and 6); until then a link to one
// of its pages points at the live site.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { MAIN_SITE_ORIGIN } from '../lib/core/main-site.ts'
import { BLOG_PATH, POST_PREFIX, postPath } from './src/lib/blog.ts'
import { CASE_STUDIES_PATH, CASE_STUDY_PREFIX } from './src/lib/case-studies.ts'
import { JOB_PREFIX } from './src/lib/jobs.ts'
import { PARTNER_PREFIX, PARTNERS_PATH } from './src/lib/partners.ts'
import type { LinkRules } from './src/lib/body-html.ts'

/** The frontmatter of a Markdown file, or `{}`. */
export function frontmatter(text: string): Record<string, unknown> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  const data = m ? (parse(m[1]!) as unknown) : undefined
  return data !== null && typeof data === 'object' ? (data as Record<string, unknown>) : {}
}

/** Ids of the Markdown entries of a collection folder that are not drafts. */
export function publishedIds(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('.'))
    .filter((f) => frontmatter(readFileSync(join(dir, f), 'utf8')).draft !== true)
    .map((f) => f.slice(0, -3))
    .sort()
}

/** Site paths of the published posts that ask for noindex (seo.noindex): kept out of the sitemap. */
export function noindexPostPaths(content: string): Set<string> {
  const dir = join(content, 'blog')
  return new Set(
    publishedIds(dir)
      .filter((id) => {
        const seo = frontmatter(readFileSync(join(dir, `${id}.md`), 'utf8')).seo as { noindex?: unknown } | undefined
        return seo?.noindex === true
      })
      .map((id) => postPath(id)),
  )
}

/** Site paths every www build serves: its fixed routes, its files and the catalog under /run. */
export function servesFixed(path: string): boolean {
  return (
    path === '/' ||
    path === BLOG_PATH ||
    path === CASE_STUDIES_PATH ||
    path === PARTNERS_PATH ||
    path === '/run' ||
    path.startsWith('/run/') ||
    path.startsWith('/media/') ||
    path.startsWith('/files/')
  )
}

/** The folder under www/content/ of each detail route, by the route's prefix. */
export const DETAIL_FOLDERS: Record<string, string> = {
  [POST_PREFIX]: 'blog',
  [CASE_STUDY_PREFIX]: 'case-studies',
  [PARTNER_PREFIX]: 'partners',
  [JOB_PREFIX]: 'jobs',
}

/** The published entries of each detail route, by its first path segment (`blog-posts`, `case-studies`, ...). */
export function detailIds(content: string): Map<string, Set<string>> {
  return new Map(
    Object.entries(DETAIL_FOLDERS).map(([prefix, dir]) => [
      prefix.slice(1, -1),
      new Set(publishedIds(join(content, dir))),
    ]),
  )
}

export function bodyLinkRules(content: string): LinkRules {
  return { origin: MAIN_SITE_ORIGIN, details: detailIds(content), serves: servesFixed }
}
