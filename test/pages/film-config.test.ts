// The Config section of the X-ray film counts what it lists (audit R11, 28 Oct): @freighttech/ui has no module and
// six env names in its own src/ (rentgen 3 `packageCode`), and its header read `Config 0` above those six rows.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import type { Facts, ModuleFacts } from '../../lib/schema/index.ts'
import { configCount, configSection } from '../../site/src/lib/film-config.ts'
import { ROOT } from '../emit/helpers.ts'

const src = (line: number) => ({ file: 'src/index.ts', line })
const env = (name: string, line: number, ifSet = false) => ({
  name,
  src: src(line),
  ...(ifSet ? { ifSet: true as const } : {}),
})

/** Shaped like the facts of @freighttech/ui: no module, six env names in packageCode (the names are placeholders). */
const FREIGHTTECH_UI: NonNullable<Facts['packageCode']> = {
  env: [
    env('NEXT_PUBLIC_API_URL', 3),
    env('NEXT_PUBLIC_APP_URL', 4),
    env('NEXT_PUBLIC_MAPBOX_TOKEN', 5),
    env('NEXT_PUBLIC_SENTRY_DSN', 6, true),
    env('NODE_ENV', 7),
    env('TZ', 8, true),
  ],
  hosts: [],
}

const mod = (envNames: string[], credentials: ModuleFacts['config']['credentials'] = []) =>
  ({ config: { env: envNames.map((n, i) => env(n, i + 1)), credentials } }) as unknown as ModuleFacts

describe('Config section of the film (audit R11)', () => {
  test('a package without a module: six env rows, and the header says 6', () => {
    const c = configSection([], FREIGHTTECH_UI)
    expect(c.items.map((i) => i.text)).toEqual(FREIGHTTECH_UI.env.map((e) => e.name))
    expect(c.items.filter((i) => i.tag === 'if set').map((i) => i.text)).toEqual(['NEXT_PUBLIC_SENTRY_DSN', 'TZ'])
    expect(c.env).toBe(6)
    expect(configCount(c)).toEqual(['6'])
  })

  test('modules and package code add up, credentials named apart', () => {
    const secret = { key: 'apiKey', type: 'secret', required: true } as ModuleFacts['config']['credentials'][number]
    const c = configSection([mod(['A_URL']), mod(['B_URL'], [secret])], FREIGHTTECH_UI)
    expect(c.items).toHaveLength(9)
    expect([c.credentials, c.env]).toEqual([1, 8])
    expect(configCount(c)).toEqual(['1 credential', '8 env'])
    expect(configCount(configSection([], null))).toEqual(['0'])
  })

  test('AnatomyFilm.astro takes its Config rows and count from configSection', () => {
    const film = readFileSync(join(ROOT, 'site', 'src', 'components', 'AnatomyFilm.astro'), 'utf8')
    expect(film).toContain('configSection(ms, pkgCode)')
    expect(film).toMatch(/config: configCount\(/)
    expect(film).not.toMatch(/const envN\b/)
  })
})
