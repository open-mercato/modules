// VER-1 `What to fix` names the route to move when add broke on a backend route a new app already has (25 Oct).
import { describe, expect, it } from 'vitest'
import { collisionFix } from '../../lib/core/finding.ts'

describe('collisionFix', () => {
  it('names the route and the module of a new app that has it, in the words yarn generate prints', () => {
    expect(collisionFix([{ route: '/backend/webhooks', module: 'webhooks', from: '@open-mercato/webhooks' }])).toBe(
      "Nest the backend page /backend/webhooks under a folder of the module's own; a new app already has it from the webhooks module (@open-mercato/webhooks)",
    )
    expect(
      collisionFix([
        { route: '/backend/settings', module: 'configs', from: '@open-mercato/core' },
        { route: '/backend/settings/x', module: 'configs', from: '@open-mercato/core' },
      ]),
    ).toBe(
      "Nest the backend page /backend/settings (and 1 more) under a folder of the module's own; a new app already has it from the built-in configs module",
    )
    expect(collisionFix([])).toBeNull()
  })
})
