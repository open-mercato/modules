// The scene of the classic preview night of 24 Oct (rounds 14 and 15): freighttech shipment-tracking broke at add on 0.8
// and next (generate refused /backend/webhooks, which the webhooks module of a new app has), and Yarn's age gate held
// back a dependency on 0.9. The fixture entry ksef plays that module, with the real add log of that night.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EmitData } from '../../lib/emit/types.ts'
import { classifyStep } from '../../lib/receipts/classify.ts'
import { Receipt, type Facts, type Presets } from '../../lib/schema/data/index.ts'
import { ROOT, fixtureData } from './helpers.ts'

export const KSEF = 'npm:@fastwhitecat/integration-ksef-direct'
export const WEBHOOKS = '@open-mercato/webhooks'
export const LOG = readFileSync(
  join(ROOT, 'test', 'fixtures', 'logs', 'freighttech-shipment-tracking-classic-0.8-add.log.txt'),
  'utf8',
)
export const SENTENCE =
  'In a new app from the default preset, the module adds the backend route /backend/webhooks, which the webhooks module (@open-mercato/webhooks) already has.'
export const STATIC =
  'Static check: the module adds the backend route /backend/webhooks, which a new app already has from the webhooks module (@open-mercato/webhooks).'
/** The line of the age gate (round 13), as `install` printed it that night. */
export const HELD =
  '➤ YN0016: │ @aws-sdk/credential-provider-http@npm:^3.972.77: are quarantined\n➤ YN0000: · Failed with errors in 29s 11ms'

export function scene(): { data: EmitData; broken: Receipt; held: Receipt; version: string } {
  const data = fixtureData()
  // a new app (classic) of every line registers the webhooks module from @open-mercato/webhooks
  const presets = structuredClone(data.presets) as Presets
  for (const k of Object.keys(presets))
    presets[k] = {
      ...presets[k]!,
      classic: [...(presets[k]!.classic ?? presets[k]!.empty ?? []), { id: 'webhooks', from: WEBHOOKS }],
    }
  // facts: the module has a backend page /backend/webhooks; @open-mercato/webhooks 0.8.0 and 0.9.0 have it too (no
  // facts of the develop snapshot: next reads the newest line that has the module, round 16)
  const facts = new Map(data.facts)
  const own = new Map(facts.get(KSEF)!)
  const version = [...own.keys()].sort().at(-1)!
  const f = structuredClone(own.get(version)!) as Facts
  f.modules = f.modules.map((m) => ({
    ...m,
    collisionKeys: { ...m.collisionKeys, backendRoutes: [...m.collisionKeys.backendRoutes, '/backend/webhooks'] },
  }))
  own.set(version, f)
  facts.set(KSEF, own)
  const hooks = new Map<string, Facts>()
  for (const v of ['0.8.0', '0.9.0']) {
    const w = structuredClone(f)
    w.modules = [
      {
        ...f.modules[0]!,
        id: 'webhooks',
        collisionKeys: {
          ...f.modules[0]!.collisionKeys,
          moduleId: 'webhooks',
          backendRoutes: ['/backend/webhooks', '/backend/webhooks/[id]'],
        },
      },
    ]
    hooks.set(v, w)
  }
  facts.set(`npm:${WEBHOOKS}`, hooks)
  // receipts of a new app: broken at add on 0.8 and next (the real excerpt), held back by the age gate on 0.9
  const base = data.receipts.get(KSEF)!.filter((r) => r.om.preset === 'classic')
  const add = classifyStep('add', LOG, { attempt: 2 })
  const mk = (line: string, i: number, held: boolean): Receipt => {
    const r = structuredClone(base.find((x) => x.om.line === line) ?? base[0]!)
    r.id = `r_20261024_00000000cc0${i}`
    r.om = { ...r.om, line, preset: 'classic' }
    r.module = { ...r.module!, version }
    r.run = { ...r.run, at: '2026-10-24T09:06:00Z' }
    r.result = held
      ? {
          status: 'quarantine',
          failedStep: 'install',
          alsoFailed: [],
          classification: 'quarantine',
          quarantineUntil: null,
        }
      : { status: 'broken', failedStep: 'add', alsoFailed: [], classification: 'module-fail', quarantineUntil: null }
    r.steps = r.steps.map((s) =>
      held && s.name === 'install'
        ? { ...s, status: 'fail' as const, excerpt: HELD }
        : !held && s.name === 'add'
          ? { ...s, status: 'fail' as const, excerpt: add.excerpt }
          : s.name === 'generate' || (held && s.name === 'add')
            ? { ...s, status: 'skipped' as const, excerpt: null }
            : s,
    )
    r.transition = { from: null, to: held ? 'quarantine' : 'broken', confirmed: true }
    return Receipt.parse(r)
  }
  const lines = data.lines!.lines.map((l) => l.key)
  const made = lines.map((k, i) => mk(k, i, k === '0.9'))
  const receipts = new Map(data.receipts)
  receipts.set(KSEF, [...data.receipts.get(KSEF)!.filter((r) => r.om.preset !== 'classic'), ...made])
  return {
    data: { ...data, presets, facts, receipts },
    broken: made.find((r) => r.om.line === '0.8')!,
    held: made.find((r) => r.om.line === '0.9')!,
    version,
  }
}
