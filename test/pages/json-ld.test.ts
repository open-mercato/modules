// Finding of 25 Oct (WEB-001): the JSON-LD script of Base.astro went through JSON.stringify, which keeps `</script>`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { jsonLdText } from '../../site/src/lib/json-ld.ts'

const ROOT = join(import.meta.dirname, '..', '..')
const LS = String.fromCharCode(0x2028)
const PS = String.fromCharCode(0x2029)

describe('jsonLdText', () => {
  it('no value can close the script or open a comment, and the JSON reads back the same', () => {
    const value = { license: '</script><script>alert(1)</script>', name: 'a <!-- b --> & c', sep: `x${LS}y${PS}z` }
    const text = jsonLdText(value)
    for (const c of ['<', '>', '&', LS, PS]) expect(text).not.toContain(c)
    expect(text).toContain('\\u003c/script\\u003e')
    expect(JSON.parse(text)).toEqual(value)
  })

  it('Base.astro writes the JSON-LD through it', () => {
    const base = readFileSync(join(ROOT, 'site', 'src', 'layouts', 'Base.astro'), 'utf8')
    expect(base).toContain('set:html={jsonLdText(jsonLd)}')
    expect(base).not.toContain('JSON.stringify(jsonLd)')
  })
})
