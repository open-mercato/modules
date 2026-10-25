// /submit (spec 7.7 H, 12.2 WP13): the checks of SubmitForm on mocked npm, jsDelivr and GitHub answers, the four
// acceptance cases and the network errors that must never end as "Not found". The YAML the form builds is
// checked against `yarn om format` (it must pass unchanged) and the descriptor schema.
// OM_LIVE=1 runs the four cases against the real public APIs as well (read only).
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { Descriptor } from '../../lib/schema/descriptor.ts'
import { formatDescriptorText, yamlFiles } from '../../lib/validate/format.ts'
import {
  CORE_PACKAGE,
  TEXT,
  buildDescriptor,
  ciRejection,
  collisionBlock,
  collisionText,
  installCommand,
  installableText,
  listedMatches,
  listedRunText,
  noticeTag,
  stateBanners,
  cadenceText,
  effectiveTarget,
  descriptorIssues,
  descriptorYaml,
  emptyForm,
  formForCheck,
  formFromPackage,
  summaryFromDescription,
  gateFromFiles,
  liveRules,
  listingRequestUrl,
  parseTarget,
  peersCheck,
  pickVersion,
  pullRequestUrl,
  repoFromUrl,
  runChecks,
  showsCommand,
  targetKey,
  typosquatHits,
  type CatalogRef,
  type CheckContext,
  type Deps,
  type Target,
} from '../../site/src/islands/SubmitForm.tsx'

const REPO = 'https://github.com/wojciechszyjka/modules'
const KSEF = '@fastwhitecat/integration-ksef-direct'
const CONSENTS = '@piotrkarwatka/marketing-consents'
const STRAPI = '@sensinum/strapi-plugin-open-mercato'
const NEW = '@om-wp13-test/no-such-module-xyz'

const ref = (npm: string, path = npm, extra: Partial<CatalogRef> = {}): CatalogRef => ({
  locator: `npm:${npm}`,
  path,
  npm,
  github: null,
  title: npm,
  status: 'active',
  renamedFrom: [],
  ...extra,
})
const CTX: CheckContext = {
  catalog: [
    ref(KSEF, KSEF, {
      github: 'FastWhiteCat/openmercato-module-ksef',
      title: 'KSeF Integration',
      renamedFrom: ['npm:@fast-white-cat/integration-ksef-direct'],
    }),
    ref(CONSENTS),
    ref('@open-mercato/gateway-tpay'),
    ref('@open-mercato/gateway-payu'),
  ],
  ignore: [
    { locator: `npm:${STRAPI}`, reason: 'Strapi plugin, not an Open Mercato module.' },
    { locator: 'npm:@open-mercato/cezar*', reason: 'Framework infrastructure or tooling, not a module.' },
  ],
  coreVersion: '0.9.0',
  preapproved: ['@open-mercato/*'],
}

// ---------- mocked network ----------

type Answer = { status?: number; body?: unknown; headers?: Record<string, string> } | 'throw' | 'hang'
function mockFetch(routes: [RegExp, Answer][]): { deps: Deps; calls: string[] } {
  const calls: string[] = []
  const fetch: Deps['fetch'] = (url, init) => {
    calls.push(url)
    const hit = routes.find(([re]) => re.test(url))
    const a: Answer = hit ? hit[1] : { status: 404, body: {} }
    if (a === 'throw') return Promise.reject(new TypeError('Failed to fetch'))
    if (a === 'hang')
      return new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
      )
    return Promise.resolve(
      new Response(JSON.stringify(a.body ?? {}), {
        status: a.status ?? 200,
        headers: { 'content-type': 'application/json', ...(a.headers ?? {}) },
      }),
    )
  }
  return { deps: { fetch, timeoutMs: 50 }, calls }
}

const packument = (
  name: string,
  version: string,
  m: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
) => ({
  name,
  'dist-tags': { latest: version },
  versions: { [version]: { name, version, ...m } },
  time: { [version]: '2026-10-14T11:49:41.185Z' },
  ...extra,
})
const files = (...names: string[]) => ({ files: names.map((name) => ({ name })) })
const MODULE_FILES = (id: string) =>
  files(`/package.json`, `/src/modules/${id}/index.ts`, `/dist/modules/${id}/index.js`)
const repoJson = (full: string, license = 'MIT') => ({
  full_name: full,
  archived: false,
  license: { spdx_id: license },
  default_branch: 'main',
})

const KSEF_ROUTES: [RegExp, Answer][] = [
  [
    /registry\.npmjs\.org\/@fastwhitecat%2Fintegration-ksef-direct$/,
    {
      body: packument(KSEF, '0.1.8', {
        license: 'MIT',
        repository: { url: 'git+https://github.com/FastWhiteCat/openmercato-module-ksef.git' },
        peerDependencies: { '@open-mercato/core': '>=0.7.0 <0.8.0' },
      }),
    },
  ],
  [
    /jsdelivr\.com\/v1\/packages\/npm\/@fastwhitecat\/integration-ksef-direct@0\.1\.8/,
    { body: MODULE_FILES('integration_ksef_direct') },
  ],
  [
    /api\.github\.com\/repos\/FastWhiteCat\/openmercato-module-ksef$/,
    { body: repoJson('FastWhiteCat/openmercato-module-ksef') },
  ],
]
const CONSENTS_ROUTES: [RegExp, Answer][] = [
  [
    /registry\.npmjs\.org\/@piotrkarwatka%2Fmarketing-consents$/,
    {
      body: packument(CONSENTS, '0.1.0', {
        license: 'UNLICENSED',
        repository: { url: 'git+https://github.com/pkarw/marketing-consents.git' },
        peerDependencies: { '@open-mercato/core': '0.9.0', '@open-mercato/ui': '0.9.0', next: '16.3.6' },
      }),
    },
  ],
  [
    /jsdelivr\.com\/v1\/packages\/npm\/@piotrkarwatka\/marketing-consents@0\.1\.0/,
    { body: MODULE_FILES('marketing_consents') },
  ],
  [
    /api\.github\.com\/repos\/pkarw\/marketing-consents$/,
    { body: repoJson('pkarw/marketing-consents', 'NOASSERTION') },
  ],
]

