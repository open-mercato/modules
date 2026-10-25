import { describe, expect, it } from 'vitest'
import { absoluteUrl, href } from '../../site/src/lib/url.ts'

describe('href', () => {
  it('links the home page with a trailing slash, so Pages does not redirect it', () => {
    expect(href('/', '/modules')).toBe('/modules/')
    expect(href('/', '')).toBe('/')
    expect(absoluteUrl('https://open-mercato.github.io', '/', '/modules')).toBe(
      'https://open-mercato.github.io/modules/',
    )
  })
  it('links other pages without a trailing slash', () => {
    expect(href('/compat', '/modules')).toBe('/modules/compat')
    expect(href('/compat/', '/modules')).toBe('/modules/compat')
    expect(href('/m/@x/y?tab=readme#a', '/modules')).toBe('/modules/m/@x/y?tab=readme#a')
  })
})
