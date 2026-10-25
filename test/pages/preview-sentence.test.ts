// One state, one sentence (review r6): `these receipts come from a preview run, not CI` was said eight ways, with
// three chips. lib/core/source.ts holds the chip and the sentence; this test keeps every other wording out of the
// sources and checks that an emit of preview data says it only in those words, in the machine contract too.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, test } from 'vitest'
import { buildEmit } from '../../lib/emit/index.ts'
import { checkCompat } from '../../lib/core/compat.ts'
import { loadSearchIndex, searchModules, type SearchIndexData } from '../../lib/core/search.ts'
import { PREVIEW_CHIP, PREVIEW_LINE, PREVIEW_QUEUED, PREVIEW_SENTENCE, receiptSource } from '../../lib/core/source.ts'
import type { Receipt } from '../../lib/schema/data/index.ts'
import type { ModulesIndex } from '../../lib/schema/published/modules.ts'
import { OPTS, ROOT, fixtureData, skillsDir } from '../emit/helpers.ts'

function previewData() {
  const data = fixtureData({ skills: skillsDir() })
  const preview = (r: Receipt): Receipt => ({ ...r, harness: { ...r.harness, runner: 'preview-docker' } })
  data.baseline = data.baseline.map(preview)
  for (const [k, list] of data.receipts) data.receipts.set(k, list.map(preview))
  return data
}

/** Source text without comments, so a comment may explain the rule without breaking it. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')
}

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) files(p, out)
    else if (/\.(ts|tsx|astro|mjs)$/.test(name)) out.push(p)
  }
  return out
}

const count = (text: string, needle: string): number => text.split(needle).length - 1

describe('one preview sentence (review r6)', () => {
  test('the sources say it only through lib/core/source.ts', () => {
    const offenders: string[] = []
    for (const f of [...files(join(ROOT, 'site', 'src')), ...files(join(ROOT, 'lib'))]) {
      const rel = relative(ROOT, f)
      if (rel === join('lib', 'core', 'source.ts')) continue
      const c = code(readFileSync(f, 'utf8'))
      if (/maintainer's machine|maintainer&#39;s machine/.test(c) || /\bnot CI\b/.test(c) || /\bCI night\b/.test(c))
        offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  test('an emit of preview data says it in the one sentence, and the contract names the source', () => {
    const out = buildEmit(previewData(), OPTS)
    const texts = [...out.public].map(
      ([path, v]) => [path, typeof v === 'string' ? v : Buffer.from(v).toString('utf8')] as [string, string],
    )
    let sentences = 0
    for (const [path, t] of texts) {
      // every mention of the maintainer's machine is the sentence itself
      expect(count(t, "maintainer's machine"), path).toBe(count(t, PREVIEW_SENTENCE))
      sentences += count(t, PREVIEW_SENTENCE)
    }
    expect(sentences).toBeGreaterThan(1)
    expect(out.public.get('llms.txt')).toContain(PREVIEW_SENTENCE)
    const index = JSON.parse(out.public.get('modules.json') as string) as ModulesIndex
    expect(index.dataAsOf.source).toBe('preview')
    const search = JSON.parse(out.public.get('search-index.json') as string) as SearchIndexData
    expect(search.receiptSource).toBe('preview')
  })

  test('search_modules and check_compat carry the source; check_compat says the sentence first', () => {
    const out = buildEmit(previewData(), OPTS)
    const index = JSON.parse(out.public.get('modules.json') as string) as ModulesIndex
    const searcher = loadSearchIndex(JSON.parse(out.public.get('search-index.json') as string) as SearchIndexData)
    const found = searchModules(searcher, { query: 'ksef' })
    expect(found.receiptSource).toBe('preview')
    const compat = checkCompat(
      { refs: ['npm:@fastwhitecat/integration-ksef-direct'], omVersion: '0.9' },
      {
        entries: index.entries,
        builtIn: [],
        lines: index.lines,
        site: index.site,
        now: OPTS.now,
        receiptSource: index.dataAsOf.source ?? null,
      },
    )
    expect(compat.receiptSource).toBe('preview')
    const r = compat.results[0]!
    expect(r.receipt).not.toBeNull()
    expect(r.notes[0]).toBe(PREVIEW_LINE)
  })

  test('the receipts source is the runner of the newest receipt', () => {
    const at = (iso: string, runner: string) => ({ run: { at: iso }, harness: { runner } })
    expect(receiptSource([])).toBeNull()
    expect(receiptSource([at('2026-10-23T09:00:00Z', 'preview-docker')])).toBe('preview')
    expect(
      receiptSource([at('2026-10-23T09:00:00Z', 'preview-docker'), at('2026-10-24T02:17:00Z', 'ubuntu-latest')]),
    ).toBe('ci')
  })

  test('the chip and the queue sentence are plain text', () => {
    for (const t of [PREVIEW_CHIP, PREVIEW_SENTENCE, PREVIEW_QUEUED]) {
      expect(t).not.toMatch(/[–—!]/)
      expect(t.endsWith('.') || t === PREVIEW_CHIP).toBe(true)
    }
  })
})
