// The title and description of a receipt page (site/src/lib/receipt-meta.ts, audit of 27 Nov 2026): short titles, and
// no two receipts with one description.
import { describe, expect, it } from 'vitest'
import { receiptDescription, receiptHash, receiptTitle } from '../../site/src/lib/receipt-meta.ts'

describe('receipt meta', () => {
  it('titles a receipt by its hash, the unscoped package and the short version', () => {
    expect(receiptHash('r_20261116_032ca8f9281e')).toBe('032ca8f9281e')
    expect(receiptHash('custom-id')).toBe('custom-id')
    const t = receiptTitle(
      'r_20261116_032ca8f9281e',
      '@fullstackhouse/open-mercato-data-sync-durable',
      '0.10.1-develop.8214.1.2a8d49710f',
    )
    expect(t).toBe('Receipt 032ca8f9281e · open-mercato-data-sync-durable on 0.10.1-develop.8214')
    expect(t.length).toBeLessThan(80)
    expect(receiptTitle('r_20261105_971197f20239', 'Open Mercato itself', '0.9.0')).toBe(
      'Receipt 971197f20239 · Open Mercato itself on 0.9.0',
    )
  })

  it('gives two receipts of the same subject, version, result and day two descriptions', () => {
    const sentence = 'Open Mercato itself on Open Mercato 0.9.0: passed, 5 Nov 2026.'
    const a = receiptDescription(sentence, 'r_20261105_971197f20239')
    const b = receiptDescription(sentence, 'r_20261105_e5f612bd10e0')
    expect(a).toBe('Open Mercato itself on Open Mercato 0.9.0: passed, 5 Nov 2026. Receipt r_20261105_971197f20239.')
    expect(a).not.toBe(b)
  })
})