const npm = (name: string): Target => ({ kind: 'npm', name })

// ---------- input ----------

describe('parseTarget', () => {
  test.each([
    ['@Scope/Name', { kind: 'npm', name: '@scope/name' }],
    ['https://www.npmjs.com/package/@fastwhitecat/integration-ksef-direct', { kind: 'npm', name: KSEF }],
    ['npm:create-mercato-module', { kind: 'npm', name: 'create-mercato-module' }],
    [`${KSEF}@0.1.8`, { kind: 'npm', name: KSEF }],
    ['Chmarusso/open-mercato-enrichment-treg', { kind: 'github', repo: 'Chmarusso/open-mercato-enrichment-treg' }],
    [
      'https://github.com/fullstackhouse/open-mercato-client-auth.git',
      { kind: 'github', repo: 'fullstackhouse/open-mercato-client-auth' },
    ],
    ['github:o/r', { kind: 'github', repo: 'o/r' }],
  ])('%s', (raw, want) => expect(parseTarget(raw)).toEqual(want))

  test('empty is null, garbage is invalid with a hint', () => {
    expect(parseTarget('  ')).toBeNull()
    expect(parseTarget('not a package!')).toMatchObject({ kind: 'invalid' })
  })
})

describe('gate from the jsDelivr file list (readGate)', () => {
  test('module pair', () => {
    expect(gateFromFiles(MODULE_FILES('visits').files.map((f) => f.name))).toEqual({
      installable: true,
      modules: [{ id: 'visits', src: true, dist: true }],
      hasSrc: true,
      reason: null,
    })
  })
  test('source without a build', () => {
    const g = gateFromFiles(['/src/modules/visits/index.ts', '/src/index.ts'])
    expect(g.installable).toBe(false)
    expect(g.reason).toBe('No dist/modules/visits/ in the published files (not built).')
  })
  test('no src at all', () => {
    const g = gateFromFiles(['/package.json', '/dist/server/index.js'])
    expect(g).toMatchObject({ installable: false, modules: [], hasSrc: false })
  })
})

test('repository URLs', () => {
  expect(repoFromUrl('git+https://github.com/pkarw/marketing-consents.git')).toBe('pkarw/marketing-consents')
  expect(repoFromUrl('github:o/r')).toBe('o/r')
  expect(repoFromUrl('https://gitlab.com/o/r')).toBeNull()
})

test('version pick (E2): latest when stable and not deprecated, else the highest stable', () => {
  const p = {
    'dist-tags': { latest: '0.9.0' },
    versions: { '0.9.0': {}, '1.0.1': { deprecated: 'use 0.9.x' }, '0.8.0': {}, '0.10.0-develop.1': {} },
  }
  expect(pickVersion(p)).toEqual({ version: '0.9.0', stable: true })
  expect(pickVersion({ ...p, 'dist-tags': { latest: '1.0.1' } })).toEqual({ version: '0.9.0', stable: true })
  expect(
    pickVersion({ 'dist-tags': { latest: '0.8.1-develop.7442' }, versions: { '0.8.1-develop.7442': {} } }),
  ).toEqual({
    version: '0.8.1-develop.7442',
    stable: false,
  })
})

test('lines sentence follows the cadence of each line (D6: 0.8 weekly)', () => {
  const lines = [
    { key: '0.8', cadence: 'weekly' as const },
    { key: '0.9', cadence: 'nightly' as const },
    { key: 'next', cadence: 'nightly' as const },
  ]
  expect(cadenceText(lines)).toBe('Lines tested: 0.9 and next every night, 0.8 once a week.')
  expect(cadenceText(lines.map((l) => ({ ...l, cadence: 'nightly' as const })))).toBe(
    'Lines tested: 0.8, 0.9 and next every night.',
  )
})

test('peer sentences', () => {
  expect(peersCheck({ '@open-mercato/core': '0.9.0' }, '0.9.0').text).toBe(
    'Peers pinned to 0.9.0, so an app on any other release of Open Mercato gets a Yarn peer warning.',
  )
  expect(peersCheck({ '@open-mercato/core': '>=0.7.0 <0.8.0' }, '0.9.0').level).toBe('warn')
  expect(peersCheck({ '@open-mercato/core': '^0.9.0' }, '0.9.0').level).toBe('ok')
  expect(peersCheck({ react: '^19' }, '0.9.0').text).toMatch(/^No @open-mercato peer dependencies/)
  // the range the sentence is about is marked on the page
  expect(peersCheck({ '@open-mercato/core': '>=0.7.0 <0.8.0' }, '0.9.0').range).toBe('>=0.7.0 <0.8.0')
})

test('an official package pinned to the release is in lockstep, not advised to widen', () => {
  expect(peersCheck({ '@open-mercato/core': '0.9.0' }, '0.9.0', '@open-mercato/onboarding')).toEqual({
    level: 'ok',
    text: 'Peers pinned to 0.9.0, in lockstep with Open Mercato.',
    range: '0.9.0',
  })
  // a pin to an older release is still advice, and a third-party pin always is
  expect(peersCheck({ '@open-mercato/core': '0.8.0' }, '0.9.0', '@open-mercato/onboarding').level).toBe('warn')
  expect(peersCheck({ '@open-mercato/core': '0.9.0' }, '0.9.0', CONSENTS).level).toBe('warn')
})

