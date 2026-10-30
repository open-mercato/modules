// Live-site review of 30 Oct, item 5: the storage-s3 card said `Settings needed: ... LOCALSTACK_PORT and 2 more`, and
// plan_install asked for LOCALSTACK_S3_ACCESS_KEY_ID and LOCALSTACK_S3_SECRET_ACCESS_KEY. The package reads them only in
// src/test-helpers/s3Fixtures.ts. An env name read only by test code is not a setting the module needs.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { anatomySummary, isTestSource, splitEnv } from '../../lib/core/entry.ts'
import { Facts } from '../../lib/schema/data/facts.ts'
import { DATA } from './helpers.ts'

const at = (file: string, line = 1) => ({ file, line })

describe('env names read only by test code are not settings', () => {
  it.each([
    'src/test-helpers/s3Fixtures.ts',
    'src/__tests__/client.ts',
    'src/__mocks__/s3.ts',
    'src/__integration__/flow.ts',
    'src/__fixtures__/data.ts',
    'src/test/setup.ts',
    'src/tests/env.ts',
    'src/test-utils/env.ts',
    'src/testing/env.ts',
    'src/fixtures/s3.ts',
    'src/e2e/run.ts',
    'src/modules/x/lib/client.test.ts',
    'src/modules/x/lib/client.spec.tsx',
  ])('%s is test code', (file) => {
    expect(isTestSource(file)).toBe(true)
  })

  it.each([
    'src/modules/storage_s3/lib/endpoint-safety.ts',
    'src/modules/storage_s3/lib/preset.ts',
    'src/modules/testimonials/lib/env.ts',
    'src/modules/attestation/api/route.ts',
    'src/lib/latest.ts',
    'src/__generated__/env.ts',
  ])('%s is module code', (file) => {
    expect(isTestSource(file)).toBe(false)
  })

  it('splitEnv drops the names whose read sits in test code', () => {
    expect(
      splitEnv([
        { name: 'OM_STORAGE_S3_ALLOW_INTERNAL_ENDPOINTS', src: at('src/modules/storage_s3/lib/endpoint-safety.ts') },
        { name: 'LOCALSTACK_PORT', src: at('src/test-helpers/s3Fixtures.ts', 10) },
        { name: 'LOCALSTACK_S3_ACCESS_KEY_ID', src: at('src/test-helpers/s3Fixtures.ts', 19) },
        { name: 'OM_X_DEBUG', src: at('src/__tests__/x.ts'), ifSet: true },
      ]),
    ).toEqual({ env: ['OM_STORAGE_S3_ALLOW_INTERNAL_ENDPOINTS'], envIfSet: [] })
  })

  it('the anatomy of a package keeps its module settings and drops the test-only names', () => {
    const raw = JSON.parse(
      readFileSync(join(DATA, 'facts', '@open-mercato', 'gateway-stripe', '0.9.0.json'), 'utf8'),
    ) as Facts
    const facts = structuredClone(raw)
    const env = facts.modules[0]!.config.env
    const kept = env.map((e) => e.name)
    env.push(
      { name: 'LOCALSTACK_PORT', src: at('src/test-helpers/s3Fixtures.ts', 10) },
      { name: 'LOCALSTACK_S3_SECRET_ACCESS_KEY', src: at('src/test-helpers/s3Fixtures.ts', 20) },
    )
    const a = anatomySummary(Facts.parse(facts), false)!
    expect([...a.lists.env, ...(a.lists.envIfSet ?? [])].sort()).toEqual([...new Set(kept)].sort())
  })
})
