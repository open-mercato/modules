// License from four sources (spec 6.1, i1 §7.4): package.json, a LICENSE* file in the tarball,
// `metadata.license` in the module's index.ts (ModuleInfo) and `license` in integration.ts.
// `UNLICENSED` and `PROPRIETARY` = proprietary; `SEE LICENSE IN` on @open-mercato/enterprise =
// enterprise; sources that disagree = mismatch (also when package.json is silent but the code
// declares a license, as in @fastwhitecat/integration-ksef-direct 0.1.7).
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { Facts } from '../schema/data/facts.ts'
import { parseSpdx, spdxKind } from '../core/spdx.ts'

type LicenseFacts = Facts['license']
type SpdxNode = { license?: string; left?: SpdxNode; right?: SpdxNode; conjunction?: 'and' | 'or' }

const req = createRequire(import.meta.url)
const spdxParse = req('spdx-expression-parse') as (s: string) => SpdxNode
const spdxCorrect = req('spdx-correct') as (s: string, opts?: { upgrade?: boolean }) => string | null

const SEE_RE = /^SEE LICEN[CS]E IN\s+\S+/i

/** Canonical form of a declared license string, or null when empty. */
export function normalizeLicense(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    if (raw && typeof raw === 'object' && typeof (raw as { type?: unknown }).type === 'string')
      return normalizeLicense((raw as { type: string }).type)
    return null
  }
  const s = raw.trim()
  if (!s) return null
  if (/^UNLICENSED$/i.test(s)) return 'UNLICENSED'
  if (/^(PROPRIETARY|COMMERCIAL)$/i.test(s)) return 'PROPRIETARY'
  if (SEE_RE.test(s)) return s.replace(/^see licen[cs]e in/i, 'SEE LICENSE IN')
  try {
    spdxParse(s)
    return s
  } catch {
    const fixed = spdxCorrect(s, { upgrade: true })
    return fixed ?? s
  }
}

/** License kind of a canonical value (spec 4.1 `LicenseKind`). */
export function licenseKind(
  value: string | null,
  packageName: string,
  licenseFile: string | null,
): LicenseFacts['kind'] {
  if (value === null) return 'unknown'
  if (value === 'UNLICENSED' || value === 'PROPRIETARY') return 'proprietary'
  if (SEE_RE.test(value)) {
    if (packageName === '@open-mercato/enterprise') return 'enterprise'
    if (licenseFile && licenseFile !== 'custom') return licenseKind(licenseFile, packageName, null)
    return 'proprietary'
  }
  // spdx-expression-parse checks the ids against the SPDX list; the kind is the tree's (lib/core/spdx.ts, finding of
  // 25 Oct: flattening the leaves made `MIT AND BUSL-1.1` and `LicenseRef-Private` osi)
  try {
    spdxParse(value)
  } catch {
    return 'unknown'
  }
  const tree = parseSpdx(value)
  return tree ? spdxKind(tree) : 'unknown'
}

const FILE_RULES: readonly [RegExp, string][] = [
  [/GNU AFFERO GENERAL PUBLIC LICENSE/i, 'AGPL-3.0'],
  [/GNU LESSER GENERAL PUBLIC LICENSE[\s\S]{0,80}Version 3/i, 'LGPL-3.0'],
  [/GNU GENERAL PUBLIC LICENSE[\s\S]{0,80}Version 3/i, 'GPL-3.0'],
  [/GNU GENERAL PUBLIC LICENSE[\s\S]{0,80}Version 2/i, 'GPL-2.0'],
  [/Mozilla Public License,?\s+Version 2\.0/i, 'MPL-2.0'],
  [/Apache License[\s\S]{0,80}Version 2\.0/i, 'Apache-2.0'],
  [/Permission is hereby granted, free of charge/i, 'MIT'],
  [/Permission to use, copy, modify, and\/or distribute this software for any/i, 'ISC'],
  [/This is free and unencumbered software released into the public domain/i, 'Unlicense'],
]

/** SPDX id of the tarball's LICENSE* file, `custom` for other text, null when there is none. */
export function licenseFileOf(pkgRoot: string): string | null {
  let names: string[]
  try {
    names = readdirSync(pkgRoot)
  } catch {
    return null
  }
  const name = names.sort().find((n) => /^(LICEN[CS]E|COPYING)(\.(md|txt|markdown))?$/i.test(n))
  if (!name) return null
  let text = ''
  try {
    text = readFileSync(join(pkgRoot, name), 'utf8').slice(0, 20_000)
  } catch {
    return 'custom'
  }
  for (const [re, id] of FILE_RULES) if (re.test(text)) return id
  if (/Redistribution and use in source and binary forms/i.test(text))
    return /Neither the name/i.test(text) ? 'BSD-3-Clause' : 'BSD-2-Clause'
  return 'custom'
}

/** Comparable class of a value: SPDX id, `proprietary`, or null (not comparable). */
function comparable(v: string | null): string | null {
  if (v === null || v === 'custom') return null
  if (v === 'UNLICENSED' || v === 'PROPRIETARY') return 'proprietary'
  if (SEE_RE.test(v)) return null
  return v.toUpperCase()
}

export interface LicenseInput {
  packageName: string
  packageJson: unknown
  licenseFile: string | null
  moduleInfo: string | null
  integrationTs: string | null
}

/** The `license` block of Facts. */
export function resolveLicense(i: LicenseInput): LicenseFacts {
  const sources = {
    packageJson: normalizeLicense(i.packageJson),
    licenseFile: i.licenseFile,
    moduleInfo: normalizeLicense(i.moduleInfo),
    integrationTs: normalizeLicense(i.integrationTs),
  }
  const fileValue = sources.licenseFile && sources.licenseFile !== 'custom' ? sources.licenseFile : null
  const value = sources.packageJson ?? fileValue ?? sources.moduleInfo ?? sources.integrationTs
  const classes = new Set(
    [sources.packageJson, sources.licenseFile, sources.moduleInfo, sources.integrationTs]
      .map(comparable)
      .filter((x) => x !== null),
  )
  const codeDeclares = [fileValue, sources.moduleInfo, sources.integrationTs].some((x) => x !== null)
  const mismatch = classes.size > 1 || (sources.packageJson === null && codeDeclares)
  return { value, kind: licenseKind(value, i.packageName, sources.licenseFile), mismatch, sources }
}
