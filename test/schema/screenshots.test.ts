// Descriptor `screenshots` (26 Oct): up to 6 `{ src, alt }`, src a file the catalog hosts next to the descriptor or an
// image on GitHub (the module's own repository on raw.githubusercontent.com, or an attachment); author field, key
// right after `links`; descriptor-1.json says the same pattern and counts.
import { Validator } from '@cfworker/json-schema'
import { describe, expect, it } from 'vitest'
import {
  CURATOR_FIELDS,
  DESCRIPTOR_KEY_ORDER,
  Descriptor,
  SCREENSHOT_FILE,
  isHostedScreenshot,
  ownRepo,
  screenshotFile,
  screenshotRepo,
} from '../../lib/schema/descriptor.ts'
import { publishedJsonSchemas } from '../../lib/schema/json-schema.ts'

const base = {
  npm: '@acme/om-invoices',
  github: 'acme/om-invoices',
  category: 'payments-finance',
  summary: 'Sends invoices to customers and tracks their payment.',
  whenToUse: 'Use when the shop sends its own invoices and follows up on payments.',
}
const ALT = 'The invoices list with the payment status of each invoice.'
const parse = (screenshots: unknown, extra: Record<string, unknown> = {}) =>
  Descriptor.safeParse({ ...base, ...extra, screenshots })
const messages = (r: ReturnType<typeof parse>) =>
  r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)

describe('screenshots in the descriptor', () => {
  it('is an author field right after links', () => {
    const i = DESCRIPTOR_KEY_ORDER.indexOf('screenshots')
    expect(DESCRIPTOR_KEY_ORDER[i - 1]).toBe('links')
    expect((CURATOR_FIELDS as readonly string[]).includes('screenshots')).toBe(false)
  })

  it('is optional', () => {
    const r = Descriptor.safeParse(base)
    expect(r.success).toBe(true)
    expect(r.data?.screenshots).toBeUndefined()
  })

  it.each([
    'screenshots/list.webp',
    'screenshots/order-detail_2.png',
    'screenshots/settings.jpg',
    'https://raw.githubusercontent.com/acme/om-invoices/main/docs/list.png',
    'https://raw.githubusercontent.com/Acme/OM-Invoices/v1.2.0/docs/my%20list.webp',
    'https://github.com/user-attachments/assets/7c1d5f4e-2b9a-4c43-9d55-0a3e8b1f6a21',
  ])('accepts src %s', (src) => {
    expect(messages(parse([{ src, alt: ALT }]))).toEqual([])
  })

  it.each([
    ['screenshots/List.webp', 'upper case'],
    ['screenshots/list.gif', 'gif'],
    ['screenshots/../x.webp', 'a parent folder'],
    ['list.webp', 'no screenshots/ folder'],
    ['/screenshots/list.webp', 'absolute path'],
    ['http://raw.githubusercontent.com/acme/om-invoices/main/a.png', 'http'],
    ['https://example.com/list.png', 'another host'],
    ['https://raw.githubusercontent.com/acme/om-invoices/main/../../evil/x/main/a.png', 'dot segments'],
    ['https://raw.githubusercontent.com/acme/om-invoices/main/%2e%2e/a.png', 'encoded dots'],
    ['https://github.com/acme/om-invoices/raw/main/a.png', 'a github.com blob link'],
  ])('rejects src %s (%s) and says what to use', (src) => {
    const m = messages(parse([{ src, alt: ALT }]))
    expect(m).toHaveLength(1)
    expect(m[0]).toMatch(
      /^screenshots\.0\.src: use screenshots\/<name>\.webp .* or an https link on raw\.githubusercontent\.com/,
    )
  })

  it('takes raw.githubusercontent.com only from the module own repository', () => {
    expect(messages(parse([{ src: 'https://raw.githubusercontent.com/other/repo/main/a.png', alt: ALT }]))).toEqual([
      "screenshots.0.src: link an image of the module's own repository acme/om-invoices, not of other/repo, or host the file under screenshots/",
    ])
    // the repository of a monorepo entry counts as its own
    expect(
      messages(
        parse([{ src: 'https://raw.githubusercontent.com/acme/mono/main/packages/x/a.png', alt: ALT }], {
          github: undefined,
          repo: 'acme/mono#main/packages/x',
        }),
      ),
    ).toEqual([])
    expect(
      messages(
        parse([{ src: 'https://raw.githubusercontent.com/acme/om-invoices/main/a.png', alt: ALT }], {
          github: undefined,
        }),
      ),
    ).toEqual([
      'screenshots.0.src: a raw.githubusercontent.com link needs the github field of the module; set it or host the file under screenshots/',
    ])
  })

  it('wants alt as plain text of 10 to 120 characters', () => {
    expect(messages(parse([{ src: 'screenshots/a.webp', alt: 'List.' }]))).toEqual([
      'screenshots.0.alt: min 10 characters',
    ])
    expect(messages(parse([{ src: 'screenshots/a.webp', alt: 'x'.repeat(121) }]))).toHaveLength(1)
    expect(messages(parse([{ src: 'screenshots/a.webp', alt: 'See https://acme.dev for the list.' }]))).toEqual([
      'screenshots.0.alt: plain text only: no URLs, markdown or HTML',
    ])
    expect(messages(parse([{ src: 'screenshots/a.webp' }]))).toHaveLength(1)
    expect(messages(parse([{ src: 'screenshots/a.webp', alt: ALT, title: 'x' }]))).toHaveLength(1)
  })

  it('takes at most 6', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ src: `screenshots/s${i}.webp`, alt: ALT }))
    expect(messages(parse(six))).toEqual([])
    expect(messages(parse([...six, { src: 'screenshots/s6.webp', alt: ALT }]))).toEqual([
      'screenshots: at most 6 screenshots',
    ])
  })
})

