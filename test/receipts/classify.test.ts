// Classification and signatures (spec 5.3 "Klasyfikacja"), on log lines from the Cezar spike.
import { describe, expect, it } from 'vitest'
import {
  classifyStep,
  errorSignature,
  explainFailure,
  forbiddenRoute,
  normalizeErrorLine,
} from '../../lib/receipts/classify.ts'
import { EXCERPT_MAX, sanitizeLogText } from '../../lib/receipts/excerpts.ts'
import { API_KEY_INIT, CONSENTS_BUILD, CONSENTS_TS } from './helpers.ts'

describe('classifyStep', () => {
  it('TypeScript errors in typecheck are module-fail with file and line (consents, spike row B1)', () => {
    const f = classifyStep('typecheck', `$ tsc --noEmit\n${CONSENTS_TS}`, { attempt: 1 })
    expect(f.classification).toBe('module-fail')
    expect(f.rule).toBe('ts-error')
    expect(f.file).toBe(
      'node_modules/@piotrkarwatka/marketing-consents/types/modules/marketing_consents/components/ConsentsTable.tsx',
    )
    expect(f.line).toBe(154)
    expect(f.excerpt).toContain('error TS2321')
  })

  it('the same TypeScript error in build has the same normalized line, so typecheck and build read as one cause', () => {
    const t = classifyStep('typecheck', CONSENTS_TS, { attempt: 1 })
    const b = classifyStep('build', CONSENTS_BUILD, { attempt: 1 })
    expect(b.classification).toBe('module-fail')
    expect(b.rule).toBe('ts-error')
    expect(normalizeErrorLine(CONSENTS_TS.split('\n')[0]!)).toBe(normalizeErrorLine(CONSENTS_BUILD.split('\n')[1]!))
    expect(b.signature).not.toBe(t.signature) // the step is part of the signature
  })

  it('missing entity metadata in initialize (spike row X1)', () => {
    const f = classifyStep('initialize', API_KEY_INIT, { attempt: 1 })
    expect([f.classification, f.rule]).toEqual(['module-fail', 'missing-entity'])
    expect(f.excerpt?.startsWith('Initialization failed: Metadata for entity ApiKey not found')).toBe(true)
  })

  it('Yarn age gate is quarantine with the blocking package', () => {
    const log =
      '➤ YN0016: │ @acme/thing@npm:1.4.3: All versions satisfying "1.4.3" are quarantined (npmMinimalAgeGate)\n'
    const f = classifyStep('add', log, { attempt: 1 })
    expect([f.classification, f.blockedBy]).toEqual(['quarantine', '@acme/thing'])
  })

  it('network and runner errors are infra in any step', () => {
    for (const line of [
      'npm ERR! code E503',
      'getaddrinfo EAI_AGAIN registry.npmjs.org',
      'ENOSPC: no space left on device',
      'The operation was canceled.',
    ])
      expect(classifyStep('build', `x\n${line}\n`, { attempt: 1 }).classification).toBe('infra')
  })

  it('module rules win over infra tokens in the same log (review round 1)', () => {
    // A TS message that quotes a literal type with an infra token, on both attempts.
    const quoted = `src/index.ts(3,7): error TS2322: Type '"ECONNRESET"' is not assignable to type 'Code'.\n`
    for (const attempt of [1, 2]) {
      const f = classifyStep('typecheck', quoted, { attempt })
      expect([f.classification, f.rule]).toEqual(['module-fail', 'ts-error'])
    }
    // Module output with an infra token before the real TS failure of build.
    const build = [
      'fetch failed: connect ETIMEDOUT 10.0.0.1:443',
      'node_modules/@acme/x/src/a.ts(9,3): error TS2393: Duplicate function implementation.',
      'Failed to type check.',
    ].join('\n')
    expect(classifyStep('build', build, { attempt: 1 }).classification).toBe('module-fail')
    expect(classifyStep('build', build, { attempt: 2 }).classification).toBe('module-fail')
    // ECONNRESET next to a missing relation in initialize, and a type-check failure without a TS line.
    const init = 'read ECONNRESET\nerror: relation "acme_items" does not exist\n'
    expect(classifyStep('initialize', init, { attempt: 1 }).rule).toBe('missing-relation')
    expect(classifyStep('build', 'EAI_AGAIN x\nFailed to type check.\n', { attempt: 1 }).rule).toBe('type-check')
    // Infra alone stays infra.
    expect(classifyStep('build', 'getaddrinfo EAI_AGAIN fonts.googleapis.com\n', { attempt: 1 }).rule).toBe('infra')
  })

  it('heap out of memory in build: infra first, module-fail on the retry', () => {
    const log = 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\n'
    expect(classifyStep('build', log, { attempt: 1 }).classification).toBe('infra')
    expect(classifyStep('build', log, { attempt: 2 }).classification).toBe('module-fail')
  })

  it('tampered-files from steps.sh is module-fail (D47)', () => {
    const f = classifyStep('typecheck', '[harness] tampered-files: scripts tsconfig.json \n', { attempt: 1 })
    expect([f.classification, f.rule]).toEqual(['module-fail', 'tampered-files'])
  })

  it('tampered-files in add is module-fail too: add may change only dependencies (review round 2)', () => {
    const f = classifyStep('add', 'Added module\n[harness] tampered-files: scripts \n', { attempt: 1 })
    expect([f.classification, f.rule]).toEqual(['module-fail', 'tampered-files'])
  })

  it('a step timeout marked by steps.sh is one rule on both runners: infra first, module-fail on the retry', () => {
    const log = 'Creating an optimized production build ...\n[harness] step timed out: yarn build ran 600 s\n'
    expect(classifyStep('build', log, { attempt: 1 })).toMatchObject({ classification: 'infra', rule: 'step-timeout' })
    expect(classifyStep('build', log, { attempt: 2 }).classification).toBe('module-fail')
    const own = '[harness] step timed out after 280 s\n'
    expect(classifyStep('typecheck', own, { attempt: 2 }).classification).toBe('module-fail')
    // Before the module is involved a timeout stays infra.
    expect(classifyStep('install', own, { attempt: 2 }).classification).toBe('infra')
    // A module rule in the same log still wins.
    const ts = 'src/x.ts(1,2): error TS2304: Cannot find name y\n[harness] step timed out after 280 s\n'
    expect(classifyStep('typecheck', ts, { attempt: 1 }).rule).toBe('ts-error')
  })

  it('a cancelled step without a module rule is infra (job timeout, cancelled run, preview backstop)', () => {
    const f = classifyStep('build', 'Creating an optimized production build ...\n', { attempt: 1, cancelled: true })
    expect([f.classification, f.rule]).toEqual(['infra', 'cancelled'])
    const ts = classifyStep('build', 'src/x.ts(1,2): error TS2304: Cannot find name y\n', {
      attempt: 1,
      cancelled: true,
    })
    expect(ts.classification).toBe('module-fail')
  })

  it('unexplained failures: infra before the module is involved, module-fail from add on', () => {
    expect(classifyStep('install', 'something odd\n', { attempt: 1 }).classification).toBe('infra')
    expect(classifyStep('scaffold', '', { attempt: 1 }).classification).toBe('infra')
    expect(classifyStep('smoke', 'smoke: FAIL module api GET /api/x -> 500\n', { attempt: 1 }).classification).toBe(
      'module-fail',
    )
    expect(classifyStep('start', 'GET /login did not answer 200 in 180 s\n', { attempt: 1 }).classification).toBe(
      'module-fail',
    )
  })
})

