// A package without a module (a provider, library or tool) is not read by Rentgen: its anatomy says so instead of
// `no hosts found in the code` (finding of 25 Oct: the web-research adapters call external APIs).
import { describe, expect, it } from 'vitest'
import { anatomyNote, NO_MODULE_TEXT } from '../../lib/core/entry.ts'
import type { AnatomySummary } from '../../lib/schema/published/modules.ts'

const counts = {
  entities: 0,
  tables: 0,
  migrations: 0,
  routes: 0,
  publicRoutes: 0,
  aclFeatures: 0,
  eventsEmitted: 0,
  eventsConsumed: 0,
  backendPages: 0,
  frontendPages: 0,
  widgets: 0,
  workers: 0,
  cli: 0,
  aiTools: 0,
  aiAgents: 0,
  extends: 0,
}
const anatomy = { coverage: 'partial', counts } as unknown as AnatomySummary

describe('anatomyNote', () => {
  it('a package without a module says its code is not read, whatever it requires', () => {
    expect(anatomyNote({ anatomy, requires: [{ raw: '@open-mercato/web-research' }], moduleIds: [] })).toEqual({
      text: NO_MODULE_TEXT,
      plugs: false,
    })
  })
  it('a module keeps the sentences of a partial anatomy', () => {
    expect(anatomyNote({ anatomy, requires: [{ raw: 'x' }], moduleIds: ['events'] })?.text).toBe(
      'Few contracts. This package mostly plugs into an existing host module.',
    )
    expect(anatomyNote({ anatomy, requires: [], moduleIds: ['events'] })?.text).toBe('Few contracts read from src/.')
  })
})
