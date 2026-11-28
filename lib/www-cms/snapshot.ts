// The `www-content` snapshot (Strapi CMS spec 2026-11-27-www-strapi-cms.md, Components and API Contracts, `pages`
// workflow; Step 4.1): the tree a pull wrote, as the snapshot job commits it, and any such tree laid over www/ of the
// checkout for a build. A tree is laid out as www/ and as `www-pull --snapshot` reads it: content/ (the files a Strapi
// type holds; no embeds, no import manifest), public/media/, public/files/, manifest.json. In the snapshot,
// redirects.yaml holds only its rules of source `manual`: a build that uses a snapshot takes the other rules (and their
// comments) from its own checkout, so generated redirects always come from the commit being built.
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { splitRedirects } from './files.ts'
import { heldByStrapi, MEDIA_ROOTS, walk } from './tree.ts'

const REDIRECTS = 'redirects.yaml'

const slash = (p: string): string => p.split('\\').join('/')

/** The manual rules of a redirects.yaml as text: the whole file when it holds only them, empty when it has none. */
export function manualRedirects(text: string): string {
  return text.slice(splitRedirects(text).kept.length)
}

/** The files of a tree, checked: regular files only, content files at paths a Strapi type holds. */
function treeFiles(dir: string): { content: string[]; media: string[] } {
  if (!existsSync(join(dir, 'content')) || !existsSync(join(dir, 'manifest.json')))
    throw new Error(`${dir} is not a content tree of www-pull: content/ and manifest.json are expected`)
  const regular = (abs: string) => {
    if (!lstatSync(abs).isFile()) throw new Error(`${slash(relative(dir, abs))}: not a regular file`)
    return abs
  }
  const content = walk(join(dir, 'content')).map((abs) => {
    const path = slash(relative(join(dir, 'content'), regular(abs)))
    if (!heldByStrapi(path)) throw new Error(`content/${path}: not a file a Strapi type holds`)
    return path
  })
  const media = MEDIA_ROOTS.flatMap((root) =>
    walk(join(dir, 'public', root)).map((abs) => slash(relative(join(dir, 'public'), regular(abs)))),
  )
  return { content, media }
}

const copy = (from: string, to: string) => {
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to)
}

/** Writes the snapshot of a pulled tree to `dest` (emptied first): the tree as it is, redirects.yaml manual rules only. */
export function snapshotTree(pulled: string, dest: string): void {
  const { content, media } = treeFiles(pulled)
  rmSync(dest, { recursive: true, force: true })
  for (const p of content) {
    const to = join(dest, 'content', p)
    if (p === REDIRECTS) {
      mkdirSync(dirname(to), { recursive: true })
      writeFileSync(to, manualRedirects(readFileSync(join(pulled, 'content', p), 'utf8')))
    } else copy(join(pulled, 'content', p), to)
  }
  for (const p of media) copy(join(pulled, 'public', p), join(dest, 'public', p))
  copy(join(pulled, 'manifest.json'), join(dest, 'manifest.json'))
}

/**
 * Lays a tree (a pull's, or a snapshot) over the site tree `www`: every content file a Strapi type holds is replaced
 * by the tree's (embeds and the import manifest stay), redirects.yaml becomes the checkout's rules of other sources
 * followed by the tree's manual rules, and public/media and public/files become the tree's. The tree is checked first,
 * so a tree that is not one changes nothing.
 */
export function applyTree(from: string, www: string): { content: number; media: number } {
  const { content, media } = treeFiles(from)
  const checkout = join(www, 'content', REDIRECTS)
  const kept = existsSync(checkout) ? splitRedirects(readFileSync(checkout, 'utf8')).kept : ''
  const own = join(from, 'content', REDIRECTS)
  const manual = existsSync(own) ? manualRedirects(readFileSync(own, 'utf8')) : ''

  for (const abs of walk(join(www, 'content'))) {
    const path = slash(relative(join(www, 'content'), abs))
    if (heldByStrapi(path)) rmSync(abs)
  }
  for (const p of content) if (p !== REDIRECTS) copy(join(from, 'content', p), join(www, 'content', p))
  writeFileSync(checkout, `${kept}${manual}`)
  for (const root of MEDIA_ROOTS) {
    rmSync(join(www, 'public', root), { recursive: true, force: true })
    mkdirSync(join(www, 'public', root), { recursive: true })
  }
  for (const p of media) copy(join(from, 'public', p), join(www, 'public', p))
  return { content: content.length, media: media.length }
}