describe('signatures and excerpts', () => {
  it('normalizes paths to file names, hex runs to h and numbers to #', () => {
    expect(normalizeErrorLine('/home/om-cell/app/src/a/b.ts(12,3): error TS2322: x 0x1f2e3d4c5b 42')).toBe(
      'b.ts(#,#): error TS#: x h #',
    )
    expect(errorSignature('build', 'a/b/c.ts(1,2): error TS1')).toBe(
      errorSignature('build', 'x/y/c.ts(9,9): error TS7'),
    )
    expect(errorSignature('build', 'c.ts(1,2): error TS1')).not.toBe(
      errorSignature('typecheck', 'c.ts(1,2): error TS1'),
    )
  })

  it('excerpts are plain printable text of at most 1200 characters', () => {
    const noisy = `\u001b[31merror\u001b[39m: boom — ${'x'.repeat(3000)}\u0007 secret ${'ab12'.repeat(12)}`
    const f = classifyStep('build', `${noisy}\n`, { attempt: 1 })
    expect(f.excerpt!.length).toBeLessThanOrEqual(EXCERPT_MAX)
    expect(f.excerpt).not.toMatch(/\u001b|\u0007|—/)
    expect(sanitizeLogText(`key ${'ab12'.repeat(12)}`)).toBe('key ab12ab...')
    expect(sanitizeLogText('Type <A> & B')).toBe('Type <A> & B')
  })
})