test('Installable: a future date is "From", a past one "Since"', () => {
  expect(installableText('2026-10-27', '2026-10-23')).toBe(
    'From 27 Oct 2026. New apps refuse it until then (Yarn 5-day age gate).',
  )
  // the age gate only, never a promise that it works (finding of 25 Oct)
  expect(installableText('2026-10-20', '2026-10-23')).toBe(
    'Past the Yarn 5-day age gate since 20 Oct 2026. The nightly run decides whether it installs.',
  )
  expect(installableText('2026-10-20', '2026-10-23', 'tool')).toBe(
    'Past the Yarn 5-day age gate since 20 Oct 2026. The nightly run installs modules only, so a tool is never verified.',
  )
  expect(installableText(null, '2026-10-23')).toBe('Unknown.')
})

test("a listed package's Installable fact carries the catalog's last run on the line (finding of 25 Oct)", () => {
  const row = {
    tier: 'listed' as const,
    verifiedOn: [],
    lines: {
      '0.9': { status: 'broken' as const, step: 'typecheck', at: '2026-10-24T03:12:00Z', moduleVersion: '0.2.0' },
      next: { status: 'verified' as const, step: null, at: '2026-10-24T03:40:00Z', moduleVersion: '0.2.0' },
      '0.8': { status: 'harness-red' as const, step: 'install', at: '2026-10-24T02:00:00Z', moduleVersion: '0.2.0' },
    },
    others: {},
  }
  expect(listedRunText(row, '0.9')).toBe('Broken at typecheck on 0.9 (24 Oct). See its page for the receipt.')
  expect(listedRunText(row, 'next')).toBe('Verified on next (24 Oct).')
  expect(listedRunText(row, '0.8')).toBe('Not judged on 0.8: our test app failed (24 Oct).')
  expect(listedRunText(undefined, '0.9')).toBeNull()
  expect(
    listedRunText(
      {
        ...row,
        others: { '0.9': { installs: '0.3.0', other: { status: 'broken', step: 'build', at: '2026-10-24' } } },
      },
      '0.9',
    ),
  ).toBe('On 0.9 a new app installs 0.3.0, which has no receipt yet.')
})

test('a bare word that is no npm package points at the listed modules it names (25 Oct)', () => {
  expect(listedMatches('ksef', CTX.catalog).map((c) => c.npm)).toEqual([KSEF])
  expect(listedMatches('KSeF Integration', CTX.catalog).map((c) => c.npm)).toEqual([KSEF])
  // a scoped name or a word too short to mean anything finds nothing
  expect(listedMatches('@acme/ksef', CTX.catalog)).toEqual([])
  expect(listedMatches('ks', CTX.catalog)).toEqual([])
})

test('every notice banner has a mono tag', () => {
  expect(noticeTag({ level: 'warn', text: TEXT.githubLimit })).toBe('Rate limit')
  expect(noticeTag({ level: 'error', text: TEXT.npmDown })).toBe('npm unreachable')
  expect(noticeTag({ level: 'error', text: collisionText(['customers'], '0.9.0') })).toBe('Core module ID')
  expect(noticeTag({ level: 'warn', text: 'Something new.' })).toBe('Check')
})

// ---------- the four acceptance cases (12.2 WP13) on mocks ----------

