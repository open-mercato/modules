// Finding of 25 Oct: a descriptor with another key order, single quotes or a double space passed validate ("1 passed")
// and failed the checks job with a bare Prettier warning, while autofix is off in the private repository. validate now
// warns with the formatter autofix runs and names `yarn om format modules`.
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { loadCatalog } from '../../lib/validate/catalog.ts'
import { FORMAT_WARNING, validateEntry } from '../../lib/validate/run.ts'
import { renderSummary } from '../../lib/validate/summary.ts'
import { ROOT, write } from './helpers.ts'

const dir = mkdtempSync(join(tmpdir(), 'om-format-warn-'))
for (const p of ['policy', '.prettierrc.json', '.prettierignore'])
  cpSync(join(ROOT, p), join(dir, p), { recursive: true })
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const CANONICAL = `npm: "@acme/inventory-sync"
category: operations
tags: [inventory]
summary: Keeps stock levels in sync between the warehouse system and the app.
whenToUse: Use when stock levels live in a warehouse system and the app must show them.
`
const MESSY = `category: operations
npm: '@acme/inventory-sync'
tags: [inventory]
summary:  Keeps stock levels in sync between the warehouse system and the app.
whenToUse: Use when stock levels live in a warehouse system and the app must show them.
`

async function check(text: string) {
  write(dir, 'modules/@acme/inventory-sync.yml', text)
  const catalog = await loadCatalog(ROOT, null)
  return validateEntry('modules/@acme/inventory-sync.yml', {
    root: dir,
    catalog,
    files: ['modules/@acme/inventory-sync.yml'],
    baseRef: null,
    builtinCheck: false,
    labels: [],
    remote: null,
    now: new Date('2026-10-25T12:00:00Z'),
  })
}

describe('validate and the canonical form', () => {
  it('a file autofix would rewrite passes with a warning that names yarn om format modules', async () => {
    const r = await check(MESSY)
    expect(r.status).toBe('pass')
    expect(r.findings).toContainEqual({ step: 'schema', severity: 'warning', code: 'format', message: FORMAT_WARNING })
    expect(FORMAT_WARNING).toContain('yarn om format modules')
    const summary = renderSummary({
      generatedAt: '2026-10-25T12:00:00Z',
      offline: true,
      changedFrom: null,
      entries: [r],
      removed: [],
      global: [],
      notes: [],
    })
    expect(summary).toContain('yarn om format modules')
  })

  it('a file in the canonical form has no such warning', async () => {
    const r = await check(CANONICAL)
    expect(r.status).toBe('pass')
    expect(r.findings.filter((f) => f.code === 'format')).toEqual([])
  })
})
