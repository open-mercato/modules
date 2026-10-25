import { describe, expect, it } from 'vitest'
import {
  AclFeature,
  CategoryId,
  EnvName,
  GithubRepo,
  Host,
  IsoDateTime,
  LineKey,
  LocPath,
  Locator,
  ModuleId,
  NpmName,
  RoutePath,
  SemVer,
  StableSemVer,
  Step,
} from '../../lib/schema/common.ts'
import type { z } from 'zod'

const ok = (s: z.ZodType, v: unknown) => expect(s.safeParse(v).success, JSON.stringify(v)).toBe(true)
const bad = (s: z.ZodType, v: unknown) => expect(s.safeParse(v).success, JSON.stringify(v)).toBe(false)

describe('spec 4.1 regexes', () => {
  it('NpmName', () => {
    for (const v of ['@fastwhitecat/integration-ksef-direct', 'create-mercato-module', '@a-b/c', '@a/b-c', 'a.b_c~d'])
      ok(NpmName, v)
    for (const v of ['@Acme/x', 'Acme', '@scope', '@scope/', '/x', '.x', 'x y', 'a'.repeat(215)]) bad(NpmName, v)
  })

  it('GithubRepo', () => {
    for (const v of ['FastWhiteCat/openmercato-module-ksef', 'Chmarusso/open-mercato-enrichment-treg', 'a/b.c_d-e'])
      ok(GithubRepo, v)
    for (const v of ['-a/b', 'a', 'a/b/c', `${'a'.repeat(40)}/b`, 'a/b c']) bad(GithubRepo, v)
  })

  it('Locator', () => {
    for (const v of [
      'npm:@fastwhitecat/integration-ksef-direct',
      'npm:create-mercato-module',
      'github:Chmarusso/open-mercato-enrichment-treg',
    ])
      ok(Locator, v)
    for (const v of ['@x/y', 'npm:@X/y', 'github:a/b/c', 'gitlab:a/b', 'npm:', 'github:/b']) bad(Locator, v)
  })

  it('LocPath', () => {
    for (const v of ['@x/y', 'create-mercato-module', 'github/chmarusso/open-mercato-enrichment-treg']) ok(LocPath, v)
    for (const v of ['github/Chmarusso/x', '@x', 'a/b', '../x', 'npm:@x/y']) bad(LocPath, v)
  })

  it('ModuleId (strictest pattern)', () => {
    for (const v of ['integration_ksef_direct', 'data_sync', 'a', 'a1_b2']) ok(ModuleId, v)
    for (const v of ['Data_sync', '_x', 'x_', 'x__y', '1x', 'x-y', 'a'.repeat(65)]) bad(ModuleId, v)
  })

  it('SemVer, StableSemVer, LineKey', () => {
    ok(SemVer, '0.10.1-develop.7583.1.0c886d0a14')
    ok(SemVer, '1.2.3')
    bad(SemVer, '1.2')
    bad(SemVer, 'v1.2.3')
    ok(StableSemVer, '0.9.0')
    bad(StableSemVer, '0.8.1-develop.7442.1.4c1dbf1f0e')
    for (const v of ['0.8', '0.9', 'next', '10.12']) ok(LineKey, v)
    for (const v of ['develop', '0.9.0', 'latest', '0']) bad(LineKey, v)
  })

  it('AclFeature, EventId, EnvName, Host, RoutePath', () => {
    for (const v of ['customers.deal.won', 'integration_ksef_direct.documents.view', 'search.*']) ok(AclFeature, v)
    for (const v of ['customers', 'Customers.view', 'a.b.c.d.e.f.g', 'x.']) bad(AclFeature, v)
    ok(EnvName, 'KSEF_TOKEN')
    for (const v of ['ksef_token', 'K', '1ABC', 'A-B']) bad(EnvName, v)
    for (const v of ['api.ksef.mf.gov.pl', '*.stripe.com']) ok(Host, v)
    for (const v of ['localhost', 'API.example.com', 'http://x.com', '1.2.3.4']) bad(Host, v)
    for (const v of ['/api/integration-ksef-direct/documents/[id]', '/backend']) ok(RoutePath, v)
    for (const v of ['api/x', '/x?y=1', '/x y']) bad(RoutePath, v)
  })

  it('IsoDateTime and enums', () => {
    ok(IsoDateTime, '2026-10-23T02:17:00Z')
    bad(IsoDateTime, '2026-10-23')
    expect(CategoryId.options).toHaveLength(16)
    expect(Step.options).toEqual([
      'scaffold',
      'install',
      'add',
      'generate',
      'typecheck',
      'initialize',
      'build',
      'start',
      'smoke',
    ])
  })
})
