// Writes test/fixtures/webflow/published/: public pages of www.openmercato.com as Webflow served them on 27 Nov 2026,
// for the tests of lib/import-webflow/published.ts. Scripts, styles and SVG drawings are cut (the reader never looks
// at them; the rich-text embed of a post keeps its own, which is what the test reads). Run
// `node test/fixtures/webflow/published/trim.ts`, then `yarn prettier --write test/fixtures/webflow/published`.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const ORIGIN = 'https://www.openmercato.com'

/** The pages the tests read: two the fixture export holds, two Webflow added after it, and the case study list. */
export const PAGES = [
  '/case-studies/arvo-configurator',
  '/blog-posts/wms-module-open-source',
  '/case-studies/fondaco-warehouse-receiving-pallet-counts',
  '/blog-posts/safety-stock-calculator',
  '/case-studies',
]

/** Cuts what the reader never reads; a rich-text embed (`data-rt-embed-type`) keeps its scripts and styles. */
export function trim(html: string): string {
  const parts = html.split(/(<div data-rt-embed-type="true">[\s\S]*?<\/section><\/div>)/)
  return parts
    .map((p, i) =>
      i % 2 === 1
        ? p
        : p
            .replace(/<script\b[\s\S]*?<\/script>/g, '')
            .replace(/<style\b[\s\S]*?<\/style>/g, '')
            .replace(/<svg\b[\s\S]*?<\/svg>/g, '<svg></svg>')
            .replace(/<link\b[^>]*>/g, ''),
    )
    .join('')
}

async function main(): Promise<void> {
  for (const path of PAGES) {
    const res = await fetch(`${ORIGIN}${path}`, {
      headers: { 'user-agent': 'open-mercato-webflow-export (read-only)' },
    })
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
    writeFileSync(join(OUT, `${path.slice(1).replace(/\//g, '__')}.html`), trim(await res.text()))
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
