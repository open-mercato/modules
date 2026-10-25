// Nothing the site publishes points into someone's machine (round 5). A preview receipt (harness/local, Docker on the
// maintainer's machine) records its run as a `file://` URL of the local log folder, and an author's README can link a
// file by its absolute path on the author's disk. Such links are dead for every reader and leak a home folder, so the
// emitter publishes a preview run as the receipt's own page and keeps only the text of a local link. `localPathLeaks`
// is the check behind it: the build fails when any published file still contains one.

import type { Facts, Receipt } from '../schema/data/index.ts'

/**
 * What no published file may contain: a `file:` URL or a macOS home folder. Linux `/home/` is left to the README
 * cleanup only, because CI logs quote the harness user's own folder (`/home/om-cell/app`) on purpose.
 */
export const LOCAL_PATH_RE = /file:\/\/|\/Users\//i
/** A local path in author text (README excerpts). */
const AUTHOR_LOCAL_RE = /file:\/\/|\/Users\/|\/home\//i

/** Markdown link to a local target: `[text](file:///...)`, `[text](/Users/me/x.ts)`, `[text](/home/me/x)`. */
const LOCAL_LINK_RE = /\[([^\]\n]*)\]\(\s*<?(?:file:\/\/|\/Users\/|\/home\/)[^)\n]*\)/gi

/**
 * Author text without local paths: a markdown link to a local file keeps its text, a bare `file://` URL becomes
 * `(local file)` and a home folder `~/`. Text without one is returned unchanged.
 */
export function stripLocalPaths(text: string): string {
  if (!AUTHOR_LOCAL_RE.test(text)) return text
  return text
    .replace(LOCAL_LINK_RE, (_, label: string) => label)
    .replace(/file:\/\/[^\s)>\]"']*/gi, '(local file)')
    .replace(/\/Users\/[^/\s)>\]"']+\//gi, '~/')
}

/**
 * The published copy of a receipt. A run URL that is not `https:` (a preview run's local log folder) becomes the
 * receipt's own page, which says where the run happened; `harness.runner` keeps saying `preview-docker`.
 */
export function publicReceipt(r: Receipt, site: string): Receipt {
  if (/^https:\/\//i.test(r.run.url)) return r
  return { ...r, run: { ...r.run, url: `${site.replace(/\/+$/, '')}/r/${r.id}` } }
}

/** The published copy of a facts document: the README excerpt without local paths. */
export function publicFacts(f: Facts): Facts {
  const readme = f.readmeExcerpt
  if (readme === null || !AUTHOR_LOCAL_RE.test(readme)) return f
  return { ...f, readmeExcerpt: stripLocalPaths(readme) }
}

/** Published files (path -> text) that still contain a local path, with the first hit of each. */
export function localPathLeaks(files: Iterable<[string, string]>): { path: string; hit: string }[] {
  const out: { path: string; hit: string }[] = []
  for (const [path, text] of files) {
    const m = LOCAL_PATH_RE.exec(text)
    if (m) out.push({ path, hit: text.slice(Math.max(0, m.index - 20), m.index + 60).replace(/\s+/g, ' ') })
  }
  return out
}
