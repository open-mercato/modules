import { describe, expect, it } from 'vitest'
import { buildDocsMap, sitemapPaths } from '../../lib/import-webflow/docs-map.ts'
import { markdownFile, toYaml } from '../../lib/import-webflow/output.ts'
import {
  cdnFile,
  emptyTally,
  formatProseDate,
  mediaFileName,
  parseProseDate,
  replaceCounts,
  replaceDashes,
  rewriteLink,
  updatedAfter,
} from '../../lib/import-webflow/text.ts'
import type { WfItem } from '../../lib/import-webflow/export.ts'

const EM = '—'
const EN = '–'

describe('lib/import-webflow/text.ts (Text, Links, Dates)', () => {
  it('A5: writes long dashes as "-" and counts them; drops invisible characters', () => {
    const t = emptyTally()
    expect(replaceDashes(`a ${EM} b, 140${EN}180, x‍y`, t)).toBe('a - b, 140-180, xy')
    expect(t).toMatchObject({ dashes: 2, invisible: 1 })
  })

  it('A6: turns hand-typed star and plugin counts into tokens and lists them', () => {
    const t = emptyTally()
    expect(replaceCounts('1,928 stars on GitHub', t)).toBe('{githubStars} stars on GitHub')
    expect(replaceCounts('50+ plugins', t)).toBe('{moduleCount} plugins')
    expect(replaceCounts('12 modules and 3 people', t)).toBe('{moduleCount} modules and 3 people')
    expect(replaceCounts('Version 2026 is out', t)).toBe('Version 2026 is out')
    expect(t.tokens).toEqual([
      { token: '{githubStars}', from: '1,928' },
      { token: '{moduleCount}', from: '50+' },
      { token: '{moduleCount}', from: '12' },
    ])
  })

  it('rewrites site links to paths, docs links to the docs map, and reports webflow.io', () => {
    const docs = new Map([['/docs/cli-overview', 'https://docs.openmercato.com/cli/overview']])
    const reported: string[] = []
    const ctx = { docs, report: (h: string) => reported.push(h) }
    expect(rewriteLink('https://www.openmercato.com/case-studies/arvo?x=1#top', ctx)).toBe('/case-studies/arvo?x=1#top')
    expect(rewriteLink('https://openmercato.com/', ctx)).toBe('/')
    expect(rewriteLink('/docs/cli-overview', ctx)).toBe('https://docs.openmercato.com/cli/overview')
    expect(rewriteLink('https://www.openmercato.com/docs/missing', ctx)).toBe('https://docs.openmercato.com/')
    expect(rewriteLink('#comparison', ctx)).toBe('#comparison')
    expect(rewriteLink('mailto:careers@openmercato.com', ctx)).toBe('mailto:careers@openmercato.com')
    expect(rewriteLink('https://openmercato-dev.webflow.io/x', ctx)).toBe('https://openmercato-dev.webflow.io/x')
    expect(reported).toEqual(['https://openmercato-dev.webflow.io/x'])
  })

  it('sets updated only when the last publication is more than a day after the date', () => {
    expect(updatedAfter('2026-08-10T09:00:00.000Z', '2026-08-11T08:59:00.000Z')).toBeUndefined()
    expect(updatedAfter('2026-08-10T09:00:00.000Z', '2026-09-10T07:54:28.239Z')).toBe('2026-09-10T07:54:28.239Z')
    expect(updatedAfter('2026-08-10T09:00:00.000Z', null)).toBeUndefined()
  })

  it('reads and writes review dates in English and Polish', () => {
    expect(parseProseDate('Reviewed 12 November 2026. Sources:', 'en')).toBe('2026-11-12')
    expect(parseProseDate('Sprawdzono 12 listopada 2026. Źródła:', 'pl')).toBe('2026-11-12')
    expect(parseProseDate('Reviewed 12 listopada 2026', 'en')).toBeUndefined()
    expect(parseProseDate('31 February 2026', 'en')).toBeUndefined()
    expect(formatProseDate('2026-11-12', 'en')).toBe('12 November 2026')
    expect(formatProseDate('2026-11-12', 'pl')).toBe('12 listopada 2026')
  })

  it('names media files <fileId>-<name> from CDN addresses', () => {
    const url =
      'https://cdn.prod.website-files.com/69a97e33d587824eef365d84/6a4f6d510584689e00a9be3b_6a4f6cebd1988bc5b4ea4980_10clouds-logo-dark.png'
    expect(cdnFile(url)).toEqual({
      fileId: '6a4f6d510584689e00a9be3b',
      name: '6a4f6cebd1988bc5b4ea4980_10clouds-logo-dark.png',
    })
    expect(cdnFile('https://s3.amazonaws.com/webflow-prod-assets/69a9/6af5f54d10cc62e6aa2105fe_icon.svg')?.fileId).toBe(
      '6af5f54d10cc62e6aa2105fe',
    )
    expect(cdnFile('https://example.com/6a4f6d510584689e00a9be3b_x.png')).toBeUndefined()
    expect(mediaFileName('6a4f6d510584689e00a9be3b', 'My Logo (Dark)%.PNG')).toBe(
      '6a4f6d510584689e00a9be3b-my-logo-dark-.png',
    )
  })
})

