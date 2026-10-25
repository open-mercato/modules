// The paper receipt (site/src/components/Receipt.astro) prints its values through these helpers. A list of seven
// installed requirements must wrap on a 360 px phone inside a 420 px paper (review r3: one nowrap span 896 px wide).
import { describe, expect, test } from 'vitest'
import {
  LOG_TOKEN_MAX,
  harnessText,
  issueText,
  logLineHtml,
  receiptValueHtml,
  receiptWord,
} from '../../site/src/lib/receipts.ts'

/**
 * The pieces a browser can never break: text between break opportunities, which are a <wbr> or a space outside every
 * `.nw` span (nested spans included).
 */
function unbreakable(html: string): string[] {
  const runs: string[] = []
  let cur = ''
  const stack: string[] = []
  const cut = (): void => {
    if (cur) runs.push(cur)
    cur = ''
  }
  for (const t of html.match(/<[^>]+>|[^<]+/g) ?? []) {
    const open = /^<span class="([^"]+)">$/.exec(t)
    if (open) stack.push(open[1] as string)
    else if (t === '</span>') stack.pop()
    else if (t === '<wbr>') {
      if (!stack.includes('nw')) cut()
    } else if (!t.startsWith('<')) {
      const nowrap = stack.includes('nw')
      const anywhere = !nowrap && stack.includes('rcpt__any')
      for (const ch of t.replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))) {
        if (ch === ' ' && !nowrap) cut()
        else {
          cur += ch
          if (anywhere) cut()
        }
      }
    }
  }
  cut()
  return runs
}

// the longest requires list of the preview receipts (@dainamite/billing on 0.8)
const REQUIRES = [
  'core:auth',
  'core:directory',
  'core:dictionaries',
  'core:configs',
  'core:sales',
  'core:payment_gateways',
  '@fullstackhouse/open-mercato-data-sync-durable@0.6.0',
].join(', ')

describe('receipt values', () => {
  test('a requires list breaks after every comma and inside a package name only at its slash or version', () => {
    const html = receiptValueHtml(REQUIRES, true)
    const runs = unbreakable(html)
    // 12 px Geist Mono is about 7.2 px a character; the value column of a 360 px paper is about 230 px wide
    expect(Math.max(...runs.map((r) => r.length))).toBeLessThanOrEqual(32)
    expect(runs).toContain('core:payment_gateways,')
    expect(runs).toContain('open-mercato-data-sync-durable')
    // every item is still whole: no break inside `core:payment_gateways`
    expect(html.replace(/<[^>]+>/g, '')).toBe(REQUIRES)
  })

  test('harness parts stay whole and break only at the separators', () => {
    const html = receiptValueHtml('a1b2c3 · node 24.21.0 · yarn 4.17.1')
    expect(unbreakable(html)).toEqual(['a1b2c3', '·', 'node 24.21.0', '·', 'yarn 4.17.1'])
  })

  test('a patch keeps `OM #7473` together and breaks before its parenthesis', () => {
    const runs = unbreakable(
      receiptValueHtml('agent-examples-tsconfig (OM\u00a0#6695), api-keys (OM\u00a0#7473)', true),
    )
    expect(runs).toEqual(['agent-examples-tsconfig', '(OM\u00a0#6695),', 'api-keys', '(OM\u00a0#7473)'])
  })

  test('a log line keeps identifiers whole but lets a long JSON body break anywhere', () => {
    const html = logLineHtml('GET /api/q returned {"error":"Forbidden","requiredFeatures":["sales.orders.view"]}')
    expect(html).toContain('<span class="rcpt__any">')
    expect(unbreakable(html).every((r) => r.length <= LOG_TOKEN_MAX)).toBe(true)
    expect(logLineHtml('ConsentsTable.tsx:154:13 TS2321 message')).not.toContain('rcpt__any')
  })

  test('a runner that did not record Yarn prints no yarn part', () => {
    expect(harnessText({ version: 'a1b2c3d4', node: '24.21.0', yarn: 'unknown' })).toBe('a1b2c3 · node 24.21.0')
    expect(harnessText({ version: 'a1b2c3d4', node: '24.21.0', yarn: '4.17.1' })).toBe(
      'a1b2c3 · node 24.21.0 · yarn 4.17.1',
    )
  })
})

describe('one state, one word on the receipt page (review r9)', () => {
  const r = (
    status: string,
    failedStep: string | null,
    module: { version: string } | null = { version: '0.8.0' },
    preset: 'classic' | 'empty' = 'classic',
  ) => ({ module, om: { preset }, result: { status, failedStep } }) as Parameters<typeof receiptWord>[0]

  test('a receipt of an app from the empty preset says so first (24 Oct): the signal in isolation', () => {
    expect(receiptWord(r('broken', 'smoke', { version: '0.8.0' }, 'empty'))).toBe('in isolation, broken at smoke')
    expect(receiptWord(r('verified', null, { version: '0.8.0' }, 'empty'))).toBe('in isolation, verified')
    expect(receiptWord(r('infra-error', null, { version: '0.8.0' }, 'empty'))).toBe('not judged')
  })

  test('a receipt of a new app keeps the dictionary word; a baseline passes', () => {
    expect(receiptWord(r('broken', 'typecheck'))).toBe('broken at typecheck')
    expect(receiptWord(r('verified', null))).toBe('verified')
    expect(receiptWord(r('harness-red', null))).toBe('not judged')
    expect(receiptWord(r('verified', null, null))).toBe('passed')
    expect(receiptWord(r('verified', null, null, 'empty'))).toBe('passed')
  })

  test('the issue text names the signal in isolation', () => {
    const rc = {
      module: { locator: 'npm:@open-mercato/events', version: '0.8.0', integrity: 'sha512-x' },
      om: { version: '0.8.0', preset: 'empty' },
      result: { status: 'broken', failedStep: 'smoke' },
      harness: { runner: 'preview-docker' },
      run: { url: 'file:///x' },
    } as unknown as Parameters<typeof issueText>[0]
    const t = issueText(rc, 'https://x/r/1', null)
    expect(t).toContain('`@open-mercato/events@0.8.0` on Open Mercato 0.8.0: in isolation, broken at smoke.')
  })
})
