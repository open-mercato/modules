// npm downloads (spec 4.5 SyncRecord.downloads30d): a failed call is said, never a silent null (finding of 25 Oct:
// visits and marketing-consents had no downloads while npm counted 218 and 29).
import { describe, expect, it } from 'vitest'
import type { Http } from '../../lib/sources/http.ts'
import { downloadsLastMonth } from '../../lib/sources/npm.ts'

function fakeHttp(answer: (url: string) => { status: number; json: unknown }): { http: Http; peak: () => number } {
  let open = 0
  let peak = 0
  const http = {
    request: async (url: string) => {
      open++
      peak = Math.max(peak, open)
      await new Promise((r) => setTimeout(r, 5))
      open--
      return { ...answer(url), text: '' }
    },
  } as unknown as Http
  return { http, peak: () => peak }
}

describe('downloadsLastMonth', () => {
  it('counts scoped names one at a time and says which call failed', async () => {
    const { http, peak } = fakeHttp((url) =>
      url.endsWith('%2Fvisits') || url.endsWith('/visits')
        ? { status: 429, json: { error: 'rate limited' } }
        : url.includes('new-one')
          ? { status: 404, json: { error: 'not found' } }
          : { status: 200, json: { downloads: 29 } },
    )
    const names = ['@piotrkarwatka/visits', '@piotrkarwatka/marketing-consents', '@x/new-one', '@a/b', '@c/d', '@e/f']
    const r = await downloadsLastMonth(http, names, { gapMs: 0 })
    expect(r.counts.get('@piotrkarwatka/marketing-consents')).toBe(29)
    expect(r.counts.get('@piotrkarwatka/visits')).toBeNull()
    expect(r.errors).toEqual(['downloads @piotrkarwatka/visits: HTTP 429'])
    // three at a time still met the rate limit of api.npmjs.org (finding of 25 Oct)
    expect(peak()).toBe(1)
  })
})