// @open-mercato/events on 0.9 and next, preview night of 23 Oct (round 5): GET /api/events has requireFeatures
// ['workflows.view'] and the empty preset has no workflows module. Open Mercato refuses the features of a disabled
// module even to a superadmin, so this is a finding about the module (it does not require workflows), not the harness.
const EVENTS_SMOKE = [
  'smoke: POST /api/auth/login -> 200',
  'smoke: backend GET /backend -> 200',
  'smoke: FAIL module api GET /api/events -> 403 (expected 2[0-9][0-9])',
  '{"error":"Forbidden","requiredFeatures":["workflows.view"]}',
  'smoke: 1 check(s) failed',
  'smoke: server log ok',
].join('\n')
const NEW_APP = (id: string): boolean | undefined => (id === 'workflows' ? false : id === 'auth' ? true : undefined)

describe('smoke 403 for a feature of a module the app does not enable', () => {
  it('the excerpt starts at the failed check, so the route and the body stay together', () => {
    const f = classifyStep('smoke', EVENTS_SMOKE, { attempt: 1 })
    expect([f.classification, f.rule]).toEqual(['module-fail', 'smoke-check'])
    expect(f.excerpt?.split('\n').slice(0, 2)).toEqual([
      'smoke: FAIL module api GET /api/events -> 403 (expected 2[0-9][0-9])',
      '{"error":"Forbidden","requiredFeatures":["workflows.view"]}',
    ])
  })

  it('reads the route, the features and their modules', () => {
    const f = classifyStep('smoke', EVENTS_SMOKE, { attempt: 1 })
    expect(forbiddenRoute(f.excerpt)).toEqual({
      route: 'GET /api/events',
      features: ['workflows.view'],
      modules: ['workflows'],
    })
  })

  it('says in one sentence which feature the route needs and that the empty preset does not enable its module', () => {
    const f = classifyStep('smoke', EVENTS_SMOKE, { attempt: 1 })
    expect(explainFailure('smoke', f.excerpt, { enabledInEmptyPreset: NEW_APP })).toBe(
      'GET /api/events needs the workflows.view feature, and the empty preset does not enable the workflows module.',
    )
  })

  it('an excerpt collected before this rule starts at the body: the sentence names no route', () => {
    const old =
      '{"error":"Forbidden","requiredFeatures":["workflows.view"]}\nsmoke: 1 check(s) failed\nsmoke: server log ok'
    expect(explainFailure('smoke', old, { enabledInEmptyPreset: NEW_APP })).toBe(
      'An API route of the module needs the workflows.view feature, and the empty preset does not enable the workflows module.',
    )
  })

  it('names the route of an old excerpt from the facts: the one smoke-checkable route with exactly those features', () => {
    const old =
      '{"error":"Forbidden","requiredFeatures":["workflows.view"]}\nsmoke: 1 check(s) failed\nsmoke: server log ok'
    const routes = [
      { method: 'GET', path: '/api/events', requireAuth: true, requireFeatures: ['workflows.view'] },
      { method: 'GET', path: '/api/events/stream', requireAuth: true, requireFeatures: [] },
    ]
    expect(explainFailure('smoke', old, { enabledInEmptyPreset: NEW_APP, routes })).toBe(
      'GET /api/events needs the workflows.view feature, and the empty preset does not enable the workflows module.',
    )
    // two routes with the same features: no guess
    const twice = [
      ...routes,
      { method: 'GET', path: '/api/events/x', requireAuth: true, requireFeatures: ['workflows.view'] },
    ]
    expect(explainFailure('smoke', old, { routes: twice })).toBe(
      'An API route of the module needs the workflows.view feature.',
    )
  })

  it('claims a disabled module only when the catalog knows it is off', () => {
    const f = classifyStep('smoke', EVENTS_SMOKE, { attempt: 1 })
    expect(explainFailure('smoke', f.excerpt)).toBe('GET /api/events needs the workflows.view feature.')
    const auth = EVENTS_SMOKE.replace('workflows.view', 'auth.users.list')
    expect(explainFailure('smoke', auth, { enabledInEmptyPreset: NEW_APP })).toBe(
      'GET /api/events needs the auth.users.list feature.',
    )
  })

  it('other failures have no sentence', () => {
    expect(explainFailure('typecheck', EVENTS_SMOKE, { enabledInEmptyPreset: NEW_APP })).toBeNull()
    expect(
      explainFailure('smoke', 'smoke: FAIL module api GET /api/x -> 500 (expected 2[0-9][0-9])\n<html>', {}),
    ).toBeNull()
    expect(explainFailure('smoke', null)).toBeNull()
  })
})
