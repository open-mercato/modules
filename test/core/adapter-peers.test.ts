// An adapter's `yarn add` takes the catalog libraries it peers on (sandbox test of 28 Oct: in a new 0.9 app,
// @open-mercato/web-research-model peers on @open-mercato/web-research, which the app does not declare, and the adapter
// file `yarn generate` writes imports it). One rule in lib/core, so modules.json, the page, the markdown twin, llms.txt,
// search_modules and the agent prompt give the same command. Module commands do not change.
import { describe, expect, it } from 'vitest'
import { installInfo, peerLibrarySpecs, withPeerLibraries, type PeerLookup } from '../../lib/core/plan.ts'
import { INSTALLABLE_META_KEY } from '../../lib/core/policy.ts'
import { promptParts } from '../../lib/core/prompt.ts'
import { installFields, moduleMeta } from '../../lib/core/search.ts'
import type { IndexEntry } from '../../lib/schema/published/modules.ts'
import { LOC, SITE, fixtureEntry, loadFixture } from './helpers.ts'

const base = fixtureEntry(loadFixture(), LOC.stripe)

function entry(
  npm: string,
  kind: IndexEntry['kind'],
  versions: Record<string, string | null>,
  o: Partial<IndexEntry> = {},
): IndexEntry {
  const latest = versions['0.9'] ?? null
  return {
    ...base,
    locator: `npm:${npm}`,
    path: npm.slice(1),
    npm,
    kind,
    moduleIds: [],
    requires: [],
    replaces: [],
    version: {
      ...base.version,
      latest,
      preview: null,
      installableFrom: null,
      recommended: { '0.8': null, '0.9': null, next: null },
    },
    compat: { ...base.compat, inPresets: [], inEmptyPreset: [], ships: {}, isolation: {} },
    _meta: { [INSTALLABLE_META_KEY]: versions },
    install: { cli: `yarn add ${npm}@${latest}`, cmm: null, needsAllowThirdParty: false, moduleFlag: null },
    ...o,
  }
}

const lib = entry('@open-mercato/web-research', 'library', { '0.8': '0.8.0', '0.9': '0.9.0', next: '0.9.0' })
const peer = { raw: '@open-mercato/web-research', resolvesTo: 'npm:@open-mercato/web-research' }
const adapter = entry(
  '@open-mercato/web-research-model',
  'provider',
  { '0.8': '0.8.0', '0.9': '0.9.0', next: '0.9.0' },
  { requires: [peer] },
)
// a module that peers on a library keeps its own command: the plan installs the library in a command of its own
const module = entry(
  '@open-mercato/web-research-ui',
  'module',
  { '0.8': '0.8.0', '0.9': '0.9.0', next: '0.9.0' },
  {
    moduleIds: ['web_research_ui'],
    requires: [peer],
    install: {
      cli: 'yarn mercato module add @open-mercato/web-research-ui@0.9.0',
      cmm: 'npx create-mercato-module install @open-mercato/web-research-ui@0.9.0',
      needsAllowThirdParty: false,
      moduleFlag: null,
    },
  },
)
const all = [lib, adapter, module]
const find: PeerLookup = (l) => all.find((e) => e.locator === l)

describe('adapter peers (sandbox test of 28 Oct)', () => {
  it('modules.json: the adapter adds its peer library at the same release; the library and modules stay', () => {
    const out = withPeerLibraries(all, '0.9')
    expect(out[1]?.install.cli).toBe('yarn add @open-mercato/web-research@0.9.0 @open-mercato/web-research-model@0.9.0')
    expect(out[0]).toBe(lib)
    expect(out[2]).toBe(module)
  })

  it('every line gets the version of that line; without the catalog the command is the bare adapter', () => {
    const at = (line: string) => installInfo({ ...adapter, moduleFlag: null }, line, null, undefined, find).cli
    expect(at('0.8')).toBe('yarn add @open-mercato/web-research@0.8.0 @open-mercato/web-research-model@0.8.0')
    expect(at('next')).toBe('yarn add @open-mercato/web-research@0.9.0 @open-mercato/web-research-model@0.9.0')
    // the install plan passes no catalog: its order installs the library in a command of its own
    expect(installInfo({ ...adapter, moduleFlag: null }, '0.9').cli).toBe(
      'yarn add @open-mercato/web-research-model@0.9.0',
    )
  })

  it('a peer outside @open-mercato takes its own install version on the line', () => {
    const acmeLib = entry('@acme/search', 'library', { '0.8': '1.1.0', '0.9': '1.2.0', next: '1.2.0' })
    const acme = entry(
      '@acme/search-model',
      'provider',
      { '0.8': '2.0.0', '0.9': '2.0.1', next: '2.0.1' },
      { requires: [{ raw: '@acme/search', resolvesTo: 'npm:@acme/search' }] },
    )
    const look: PeerLookup = (l) => [acmeLib, acme].find((e) => e.locator === l)
    expect(peerLibrarySpecs(acme, '2.0.1', '0.9', look)).toEqual(['@acme/search@1.2.0'])
    expect(peerLibrarySpecs(acme, '2.0.0', '0.8', look)).toEqual(['@acme/search@1.1.0'])
    // a peer that is a module, or not in the catalog, is never added
    expect(
      peerLibrarySpecs({ ...acme, requires: [{ raw: 'x', resolvesTo: 'npm:@acme/x' }] }, '2.0.1', '0.9', look),
    ).toEqual([])
    expect(peerLibrarySpecs(module, '0.9.0', '0.9', find)).toEqual([])
  })

  it('search_modules on another line and the agent prompt give the same command', () => {
    const metas = { [lib.locator]: moduleMeta(lib), [adapter.locator]: moduleMeta(adapter) }
    const [withPeer] = withPeerLibraries([adapter, lib], '0.9')
    expect(installFields(moduleMeta(withPeer!), '0.8', '0.9', metas).install).toBe(
      'yarn add @open-mercato/web-research@0.8.0 @open-mercato/web-research-model@0.8.0',
    )
    expect(installFields(moduleMeta(withPeer!), '0.9', '0.9', metas).install).toBe(withPeer!.install.cli)
    expect(promptParts(withPeer!, { site: SITE, line: '0.9' }).command).toBe(withPeer!.install.cli)
    expect(promptParts(withPeer!, { site: SITE, line: '0.8', find }).command).toBe(
      'yarn add @open-mercato/web-research@0.8.0 @open-mercato/web-research-model@0.8.0',
    )
  })
})
