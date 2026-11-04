// The template catalog fixture (test/fixtures/templates/catalog/templates/) and a fake GitHub that serves its
// repositories: what `sync` reads for templates, with no network. test/templates/golden/data/ holds what sync writes
// from it, and the emitter tests read that as the template part of the data branch.
import { cpSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { modulesFromModulesTs } from '../../lib/templates/modules-ts.ts'
import type { FakeRepo, FakeWorld } from '../validate/helpers.ts'
import {
  lockEntry,
  lockfile,
  MANIFEST,
  PACKAGE_JSON,
  SCAFFOLD_MODULES_TS,
  SCAFFOLD_OFFICIAL,
  templateArchive,
} from './helpers.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(HERE, '..', '..')
export const CATALOG = join(ROOT, 'test', 'fixtures', 'templates', 'catalog', 'templates')
/** What sync writes for the fixture (golden files, updated with -u). */
export const TEMPLATE_DATA = join(HERE, 'golden', 'data')
export const MODULE_DATA = join(ROOT, 'test', 'fixtures', 'data')
export const NOW = new Date('2026-11-04T06:00:00Z')

export const SHA = {
  b2b: 'b2b0000000000000000000000000000000000120',
  b2bMain: 'b2b00000000000000000000000000000000000ff',
  crm: 'c4a0000000000000000000000000000000000072',
  kiosk: 'a1e0000000000000000000000000000000000009',
  prm: 'f0a0000000000000000000000000000000000410',
  old: '01d0000000000000000000000000000000000001',
} as const

const top = (repo: string, sha: string) => `${repo.split('/')[1]}-${sha}`

/** The manifest the save tool would write for the 0.9.0 scaffold: its modules, `package` as yarn.lock resolves it. */
export function scaffoldManifest(env: { name: string; description?: string; link?: string }[] = []): string {
  const versions: Record<string, string> = {
    '@open-mercato/enterprise': '0.9.0',
    '@open-mercato/storage-s3': '0.9.0',
  }
  const inv = modulesFromModulesTs(
    SCAFFOLD_MODULES_TS,
    new Map([['src/official-modules.generated.ts', SCAFFOLD_OFFICIAL]]),
  )
  const modules = inv.entries.map((e) => ({
    id: e.id,
    from: e.from,
    ...(versions[e.from] ? { package: `${e.from}@${versions[e.from]}` } : {}),
    ...(e.when ? { when: e.when } : {}),
  }))
  return `${JSON.stringify({ ...MANIFEST, env, modules }, null, 2)}\n`
}

/** A small app on one framework line, with its own `src/modules.ts`. */
function smallApp(version: string, modulesTs: string, extra: Record<string, string> = {}): Record<string, string> {
  const pkg = {
    ...PACKAGE_JSON,
    name: 'small-app',
    dependencies: {
      '@open-mercato/core': version,
      '@open-mercato/shared': version,
      '@open-mercato/enterprise': version,
    },
  }
  return {
    'package.json': `${JSON.stringify(pkg, null, 2)}\n`,
    'yarn.lock': lockfile([
      lockEntry('@open-mercato/core', version, { '@open-mercato/shared': version }),
      lockEntry('@open-mercato/enterprise', version, { '@open-mercato/core': version }),
      lockEntry('@open-mercato/shared', version),
    ]),
    'src/modules.ts': modulesTs,
    'src/official-modules.generated.ts': '',
    ...extra,
  }
}

/** A field CRM on 0.7.2 that registers `sso` without a condition: the Enterprise mark. */
export const CRM_MODULES_TS = `import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'

export type ModuleEntry = { id: string; from?: string }

export const enabledModules: ModuleEntry[] = [
  { id: 'auth', from: '@open-mercato/core' },
  { id: 'customers', from: '@open-mercato/core' },
  { id: 'currencies' },
  { id: 'field_visits', from: '@app' },
  { id: 'sso', from: '@open-mercato/enterprise' },
]

if (parseBooleanWithDefault(process.env.OM_ENABLE_ENTERPRISE_MODULES_SECURITY, false)) {
  enabledModules.push({ id: 'security', from: '@open-mercato/enterprise' })
}
`

/** PRM pins 0.4.10 and has no license. */
export const PRM_MODULES_TS = `export const enabledModules = [
  { id: 'auth', from: '@open-mercato/core' },
  { id: 'directory', from: '@open-mercato/core' },
  { id: 'partners', from: '@app' },
]
`

const repos: FakeRepo[] = [
  {
    nameWithOwner: 'acme/b2b-portal',
    ownerType: 'Organization',
    branches: { main: SHA.b2bMain },
    tagShas: { 'v1.2.0': SHA.b2b },
    contains: { main: [SHA.b2b] },
    isTemplate: true,
    stars: 42,
    pushedAt: '2026-10-30T12:00:00Z',
    topics: ['open-mercato-template', 'open-mercato'],
  },
  {
    nameWithOwner: 'acme/field-crm',
    fullName: 'acme-labs/field-crm',
    branches: { main: SHA.crm },
    license: 'Apache-2.0',
    stars: 7,
  },
  { nameWithOwner: 'acme/kiosk', archived: true, branches: { main: SHA.kiosk }, license: null, stars: 1 },
  {
    nameWithOwner: 'open-mercato/ready-app-oss-prm',
    ownerType: 'Organization',
    branches: { main: SHA.prm },
    license: null,
    pushedAt: '2026-05-10T09:00:00Z',
  },
  { nameWithOwner: 'acme/old-portal', branches: { main: SHA.old } },
]

/** The fake GitHub of the fixture: repositories and the archive of each synced sha. */
export function templateWorld(): FakeWorld {
  return {
    repos,
    archives: {
      [`acme/b2b-portal@${SHA.b2b}`]: templateArchive(
        {
          'mercato-template.json': scaffoldManifest([
            { name: 'OPENAI_API_KEY', description: 'Used by the AI assistant.' },
          ]),
        },
        [],
        top('acme/b2b-portal', SHA.b2b),
      ),
      [`Acme/Field-CRM@${SHA.crm}`]: templateArchive(
        smallApp('0.7.2', CRM_MODULES_TS, {
          LICENSE: 'Apache License\nVersion 2.0, January 2004\n',
        }),
        [],
        top('acme/field-crm', SHA.crm),
      ),
      [`acme/kiosk@${SHA.kiosk}`]: templateArchive(
        {
          'mercato-template.json': scaffoldManifest([
            { name: 'KIOSK_SCREEN_TOKEN', description: 'Token the shop screen signs in with.' },
          ]),
        },
        [],
        top('acme/kiosk', SHA.kiosk),
      ),
      [`open-mercato/ready-app-oss-prm@${SHA.prm}`]: templateArchive(
        { ...smallApp('0.4.10', PRM_MODULES_TS), LICENSE: null, 'src/modules/quotes_portal/index.ts': null },
        [],
        top('open-mercato/ready-app-oss-prm', SHA.prm),
      ),
    },
  }
}

/** A throwaway repo root (not a git checkout, so `firstSeenAt` is the clock) with the catalog fixture and module data. */
export function syncRoot(): { root: string; templates: string; data: string; out: string } {
  const root = mkdtempSync(join(tmpdir(), 'om-tsync-'))
  const templates = join(root, 'templates')
  const data = join(root, 'data')
  const out = join(root, 'out')
  cpSync(CATALOG, templates, { recursive: true })
  cpSync(MODULE_DATA, data, { recursive: true })
  mkdirSync(out, { recursive: true })
  return { root, templates, data, out }
}