describe('screenshot helpers', () => {
  it('resolve a hosted src against the folder of the descriptor', () => {
    expect(screenshotFile('modules/@acme/om-invoices.yml', 'screenshots/a.webp')).toBe(
      'modules/@acme/screenshots/a.webp',
    )
    expect(screenshotFile('modules/github/acme/x.yml', 'screenshots/a.png')).toBe(
      'modules/github/acme/screenshots/a.png',
    )
    expect(screenshotFile('modules/create-x.yml', 'screenshots/a.jpg')).toBe('modules/screenshots/a.jpg')
  })

  it('tell hosted files, repositories and screenshot files apart', () => {
    expect(isHostedScreenshot('screenshots/a.webp')).toBe(true)
    expect(isHostedScreenshot('https://github.com/user-attachments/assets/abc')).toBe(false)
    expect(screenshotRepo('https://raw.githubusercontent.com/acme/x/main/a.png')).toBe('acme/x')
    expect(screenshotRepo('https://github.com/user-attachments/assets/abc')).toBeNull()
    expect(ownRepo({ repo: 'acme/mono#main/p' })).toBe('acme/mono')
    expect(ownRepo({})).toBeNull()
    expect(SCREENSHOT_FILE.test('modules/@acme/screenshots/a.webp')).toBe(true)
    expect(SCREENSHOT_FILE.test('modules/screenshots/a.png')).toBe(true)
    expect(SCREENSHOT_FILE.test('modules/@acme/a.webp')).toBe(false)
    expect(SCREENSHOT_FILE.test('modules/@acme/screenshots/a.yml')).toBe(false)
  })
})

describe('descriptor-1.json', () => {
  const v = new Validator(publishedJsonSchemas().descriptor as never, '2020-12', false)
  it('accepts the shapes Descriptor accepts', () => {
    for (const src of [
      'screenshots/list.webp',
      'https://raw.githubusercontent.com/acme/om-invoices/main/docs/list.png',
      'https://github.com/user-attachments/assets/7c1d5f4e',
    ])
      expect(v.validate({ ...base, screenshots: [{ src, alt: ALT }] }).valid, src).toBe(true)
  })
  it('rejects a bad src, a short alt, an extra key and a seventh screenshot', () => {
    expect(v.validate({ ...base, screenshots: [{ src: 'https://example.com/a.png', alt: ALT }] }).valid).toBe(false)
    expect(v.validate({ ...base, screenshots: [{ src: 'screenshots/../a.png', alt: ALT }] }).valid).toBe(false)
    expect(
      v.validate({ ...base, screenshots: [{ src: 'https://raw.githubusercontent.com/a/b/c/../x.png', alt: ALT }] })
        .valid,
    ).toBe(false)
    expect(v.validate({ ...base, screenshots: [{ src: 'screenshots/a.png', alt: 'short' }] }).valid).toBe(false)
    expect(v.validate({ ...base, screenshots: [{ src: 'screenshots/a.png', alt: ALT, w: 1 }] }).valid).toBe(false)
    const seven = Array.from({ length: 7 }, (_, i) => ({ src: `screenshots/s${i}.png`, alt: ALT }))
    expect(v.validate({ ...base, screenshots: seven }).valid).toBe(false)
  })
})
