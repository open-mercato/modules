// Screenshots of an entry (descriptor `screenshots`, 26 Oct): a file the catalog hosts is copied into the site at
// `shots/<folder>/<name>` (the descriptor's folder under modules/) and gets a site-relative src with the base path;
// an https src (the module's own GitHub repository or a GitHub attachment) stays as it is. Pure: load.ts reads the bytes.
import { isHostedScreenshot } from '../schema/descriptor.ts'
import type { LoadedDescriptor } from './types.ts'

export interface PublishedScreenshots {
  /** For IndexEntry.screenshots, in the order of the descriptor. */
  list: { src: string; alt: string }[]
  /** Published path and bytes of each hosted file. */
  files: [string, Uint8Array][]
}

/** `/modules` for a base of `/modules/` or `modules`, `` for `/`. */
export const basePrefix = (base: string): string => {
  const b = base.replace(/^\/+|\/+$/g, '')
  return b === '' ? '' : `/${b}`
}

/**
 * Published path of a hosted screenshot: the descriptor's folder without its first segment (`modules/@acme/x.yml` +
 * `screenshots/a.webp` = `shots/@acme/a.webp`; `modules/x.yml` = `shots/a.webp`).
 */
export function shotPath(descriptorFile: string, src: string): string {
  const parts = descriptorFile.split('/').slice(1, -1)
  const name = src.slice(src.lastIndexOf('/') + 1)
  return ['shots', ...parts, name].join('/')
}

/**
 * The screenshots an entry publishes. A hosted file load.ts could not read (missing, over the size limit) is left out;
 * load.ts warned about it and `validate` fails the pull request that brings it.
 */
export function publishedScreenshots(d: LoadedDescriptor, base: string): PublishedScreenshots {
  const out: PublishedScreenshots = { list: [], files: [] }
  for (const s of d.descriptor?.screenshots ?? []) {
    if (!isHostedScreenshot(s.src)) {
      out.list.push({ src: s.src, alt: s.alt })
      continue
    }
    const bytes = d.screenshotFiles?.get(s.src)
    if (!bytes) continue
    const path = shotPath(d.file, s.src)
    out.list.push({ src: `${basePrefix(base)}/${path}`, alt: s.alt })
    if (!out.files.some(([p]) => p === path)) out.files.push([path, bytes])
  }
  return out
}
