// The template gallery and pages (docs/specs/2026-10-29-templates.md, UI/UX, Phase 1a step 7) on the emit golden of
// the template fixture: which entries the gallery shows and in what order, the line badge, the verification state,
// the create command (none for `hold`) and the use case filter. The pages themselves are checked by
// test/e2e/templates.spec.ts on a build of the same fixture.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { isTemplatePath } from '../../lib/emit/site-data.ts'
import { builtOn } from '../../lib/core/template-facts.ts'
import { TemplateDetail, TemplatesIndex } from '../../lib/schema/published/templates.ts'
import {
  createCommand,
  galleryCards,
  lineBadge,
  TEMPLATE_OPTION_RELEASED,
  useCaseFilter,
  verification,
} from '../../site/src/lib/templates.ts'
import { ROOT } from '../emit/helpers.ts'

const golden = join(ROOT, 'test', 'emit', 'golden', 'public')
const index = TemplatesIndex.parse(JSON.parse(readFileSync(join(golden, 'templates.json'), 'utf8')))
const detail = (path: string): TemplateDetail | null => {
  try {
    return TemplateDetail.parse(JSON.parse(readFileSync(join(golden, 't', `${path}.json`), 'utf8')))
  } catch {
    return null
  }
}

describe('gallery', () => {
  const cards = galleryCards(index.templates, detail)

  test('active and held entries, featured first, then the last push; hold gets no boost; unmaintained left out', () => {
    expect(cards.map((c) => [c.github, c.status, c.featured])).toEqual([
      ['acme/b2b-portal', 'active', true],
      ['Acme/Field-CRM', 'active', false],
      ['open-mercato/ready-app-oss-prm', 'hold', false],
    ])
  })

  test('a held entry follows every active one, featured or not, and a green smoke comes before the last push', () => {
    const at = (github: string, o: object) => ({ ...index.templates.find((t) => t.github === github)!, ...o })
    const verified = { sha: 'c'.repeat(40), at: '2026-11-04T00:00:00Z', omVersion: '0.9.0', importer: 'x', facts: null }
    const crm = at('Acme/Field-CRM', { verified })
    const prm = at('open-mercato/ready-app-oss-prm', {})
    const featuredHold = (p: string) => {
      const d = detail(p)
      return d && p === 'open-mercato/ready-app-oss-prm' ? { ...d, entry: { ...d.entry, featured: true } } : d
    }
    const order = galleryCards([prm, crm, at('acme/b2b-portal', {})], featuredHold).map((c) => c.path)
    // b2b-portal is featured; Field-CRM passed the smoke; PRM is featured but on hold
    expect(order).toEqual(['acme/b2b-portal', 'acme/field-crm', 'open-mercato/ready-app-oss-prm'])
    const noFeature = galleryCards([at('acme/b2b-portal', {}), crm], (p) => {
      const d = detail(p)
      return d ? { ...d, entry: { ...d.entry, featured: false } } : d
    })
    expect(noFeature.map((c) => c.path)).toEqual(['acme/field-crm', 'acme/b2b-portal'])
  })

  test('a card carries the screenshot, the stars, the badge, the state and the Enterprise mark of its sha', () => {
    const [b2b, crm, prm] = cards
    expect(b2b?.shot?.src).toBe('/modules/shots/templates/acme/b2b-portal-quotes.png')
    expect(b2b?.stars).toBe(42)
    expect(b2b?.badge).toMatchObject({ text: 'Built on 0.9.x', behind: null })
    expect(b2b?.enterprise).toBe(false)
    expect(crm?.badge).toMatchObject({ text: 'Built on 0.7.x', behind: '2 lines behind' })
    expect(crm?.enterprise).toBe(true)
    expect(crm?.shot).toBeNull()
    expect(prm?.reason).toBe('No license yet, and it pins Open Mercato 0.4.')
    expect(cards.every((c) => c.verified.text === 'Not verified')).toBe(true)
  })

  test('the filter lists the use cases that have a card, in the order of the closed list', () => {
    expect(useCaseFilter(cards)).toEqual([
      { id: 'b2b-portal', label: 'B2B portal', count: 1 },
      { id: 'partner-portal', label: 'Partner portal', count: 1 },
      { id: 'field-service', label: 'Field service', count: 1 },
    ])
  })
})

describe('badges and states', () => {
  test('line badge', () => {
    expect(lineBadge(null)).toBeNull()
    expect(lineBadge({ omLine: null, linesBehind: null })?.text).toBe('Line unknown')
    expect(lineBadge({ omLine: '0.8', linesBehind: 1 })?.behind).toBe('1 line behind')
    expect(lineBadge({ omLine: '1.0', linesBehind: null })).toMatchObject({ text: 'Built on 1.0.x', behind: null })
  })

  test('verification: not verified until Phase 1b names a sha', () => {
    expect(verification(null)).toMatchObject({ text: 'Not verified', ok: false })
    const v = verification({
      sha: 'a'.repeat(40),
      at: '2026-11-04T00:00:00Z',
      omVersion: '0.9.0',
      importer: 'x',
      facts: null,
    })
    expect(v).toMatchObject({ text: 'Verified on 0.9.0', ok: true })
  })

  test('built on, for the page and the Markdown twin alike', () => {
    expect(builtOn({ omVersion: '0.7.2', omLine: '0.7', linesBehind: 2, latestStable: '0.9.0' })).toBe(
      'Open Mercato 0.7.2 (0.7.x, 2 lines behind 0.9.0)',
    )
  })
})

describe('create command', () => {
  test('slug first, else owner/repo as listed; none on hold', () => {
    expect(createCommand({ slug: 'b2b-portal', github: 'acme/b2b-portal', status: 'active' })).toBe(
      'npx create-mercato-app my-app --template b2b-portal',
    )
    expect(createCommand({ slug: null, github: 'Acme/Field-CRM', status: 'unmaintained' })).toBe(
      'npx create-mercato-app my-app --template Acme/Field-CRM',
    )
    expect(createCommand({ slug: 'prm', github: 'open-mercato/ready-app-oss-prm', status: 'hold' })).toBeNull()
  })

  test('planned until create-mercato-app releases --template (Phase 4)', () => {
    expect(TEMPLATE_OPTION_RELEASED).toBe(false)
    const page = readFileSync(join(ROOT, 'site', 'src', 'pages', 't', '[...path].astro'), 'utf8')
    expect(page).toContain('TEMPLATE_OPTION_RELEASED ? (')
    expect(page).toContain('<CommandChip command={command} />')
  })
})

describe('template paths of the site', () => {
  test('lower-case owner/repo only, so a route parameter never leaves the generated folder', () => {
    expect(isTemplatePath('acme/b2b-portal')).toBe(true)
    expect(isTemplatePath('Acme/Field-CRM')).toBe(false)
    expect(isTemplatePath('acme/..')).toBe(false)
    expect(isTemplatePath('../etc')).toBe(false)
    expect(isTemplatePath('acme/b2b/x')).toBe(false)
  })
})
