// The install ladder of a receipt (spec 5.3, 7.7 C): one list for every sentence that names the steps, so the
// receipt, /compat, /quality, the Verified tooltip and the agent card always say the same nine steps.
// Isomorphic: no Node APIs. test/core/steps.test.ts keeps it equal to the Step enum of lib/schema/common.ts.

export const STEPS = [
  'scaffold',
  'install',
  'add',
  'generate',
  'typecheck',
  'initialize',
  'build',
  'start',
  'smoke',
] as const

export type StepName = (typeof STEPS)[number]

/** `scaffold, install, add, generate, typecheck, initialize, build, start and smoke`. */
export function stepsList(conjunction = 'and'): string {
  return `${STEPS.slice(0, -1).join(', ')} ${conjunction} ${STEPS[STEPS.length - 1]}`
}

/** `nine` for the nine steps of the ladder. */
export const STEPS_WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][
  STEPS.length
] as string