describe('acceptance cases', () => {
  test('ksef: already listed, gate passes', async () => {
    const { deps } = mockFetch(KSEF_ROUTES)
    const r = await runChecks(npm(KSEF), CTX, deps)
    expect(r.states).toEqual(['listed'])
    expect(r.existing?.path).toBe(KSEF)
    expect(r.gate?.installable).toBe(true)
    expect(r.kind).toBe('module')
    expect(r.license?.kind).toBe('osi')
    expect(r.notices).toEqual([])
    expect(r.license?.text).toBe('MIT')
    expect(showsCommand(r)).toBe(true)
  })

  test('consents: UNLICENSED and a pinned peer', async () => {
    const { deps } = mockFetch(CONSENTS_ROUTES)
    const r = await runChecks(npm(CONSENTS), CTX, deps)
    expect(r.states).toEqual(['listed'])
    expect(r.license).toMatchObject({ kind: 'proprietary', text: TEXT.unlicensed })
    expect(r.peers?.text).toBe(
      'Peers pinned to 0.9.0, so an app on any other release of Open Mercato gets a Yarn peer warning.',
    )
    expect(r.repo?.license).toBeNull() // NOASSERTION
  })

  test('a new fictional scoped package: npm 404 without CORS, the search probe proves npm answers', async () => {
    const { deps, calls } = mockFetch([
      [/registry\.npmjs\.org\/@om-wp13-test/, 'throw'],
      [/registry\.npmjs\.org\/-\/v1\/search/, { body: { objects: [] } }],
    ])
    const r = await runChecks(npm(NEW), CTX, deps)
    expect(r.states).toEqual(['not-found'])
    expect(r.notices).toEqual([])
    expect(calls.some((c) => c.includes('/-/v1/search?text=%40om-wp13-test%2Fno-such-module-xyz'))).toBe(true)
  })

  test('a packument blocked on the way while the search lists the package: npm unreachable, not Not found', async () => {
    const { deps } = mockFetch([
      [/registry\.npmjs\.org\/@om-wp13-test/, 'throw'],
      [
        /registry\.npmjs\.org\/-\/v1\/search/,
        { body: { objects: [{ package: { name: 'other' } }, { package: { name: NEW } }] } },
      ],
    ])
    const r = await runChecks(npm(NEW), CTX, deps)
    expect(r.states).not.toContain('not-found')
    expect(r.states).toEqual(['unknown'])
    expect(r.notices).toEqual([{ level: 'error', text: TEXT.npmDown }])
  })

  test('a search that lists only other names still means the package does not exist', async () => {
    const { deps } = mockFetch([
      [/registry\.npmjs\.org\/@om-wp13-test/, 'throw'],
      [/registry\.npmjs\.org\/-\/v1\/search/, { body: { objects: [{ package: { name: `${NEW}-2` } }] } }],
    ])
    expect((await runChecks(npm(NEW), CTX, deps)).states).toEqual(['not-found'])
  })

  test('a scoped name longer than 64 characters: the probe stays inside the search text limit', async () => {
    const long = `@om-wp13-test/${'very-long-module-name-'.repeat(4)}xyz`
    expect(long.length).toBeGreaterThan(64)
    const { deps, calls } = mockFetch([
      [/registry\.npmjs\.org\/@om-wp13-test/, 'throw'],
      // npm answers 400 ERR_TEXT_LENGTH when the search text is outside 2 to 64 characters
      [/registry\.npmjs\.org\/-\/v1\/search\?text=[^&]{69,}&/, { status: 400, body: { code: 'ERR_TEXT_LENGTH' } }],
      [/registry\.npmjs\.org\/-\/v1\/search/, { body: { objects: [] } }],
    ])
    const r = await runChecks(npm(long), CTX, deps)
    expect(r.states).toEqual(['not-found'])
    expect(r.notices).toEqual([])
    const probe = calls.find((c) => c.includes('/-/v1/search'))!
    expect(decodeURIComponent(new URL(probe).searchParams.get('text')!).length).toBeLessThanOrEqual(64)
  })

  test('an unscoped package npm reports as 404', async () => {
    const { deps } = mockFetch([
      [/registry\.npmjs\.org\/no-such-om-pkg$/, { status: 404, body: { error: 'Not found' } }],
    ])
    expect((await runChecks(npm('no-such-om-pkg'), CTX, deps)).states).toEqual(['not-found'])
  })

  test('strapi plugin: not an Open Mercato module (and ignored)', async () => {
    const { deps } = mockFetch([
      [
        /registry\.npmjs\.org\/@sensinum%2Fstrapi-plugin-open-mercato$/,
        { body: packument(STRAPI, '1.0.0', { license: 'MIT', peerDependencies: { '@strapi/strapi': '^5.7.0' } }) },
      ],
      [
        /jsdelivr\.com\/v1\/packages\/npm\/@sensinum/,
        { body: files('/package.json', '/dist/server/index.js', '/dist/admin/index.mjs') },
      ],
    ])
    const r = await runChecks(npm(STRAPI), CTX, deps)
    expect(r.states).toEqual(['not-module', 'ignored'])
    expect(r.ignored).toBe('Strapi plugin, not an Open Mercato module.')
    expect(r.kind).toBe('library')
    // no install command for a library on the ignore list
    expect(showsCommand(r)).toBe(false)
  })

  test('a GitHub repository listed under its npm name is Already listed, never a second GitHub-only entry', async () => {
    const gh: Target = { kind: 'github', repo: 'fastwhitecat/openmercato-module-ksef' }
    const { deps, calls } = mockFetch(KSEF_ROUTES)
    const r = await runChecks(gh, CTX, deps)
    expect(r.states).toEqual(['listed'])
    expect(r.existing?.npm).toBe(KSEF)
    expect(r.target).toEqual(gh)
    // checked as the npm package the catalog installs from
    expect(r.pkg?.version).toBe('0.1.8')
    expect(calls.some((c) => c.includes('/gh/'))).toBe(false)
    // the YAML and the preview are those of the npm entry (spec 4.3: npm takes precedence over github)
    expect(effectiveTarget(gh, r)).toEqual(npm(KSEF))
    expect(effectiveTarget(npm(KSEF), r)).toEqual(npm(KSEF))
  })

  test('a listed tool that ships no module keeps its kind: no red state, and an edit keeps kind tool (25 Oct)', async () => {
    const DEMO = '@fullstackhouse/open-mercato-demo-auth'
    const descriptor = {
      npm: DEMO,
      kind: 'tool',
      category: 'developer-tools',
      summary: 'Demo login switcher for Open Mercato apps with seeded users.',
      whenToUse: 'Use when a demo app needs one-click logins as seeded users.',
    }
    const ctx: CheckContext = { ...CTX, catalog: [ref(DEMO, DEMO, { kind: 'tool', descriptor })] }
    const { deps } = mockFetch([
      [
        /registry\.npmjs\.org\/@fullstackhouse%2Fopen-mercato-demo-auth$/,
        { body: packument(DEMO, '0.3.0', { license: 'MIT', peerDependencies: { '@open-mercato/core': '^0.9.0' } }) },
      ],
      [
        /jsdelivr\.com\/v1\/packages\/npm\/@fullstackhouse/,
        { body: files('/package.json', '/dist/index.js', '/src/index.ts') },
      ],
    ])
    const r = await runChecks(npm(DEMO), ctx, deps)
    // no bin, so the files alone read as a library; the curator's kind wins
    expect(r.kind).toBe('tool')
    expect(r.states).toEqual(['listed'])
    expect(r.notices.map((n) => n.text)).toContain(
      'Listed as a tool: no src/modules and dist/modules pair is expected.',
    )
    const f = formFromPackage(r, [], emptyForm())
    expect(buildDescriptor(npm(DEMO), r, f).kind).toBe('tool')
    expect(liveRules(npm(DEMO), r, [], []).find((x) => x.id === 'LST-3')).toMatchObject({ state: 'pass' })
  })

  test('an archived repository fails LST-2 and is a CI rejection, so the pull request stays off (25 Oct)', async () => {
    const gh: Target = { kind: 'github', repo: 'open-mercato/official-modules' }
    const { deps } = mockFetch([
      [
        /api\.github\.com\/repos\/open-mercato\/official-modules$/,
        { body: { ...repoJson('open-mercato/official-modules'), archived: true } },
      ],
      [/jsdelivr\.com\/v1\/packages\/gh\/open-mercato\/official-modules$/, { body: { versions: [] } }],
    ])
    const r = await runChecks(gh, CTX, deps)
    expect(liveRules(gh, r, [], []).find((x) => x.id === 'LST-2')).toEqual({
      id: 'LST-2',
      state: 'fail',
      text: 'Repository is archived.',
    })
    expect(ciRejection(gh, r)).toBe(
      'CI rejects an archived repository (open-mercato/official-modules). Unarchive it, or use Request listing.',
    )
  })

  test('a deprecated or prerelease-only package is a CI rejection; a stable one is not', async () => {
    const name = '@om-wp13-test/dep'
    const route = (m: Record<string, unknown>, v = '1.0.0'): [RegExp, Answer][] => [
      [/registry\.npmjs\.org\/@om-wp13-test%2Fdep$/, { body: packument(name, v, { license: 'MIT', ...m }) }],
      [/jsdelivr/, { body: MODULE_FILES('dep') }],
    ]
    const dep = await runChecks(npm(name), CTX, mockFetch(route({ deprecated: 'use @x/y' })).deps)
    expect(ciRejection(npm(name), dep)).toMatch(/^CI rejects a deprecated package\./)
    const pre = await runChecks(npm(name), CTX, mockFetch(route({}, '1.0.0-beta.1')).deps)
    expect(ciRejection(npm(name), pre)).toMatch(/^CI rejects a package without a stable version\./)
    const ok = await runChecks(npm(name), CTX, mockFetch(route({})).deps)
    expect(ciRejection(npm(name), ok)).toBeNull()
  })

  test('the YAML never names a repository GitHub does not know or that is archived (CI checks github too)', async () => {
    const name = '@om-wp13-test/repo'
    const routes = (repo: Answer): [RegExp, Answer][] => [
      [
        /registry\.npmjs\.org\/@om-wp13-test%2Frepo$/,
        { body: packument(name, '1.0.0', { license: 'MIT', repository: 'github:acme/repo' }) },
      ],
      [/jsdelivr/, { body: MODULE_FILES('repo') }],
      [/api\.github\.com\/repos\/acme\/repo$/, repo],
    ]
    const missing = await runChecks(npm(name), CTX, mockFetch(routes({ status: 404, body: {} })).deps)
    expect(buildDescriptor(npm(name), missing, emptyForm()).github).toBeUndefined()
    const archived = await runChecks(
      npm(name),
      CTX,
      mockFetch(routes({ body: { ...repoJson('acme/repo'), archived: true } })).deps,
    )
    expect(buildDescriptor(npm(name), archived, emptyForm()).github).toBeUndefined()
    const live = await runChecks(npm(name), CTX, mockFetch(routes({ body: repoJson('acme/repo') })).deps)
    expect(buildDescriptor(npm(name), live, emptyForm()).github).toBe('acme/repo')
  })

  test('renamed: an old name of a listed entry', async () => {
    const { deps } = mockFetch([[/registry/, { status: 404 }]])
    const r = await runChecks(npm('@fast-white-cat/integration-ksef-direct'), CTX, deps)
    expect(r.renamedTo?.path).toBe(KSEF)
    expect(r.states).toContain('renamed')
  })
})

