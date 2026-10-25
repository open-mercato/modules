// Lint host-dependency-duplication (spec 6.6, D34) on the module page, the card and /m/<path>.json: the bundled host
// package and its fix, grouped across the lines, so a typecheck break says its likely cause (D-OPEN-4).
import { describe, expect, test } from 'vitest'
import {
  duplicateTypeError,
  hostDuplicateFindings,
  hostDuplicateFix,
  hostDuplicateText,
} from '../../lib/core/finding.ts'

const LINES = [
  { key: '0.8', version: '0.8.0' },
  { key: '0.9', version: '0.9.0' },
  { key: 'next', version: '0.10.1-develop.7583.1.0c886d0a14' },
]
const TABLE = { name: '@tanstack/react-table', moduleRange: '9.2.5', appVersion: '9.3.1' }
const QUERY = { name: '@tanstack/react-query', moduleRange: '5.104.1', appVersion: '5.104.4' }

describe('host duplicates', () => {
  test('one item per package and versions, with its lines in reading order', () => {
    const fs = hostDuplicateFindings(
      { '0.8': { hostDuplicates: [QUERY, TABLE] }, '0.9': { hostDuplicates: [TABLE] }, next: null },
      LINES,
    )
    expect(fs).toEqual([
      { ...QUERY, lines: ['0.8'], om: ['0.8.0'] },
      { ...TABLE, lines: ['0.8', '0.9'], om: ['0.8.0', '0.9.0'] },
    ])
  })

  test('the lint text of spec 6.6 on one line, the lines on several', () => {
    expect(hostDuplicateText({ ...TABLE, moduleRange: '9.2.6', lines: ['0.9'], om: ['0.9.0'] })).toBe(
      'Bundles @tanstack/react-table 9.2.6 while Open Mercato 0.9.0 ships 9.3.1. Two copies break types. Move it to peerDependencies.',
    )
    expect(hostDuplicateText({ ...TABLE, lines: ['0.8', '0.9', 'next'], om: ['0.8.0', '0.9.0', 'x'] })).toBe(
      'Bundles @tanstack/react-table 9.2.5 while a new app on 0.8, 0.9 and next ships 9.3.1. Two copies break types. Move it to peerDependencies.',
    )
  })

  test('the fix names every bundled package once, and is null without findings', () => {
    const fs = hostDuplicateFindings({ '0.9': { hostDuplicates: [QUERY, TABLE] } }, LINES)
    expect(hostDuplicateFix(fs)).toBe(
      'The package bundles its own @tanstack/react-query and @tanstack/react-table, and two copies break types. Move them to peerDependencies',
    )
    expect(hostDuplicateFix([])).toBeNull()
  })
})

test('a typecheck error reads as two copies when it names the package or has the duplicate-type errors', () => {
  const names = ['@tanstack/react-table']
  expect(duplicateTypeError('x/node_modules/@tanstack/react-table/dist/a.d.ts(1,1): error TS2589', names)).toBe(true)
  expect(
    duplicateTypeError("a.tsx(154,13): error TS2321: Excessive stack depth comparing types 'A' and 'B'.", names),
  ).toBe(true)
  expect(duplicateTypeError("a.ts(1,1): error TS2307: Cannot find module 'x'.", names)).toBe(false)
  expect(duplicateTypeError('error TS2321', [])).toBe(false)
  expect(duplicateTypeError(null, names)).toBe(false)
})
