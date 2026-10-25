// A page served elsewhere than its configured site rewrites its copy commands and links to the host it is on
// (finding of 25 Oct: the preview's `curl open-mercato.github.io/modules/llms.txt` answered 404).
import { describe, expect, test } from 'vitest'
import { hereScript, rewriteSite } from '../../site/src/lib/here.ts'

const FROM = 'https://open-mercato.github.io/modules'
const TO = 'https://3000-abc.apps.example.com/modules'

describe('rewriteSite', () => {
  test('the command, the scheme-less display and an encoded prompt all move to the page host', () => {
    expect(rewriteSite(`curl ${FROM}/llms.txt`, FROM, TO)).toBe(`curl ${TO}/llms.txt`)
    expect(rewriteSite('curl open-mercato.github.io/modules/llms.txt', FROM, TO)).toBe(
      'curl 3000-abc.apps.example.com/modules/llms.txt',
    )
    const prompt = `claude-cli://open?q=${encodeURIComponent(`Read ${FROM}/m/x.md`)}`
    expect(rewriteSite(prompt, FROM, TO)).toBe(`claude-cli://open?q=${encodeURIComponent(`Read ${TO}/m/x.md`)}`)
  })

  test('on the configured site nothing changes, and other hosts stay', () => {
    expect(rewriteSite(`curl ${FROM}/llms.txt`, FROM, FROM)).toBe(`curl ${FROM}/llms.txt`)
    expect(rewriteSite('https://www.npmjs.com/package/x', FROM, TO)).toBe('https://www.npmjs.com/package/x')
  })

  test('the inline script is plain JavaScript with the configured site', () => {
    const js = hereScript(`${FROM}/`, '/modules')
    expect(() => new Function(js)).not.toThrow()
    expect(js).toContain(JSON.stringify(FROM))
  })
})