// ---------- network errors never end as Not found or Not an Open Mercato module ----------

describe('network errors', () => {
  const never = (states: string[]) => {
    expect(states).not.toContain('not-found')
    expect(states).not.toContain('not-module')
  }

  test('GitHub 403 rate limit: a notice, the checks go on without repository data', async () => {
    const { deps } = mockFetch([
      ...KSEF_ROUTES.slice(0, 2),
      [
        /api\.github\.com/,
        {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0' },
          body: { message: 'API rate limit exceeded for 1.2.3.4.' },
        },
      ],
    ])
    const r = await runChecks(npm(KSEF), CTX, deps)
    never(r.states)
    expect(r.notices).toEqual([{ level: 'warn', text: TEXT.githubLimit }])
    expect(r.gate?.installable).toBe(true)
    expect(r.repo).toBeNull()
  })

  test('GitHub 403 rate limit on a GitHub-only entry: jsDelivr still gives the tag and the gate', async () => {
    const { deps } = mockFetch([
      [/api\.github\.com/, { status: 403, body: { message: 'API rate limit exceeded' } }],
      [
        /jsdelivr\.com\/v1\/packages\/gh\/fullstackhouse\/open-mercato-client-auth$/,
        { body: { versions: [{ version: '0.4.0' }, { version: '0.3.1' }] } },
      ],
      [
        /jsdelivr\.com\/v1\/packages\/gh\/fullstackhouse\/open-mercato-client-auth@0\.4\.0/,
        { body: files('/src/modules/client_auth/index.ts') },
      ],
    ])
    const r = await runChecks({ kind: 'github', repo: 'fullstackhouse/open-mercato-client-auth' }, CTX, deps)
    never(r.states)
    expect(r.states).toEqual(['github-only'])
    expect(r.repo?.tag).toBe('0.4.0')
    expect(r.gate).toMatchObject({
      installable: false,
      reason: 'No dist/modules/client_auth/ in the published files (not built).',
    })
    expect(r.notices.map((n) => n.text)).toEqual([TEXT.githubLimit])
  })

  test('jsDelivr 404 while the packument exists: the version is not on jsDelivr yet', async () => {
    const { deps } = mockFetch([KSEF_ROUTES[0]!, [/jsdelivr/, { status: 404, body: { status: 404 } }], KSEF_ROUTES[2]!])
    const r = await runChecks(npm(KSEF), CTX, deps)
    never(r.states)
    expect(r.gate).toBeNull()
    expect(r.notices).toEqual([{ level: 'warn', text: TEXT.jsdelivrLag }])
    expect(liveRules(npm(KSEF), r, [], []).find((x) => x.id === 'LST-3')?.state).toBe('unknown')
  })

  test('npm timeout: Could not reach npm', async () => {
    const { deps } = mockFetch([[/registry\.npmjs\.org/, 'hang']])
    const r = await runChecks(npm(NEW), CTX, deps)
    never(r.states)
    expect(r.states).toEqual(['unknown'])
    expect(r.notices).toEqual([{ level: 'error', text: TEXT.npmDown }])
  })

  test('npm unreachable and the probe too (offline): Could not reach npm, not Not found', async () => {
    const { deps } = mockFetch([[/registry\.npmjs\.org/, 'throw']])
    const r = await runChecks(npm(NEW), CTX, deps)
    never(r.states)
    expect(r.notices).toEqual([{ level: 'error', text: TEXT.npmDown }])
  })

  test('jsDelivr and GitHub timeouts: their own notices', async () => {
    const { deps } = mockFetch([KSEF_ROUTES[0]!, [/jsdelivr|github/, 'hang']])
    const r = await runChecks(npm(KSEF), CTX, deps)
    never(r.states)
    expect(r.notices.map((n) => n.text)).toEqual([TEXT.jsdelivrDown, TEXT.githubDown])
  })

  test('npm 5xx: Could not reach npm', async () => {
    const { deps } = mockFetch([[/registry\.npmjs\.org/, { status: 503 }]])
    const r = await runChecks(npm(KSEF), CTX, deps)
    never(r.states)
    expect(r.notices.map((n) => n.text)).toEqual([TEXT.npmDown])
  })
})

