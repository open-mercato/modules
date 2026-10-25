// SPDX license expressions (spec 6.1) without the SPDX id list: the syntax of
// https://spdx.github.io/spdx-spec/v2.3/SPDX-license-expressions/ (ids, `+`, LicenseRef-, DocumentRef-, WITH, AND
// binding tighter than OR, parentheses). Operators are read in any case, as spdx-expression-parse does. A value that
// does not parse is not an expression, so it never reaches a page as an SPDX id (finding of 25 Oct: a packument
// license `(</script>...)` passed as `osi`). Isomorphic: no Node APIs.

export type SpdxNode =
  | { license: string; plus: boolean; exception: string | null }
  | { conjunction: 'and' | 'or'; left: SpdxNode; right: SpdxNode }

const MAX_LENGTH = 500
const ID = /^[A-Za-z0-9.-]+$/
const LICENSE = /^(?:(?:DocumentRef-[A-Za-z0-9.-]+:)?LicenseRef-[A-Za-z0-9.-]+|[A-Za-z0-9.-]+\+?)$/
const OPERATORS = new Set(['AND', 'OR', 'WITH'])

function tokens(s: string): string[] | null {
  const out: string[] = []
  const re = /\s*(\(|\)|[^\s()]+)\s*/y
  let m: RegExpExecArray | null
  while (re.lastIndex < s.length && (m = re.exec(s))) out.push(m[1] as string)
  return re.lastIndex === s.length ? out : null
}

/** The expression tree of `value`, or null when it is not an SPDX license expression. */
export function parseSpdx(value: string): SpdxNode | null {
  const s = value.trim()
  if (!s || s.length > MAX_LENGTH) return null
  const t = tokens(s)
  if (!t || t.length === 0) return null
  let i = 0
  const peekOp = () => (t[i] ?? '').toUpperCase()
  const atom = (): SpdxNode | null => {
    const tok = t[i]
    if (tok === undefined) return null
    if (tok === '(') {
      i++
      const inner = or()
      if (!inner || t[i] !== ')') return null
      i++
      return inner
    }
    if (tok === ')' || OPERATORS.has(tok.toUpperCase()) || !LICENSE.test(tok)) return null
    i++
    let exception: string | null = null
    if (peekOp() === 'WITH') {
      i++
      const ex = t[i]
      if (ex === undefined || OPERATORS.has(ex.toUpperCase()) || !ID.test(ex)) return null
      exception = ex
      i++
    }
    const plus = tok.endsWith('+')
    return { license: plus ? tok.slice(0, -1) : tok, plus, exception }
  }
  const and = (): SpdxNode | null => {
    let left = atom()
    while (left && peekOp() === 'AND') {
      i++
      const right = atom()
      left = right ? { conjunction: 'and', left, right } : null
    }
    return left
  }
  const or = (): SpdxNode | null => {
    let left = and()
    while (left && peekOp() === 'OR') {
      i++
      const right = and()
      left = right ? { conjunction: 'or', left, right } : null
    }
    return left
  }
  const tree = or()
  return tree && i === t.length ? tree : null
}

/**
 * OSI-approved licenses the catalog names as `osi` (spec 6.1), by SPDX id without `-only`, `-or-later` or `+`. An id
 * outside this list and outside NON_OSI (LicenseRef-*, CC-BY-NC-3.0, PolyForm-Shield-1.0.0, ...) is `unknown`, so
 * the policy asks instead of passing a restrictive license as open source (finding of 25 Oct).
 */
export const OSI_IDS: ReadonlySet<string> = new Set(
  [
    '0BSD',
    'AFL-3.0',
    'AGPL-3.0',
    'Apache-1.1',
    'Apache-2.0',
    'Artistic-2.0',
    'BlueOak-1.0.0',
    'BSD-1-Clause',
    'BSD-2-Clause',
    'BSD-2-Clause-Patent',
    'BSD-3-Clause',
    'BSL-1.0',
    'CDDL-1.0',
    'ECL-2.0',
    'EPL-1.0',
    'EPL-2.0',
    'EUPL-1.1',
    'EUPL-1.2',
    'GPL-2.0',
    'GPL-3.0',
    'ISC',
    'LGPL-2.0',
    'LGPL-2.1',
    'LGPL-3.0',
    'MIT',
    'MIT-0',
    'MPL-1.1',
    'MPL-2.0',
    'MPL-2.0-no-copyleft-exception',
    'MS-PL',
    'MS-RL',
    'NCSA',
    'OFL-1.1',
    'OSL-3.0',
    'PostgreSQL',
    'Python-2.0',
    'Unlicense',
    'UPL-1.0',
    'Zlib',
  ].map((id) => id.toUpperCase()),
)

/** SPDX ids that are not open source: an expression that requires one of them is proprietary. */
export const NON_OSI_IDS: ReadonlySet<string> = new Set(
  [
    'BUSL-1.1',
    'SSPL-1.0',
    'Elastic-2.0',
    'CC-BY-NC-4.0',
    'CC-BY-NC-SA-4.0',
    'CC-BY-NC-ND-4.0',
    'PolyForm-Noncommercial-1.0.0',
    'PolyForm-Small-Business-1.0.0',
    'Commons-Clause',
  ].map((id) => id.toUpperCase()),
)

export type SpdxKind = 'osi' | 'proprietary' | 'unknown'
const RANK: Record<SpdxKind, number> = { osi: 0, unknown: 1, proprietary: 2 }

/**
 * Kind of an expression: a leaf is osi (OSI_IDS), proprietary (NON_OSI_IDS) or unknown; `AND` takes the worse side
 * (both terms apply: `MIT AND BUSL-1.1` is BUSL), `OR` the better one (the user picks); `WITH` keeps the base kind.
 */
export function spdxKind(node: SpdxNode): SpdxKind {
  if ('license' in node) {
    const id = node.license.toUpperCase().replace(/-(ONLY|OR-LATER)$/, '')
    // `Apache-2.0 WITH Commons-Clause` takes the commercial rights away: the exception decides then
    if (node.exception !== null && NON_OSI_IDS.has(node.exception.toUpperCase())) return 'proprietary'
    return OSI_IDS.has(id) ? 'osi' : NON_OSI_IDS.has(id) ? 'proprietary' : 'unknown'
  }
  const l = spdxKind(node.left)
  const r = spdxKind(node.right)
  const worse = RANK[l] >= RANK[r] ? l : r
  const better = RANK[l] <= RANK[r] ? l : r
  return node.conjunction === 'and' ? worse : better
}
