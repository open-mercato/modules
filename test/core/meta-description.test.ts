// The meta description of Base.astro: the catalog cuts it at 155 characters as before; the main site keeps it whole
// (owner's decision of 25 Nov 2026).
import { describe, expect, it } from 'vitest'
import { CATALOG_DESCRIPTION_MAX, metaDescription } from '../../site/src/lib/meta-description.ts'

const long = 'word '.repeat(60).trim()

describe('the meta description', () => {
  it('is cut at 155 characters on a catalog page', () => {
    expect(CATALOG_DESCRIPTION_MAX).toBe(155)
    expect(metaDescription(long, 'run')).toBe(long.slice(0, 155))
    expect(metaDescription('short', 'run')).toBe('short')
  })

  it('is whole on a main site page', () => {
    expect(metaDescription(long, 'main')).toBe(long)
  })
})
