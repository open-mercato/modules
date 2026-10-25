// Finding of 25 Oct (WEB-001): without facts the identity license falls back to the npm packument, which no pull
// request reviews. licenseKind labelled any `(...)` as osi, so `(</script><script>...)` went into the page's
// JSON-LD as an SPDX id. Only a value that parses as an SPDX expression is osi now; the rest is unknown, no spdx.
import { describe, expect, it } from 'vitest'
import { buildIndexEntry } from '../../lib/core/entry.ts'
import { identityLicense, licenseKind } from '../../lib/core/signals.ts'
import { parseSpdx } from '../../lib/core/spdx.ts'
import type { SyncRecord } from '../../lib/schema/data/sync.ts'
import { IndexEntry } from '../../lib/schema/published/modules.ts'
import { fixtureCatalog, LOC, loadFixture, NOW, SITE } from './helpers.ts'

const fx = loadFixture()
const XSS = '(</script><script>alert(1)</script>)'

describe('licenseKind without facts', () => {
  it('a value that is not an SPDX expression is unknown', () => {
    expect(licenseKind(XSS, false)).toBe('unknown')
    expect(licenseKind('(anything at all)', false)).toBe('unknown')
    expect(licenseKind('MIT OR', false)).toBe('unknown')
    expect(licenseKind('(MIT', false)).toBe('unknown')
  })

  it('SPDX expressions keep their kind, parentheses included', () => {
    expect(licenseKind('MIT', false)).toBe('osi')
    expect(licenseKind('(MIT OR Apache-2.0)', false)).toBe('osi')
    expect(licenseKind('MIT AND (ISC OR BSD-2-Clause)', false)).toBe('osi')
    expect(licenseKind('Apache-2.0 WITH LLVM-exception', false)).toBe('osi')
    expect(licenseKind('UNLICENSED', false)).toBe('proprietary')
  })

  it('the kind is the tree of the expression, as in Rentgen (F06)', () => {
    expect(licenseKind('MIT AND BUSL-1.1', false)).toBe('proprietary')
    expect(licenseKind('MIT OR BUSL-1.1', false)).toBe('osi')
    expect(licenseKind('LicenseRef-Private', false)).toBe('unknown')
    expect(licenseKind('Apache-2.0 WITH Commons-Clause', false)).toBe('proprietary')
    expect(licenseKind('FOO-1.0', false)).toBe('unknown')
  })

  it('parseSpdx reads ids, plus, LicenseRef, WITH and the AND-before-OR order', () => {
    expect(parseSpdx('GPL-2.0+')).toEqual({ license: 'GPL-2.0', plus: true, exception: null })
    expect(parseSpdx('LicenseRef-Private')).toEqual({ license: 'LicenseRef-Private', plus: false, exception: null })
    expect(parseSpdx('MIT OR ISC AND Zlib')).toEqual({
      conjunction: 'or',
      left: { license: 'MIT', plus: false, exception: null },
      right: {
        conjunction: 'and',
        left: { license: 'ISC', plus: false, exception: null },
        right: { license: 'Zlib', plus: false, exception: null },
      },
    })
    expect(parseSpdx('MIT WITH')).toBeNull()
    expect(parseSpdx('AND')).toBeNull()
    expect(parseSpdx('MIT ISC')).toBeNull()
  })

  it('an entry without facts and that npm license has no license.spdx', () => {
    const sync = structuredClone(fx.sync(LOC.ksef) as SyncRecord)
    sync.npm!.license = XSS
    expect(identityLicense(null, sync, false)).toEqual({ spdx: null, kind: 'unknown', mismatch: false })
    const entry = IndexEntry.parse(
      buildIndexEntry({
        locator: LOC.ksef,
        descriptor: fx.descriptors.get(LOC.ksef)!,
        descriptorIssues: [],
        sync,
        facts: null,
        fit: {},
        receipts: [],
        lines: fx.lines.lines,
        claims: fx.claims,
        presets: fx.presets,
        stats: fx.stats,
        site: SITE,
        now: NOW,
        catalog: fixtureCatalog(fx),
      }),
    )
    expect(entry.license.spdx).toBeNull()
    expect(entry.license).toEqual({ spdx: null, kind: 'unknown', mismatch: false })
  })
})
