// OM Quality in `yarn om health` (spec 6.3, R17): the seal comes only from a review file of the judged version whose
// integrity matches the facts, with every item passed, not revoked and not expired. A new version does not inherit it.
// Finding of 25 Oct: the grant (lib/commands/health.ts) had no test of its own; a refactor that dropped the integrity
// check would have passed the suite.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import health from '../../lib/commands/health.ts'
import { Health } from '../../lib/schema/data/index.ts'
import { locatorToPath } from '../../lib/schema/locator.ts'
import { DATA, DESCRIPTORS, LOC, NOW, ROOT, readJson } from './helpers.ts'

const KSEF = LOC.ksef
const PATH = locatorToPath(KSEF)
const VERSION = '0.1.8' // the judged version of KSeF in the fixture, verified (tier verified)
const INTEGRITY = (
  JSON.parse(readFileSync(join(DATA, 'facts', PATH, `${VERSION}.json`), 'utf8')) as { package: { integrity: string } }
).package.integrity

let data = ''
let quality = ''
beforeEach(() => {
  data = mkdtempSync(join(tmpdir(), 'om-quality-data-'))
  cpSync(DATA, data, { recursive: true })
  quality = mkdtempSync(join(tmpdir(), 'om-quality-'))
  writeFileSync(join(quality, 'revocations.yml'), '[]\n')
})
afterEach(() => {
  rmSync(data, { recursive: true, force: true })
  rmSync(quality, { recursive: true, force: true })
})

const review = (o: { version?: string; integrity?: string; failed?: number; until?: string } = {}) =>
  [
    `version: ${o.version ?? VERSION}`,
    `integrity: ${o.integrity ?? INTEGRITY}`,
    'checklistVersion: 1',
    'items:',
    ...Array.from(
      { length: 12 },
      (_, i) =>
        `  - { id: OMQ-${String(i + 1).padStart(2, '0')}, pass: ${o.failed === i + 1 ? 'false' : 'true'}, note: ok, file: null, line: null }`,
    ),
    'reviewers: [alice, bob]',
    'reviewedAt: 2026-10-20',
    `until: ${o.until ?? '2027-10-20'}`,
    'reportUrl: https://github.com/open-mercato/modules/issues/1',
    '',
  ].join('\n')

const writeReview = (file: string, text: string) => {
  const dir = join(quality, 'reviews', PATH)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, file), text)
}

const sealOf = (): Health['quality'] => {
  const log = console.log
  const err = console.error
  console.log = () => {}
  console.error = () => {}
  try {
    const code = health({
      args: ['--all', '--modules', DESCRIPTORS, '--quality', quality, '--now', NOW],
      flags: { data, out: 'out', offline: true, json: false },
      root: ROOT,
    })
    expect(code).toBe(0)
  } finally {
    console.log = log
    console.error = err
  }
  return Health.parse(readJson(join(data, 'health', `${PATH}.json`))).quality
}

describe('OM Quality grant in health', () => {
  it('grants the seal for a valid review of the judged version with its integrity', () => {
    writeReview(`${VERSION}.yml`, review())
    expect(sealOf()).toMatchObject({ version: VERSION, integrity: INTEGRITY, reviewers: ['alice', 'bob'] })
  })

  it('grants nothing when the integrity differs from the facts of that version', () => {
    writeReview(`${VERSION}.yml`, review({ integrity: 'sha512-OTHER' }))
    expect(sealOf()).toBeNull()
  })

  it('does not carry a review of the previous version over to the judged one', () => {
    writeReview('0.1.7.yml', review({ version: '0.1.7' }))
    expect(sealOf()).toBeNull()
  })

  it('grants nothing for a failed item, a revocation or an expired review', () => {
    writeReview(`${VERSION}.yml`, review({ failed: 7 }))
    expect(sealOf()).toBeNull()
    writeReview(`${VERSION}.yml`, review())
    writeFileSync(
      join(quality, 'revocations.yml'),
      `- { locator: "${KSEF}", version: ${VERSION}, reason: Revoked in a test., at: 2026-10-22 }\n`,
    )
    expect(sealOf()).toBeNull()
    writeFileSync(join(quality, 'revocations.yml'), '[]\n')
    writeReview(`${VERSION}.yml`, review({ until: '2026-10-22' }))
    expect(sealOf()).toBeNull()
  })
})
