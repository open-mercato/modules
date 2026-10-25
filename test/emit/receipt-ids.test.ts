// Finding of 25 Oct (F11): r/<id>.json is a permanent public URL. Two receipts of different runs under one id would
// replace the first run's evidence silently; collect now suffixes a later run (`_2`), and the emitter refuses a data
// branch that still has such a pair instead of publishing one of them.
import { describe, expect, it } from 'vitest'
import { buildEmit } from '../../lib/emit/index.ts'
import { OPTS, fixtureData, text } from './helpers.ts'

const DURABLE = 'npm:@fullstackhouse/open-mercato-durable-work'

describe('receipt ids in the emit', () => {
  it('two receipts of different runs under one id stop the emit', () => {
    const data = fixtureData()
    const list = data.receipts.get(DURABLE)!
    const r = list[0]!
    data.receipts.set(DURABLE, [...list, { ...r, run: { ...r.run, id: r.run.id + 1 } }])
    expect(() => buildEmit(data, OPTS)).toThrow(`emit: receipt id ${r.id} is used by runs`)
  })

  it('a suffixed id of a later run is its own file next to the first', () => {
    const data = fixtureData()
    const list = data.receipts.get(DURABLE)!
    const r = list[0]!
    const later = { ...r, id: `${r.id}_2`, run: { ...r.run, id: r.run.id + 1, at: '2026-10-23T09:00:00Z' } }
    data.receipts.set(DURABLE, [...list, later])
    const out = buildEmit(data, OPTS)
    expect(JSON.parse(text(out, `r/${r.id}.json`)).run.id).toBe(r.run.id)
    expect(JSON.parse(text(out, `r/${r.id}_2.json`)).run.id).toBe(r.run.id + 1)
  })
})