describe('lib/import-webflow/docs-map.ts (Docs map)', () => {
  const xml =
    '<urlset><url><loc>https://docs.openmercato.com/user-guide/workflows/user-tasks</loc></url>' +
    '<url><loc>https://docs.openmercato.com/cli/overview/</loc></url>' +
    '<url><loc>https://docs.openmercato.com/framework/events/overview</loc></url>' +
    '<url><loc>https://example.com/other</loc></url></urlset>'
  const item = (slug: string, section: string): WfItem => ({
    id: slug,
    lastPublished: null,
    lastUpdated: null,
    createdOn: null,
    isArchived: false,
    isDraft: false,
    fieldData: { slug, section },
  })

  it('reads the docs host paths of a sitemap', () => {
    expect(sitemapPaths(xml)).toEqual([
      '/user-guide/workflows/user-tasks',
      '/cli/overview',
      '/framework/events/overview',
    ])
  })

  it('maps flattened slugs, a slug without its section prefix, and the rest to the docs home; catch-all last', () => {
    const m = buildDocsMap(
      [item('user-guide-workflows-user-tasks', 'User guide'), item('overview', 'CLI'), item('gone', 'Framework')],
      sitemapPaths(xml),
    )
    expect(m.rules.map((r) => [r.from, r.to])).toEqual([
      ['/docs', 'https://docs.openmercato.com/'],
      ['/documentation', 'https://docs.openmercato.com/'],
      ['/docs/user-guide-workflows-user-tasks', 'https://docs.openmercato.com/user-guide/workflows/user-tasks'],
      ['/docs/overview', 'https://docs.openmercato.com/cli/overview'],
      ['/docs/gone', 'https://docs.openmercato.com/'],
      ['/docs/*', 'https://docs.openmercato.com/'],
    ])
    expect(m.unmatched).toEqual(['gone'])
    expect(m.rules.every((r) => r.status === 301 && r.source === 'docs-map')).toBe(true)
  })
})

describe('lib/import-webflow/output.ts (YAML)', () => {
  it('quotes dates and the words a YAML 1.1 reader would take for booleans', () => {
    expect(
      toYaml({ date: '2026-08-10T09:00:00.000Z', day: '2026-11-12', ours: 'yes', theirs: 'no', text: 'plain' }),
    ).toBe('date: "2026-08-10T09:00:00.000Z"\nday: "2026-11-12"\nours: "yes"\ntheirs: "no"\ntext: plain\n')
  })

  it('writes a Markdown file with frontmatter', () => {
    expect(markdownFile({ title: 'T' }, '\nBody\n')).toBe('---\ntitle: T\n---\n\nBody\n')
  })
})
