// policy/builtin-upcoming.yml (round 13): `ecommerce` is mapped for 0.10 (spec 4.4, P9) and no released core ships it,
// so emit no longer warns `1 IDs are not core modules of 0.9.0: ecommerce`; an ID a released core ships asks for removal.
import { describe, expect, it } from 'vitest'
import { buildBuiltInModules } from '../../lib/emit/builtin.ts'
import { fixtureData } from './helpers.ts'

describe('built-in categories of the develop line', () => {
  it('the repository policy lists ecommerce as upcoming', () => {
    expect(fixtureData().builtinUpcoming).toEqual(['ecommerce'])
  })

  it('an upcoming ID is not reported as unknown; one that core ships asks for removal', () => {
    const data = fixtureData()
    const ids = data.builtin!.modules.map((m) => m.id)
    const map = Object.fromEntries(ids.map((id) => [id, data.builtinCategories![id] ?? 'operations']))
    const warnings: string[] = []
    buildBuiltInModules(
      { ...data, builtinCategories: { ...map, ecommerce: 'orders-checkout' }, builtinUpcoming: ['ecommerce'] },
      (m) => warnings.push(m),
    )
    expect(warnings).toEqual([])
    const again: string[] = []
    buildBuiltInModules({ ...data, builtinCategories: map, builtinUpcoming: [ids[0]!] }, (m) => again.push(m))
    expect(again).toEqual([
      `policy/builtin-upcoming.yml: core ${data.builtin!.coreVersion} ships ${ids[0]}; remove them from that file`,
    ])
  })
})
