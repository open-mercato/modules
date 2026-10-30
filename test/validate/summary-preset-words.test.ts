// The summary of a descriptor is followed by the computed level phrase in llms.txt and the cards (`Listed. Already on
// in a new app on 0.9 and next.`). Live review of 30 Oct, item 8: the Telemetry summary said `Off by default`, so its
// line read `Off by default ... Already on in a new app`. A package a new app registers never says on or off by
// default in its summary; the computed phrase says where a new app has it. Providers of web-research keep their own
// `on by default` (the library's choice of provider), since no new app registers them.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { ROOT } from '../emit/helpers.ts'

const DIR = join(ROOT, 'modules')
function ymls(dir = DIR): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? ymls(p) : n.endsWith('.yml') ? [p] : []
  })
}
/** Packages src/modules.ts of a new app registers, on the templates the tests keep. */
const registered = new Set(
  ['0.8.0', '0.9.0'].flatMap((v) =>
    [
      ...readFileSync(join(ROOT, 'test', 'fixtures', 'create-app', `modules-${v}.ts.txt`), 'utf8').matchAll(
        /from: '([^']+)'/g,
      ),
    ].map((m) => m[1]!),
  ),
)

describe('descriptor summaries of packages a new app registers', () => {
  it('telemetry is one of them', () => {
    expect(registered.has('@open-mercato/telemetry')).toBe(true)
  })

  it('never say on or off by default', () => {
    const hits = ymls()
      .map((f) => ({ f, d: parse(readFileSync(f, 'utf8')) as { npm?: string; summary?: string } }))
      .filter(({ d }) => !!d.npm && registered.has(d.npm) && /\b(?:on|off) by default\b/i.test(d.summary ?? ''))
      .map(({ f }) => relative(ROOT, f))
    expect(hits).toEqual([])
  })
})
