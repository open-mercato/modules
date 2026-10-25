// Orchestrator decision E3 (errata to spec 6.2 and 6.6): `prepare` is not an install script of a
// package installed from the npm registry (npm does not run it there); it still counts for a GitHub source.
import { describe, expect, it } from 'vitest'
import { countedInstallScripts, hygieneFindings, supplyChainSignal } from '../../lib/core/signals.ts'
import type { SyncRecord } from '../../lib/schema/data/sync.ts'

const NOW = '2026-10-23T00:00:00Z'

function sync(installScripts: NonNullable<SyncRecord['npm']>['installScripts']) {
  return {
    npm: { installScripts, dependencies: {} },
    advisories: [],
    provenance: { status: 'none', sourceRepo: null, commit: null, workflow: null },
  } as unknown as SyncRecord
}

describe('E3: prepare and install scripts', () => {
  it('countedInstallScripts drops prepare for npm only', () => {
    expect(countedInstallScripts(['prepare'], 'npm')).toEqual([])
    expect(countedInstallScripts(['prepare', 'postinstall'], 'npm')).toEqual(['postinstall'])
    expect(countedInstallScripts(['prepare'], 'github')).toEqual(['prepare'])
  })

  it('Supply chain stays ok for an npm package with only prepare (create-mercato-module)', () => {
    expect(supplyChainSignal(sync(['prepare']), null, NOW)).toEqual({ status: 'ok', reasons: [] })
    expect(supplyChainSignal(sync(['prepare', 'postinstall']), null, NOW)).toEqual({
      status: 'fail',
      reasons: ['Undeclared install scripts: postinstall.'],
    })
  })

  it('Hygiene has no install-scripts error for prepare alone', () => {
    expect(hygieneFindings(null, null, sync(['prepare']), null)).toEqual([])
    expect(hygieneFindings(null, null, sync(['install']), null)).toEqual([
      { code: 'install-scripts', severity: 'error' },
    ])
  })
})