// ---------- core module IDs (lint collision-core) ----------

describe('core module IDs', () => {
  const BUILT_IN = { coreVersion: '0.9.0', ids: ['api_docs', 'customers', 'data_sync', 'workflows'] }
  const ctx: CheckContext = { ...CTX, builtIn: BUILT_IN }
  const routes = (name: string, ...ids: string[]): [RegExp, Answer][] => [
    [
      new RegExp(`registry\\.npmjs\\.org/${name.replace('/', '%2F')}$`),
      { body: packument(name, '0.9.0', { license: 'MIT', peerDependencies: { '@open-mercato/shared': '0.9.0' } }) },
    ],
    [
      /data\.jsdelivr\.com/,
      { body: files('/package.json', ...ids.flatMap((id) => MODULE_FILES(id).files.map((f) => f.name))) },
    ],
  ]

  test('@open-mercato/core is Open Mercato itself: its own state, no form, no command', async () => {
    const { deps } = mockFetch(routes(CORE_PACKAGE, 'api_docs', 'customers', 'workflows'))
    const r = await runChecks(npm(CORE_PACKAGE), ctx, deps)
    expect(r.states).toEqual(['core'])
    expect(r.collisions).toEqual([])
    expect(showsCommand(r)).toBe(false)
    expect(stateBanners(r.states)[0]?.tag).toBe('Open Mercato core')
  })

  test('a package that ships a core module ID collides: no "Ready", a sentence CI agrees with', async () => {
    const { deps } = mockFetch(routes('@someone/customers-plus', 'customers'))
    const r = await runChecks(npm('@someone/customers-plus'), ctx, deps)
    expect(r.collisions).toEqual(['customers'])
    expect(r.states).toEqual(['collision'])
    expect(r.notices).toEqual([
      {
        level: 'error',
        text: 'Module ID customers is built into Open Mercato 0.9.0. A module that replaces it needs replaces:, otherwise CI rejects the entry.',
      },
    ])
    expect(collisionText(['customers', 'workflows'], '0.9.0')).toMatch(/^Module IDs customers and workflows are built/)
  })

  test('a collision keeps the pull request closed until the author ticks replaces; then the YAML carries it', async () => {
    const { deps } = mockFetch(routes('@someone/customers-plus', 'customers'))
    const r = await runChecks(npm('@someone/customers-plus'), ctx, deps)
    const f = {
      ...emptyForm(),
      category: 'crm-sales',
      summary: 'Adds loyalty tiers to customer records.',
      whenToUse: 'Use when customers need loyalty tiers and points on top of the built-in records.',
    }
    expect(collisionBlock(r, f)).toBe(
      'Module ID customers is built into core. Rename the module, or tick that it replaces core.',
    )
    expect(buildDescriptor(npm('@someone/customers-plus'), r, f).replaces).toBeUndefined()
    const ticked = { ...f, replacesCore: true }
    expect(collisionBlock(r, ticked)).toBeNull()
    const d = buildDescriptor(npm('@someone/customers-plus'), r, ticked)
    expect(d.replaces).toEqual(['core:customers'])
    expect(descriptorIssues(d)).toEqual([])
  })

  test('a listed entry that declares replaces does not collide', async () => {
    const name = '@fullstackhouse/open-mercato-data-sync-durable'
    const c: CheckContext = { ...ctx, catalog: [ref(name, name, { replaces: ['data_sync'] })] }
    const { deps } = mockFetch(routes(name, 'data_sync'))
    const r = await runChecks(npm(name), c, deps)
    expect(r.collisions).toEqual([])
    expect(r.states).toEqual(['listed'])
  })
})

// ---------- summary from npm ----------

