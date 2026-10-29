// Audit of 29 Oct (C04): a GitHub entry with no pinned tag has no installable version. Its card says so (`install:
// null`), but search_modules and raw/modules.md gave `npx create-mercato-module install <repo>`, which installs
// whatever the default branch holds. Every place that shows the command now says there is nothing to install;
// modules.json keeps its string (the schema is not nullable) and its description says not to run it then.
import { describe, expect, test } from 'vitest'
import { buildSearchIndex, installFields, searchModules, loadSearchIndex } from '../../lib/core/search.ts'
import { installSentence } from '../../lib/core/policy.ts'
import { IndexEntry, type ModulesIndex } from '../../lib/schema/published/modules.ts'
import { fixtureEmit, json, text } from './helpers.ts'
import { fixtureBuiltIn, LOC, loadFixture, NOW, SITE } from '../core/helpers.ts'

const fx = loadFixture()
const lines = fx.lines.lines
const latest = lines.find((l) => l.source === 'latest')!.key
const NOTHING = `Nothing to install: ${LOC.treg} has no installable version (no stable release or pinned tag).`
const index = json<ModulesIndex>(fixtureEmit(), 'modules.json')
const treg = index.entries.find((e) => e.locator === LOC.treg)!

describe('an unpinned GitHub entry has nothing to install anywhere (C04)', () => {
  test('the fixture entry is unpinned and refused', () => {
    expect(treg.npm).toBeNull()
    expect(treg.version.gitRef).toBeNull()
    expect(treg.agentPolicy[latest]?.reasons.map((r) => r.code)).toContain('UNPINNED_GIT')
  })

  test('search_modules gives the sentence on every line, never the command', () => {
    const data = buildSearchIndex({
      entries: index.entries,
      builtIn: fixtureBuiltIn(fx),
      lines,
      dataVersion: '1.0.0-1.h000000',
      generatedAt: NOW,
      site: SITE,
    })
    for (const l of lines) expect(installFields(data.modules[LOC.treg]!, l.key, latest).install, l.key).toBe(NOTHING)
    const hit = searchModules(loadSearchIndex(data), { query: 'enrichment' }).results.find(
      (r) => r.locator === LOC.treg,
    )
    expect(hit?.install).toBe(NOTHING)
  })

  test('raw/modules.md and the install sentence say it too', () => {
    expect(installSentence(treg, latest, treg.install.cli)).toBe(NOTHING)
    const raw = text(fixtureEmit(), 'raw/modules.md')
    expect(raw).toContain(NOTHING)
    expect(raw).not.toContain('npx create-mercato-module install Chmarusso/open-mercato-enrichment-treg')
  })

  test('the card keeps install: null; a pinned entry keeps its command', () => {
    expect(text(fixtureEmit(), 'm/github/chmarusso/open-mercato-enrichment-treg.md')).toContain('\ninstall: null\n')
    const pinned = { ...treg, version: { ...treg.version, gitRef: 'v1.0.0' } }
    expect(installSentence(pinned, latest, 'npx create-mercato-module install x --ref v1.0.0')).toBe(
      'Install: npx create-mercato-module install x --ref v1.0.0',
    )
  })

  test('modules.json keeps the string and says not to run it then', () => {
    const cli = IndexEntry.shape.install.shape.cli
    expect(cli.description).toContain('UNPINNED_GIT')
  })
})
