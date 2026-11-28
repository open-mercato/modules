// The content tree of the main site on disk, as www-push reads it and www-pull writes and compares it (Strapi CMS
// spec, API Contracts): a root laid out as `www/` with `content/`, `public/media/` and `public/files/`. Paths are
// `/`-separated: under content/ (`blog/x.md`) for content files, site paths (`/media/blog/x.png`) for media.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { entriesOf, NOT_IN_STRAPI, sourceOf, type ContentFile } from './files.ts'
import type { FileEntry } from './model.ts'

/** The media folders of the site under public/. */
export const MEDIA_ROOTS = ['media', 'files'] as const

/** Every file under `dir`, as absolute paths, sorted; none when `dir` does not exist. */
export function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))
}

const slash = (p: string): string => p.split('\\').join('/')

/** The content files of a content folder that a Strapi type holds, by source, and the paths no type holds. */
export function readContent(contentDir: string): { bySource: Map<string, ContentFile[]>; other: string[] } {
  const bySource = new Map<string, ContentFile[]>()
  const other: string[] = []
  for (const abs of walk(contentDir)) {
    const path = slash(relative(contentDir, abs))
    const source = sourceOf(path)
    if (source === undefined) {
      other.push(path)
      continue
    }
    bySource.set(source, [...(bySource.get(source) ?? []), { path, text: readFileSync(abs, 'utf8') }])
  }
  return { bySource, other }
}

/** True for a content path a Strapi type holds (the pull owns it), false for embeds, the import manifest and others. */
export function heldByStrapi(path: string): boolean {
  return sourceOf(path) !== undefined && !NOT_IN_STRAPI.some((n) => n.match.test(path))
}

/** The entries of every content file of a source. */
export function entriesOfSource(source: string, files: readonly ContentFile[]): FileEntry[] {
  return files.flatMap((f) => entriesOf(source, f))
}

/** The media files of a public folder by site path (`/media/blog/x.png`), with their absolute path. */
export function readMedia(publicDir: string): { path: string; abs: string }[] {
  return MEDIA_ROOTS.flatMap((root) =>
    walk(join(publicDir, root)).map((abs) => ({ path: `/${slash(relative(publicDir, abs))}`, abs })),
  )
}
