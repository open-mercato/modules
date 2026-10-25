// Receipt schema extensions of WP07 (additive): `harness.runner` accepts the preview runner, optional `notes`.
import { describe, expect, it } from 'vitest'
import { Receipt } from '../../lib/schema/data/index.ts'
import { DATA, readJsonl } from './helpers.ts'

const fixture = () =>
  readJsonl(`${DATA}/receipts/_baseline.jsonl`)[0] as Record<string, unknown> & {
    harness: Record<string, unknown>
    run: Record<string, unknown>
  }

describe('Receipt (WP07 additions)', () => {
  it('accepts ubuntu-latest and preview-docker, nothing else', () => {
    const r = fixture()
    expect(Receipt.safeParse(r).success).toBe(true)
    expect(Receipt.safeParse({ ...r, harness: { ...r.harness, runner: 'preview-docker' } }).success).toBe(true)
    expect(Receipt.safeParse({ ...r, harness: { ...r.harness, runner: 'self-hosted' } }).success).toBe(false)
  })

  it('the id is plain for the first run of a day and takes `_2`.. for later ones (additive, 25 Oct)', () => {
    const r = fixture()
    const plain = String(r.id)
    for (const id of [plain, `${plain}_2`, `${plain}_999`])
      expect(Receipt.safeParse({ ...r, id }).success, id).toBe(true)
    for (const id of [`${plain}_`, `${plain}_1000`, `${plain}-2`, `${plain}_x`])
      expect(Receipt.safeParse({ ...r, id }).success, id).toBe(false)
  })

  it('a preview receipt may point run.url at a local log', () => {
    const r = fixture()
    const local = {
      ...r,
      harness: { ...r.harness, runner: 'preview-docker' },
      run: { ...r.run, url: 'file:///home/x/out/preview/1/artifacts/cell-a/' },
    }
    expect(Receipt.safeParse(local).success).toBe(true)
  })

  it('notes are optional and limited to in-preset and flaky', () => {
    const r = fixture()
    expect(Receipt.safeParse({ ...r, notes: ['in-preset', 'flaky'] }).success).toBe(true)
    expect(Receipt.safeParse({ ...r, notes: ['anything'] }).success).toBe(false)
    expect(Receipt.safeParse({ ...r, unknown: 1 }).success).toBe(false)
  })
})
