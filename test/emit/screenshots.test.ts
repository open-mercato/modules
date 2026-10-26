// Screenshots in the published files (26 Oct): a file the catalog hosts is copied to `shots/<folder>/<name>` and its
// src carries the base path; an https src stays; modules.json, /m/<path>.json and the card say the same; a missing file
// is a warning and is left out; no screenshots, no key.
import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildEmit } from '../../lib/emit/index.ts'
import { basePrefix, publishedScreenshots, shotPath } from '../../lib/emit/screenshots.ts'
import type { LoadedDescriptor } from '../../lib/emit/types.ts'
import type { IndexEntry, ModuleDetail, ModulesIndex } from '../../lib/schema/published/modules.ts'
import { DESCRIPTORS, OPTS, fixtureData, fixtureEmit, json, text, tmp } from './helpers.ts'

const KSEF = 'npm:@fastwhitecat/integration-ksef-direct'
const SHOT = {
  src: '/modules/shots/@fastwhitecat/invoices.png',
  alt: 'The KSeF invoices list with the send status of each invoice.',
}

describe('emit: hosted screenshots of the fixture', () => {
  const r = fixtureEmit()
  const entry = (loc: string): IndexEntry =>
    json<ModulesIndex>(r, 'modules.json').entries.find((e) => e.locator === loc) as IndexEntry

  it('copies the file under shots/ with its bytes', () => {
    const bytes = r.public.get('shots/@fastwhitecat/invoices.png')
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect([...(bytes as Uint8Array).slice(1, 4)]).toEqual([0x50, 0x4e, 0x47]) // PNG
  })

  it('gives modules.json and /m/<path>.json a src with the base path', () => {
    expect(entry(KSEF).screenshots).toEqual([SHOT])
    expect(json<ModuleDetail>(r, 'm/@fastwhitecat/integration-ksef-direct.json').screenshots).toEqual([SHOT])
  })

  it('leaves the key out of an entry without screenshots', () => {
    expect('screenshots' in entry('npm:@piotrkarwatka/marketing-consents')).toBe(false)
  })

  it('lists absolute image links in the card', () => {
    const card = text(r, 'm/@fastwhitecat/integration-ksef-direct.md')
    expect(card).toContain(
      `## Screenshots\n- ![${SHOT.alt}](https://wojciechszyjka.github.io/modules/shots/@fastwhitecat/invoices.png)\n`,
    )
    expect(text(r, 'm/@piotrkarwatka/marketing-consents.md')).not.toContain('## Screenshots')
  })

  it('lists the file in files.json', () => {
    const files = JSON.parse(r.site.get('files.json') as string) as { path: string; bytes: number }[]
    expect(files.find((f) => f.path === 'shots/@fastwhitecat/invoices.png')?.bytes).toBeGreaterThan(0)
  })
})

describe('emit: a missing file and an https src', () => {
  it('warns and leaves a missing file out, keeps an https src', () => {
    const modules = join(tmp(), 'modules')
    cpSync(DESCRIPTORS, modules, { recursive: true })
    const file = join(modules, '@piotrkarwatka', 'marketing-consents.yml')
    const yaml = `npm: "@piotrkarwatka/marketing-consents"
github: pkarw/marketing-consents
category: marketing-loyalty
summary: Records marketing consents of customers with the date and the channel.
whenToUse: Use when the shop must prove which customer agreed to which marketing channel and when.
screenshots:
  - src: screenshots/missing.webp
    alt: A screenshot that is not in the folder.
  - src: https://raw.githubusercontent.com/pkarw/marketing-consents/main/docs/list.png
    alt: The consents list of a customer.
`
    writeFileSync(file, yaml)
    const r = buildEmit(fixtureData({ modules }), OPTS)
    expect(r.warnings).toContain(
      'modules/@piotrkarwatka/marketing-consents.yml: screenshot screenshots/missing.webp does not exist, left out',
    )
    const e = json<ModulesIndex>(r, 'modules.json').entries.find(
      (x) => x.locator === 'npm:@piotrkarwatka/marketing-consents',
    )
    expect(e?.screenshots).toEqual([
      {
        src: 'https://raw.githubusercontent.com/pkarw/marketing-consents/main/docs/list.png',
        alt: 'The consents list of a customer.',
      },
    ])
    expect([...r.public.keys()].filter((k) => k.startsWith('shots/'))).toEqual(['shots/@fastwhitecat/invoices.png'])
  })

  it('warns about a file over 600 KB', () => {
    const modules = join(tmp(), 'modules')
    cpSync(DESCRIPTORS, modules, { recursive: true })
    writeFileSync(join(modules, '@fastwhitecat', 'screenshots', 'invoices.png'), new Uint8Array(600 * 1024 + 1))
    const r = buildEmit(fixtureData({ modules }), OPTS)
    expect(r.warnings).toContain(
      'modules/@fastwhitecat/integration-ksef-direct.yml: screenshot screenshots/invoices.png is over 600 KB, left out',
    )
    expect(r.public.has('shots/@fastwhitecat/invoices.png')).toBe(false)
  })
})

describe('screenshot paths', () => {
  it('keep the folder of the descriptor under shots/', () => {
    expect(shotPath('modules/@acme/x.yml', 'screenshots/a.webp')).toBe('shots/@acme/a.webp')
    expect(shotPath('modules/github/acme/x.yml', 'screenshots/a.webp')).toBe('shots/github/acme/a.webp')
    expect(shotPath('modules/x.yml', 'screenshots/a.webp')).toBe('shots/a.webp')
  })

  it('apply any form of the base path', () => {
    expect(basePrefix('/modules')).toBe('/modules')
    expect(basePrefix('/modules/')).toBe('/modules')
    expect(basePrefix('modules')).toBe('/modules')
    expect(basePrefix('/')).toBe('')
    const d: LoadedDescriptor = {
      file: 'modules/x.yml',
      locator: 'npm:x',
      issues: [],
      descriptor: {
        npm: 'x',
        screenshots: [{ src: 'screenshots/a.webp', alt: 'The main page of the module.' }],
      } as LoadedDescriptor['descriptor'],
      screenshotFiles: new Map([['screenshots/a.webp', new Uint8Array([1])]]),
    }
    expect(publishedScreenshots(d, '/').list).toEqual([{ src: '/shots/a.webp', alt: 'The main page of the module.' }])
    expect(publishedScreenshots(d, '/modules').files.map(([p]) => p)).toEqual(['shots/a.webp'])
  })
})