test('Summary takes the npm description, or its first sentence when the whole is over 140 characters (25 Oct)', () => {
  expect(summaryFromDescription('Sends and receives Polish structured e-invoices through the KSeF API v2.')).toBe(
    'Sends and receives Polish structured e-invoices through the KSeF API v2.',
  )
  expect(
    summaryFromDescription(
      'Sends and receives Polish structured e-invoices through the KSeF API v2. Works with the test and production endpoints and keeps every UPO receipt with the invoice.',
    ),
  ).toBe('Sends and receives Polish structured e-invoices through the KSeF API v2.')
  // one long sentence (sync-shopify, 195 characters) stays empty for the author to write
  expect(
    summaryFromDescription(
      "Shopify to Open Mercato Data Sync adapter: syncs products, variants, prices, collections, customers and orders from a Shopify store into Open Mercato's native catalog, customer and sales entities.",
    ),
  ).toBeNull()
  expect(summaryFromDescription('Too short.')).toBeNull()
  expect(summaryFromDescription('')).toBeNull()
})

// ---------- names ----------

test('typosquat (LST-6): same scope is fine, a near name elsewhere is flagged', () => {
  expect(typosquatHits(npm('@open-mercato/gateway-tpay'), CTX.catalog)).toEqual([])
  expect(typosquatHits(npm('@open-mercato/gateway-payu'), CTX.catalog)).toEqual([])
  expect(typosquatHits(npm('@evil/integration-ksef-direkt'), CTX.catalog)[0]?.other).toBe(`npm:${KSEF}`)
  // a near module name under a scope of its own is what CI warns about, as the same name (finding of 25 Oct)
  expect(typosquatHits(npm('@evil/integration-ksef-direkt'), CTX.catalog)[0]?.nearNameOnly).toBe(true)
  // a look-alike scope with a near name is not
  expect(typosquatHits(npm('@fastwhitecaat/integration-ksef-direkt'), CTX.catalog)[0]?.nearNameOnly).toBeUndefined()
})

// ---------- descriptor, YAML, links ----------

describe('descriptor YAML', () => {
  const forms = [
    {
      ...emptyForm(),
      category: 'localization-compliance',
      tags: 'ksef, e-invoicing, poland',
      summary: 'Sends and receives Polish structured e-invoices through the KSeF API v2.',
      whenToUse: 'Use when the app must issue or receive structured invoices in KSeF (Poland).',
      providers: [{ name: 'ksef', label: 'KSeF' }],
    },
    {
      ...emptyForm(),
      category: 'marketing-loyalty',
      tags: '',
      summary: 'Register of marketing consent proofs: exact text with a SHA-256 digest.',
      whenToUse: 'Use when the app must keep evidence of each marketing consent, with "reasons".',
    },
    {
      ...emptyForm(),
      category: 'payments-finance',
      tags: '2024, yes',
      summary: 'Payments: refunds and payouts through one gateway, for checkout.',
      whenToUse: 'Use when the shop needs: card payments and refunds in one place for orders.',
      providers: [{ name: 'p24', label: 'Przelewy24, PayU' }],
    },
  ]
  const targets: Target[] = [
    npm(KSEF),
    npm('create-mercato-module'),
    { kind: 'github', repo: 'Chmarusso/open-mercato-enrichment-treg' },
  ]

  test.each(forms.flatMap((f, i) => targets.map((t, j) => [`form ${i} on target ${j}`, f, t] as const)))(
    '%s passes yarn om format unchanged and the schema',
    async (_, f, t) => {
      const d = buildDescriptor(t, null, f)
      const yaml = descriptorYaml(d)
      const file = `modules/${t.kind === 'npm' ? t.name : `github/${t.repo.toLowerCase()}`}.yml`
      const formatted = await formatDescriptorText(yaml, file)
      expect(formatted.text).toBe(yaml)
      expect(parseYaml(yaml)).toEqual(d)
      expect(Descriptor.safeParse(parseYaml(yaml)).success).toBe(true)
    },
  )

  test('kind from the file list, repository from package.json', async () => {
    const { deps } = mockFetch(KSEF_ROUTES)
    const r = await runChecks(npm(KSEF), CTX, deps)
    const d = buildDescriptor(npm(KSEF), r, forms[0]!)
    expect(Object.keys(d)).toEqual(['npm', 'github', 'category', 'tags', 'summary', 'whenToUse', 'providers'])
    expect(d.github).toBe('FastWhiteCat/openmercato-module-ksef')
  })

  test('issues come from the Descriptor schema, in form words', () => {
    const issues = descriptorIssues(buildDescriptor(npm(NEW), null, emptyForm()))
    expect(issues.map((i) => i.path)).toEqual(expect.arrayContaining(['category', 'summary', 'whenToUse']))
    expect(issues.find((i) => i.path === 'category')?.message).toBe('Pick a category.')
    // LST-1 reads as one sentence, not "Descriptor: category choose a category."
    expect(liveRules(npm(NEW), null, issues, [])[0]?.text).toBe(issues[0]?.message)
  })

  test('pull request, edit and listing request URLs', () => {
    const yaml = descriptorYaml(buildDescriptor(npm(KSEF), null, forms[0]!))
    const url = new URL(pullRequestUrl(REPO, npm(KSEF), yaml))
    expect(`${url.origin}${url.pathname}`).toBe(`${REPO}/new/main`)
    expect(url.searchParams.get('filename')).toBe(`modules/${KSEF}.yml`)
    expect(url.searchParams.get('value')).toBe(yaml)
    const issue = new URL(listingRequestUrl(REPO, npm(KSEF), forms[0]!))
    expect(issue.searchParams.get('template')).toBe('listing-request.yml')
    expect(issue.searchParams.get('package')).toBe(KSEF)
    expect(issue.searchParams.get('when-to-use')).toBe(forms[0]!.whenToUse)
  })
})

