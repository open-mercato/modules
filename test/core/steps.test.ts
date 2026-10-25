// One install ladder everywhere (review r1 P1): the constant equals the Step enum the receipts are validated with.
import { describe, expect, test } from 'vitest'
import { STEPS, STEPS_WORD, stepsList } from '../../lib/core/steps.ts'
import { Step } from '../../lib/schema/common.ts'

describe('install ladder', () => {
  test('STEPS is the Step enum, in receipt order', () => {
    expect([...STEPS]).toEqual(Step.options)
  })
  test('one sentence for every page', () => {
    expect(stepsList()).toBe('scaffold, install, add, generate, typecheck, initialize, build, start and smoke')
    expect(STEPS_WORD).toBe('nine')
  })
})
