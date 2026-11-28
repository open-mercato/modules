// A small copy of the main site's content tree for the tests of www-push and www-pull: every dictionary, single file
// and landing (the landings relate to each other), a few pages, posts (one of them a draft), a case study with the
// partner that delivered it, the job, redirects.yaml with one manual rule after the kept part, and exactly the media
// files those entries use plus one site file, laid out as `www/` (content/, public/media/, public/files/).
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { entriesOf, sourceOf } from '../../lib/www-cms/files.ts'
import { toDocument, typeOf, type MediaIndex } from '../../lib/www-cms/model.ts'
import { walk } from '../../lib/www-cms/tree.ts'

export const ROOT = join(import.meta.dirname, '..', '..')
const WWW = join(ROOT, 'www')

/** The content files of the copy, by path under www/content. */
export const MINI_FILES = [
  'authors.yaml',
  'blog-categories.yaml',
  'case-study-categories.yaml',
  'partner-tiers.yaml',
  'partner-industries.yaml',
  'partner-services.yaml',
  'partner-languages.yaml',
  'partner-locations.yaml',
  'navigation.json',
  'footer.json',
  'landing-template.yaml',
  'redirects.yaml',
  'pages/home.yaml',
  'pages/pricing.yaml',
  'pages/blog.yaml',
  'blog/ceo-real-playbook-for-ai.md',
  'blog/10-it-department-fears-about-open-mercato-answered-honestly.md',
  'case-studies/arvo-configurator.md',
  'partners/the-good-code.md',
  'jobs',
  'landings',
] as const

/** The manual rule the copy's redirects.yaml ends with (a document of the type `redirect`). */
export const MANUAL_RULE = '- from: /old-pricing\n  to: /pricing\n  status: 301\n  source: manual\n'

/** A site file no entry uses: pushed and pulled as every other file of www/public/files. */
export const SITE_FILE = '/files/site/custom-checkbox-checkmark.svg'

/** Builds the copy in a new temporary directory; returns its root (the `www` of the copy) and its media paths. */
export function miniTree(): { dir: string; media: string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'www-mini-'))
  for (const f of MINI_FILES) cpSync(join(WWW, 'content', f), join(dir, 'content', f), { recursive: true })
  const redirects = join(dir, 'content', 'redirects.yaml')
  writeFileSync(redirects, `${readFileSync(redirects, 'utf8')}${MANUAL_RULE}`)
  const used = new Set<string>([SITE_FILE])
  const recorder: MediaIndex = {
    toMedia(path) {
      used.add(path)
      return { id: 0, documentId: path, name: path, url: path, ext: '', mime: '', hash: '' }
    },
    toPath: (f) => f.documentId,
  }
  for (const abs of walk(join(dir, 'content'))) {
    const path = abs.slice(join(dir, 'content').length + 1)
    const source = sourceOf(path)
    if (!source) continue
    const type = typeOf(source)
    for (const e of entriesOf(source, { path, text: readFileSync(abs, 'utf8') }))
      toDocument(type, e, { media: recorder })
  }
  for (const p of used) {
    mkdirSync(dirname(join(dir, 'public', p)), { recursive: true })
    cpSync(join(WWW, 'public', p), join(dir, 'public', p))
  }
  return { dir, media: [...used].sort() }
}
