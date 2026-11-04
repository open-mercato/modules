// The static archive step of template validation (docs/specs/2026-10-29-templates.md, Phase 1a step 3): tarballs built
// in memory, no network. Limits, links and `.template` files, the root rules of the save tool (Yarn 4, core, one line),
// a readable src/modules.ts, engines, and the manifest cross-check, which only ever warns.
import { describe, expect, it } from 'vitest'
import { checkTemplateArchive, listed } from '../../lib/templates/archive.ts'
import { parseLockfile, frameworkNames } from '../../lib/templates/lockfile.ts'
import { modulesFromModulesTs } from '../../lib/templates/modules-ts.ts'
import {
  lockEntry,
  lockfile,
  MANIFEST,
  PACKAGE_JSON,
  SCAFFOLD_MODULES_TS,
  SCAFFOLD_OFFICIAL,
  SHA,
  templateArchive,
  YARN_LOCK,
} from './helpers.ts'

const TOP = `acme-b2b-portal-${SHA}`
const codes = (r: Awaited<ReturnType<typeof checkTemplateArchive>>) => r.findings.map((f) => `${f.severity}:${f.code}`)
const pkg = (patch: Record<string, unknown>) => `${JSON.stringify({ ...PACKAGE_JSON, ...patch }, null, 2)}\n`

/** The manifest the save tool writes for the scaffold: the same inventory, no `package` fields. */
function scaffoldManifest(patch: Record<string, unknown> = {}): string {
  const inv = modulesFromModulesTs(
    SCAFFOLD_MODULES_TS,
    new Map([['src/official-modules.generated.ts', SCAFFOLD_OFFICIAL]]),
  )
  return JSON.stringify({ ...MANIFEST, modules: inv.entries, ...patch })
}

