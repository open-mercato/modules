import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ROOT, readYaml } from './helpers.ts'

const pkg = JSON.parse(readFileSync(`${ROOT}/package.json`, 'utf8')) as {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  packageManager: string
  scripts: Record<string, string>
}

// spec 3.3: the full dependency list; other WPs may not add to it
const SPEC_3_3: Record<string, string> = {
  astro: '7.3.8',
  '@astrojs/preact': '6.0.6',
  preact: '10.29.8',
  '@astrojs/sitemap': '3.7.4',
  '@astrojs/check': '0.9.10',
  typescript: '6.0.3',
  zod: '4.6.5',
  yaml: '2.9.1',
  minisearch: '7.2.0',
  semver: '7.8.5',
  'ts-morph': '28.0.0',
  '@open-mercato/cli': '0.9.0',
  tar: '7.5.22',
  'p-limit': '7.3.3',
  'fastest-levenshtein': '1.0.16',
  'spdx-expression-parse': '5.0.0',
  'spdx-correct': '3.2.0',
  '@modelcontextprotocol/sdk': '1.32.1',
  '@cfworker/json-schema': '4.1.1',
  wrangler: '4.149.0',
  '@cloudflare/workers-types': '5.20261008.1',
  'takumi-js': '2.14.0',
  geist: '1.7.2',
  vitest: '5.0.3',
  '@playwright/test': '1.64.0',
  '@axe-core/playwright': '4.13.0',
  prettier: '3.9.9',
  '@types/node': '24.19.1',
  // www site migration (2026-11-24-www-site-migration.md of PR #23, Risks, Dependencies): the importer's HTML parser
  // and Markdown writer, dev only
  'hast-util-from-html': '2.1.0',
  'mdast-util-to-markdown': '2.2.3',
  'mdast-util-gfm-table': '2.0.1',
}

describe('repo configuration (spec 3.3, 3.4)', () => {
  it('pins exactly the dependencies of spec 3.3', () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies }
    expect(all).toEqual(SPEC_3_3)
    for (const v of Object.values(all)) expect(v).toMatch(/^\d+\.\d+\.\d+$/)
    expect(pkg.packageManager).toBe('yarn@4.18.1')
    expect(readFileSync(`${ROOT}/.nvmrc`, 'utf8').trim()).toBe('24.21.0')
  })

  it('has the scripts of spec 3.4', () => {
    expect(pkg.scripts.om).toBe('node lib/cli.ts')
    // the main site (www site migration, Phase 1a): its own astro check, and `build` writes both builds; the Worker for
    // the old hosts (Phase 1b): its own tsc with the Workers types
    expect(pkg.scripts.check).toBe(
      'tsc --noEmit && tsc -p mcp/tsconfig.json --noEmit && tsc -p workers/old-hosts/tsconfig.json --noEmit && astro check --tsconfig tsconfig.site.json && astro check --root www --tsconfig tsconfig.json && prettier --check . && node lib/cli.ts check-text',
    )
    expect(pkg.scripts.build).toBe('yarn build:run && yarn build:www')
    expect(pkg.scripts['build:run']).toBe('node lib/cli.ts emit --data .data && astro build --outDir dist-run')
    expect(pkg.scripts['build:www']).toBe('astro build --root www')
    expect(pkg.scripts.test).toBe('vitest run')
  })

  it('keeps dependency scripts off and the 14-day age gate on', () => {
    const y = readYaml(`${ROOT}/.yarnrc.yml`) as Record<string, unknown>
    expect(y).toMatchObject({
      nodeLinker: 'node-modules',
      enableScripts: false,
      enableTelemetry: false,
      npmMinimalAgeGate: '14d',
      npmPreapprovedPackages: ['@open-mercato/*'],
    })
  })

  it('ignores generated directories in Prettier but not descriptors or policy', () => {
    const lines = readFileSync(`${ROOT}/.prettierignore`, 'utf8').split('\n').filter(Boolean)
    // `.wp/` (review r3): the local notes and screenshots of the work packages, kept out of git by
    // .gitignore; a JSON file written there must not turn `yarn check` red
    // `.agents/`, `.claude/`, `.npm/`: untracked files the agent sandbox writes into the checkout
    // `.ai/`: the local operator files of the agent pipeline and its task worktrees, never committed
    // `dist-run/`, `dist-www/`: the two builds the merged layout composes dist/ from (lib/emit/pages-merge.ts)
    expect(lines).toEqual([
      'dist/',
      'dist-run/',
      'dist-www/',
      'out/',
      '.data/',
      'site/.generated/',
      'test/**/golden/',
      'quality/reviews/',
      '.wp/',
      '.agents/',
      '.claude/',
      '.ai/',
      '.npm/',
      // byte copies of the create-mercato-app scaffold, the modulesFromModulesTs contract (templates spec, rev. 7)
      'test/fixtures/templates/modules-from-modules-ts/scaffold-*',
      // the rich-text embeds of posts, kept byte for byte as Webflow serves them (lib/import-webflow/run.ts)
      'www/content/embeds/',
    ])
  })

  it('uses erasable TypeScript only, with mcp checked separately', () => {
    const ts = JSON.parse(readFileSync(`${ROOT}/tsconfig.json`, 'utf8')) as {
      compilerOptions: Record<string, unknown>
      exclude: string[]
    }
    expect(ts.compilerOptions).toMatchObject({
      target: 'ES2024',
      module: 'NodeNext',
      strict: true,
      noUncheckedIndexedAccess: true,
      erasableSyntaxOnly: true,
      verbatimModuleSyntax: true,
      allowImportingTsExtensions: true,
      jsxImportSource: 'preact',
    })
    // the modulesFromModulesTs fixtures are src/modules.ts files of apps, named `.ts` for the save tool's contract test
    expect(ts.exclude).toEqual(['mcp', 'test/fixtures/templates/modules-from-modules-ts'])
    const mcp = JSON.parse(readFileSync(`${ROOT}/mcp/tsconfig.json`, 'utf8')) as {
      compilerOptions: Record<string, unknown>
      include: string[]
    }
    expect(mcp.compilerOptions.types).toEqual(['@cloudflare/workers-types'])
    expect(mcp.compilerOptions.lib).toEqual(['ES2024'])
    expect(mcp.include).toEqual(['*.ts', '../lib/core/**/*.ts', '../lib/schema/**/*.ts'])
  })
})
