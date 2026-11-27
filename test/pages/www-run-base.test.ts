// The om-run-base plugin of the main site's build (www/run-base.ts): the shared header, footer and fonts of
// site/src/ link the catalog under its base, while the catalog's own source stays as it is.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isUrlModule, runBasePlugin, URL_BASE } from '../../www/run-base.ts'
import { ROOT } from '../emit/helpers.ts'

const URL_TS = join(ROOT, 'site', 'src', 'lib', 'url.ts')

describe('om-run-base (www/run-base.ts)', () => {
  it('finds the expression it rewrites in site/src/lib/url.ts, once', () => {
    expect(readFileSync(URL_TS, 'utf8').split(URL_BASE)).toHaveLength(2)
  })

  it('sets the base of url.ts to the catalog base and touches no other module', () => {
    const plugin = runBasePlugin('/run')
    const code = readFileSync(URL_TS, 'utf8')
    const out = plugin.transform(code, `${URL_TS}?v=1`)
    expect(out).toContain('export const BASE = normalizeBase("/run")')
    expect(out).not.toContain(URL_BASE)
    expect(plugin.transform(code, join(ROOT, 'site', 'src', 'lib', 'here.ts'))).toBeNull()
    expect(isUrlModule('/x/site/src/lib/url.ts')).toBe(true)
    expect(isUrlModule('/x/site/src/lib/url.tsx')).toBe(false)
  })

  it('stops the build when url.ts no longer reads the base that way', () => {
    expect(() => runBasePlugin('/run').transform('export const BASE = "/"', URL_TS)).toThrow(/no longer has/)
  })
})