// ---------- listed entries: the catalog file and command ----------

describe('listed entries', () => {
  const KSEF_FILE = readFileSync(`modules/${KSEF}.yml`, 'utf8')
  const descriptor = parseYaml(KSEF_FILE) as Record<string, unknown>
  const listed = ref(KSEF, KSEF, {
    github: 'FastWhiteCat/openmercato-module-ksef',
    renamedFrom: ['npm:@fast-white-cat/integration-ksef-direct'],
    cli: `yarn mercato module add ${KSEF}@0.1.7 --allow-third-party`,
    descriptor,
    fields: {
      category: descriptor.category as string,
      tags: descriptor.tags as string[],
      summary: descriptor.summary as string,
      whenToUse: descriptor.whenToUse as string,
      providers: descriptor.providers as { name: string; label: string }[],
    },
  })
  const ctx: CheckContext = { ...CTX, catalog: [listed] }

  test('Copy YAML of an unchanged listed entry is its file, curator fields included', async () => {
    const { deps } = mockFetch(KSEF_ROUTES)
    const r = await runChecks(npm(KSEF), ctx, deps)
    const f = {
      ...emptyForm(),
      category: descriptor.category as string,
      tags: (descriptor.tags as string[]).join(', '),
      summary: descriptor.summary as string,
      whenToUse: descriptor.whenToUse as string,
      providers: descriptor.providers as { name: string; label: string }[],
    }
    expect(descriptorYaml(buildDescriptor(npm(KSEF), r, f))).toBe(KSEF_FILE)
    // an edited summary replaces its key and keeps renamedFrom
    const edited = descriptorYaml(
      buildDescriptor(npm(KSEF), r, { ...f, summary: 'A new summary that is long enough.' }),
    )
    expect(edited).toContain('summary: A new summary that is long enough.')
    expect(edited).toContain('renamedFrom: ["npm:@fast-white-cat/integration-ksef-direct"]')
  })

  test('the header command of a listed entry is the catalog command (D46), not one built from the packument', async () => {
    const { deps } = mockFetch(KSEF_ROUTES)
    const r = await runChecks(npm(KSEF), ctx, deps)
    expect(r.pkg?.version).toBe('0.1.8')
    expect(installCommand(npm(KSEF), r)).toBe(`yarn mercato module add ${KSEF}@0.1.7 --allow-third-party`)
    expect(installCommand(npm(NEW), null)).toBeNull()
  })

  test('a Check of another package starts from an empty form, so no value of the previous one carries over', async () => {
    const { deps } = mockFetch(KSEF_ROUTES)
    const r = await runChecks(npm(KSEF), ctx, deps)
    const before = {
      ...emptyForm(),
      category: 'marketing',
      tags: 'i18n, content',
      summary: 'This plugin enables to create, to read and to update content in different languages.',
      whenToUse: 'Use when content needs translations.',
    }
    // checking the same package again keeps what the user typed
    const same = formFromPackage(r, [], formForCheck(before, targetKey(npm(KSEF)), targetKey(npm(KSEF))))
    expect(same.summary).toBe(before.summary)
    // checking another package fills every field from that package
    const other = formFromPackage(r, [], formForCheck(before, targetKey(npm(STRAPI)), targetKey(npm(KSEF))))
    expect(other.summary).toBe(descriptor.summary)
    expect(other.category).toBe(descriptor.category)
    expect(other.whenToUse).toBe(descriptor.whenToUse)
    expect(other.tags).toBe((descriptor.tags as string[]).join(', '))
    expect(targetKey({ kind: 'github', repo: 'Owner/Repo' })).toBe(targetKey({ kind: 'github', repo: 'owner/repo' }))
  })

  test('every descriptor in modules/ round-trips through the form YAML unchanged (comments aside)', () => {
    const all = yamlFiles(['modules'])
    expect(all.length).toBeGreaterThan(20)
    // a file comment is curator prose for the repository; the copied YAML carries the fields only
    const fields = (text: string): string => text.replace(/^(#.*\n)+\n?/, '')
    for (const file of all) {
      const text = readFileSync(file, 'utf8')
      expect(descriptorYaml(parseYaml(text) as Record<string, unknown>), file).toBe(fields(text))
    }
  })
})

test('strapi: one banner whose tag names both states', () => {
  expect(stateBanners(['not-module', 'ignored'])).toEqual([
    { s: 'ignored', tag: 'Ignored · Not an Open Mercato module' },
  ])
  expect(stateBanners(['not-module'])).toEqual([{ s: 'not-module', tag: 'Not an Open Mercato module' }])
})

// ---------- the same four cases on the real public APIs (read only) ----------

describe.runIf(process.env.OM_LIVE === '1')('live (OM_LIVE=1)', () => {
  const live: Deps = { fetch: (u, i) => fetch(u, i), timeoutMs: 15000 }
  test('ksef', async () => expect((await runChecks(npm(KSEF), CTX, live)).states).toEqual(['listed']), 30000)
  test('consents', async () => {
    const r = await runChecks(npm(CONSENTS), CTX, live)
    expect(r.license?.text).toBe(TEXT.unlicensed)
    expect(r.peers?.text).toBe(
      'Peers pinned to 0.9.0, so an app on any other release of Open Mercato gets a Yarn peer warning.',
    )
  }, 30000)
  test('new', async () => expect((await runChecks(npm(NEW), CTX, live)).states).toEqual(['not-found']), 30000)
  test('strapi', async () => expect((await runChecks(npm(STRAPI), CTX, live)).states).toContain('not-module'), 30000)
})
