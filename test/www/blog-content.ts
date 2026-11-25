// The blog entries of www/content/ as the build sees them: frontmatter through the schemas of lib/schema/www-content.ts.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { blogSchema } from '../../lib/schema/www-content.ts'
import type { PostEntry } from '../../www/src/lib/blog.ts'
import { frontmatter } from '../../www/body-links.ts'
import { ROOT } from '../emit/helpers.ts'

export const CONTENT = join(ROOT, 'www', 'content')

export function blogEntries(): PostEntry[] {
  const dir = join(CONTENT, 'blog')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => ({
      id: f.slice(0, -3),
      // references are slugs here (slugRef)
      data: blogSchema().parse(frontmatter(readFileSync(join(dir, f), 'utf8'))) as PostEntry['data'],
    }))
}

export function names(file: string): Map<string, string> {
  const data = parse(readFileSync(join(CONTENT, file), 'utf8')) as Record<string, { name: string }>
  return new Map(Object.entries(data).map(([id, v]) => [id, v.name]))
}
