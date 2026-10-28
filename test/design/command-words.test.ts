// The words of a command chip (review of 28 Oct): on a 375 px page the enterprise command
// (`OM_ENABLE_ENTERPRISE_MODULES=true`) and long package names scrolled sideways. A word breaks at '/' and before '@'
// (an environment setting at '_'); a short word moves to the next line whole, and a piece wider than the chip breaks
// at '-' and '.' as the last resort. The text is never changed.
import { h } from 'preact'
import { render } from 'preact-render-to-string'
import { describe, expect, it } from 'vitest'
import { CommandText } from '../../site/src/lib/ui.tsx'

const html = (text: string): string => render(h(CommandText, { text }))
const plain = (s: string): string =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&#64;/g, '@')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

describe('command words (review of 28 Oct)', () => {
  it('an environment setting breaks after a "_" of its name, never inside a word', () => {
    const out = html('echo OM_ENABLE_ENTERPRISE_MODULES=true >> .env && yarn generate')
    expect(out).toContain(
      'echo</span> <span class="nw">OM_</span><wbr/><span class="nw">ENABLE_</span><wbr/><span class="nw">ENTERPRISE_</span><wbr/><span class="nw">MODULES=true</span> <span class="nw">',
    )
    expect(plain(out)).toBe('echo OM_ENABLE_ENTERPRISE_MODULES=true >> .env && yarn generate')
  })

  it('a long package name breaks at "/" and "@", and a name wider than the chip also at "-"', () => {
    const out = html('yarn mercato module add @fullstackhouse/open-mercato-data-sync-durable@0.6.0 --allow-third-party')
    expect(out).toContain(
      'add</span> <span class="nw">@fullstackhouse/</span><wbr/><span class="cmd__w"><span class="nw">open-</span><wbr/><span class="nw">mercato-</span><wbr/><span class="nw">data-</span><wbr/><span class="nw">sync-</span><wbr/><span class="nw">durable</span></span><wbr/><span class="nw">@0.6.0</span> <span',
    )
    // short words stay one no-wrap token
    expect(out).toContain('<span class="nw">yarn</span> <span class="nw">mercato</span>')
    expect(plain(out)).toBe(
      'yarn mercato module add @fullstackhouse/open-mercato-data-sync-durable@0.6.0 --allow-third-party',
    )
  })

  it('a short name is one block: it moves to the next line whole and breaks inside only when wider than the chip', () => {
    expect(html('yarn add @freighttech/ui@0.14.9')).toContain(
      '<span class="cmd__w"><span class="nw">@freighttech/</span><wbr/><span class="nw">ui</span><wbr/><span class="nw">@0.14.9</span></span>',
    )
  })
})
