// The link rules of Markdown bodies (www/src/lib/body-html.ts) for this build, read from www/content/ when the Astro
// config loads: the published posts a body may link, and the site paths the www build serves. Node only (the config).
// A collection adds its routes here when it gets them (case studies, partners and jobs in Phase 4, pages and landings
// in Phase 5 and 6); until then a link to one of its pages points at the live site.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { MAIN_SITE_ORIGIN } from '../lib/core/main-site.ts'
import { BLOG_PATH } from './src/lib/blog.ts'
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

/** Site paths every www build serves: its fixed routes, its files and the catalog under /run. */
export function servesFixed(path: string): boolean {
  return (
    path === '/' ||
    path === BLOG_PATH ||
    path === '/run' ||
    path.startsWith('/run/') ||
    path.startsWith('/media/') ||
    path.startsWith('/files/')
  )
}

export function bodyLinkRules(content: string): LinkRules {
  return { origin: MAIN_SITE_ORIGIN, posts: new Set(publishedIds(join(content, 'blog'))), serves: servesFixed }
}
