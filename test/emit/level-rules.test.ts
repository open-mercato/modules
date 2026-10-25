// The level and the VER rows on /m/<path> come from the same rules (review r3): a module run collected before the
// baseline run of the same night is linked to it, `/m/<path>.json` carries the rules, and a green latest-line square
// next to Listed says why.
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { linkNightBaselines } from '../../lib/core/lines.ts'
import { buildEmit } from '../../lib/emit/index.ts'
import type { Receipt } from '../../lib/schema/data/index.ts'
import type { ModuleDetail, ModulesIndex } from '../../lib/schema/published/modules.ts'
import { levelNote } from '../../site/src/lib/chips.ts'
import { DATA, fixtureData, json, OPTS, tmp } from './helpers.ts'

const KSEF = '@fastwhitecat/integration-ksef-direct'
const RECEIPTS = join('receipts', '@fastwhitecat', 'integration-ksef-direct.jsonl')

const readJsonl = (file: string): Receipt[] =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Receipt)
const writeJsonl = (file: string, rows: readonly Receipt[]): void =>
  writeFileSync(file, rows.map((r) => `${JSON.stringify(r)}\n`).join(''))

/** The fixture data with the ksef receipts unlinked, as the preview runner collected them (run 1792747625). */
function unlinkedData(opts: { dropBaseline09?: boolean } = {}): string {
  const dir = tmp('om-level-')
  cpSync(DATA, dir, { recursive: true })
  const file = join(dir, RECEIPTS)
  writeJsonl(
    file,
    readJsonl(file).map((r) => ({ ...r, baseline: null })),
  )
  if (opts.dropBaseline09) {
    const base = join(dir, 'receipts', '_baseline.jsonl')
    writeJsonl(
      base,
      readJsonl(base).filter((r) => r.om.line !== '0.9'),
    )
  }
  return dir
}

function emitOf(dir: string) {
  const r = buildEmit(fixtureData({ data: dir }), OPTS)
  const index = json<ModulesIndex>(r, 'modules.json')
  const entry = index.entries.find((e) => e.npm === KSEF)!
  const detail = json<ModuleDetail>(r, `m/${KSEF}.json`)
  return { r, index, entry, detail }
}

describe('linkNightBaselines', () => {
  const base = readJsonl(join(DATA, 'receipts', '_baseline.jsonl'))
  const mod = readJsonl(join(DATA, RECEIPTS)).map((r) => ({ ...r, baseline: null }))

  test('links the baseline of the same line, version and runner within the night', () => {
    const linked = linkNightBaselines(mod, base)
    const r09 = linked.find((r) => r.om.line === '0.9')!
    const b09 = base.find((b) => b.om.line === '0.9')!
    expect(r09.baseline).toEqual({ status: b09.result.status, receipt: b09.id })
  })

  test('leaves a receipt alone when the baseline ran on another runner, version or night', () => {
    const other = base.map((b) => ({ ...b, harness: { ...b.harness, runner: 'preview-docker' as const } }))
    expect(linkNightBaselines(mod, other).every((r) => r.baseline === null)).toBe(true)
    const later = base.map((b) => ({ ...b, run: { ...b.run, at: '2026-10-24T02:17:00Z' } }))
    expect(linkNightBaselines(mod, later).every((r) => r.baseline === null)).toBe(true)
  })

  test('keeps a link the collect already wrote', () => {
    const kept = readJsonl(join(DATA, RECEIPTS))
    expect(linkNightBaselines(kept, [])).toEqual(kept)
  })
})

describe('level, rules and the green square agree', () => {
  test('a module run collected before its baseline run is Verified, as on the strip', () => {
    const { entry, detail } = emitOf(unlinkedData())
    expect(entry.compat.lines['0.9']?.status).toBe('verified')
    expect(entry.tier).toBe('verified')
    expect(detail.rules?.find((x) => x.id === 'VER-1')).toMatchObject({ pass: true })
  })

  test('without a baseline of that night: VER-1 fails with the reason, the level is Listed and says why', () => {
    const { entry, detail } = emitOf(unlinkedData({ dropBaseline09: true }))
    const ver1 = detail.rules?.find((x) => x.id === 'VER-1')
    expect(ver1).toEqual({
      id: 'VER-1',
      pass: false,
      detail: 'Receipt on 0.9: verified, but no baseline run of that night was linked.',
    })
    expect(entry.tier).toBe('listed')
    expect(entry.compat.lines['0.9']?.status).toBe('verified')
    expect(levelNote(entry, detail.rules, '0.9')).toBe(`VER-1: ${ver1!.detail}`)
  })

  test('every entry: tier Verified exactly when every LST and VER rule of /m/<path>.json passes', () => {
    for (const dir of [unlinkedData(), unlinkedData({ dropBaseline09: true })]) {
      const { r, index } = emitOf(dir)
      for (const e of index.entries) {
        const d = json<ModuleDetail>(r, `m/${e.path}.json`)
        expect(d.rules?.length, e.locator).toBe(11)
        if (e.tier === null) continue
        const allPass = (d.rules ?? []).every((x) => x.pass)
        expect(e.tier === 'verified', e.locator).toBe(allPass)
        if (e.tier === 'verified') expect(levelNote(e, d.rules, '0.9'), e.locator).toBeNull()
      }
    }
  })
})
