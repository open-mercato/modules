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
