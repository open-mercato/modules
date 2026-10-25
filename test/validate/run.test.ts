// validate end to end: `--offline` over the 59 seed descriptors (spec 12.2 WP03/WP10), and a pull request in a
// throwaway git repository (`--changed=main`) with a valid new entry, a broken one, a removed one and a policy
// change, through the network steps against a fake registry. The summary keeps 10 lines per entry.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { main } from '../../lib/cli.ts'
import validate from '../../lib/commands/validate.ts'
import { loadCatalog } from '../../lib/validate/catalog.ts'
import {
  changedFiles,
  checkBuiltinCoverage,
  checkQualityReviews,
  reportFailed,
  runValidate,
} from '../../lib/validate/run.ts'
import { renderSummary } from '../../lib/validate/summary.ts'
import { catalogRepo, fakeHttp, git, moduleTarball, ROOT, seedTree, write } from './helpers.ts'

const NOW = new Date('2026-10-23T12:00:00Z')
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const log = console.log
  const err = console.error
  console.log = () => {}
  console.error = () => {}
  try {
    return await fn()
  } finally {
    console.log = log
    console.error = err
  }
}

describe('validate --offline on the seed descriptors', () => {
  it('passes all 59 entries through the offline steps (schema, path, texts, names, built-in map)', async () => {
    // the files `yarn om seed` writes, not the live modules/** that grows by pull requests (finding of 25 Oct)
    const seedRoot = await seedTree()
    const out = join(seedRoot, 'out')
    const summary = join(out, 'summary.md')
    const code = await quiet(() =>
      validate({
        args: ['--summary', summary],
        flags: { data: join(seedRoot, '.data'), out, offline: true, json: false },
        root: seedRoot,
      }),
    )
    expect(code).toBe(0)
    const report = JSON.parse(readFileSync(join(out, 'validate.json'), 'utf8')) as {
      entries: { status: string; findings: { severity: string }[] }[]
      global: { severity: string; code: string }[]
    }
    expect(report.entries).toHaveLength(59)
    expect(report.entries.filter((e) => e.status !== 'pass')).toEqual([])
    expect(report.entries.flatMap((e) => e.findings.filter((f) => f.severity !== 'info'))).toEqual([])
    // the 46 core modules of 0.9.0 are all mapped; ecommerce (0.10) is listed ahead of time in builtin-upcoming.yml,
    // so it is no `builtin-extra` (finding of 25 Oct)
    expect(report.global.map((g) => `${g.severity}:${g.code}`)).toEqual([])
    rmSync(seedRoot, { recursive: true, force: true })
  })

  it('passes every file of modules/ as it is now (any merged pull request keeps this)', async () => {
    const out = join(ROOT, 'out', 'test-validate-offline')
    const code = await quiet(() => main(['validate', '--offline', '--out', out]))
    expect(code).toBe(0)
    const report = JSON.parse(readFileSync(join(out, 'validate.json'), 'utf8')) as { entries: { status: string }[] }
    expect(report.entries.length).toBeGreaterThan(0)
    expect(report.entries.filter((e) => e.status === 'fail')).toEqual([])
    rmSync(out, { recursive: true, force: true })
  })

  it('a category for a core module neither core nor builtin-upcoming.yml knows is info builtin-extra', async () => {
    const catalog = await loadCatalog(ROOT, null)
    const map = { ...catalog.builtinCategories, teleport: 'operations' }
    expect(checkBuiltinCoverage({ ...catalog, builtinCategories: map }, ['ecommerce']).map((x) => x.message)).toEqual([
      'policy/builtin-categories.yml lists teleport, not in core 0.9.0 (@open-mercato/cli@0.9.0 (pinned; no data/builtin))',
    ])
  })

  it('OM Quality reviews: OMQ-01 to OMQ-12 once each, two different people, the file named after the version', () => {
    const root = mkdtempSync(join(tmpdir(), 'om-quality-'))
    const dir = join(root, 'quality', 'reviews', '@x', 'mod')
    mkdirSync(dir, { recursive: true })
    const items = Array.from({ length: 12 }, (_, i) => ({ id: `OMQ-${String(i + 1).padStart(2, '0')}`, pass: true }))
    const yaml = (it: { id: string; pass: boolean }[], reviewers: string[]) =>
      [
        'version: 1.0.0',
        'integrity: sha512-x',
        'checklistVersion: 1',
        'items:',
        ...it.map((x) => `  - { id: ${x.id}, pass: ${x.pass}, note: ok, file: null, line: null }`),
        `reviewers: [${reviewers.join(', ')}]`,
        'reviewedAt: 2026-10-23',
        'until: 2027-10-23',
        'reportUrl: https://github.com/open-mercato/modules/issues/1',
      ].join('\n')
    writeFileSync(join(dir, '1.0.0.yml'), yaml(items, ['a', 'b']))
    writeFileSync(
      join(dir, '2.0.0.yml'),
      yaml(
        items.map((x) => ({ ...x, id: 'OMQ-01' })),
        ['a', 'a'],
      ),
    )
    writeFileSync(join(dir, '3.0.0.yml'), yaml(items, ['a', 'b']))
    try {
      const f = checkQualityReviews(root, null)
      expect(f.map((x) => `${x.code}: ${x.message}`)).toEqual([
        'quality: quality/reviews/@x/mod/2.0.0.yml: items: items must be OMQ-01 to OMQ-12, each once (missing OMQ-02, OMQ-03, OMQ-04, OMQ-05, OMQ-06, OMQ-07, OMQ-08, OMQ-09, OMQ-10, OMQ-11, OMQ-12)',
        'quality: quality/reviews/@x/mod/2.0.0.yml: reviewers: reviewers must be different people',
        'quality-path: quality/reviews/@x/mod/3.0.0.yml: the file name must be the reviewed version, 1.0.0.yml',
      ])
      expect(checkQualityReviews(root, ['quality/reviews/@x/mod/1.0.0.yml'])).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('built-in coverage is an error when a core module has no category (only in validate)', async () => {
    const catalog = await loadCatalog(ROOT, null)
    const map = { ...catalog.builtinCategories }
    delete map.customers
    const f = checkBuiltinCoverage({ ...catalog, builtinCategories: map })
    expect(f.find((x) => x.severity === 'error')?.message).toBe(
      'policy/builtin-categories.yml misses core 0.9.0 module: customers',
    )
  })
})

describe('validate --changed on a pull request', () => {
  const repo = catalogRepo()
  afterAll(() => rmSync(repo, { recursive: true, force: true }))

  it('checks only what the PR changed, reads the network steps, and fails on the broken entry', async () => {
    write(
      repo,
      'modules/@acme-labs/om-loyalty.yml',
      `npm: "@acme-labs/om-loyalty"
github: acme-labs/om-loyalty
category: marketing-loyalty
summary: Loyalty points for customers, earned on paid orders and spent at checkout.
whenToUse: Use when the shop rewards repeat customers with points they can spend on later orders.
`,
    )
    write(
      repo,
      'modules/@acme-labs/om-crm-notes.yml',
      'npm: "@acme-labs/om-crm-notes"\ncategory: crm\nsummary: Notes.\n',
    )
    unlinkSync(join(repo, 'modules/@open-mercato/pay-by-links.yml'))
    write(repo, 'policy/reserved.yml', 'names: [catalog, directory, modules, official, open-mercato, mercato]\n')
    git(repo, 'add', '-A')
    git(repo, 'commit', '--quiet', '-m', 'pr')

    const ch = changedFiles(repo, 'main')
    expect(ch).toEqual({
      descriptors: ['modules/@acme-labs/om-crm-notes.yml', 'modules/@acme-labs/om-loyalty.yml'],
      removed: ['modules/@open-mercato/pay-by-links.yml'],
      policy: ['policy/reserved.yml'],
      quality: [],
    })

    const tarball = moduleTarball({
      name: '@acme-labs/om-loyalty',
      version: '1.2.0',
      id: 'loyalty',
      pkg: {
        repository: 'github:acme-labs/om-loyalty',
        peerDependencies: { '@open-mercato/core': '>=0.7.0 <0.8.0' },
      },
    })
    const seen: string[] = []
    const http = fakeHttp(
      {
        packages: [
          {
            name: '@acme-labs/om-loyalty',
            versions: {
              '1.2.0': { tarball, repository: 'github:acme-labs/om-loyalty', time: '2026-10-15T08:00:00.000Z' },
            },
          },
        ],
        repos: [{ nameWithOwner: 'acme-labs/om-loyalty' }],
      },
      seen,
    )
    const t0 = Date.now()
    const report = await runValidate({
      root: repo,
      catalog: await loadCatalog(repo, null),
      files: ch.descriptors,
      baseRef: 'main',
      removed: ch.removed,
      policyFiles: ch.policy,
      builtinCheck: false,
      labels: [],
      remote: { http, store: null, now: NOW, author: 'acme-labs' },
      now: NOW,
    })
    expect(Date.now() - t0).toBeLessThan(20_000)
    expect(reportFailed(report)).toBe(true)
    const [broken, loyalty] = report.entries
    expect(broken?.status).toBe('fail')
    expect(broken?.findings.map((f) => f.message)).toEqual([
      'category: "crm" is an old name of crm-sales; autofix rewrites it, or run yarn om format modules',
      'summary: min 20 characters',
      'whenToUse: required',
    ])
    expect(broken?.skipped.map((s) => s.step)).toEqual([
      'locator',
      'tarball',
      'license',
      'texts',
      'name',
      'anatomy',
      'lint',
      'claim',
    ])
    expect(loyalty?.status).toBe('pass')
    expect(loyalty?.rows.map((r) => r.check)).toEqual([
      'Kind',
      'License',
      'Ownership',
      'Anatomy',
      'Fits statically',
      'Built for',
      'Lint',
    ])
    expect(loyalty?.rows.find((r) => r.check === 'Built for')?.result).toBe(
      '>=0.7.0 <0.8.0 (bounded, 2 lines behind) · installable from 2026-10-20',
    )
    expect(loyalty?.rows.find((r) => r.check === 'Ownership')?.result).toBe('Claimed (repo-owner)')
    // only the new package was fetched, never the 59 existing entries
    expect(seen.filter((s) => s.includes('registry.npmjs.org')).every((s) => s.includes('om-loyalty'))).toBe(true)
    expect(report.global).toEqual([])
    expect(report.removed).toEqual(['modules/@open-mercato/pay-by-links.yml'])

    const md = renderSummary(report)
    const blocks = md.split('\n### ').slice(1)
    expect(blocks).toHaveLength(2)
    for (const b of blocks) expect(b.trim().split('\n').length).toBeLessThanOrEqual(10)
    expect(md).toContain('### `modules/@acme-labs/om-crm-notes.yml`: failed')
    expect(md).toContain('| Error | summary: min 20 characters |')
    expect(md).toContain('### `npm:@acme-labs/om-loyalty@1.2.0`: passed')
  })

  it('a broken policy file fails the check with the file and field', async () => {
    write(repo, 'policy/reserved.yml', 'names: [Not Valid]\n')
    git(repo, 'commit', '--quiet', '-am', 'bad policy')
    const report = await runValidate({
      root: repo,
      catalog: await loadCatalog(repo, null),
      files: [],
      baseRef: 'main',
      policyFiles: changedFiles(repo, 'main').policy,
      builtinCheck: false,
      labels: [],
      remote: null,
      now: NOW,
    })
    expect(report.global.map((g) => g.message)).toEqual([
      'policy/reserved.yml: names.0: Invalid string: must match pattern /^[a-z0-9-]{2,60}$/',
    ])
    expect(reportFailed(report)).toBe(true)
  })

  it('an unknown base ref is an environment error (exit 2)', async () => {
    expect(await quiet(() => main(['validate', '--changed=no-such-ref', '--offline']))).toBe(2)
  })
})
