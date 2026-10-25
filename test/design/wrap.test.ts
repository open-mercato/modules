// Identifier wrapping (site/src/lib/wrap.ts): breaks only at token boundaries, never inside a package name.
import { describe, expect, it } from 'vitest'
import {
  breakSegments,
  commonSegmentPrefix,
  middleEllipsis,
  proseHtml,
  segmentEllipsis,
  wbrHtml,
} from '../../site/src/lib/wrap.ts'

describe('breakSegments', () => {
  it('breaks after "/", before a version "@" and at spaces, never at "-"', () => {
    expect(
      breakSegments('yarn mercato module add @fastwhitecat/integration-ksef-direct@0.1.8 --allow-third-party'),
    ).toEqual([
      'yarn ',
      'mercato ',
      'module ',
      'add ',
      '@fastwhitecat/',
      'integration-ksef-direct',
      '@0.1.8 ',
      '--allow-third-party',
    ])
  })
  it('breaks after "." only when asked (event ids), never at "-" or "_"', () => {
    expect(breakSegments('integration_ksef_direct.document.received')).toEqual([
      'integration_ksef_direct.document.received',
    ])
    expect(breakSegments('integration_ksef_direct.document.received', { dots: true })).toEqual([
      'integration_ksef_direct.',
      'document.',
      'received',
    ])
    expect(breakSegments('/received-documents', { dots: true })).toEqual(['/', 'received-documents'])
  })
  it('breaks after "_" only when asked (environment variables)', () => {
    expect(breakSegments('OM_CHANNEL_IMAP_ALLOW_INSECURE_TRANSPORT')).toEqual([
      'OM_CHANNEL_IMAP_ALLOW_INSECURE_TRANSPORT',
    ])
    expect(breakSegments('OM_CHANNEL_IMAP_ALLOW', { underscores: true })).toEqual(['OM_', 'CHANNEL_', 'IMAP_', 'ALLOW'])
  })

  it('breaks after "-" only when asked (anatomy queue names)', () => {
    expect(breakSegments('sync-akeneo-delete-products')).toEqual(['sync-akeneo-delete-products'])
    expect(breakSegments('sync-akeneo-delete-products', { hyphens: true })).toEqual([
      'sync-',
      'akeneo-',
      'delete-',
      'products',
    ])
  })

  it('keeps a leading scope "@" with its name', () => {
    expect(breakSegments('@open-mercato/core')).toEqual(['@open-mercato/', 'core'])
  })
  it('renders no-wrap tokens joined by <wbr> or spaces, escaped', () => {
    expect(wbrHtml('@a/b-c@1 <x>')).toBe(
      '<span class="nw">@a/</span><wbr><span class="nw">b-c</span><wbr><span class="nw">@1</span> <span class="nw">&#60;x&#62;</span>',
    )
  })
})

describe('commonSegmentPrefix', () => {
  it('cuts the shared prefix on a segment boundary', () => {
    expect(
      commonSegmentPrefix(['/api/integration-ksef-direct/documents', '/api/integration-ksef-direct/documents/send']),
    ).toBe('/api/integration-ksef-direct/')
    expect(commonSegmentPrefix(['ksef_direct.document.sent', 'ksef_direct.connection.failed'])).toBe('ksef_direct.')
  })
  it('is empty for one value or no shared segment', () => {
    expect(commonSegmentPrefix(['/api/x'])).toBe('')
    expect(commonSegmentPrefix(['alpha', 'beta'])).toBe('')
  })
})

describe('middleEllipsis', () => {
  it('keeps the start and the distinguishing end', () => {
    expect(middleEllipsis('/backend/integration-ksef-direct/received-documents', 10, 22)).toBe(
      '/backend/i...ect/received-documents',
    )
    expect(middleEllipsis('short', 10, 22)).toBe('short')
  })
})

describe('proseHtml', () => {
  it('sets versions and symbols in code, keeps the prose as text', () => {
    const html = proseHtml(
      '0.10.1-develop.7583.1.0c886d0a14 changes 3 APIs. createRequestContainer is used by 15 of 16 packages.',
    )
    expect(html.startsWith('<code translate="no">')).toBe(true)
    expect(html).toContain('0c886d0a14</span></code> changes 3 APIs. <code translate="no">')
    expect(html).toContain('<span class="nw">createRequestContainer</span></code> is used by 15 of 16 packages.')
    expect(proseHtml('Plain words, 3 of 4.')).toBe('Plain words, 3 of 4.')
  })
})

describe('segmentEllipsis', () => {
  it('drops whole middle segments and keeps the kind and the tail', () => {
    expect(segmentEllipsis('event ksef_direct.document.sent', 24)).toBe('event ...document.sent')
    expect(segmentEllipsis('event customers.deal.won', 24)).toBe('event customers.deal.won')
  })
})
