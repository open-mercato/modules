// The OG card of the landings (www/src/lib/og-card.ts): a 1200 by 630 PNG whose fonts draw every letter of the
// landings' languages. A letter the card's font lacks renders as the missing-glyph box, the same picture as a code
// point no font has (U+E000), so each Polish letter must give another image than that.
import { describe, expect, it } from 'vitest'
import { OG_HEIGHT, OG_WIDTH, ogCardPng } from '../../www/src/lib/og-card.ts'

const size = (png: Uint8Array) => {
  const b = Buffer.from(png)
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

describe('www/src/lib/og-card.ts (Phase 5)', () => {
  it('draws a 1200 by 630 PNG', async () => {
    const png = await ogCardPng({ eyebrow: 'HubSpot alternative', title: 'Build the records you need.' })
    expect(Buffer.from(png).subarray(1, 4).toString()).toBe('PNG')
    expect(size(png)).toEqual([OG_WIDTH, OG_HEIGHT])
  })

  it('has a glyph for every Polish letter', async () => {
    const missing = Buffer.from(await ogCardPng({ eyebrow: 'x', title: '' }))
    for (const letter of [...'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ']) {
      const png = Buffer.from(await ogCardPng({ eyebrow: 'x', title: letter }))
      expect(png.equals(missing), letter).toBe(false)
    }
  }, 60_000)
})