describe('checkTemplateArchive', () => {
  it('passes a scaffold app and reads its facts', async () => {
    const r = await checkTemplateArchive(templateArchive())
    expect(r.findings).toEqual([])
    expect(r.facts.openMercato).toEqual({ version: '0.9.0', line: '0.9' })
    expect(r.facts.engines).toEqual({ node: '>=24' })
    expect(r.facts.packageManager).toBe('yarn@4.17.1')
    expect(r.facts.license).toEqual({ file: 'MIT', packageJson: null })
    expect(r.facts.manifest).toEqual({ state: 'absent' })
    const inv = r.facts.modules
    expect(inv?.unparsed).toEqual([])
    expect(inv?.entries.find((e) => e.id === 'ratelimit_probe')).toEqual({ id: 'ratelimit_probe', from: '@app' })
    expect(inv?.entries.find((e) => e.id === 'storage_s3')?.when).toBe('OM_ENABLE_STORAGE_S3')
  })

  it('a package released on its own line (@open-mercato/client) is not a second framework line', () => {
    const lock = parseLockfile(YARN_LOCK)
    expect([...frameworkNames(lock)].sort()).toEqual([
      '@open-mercato/core',
      '@open-mercato/enterprise',
      '@open-mercato/shared',
      '@open-mercato/storage-s3',
    ])
  })

  it('refuses .template files, links, special entries and paths outside the app, each by path', async () => {
    const r = await checkTemplateArchive(
      templateArchive({ '.env.template': 'A=1\n' }, [
        { path: `${TOP}/public/logo.png`, type: 'symlink', target: '/etc/passwd' },
        { path: `${TOP}/hard`, type: 'hardlink', target: `${TOP}/README.md` },
        { path: `${TOP}/pipe`, type: 'fifo' },
        { path: `${TOP}/../escape.txt`, content: 'x' },
      ]),
    )
    expect(codes(r)).toEqual(['error:archive-entry', 'error:template-file'])
    expect(r.findings[0]?.message).toBe(
      'only regular files and directories are allowed: ../escape.txt (parent directory segment), hard (type Link), pipe (type FIFO), public/logo.png (type SymbolicLink)',
    )
    expect(r.findings[1]?.message).toBe('create-mercato-app refuses paths ending in .template: .env.template')
  })

  it('stops at the tarball limits: download size, unpacked size and file count', async () => {
    const bytes = templateArchive()
    expect(codes(await checkTemplateArchive(bytes, { limits: { maxBytes: 100, maxFiles: 5000 } }))).toEqual([
      'error:archive-limit',
    ])
    const files = await checkTemplateArchive(bytes, { limits: { maxBytes: 50 * 1024 * 1024, maxFiles: 3 } })
    expect(files.findings.map((f) => f.message)).toEqual(['7 files, the limit is 3'])
    const big = templateArchive({ 'public/big.txt': 'x'.repeat(200_000) })
    const unpacked = await checkTemplateArchive(big, { limits: { maxBytes: 150_000, maxFiles: 5000 } })
    expect(unpacked.findings.map((f) => f.code)).toEqual(['archive-limit'])
    expect(unpacked.findings[0]?.message).toMatch(/bytes unpacked, the limit is 150000$/)
    expect(codes(await checkTemplateArchive(new TextEncoder().encode('not a tarball')))).toEqual([
      'error:archive-unreadable',
    ])
  })

  it('requires package.json with @open-mercato/core and Yarn 4, a Yarn 4 yarn.lock, and src/modules.ts', async () => {
    expect(codes(await checkTemplateArchive(templateArchive({ 'package.json': null })))).toEqual(['error:package-json'])
    const noCore = { ...PACKAGE_JSON.dependencies } as Record<string, string>
    delete noCore['@open-mercato/core']
    expect(
      codes(await checkTemplateArchive(templateArchive({ 'package.json': pkg({ dependencies: noCore }) }))),
    ).toEqual(['error:not-om-app'])
    const yarn3 = await checkTemplateArchive(templateArchive({ 'package.json': pkg({ packageManager: 'yarn@3.8.7' }) }))
    expect(yarn3.findings.map((f) => f.message)).toEqual(['package.json packageManager must be Yarn 4 (yarn@4.x)'])
    expect(codes(await checkTemplateArchive(templateArchive({ 'yarn.lock': null })))).toEqual(['error:yarn-lock'])
    const yarn1 = await checkTemplateArchive(
      templateArchive({ 'yarn.lock': '# yarn lockfile v1\n\n"@open-mercato/core@0.9.0":\n  version "0.9.0"\n' }),
    )
    expect(yarn1.findings.map((f) => f.code)).toEqual(['yarn-lock'])
    expect(codes(await checkTemplateArchive(templateArchive({ 'src/modules.ts': null })))).toEqual(['error:modules-ts'])
  })

  it('every @open-mercato dependency resolves in yarn.lock, all framework packages on one line', async () => {
    const stale = await checkTemplateArchive(
      templateArchive({
        'package.json': pkg({ dependencies: { ...PACKAGE_JSON.dependencies, '@open-mercato/ui': '0.9.0' } }),
      }),
    )
    expect(stale.findings.map((f) => f.message)).toEqual(['@open-mercato/ui has no entry in yarn.lock'])
    const mixed = lockfile([
      lockEntry('@open-mercato/client', '0.3.1'),
      lockEntry('@open-mercato/core', '0.9.0', { '@open-mercato/shared': '0.9.0' }),
      lockEntry('@open-mercato/enterprise', '0.9.0', { '@open-mercato/core': '0.9.0' }),
      lockEntry('@open-mercato/shared', '0.9.0'),
      lockEntry('@open-mercato/storage-s3', '0.8.2', { '@open-mercato/shared': '0.9.0' }),
    ])
    const r = await checkTemplateArchive(
      templateArchive({
        'yarn.lock': mixed,
        'package.json': pkg({ dependencies: { ...PACKAGE_JSON.dependencies, '@open-mercato/storage-s3': '0.8.2' } }),
      }),
    )
    expect(r.findings.map((f) => f.message)).toEqual([
      'the @open-mercato framework packages in yarn.lock span 2 lines (0.8, 0.9); keep them on one major.minor line',
    ])
  })

  it('refuses the framework monorepo', async () => {
    const r = await checkTemplateArchive(
      templateArchive({ 'packages/core/package.json': JSON.stringify({ name: '@open-mercato/core' }) }),
    )
    expect(codes(r)).toEqual(['error:monorepo'])
  })

  it('src/modules.ts must parse; a construct the inventory cannot read is a warning with its line', async () => {
    const broken = await checkTemplateArchive(templateArchive({ 'src/modules.ts': 'export const x = [\n  {\n' }))
    expect(broken.findings).toEqual([
      { severity: 'error', code: 'modules-ts', message: 'src/modules.ts has a syntax error at line 3' },
    ])
    const odd = await checkTemplateArchive(
      templateArchive({
        'src/modules.ts': `${SCAFFOLD_MODULES_TS}\nenabledModules.push({ ...extra })\n`,
      }),
    )
    expect(codes(odd)).toEqual(['warning:modules-ts-unparsed'])
    expect(odd.findings[0]?.message).toMatch(/^src\/modules\.ts: the module list cannot read line \d+ \(/)
  })

  it('reads mercato-template.json: one that matches the app passes, every difference is a warning', async () => {
    const same = await checkTemplateArchive(templateArchive({ 'mercato-template.json': scaffoldManifest() }), {
      declaredEnv: ['OPENAI_API_KEY'],
    })
    expect(same.findings).toEqual([])
    expect(same.facts.manifest.state).toBe('valid')

    const inv = JSON.parse(scaffoldManifest()) as { modules: { id: string; from: string; when?: string }[] }
    const modules = inv.modules
      .filter((m) => m.id !== 'auth')
      .map((m) => (m.id === 'storage_s3' ? { id: m.id, from: m.from, package: '@open-mercato/storage-s3@0.9.1' } : m))
    modules.push({ id: 'ghost', from: '@app' })
    const differs = await checkTemplateArchive(
      templateArchive({ 'mercato-template.json': scaffoldManifest({ modules, openMercato: '0.8.x' }) }),
      { declaredEnv: ['STRIPE_KEY'] },
    )
    expect(differs.findings.every((f) => f.severity === 'warning')).toBe(true)
    expect(differs.findings.map((f) => f.message)).toEqual([
      'mercato-template.json modules differ from src/modules.ts; not listed: auth from @open-mercato/core; not registered in src/modules.ts: ghost from @app; another when: storage_s3 from @open-mercato/storage-s3',
      'mercato-template.json names packages yarn.lock does not resolve: @open-mercato/storage-s3@0.9.1',
      'mercato-template.json says openMercato 0.8.x, yarn.lock pins @open-mercato/core 0.9.0',
      'env keys differ; missing from declares.env: OPENAI_API_KEY; missing from mercato-template.json: STRIPE_KEY',
    ])
  })

  it('an invalid manifest is a warning and is ignored', async () => {
    const json = await checkTemplateArchive(templateArchive({ 'mercato-template.json': '{ nope' }))
    expect(json.findings).toEqual([
      {
        severity: 'warning',
        code: 'manifest',
        message: 'mercato-template.json is not valid JSON; the catalog reads the app itself',
      },
    ])
    const schema = await checkTemplateArchive(
      templateArchive({ 'mercato-template.json': JSON.stringify({ ...MANIFEST, schema: 2, extra: true }) }),
    )
    expect(schema.findings.map((f) => f.message)).toEqual([
      'mercato-template.json does not match mercato-template-1.json at schema, (root)',
    ])
    expect(schema.facts.manifest).toEqual({ state: 'invalid' })
  })

  it('lists at most five items', () => {
    expect(listed(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toBe('a, b, c, d, e and 2 more')
  })
})
