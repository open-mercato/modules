// Environment variables a package reads: `process.env.X`, `process.env['X']`, `const { X } = process.env`
// and `import.meta.env.X`, with file and line of the first read. Names only, never values. A name whose every read only
// checks whether it is set (`Boolean(process.env.A || process.env.B)`, `!process.env.X`, a read inside `isConfigured()`)
// is marked `ifSet`: the package works without it (finding of 25 Oct: the health module checks 18 provider keys to see
// which services are configured, and the card asked for all of them as settings it needs).
import { ts } from 'ts-morph'
import { lineOf, parseSource, relPath } from './ast.ts'

export interface EnvRead {
  name: string
  src: { file: string; line: number }
  /** Every read only checks whether the name is set; the package does not need it. Absent: a value is used. */
  ifSet?: true
}

/** Set by the framework or the runtime, not by the person installing the module. */
export const FRAMEWORK_ENV: ReadonlySet<string> = new Set(['NODE_ENV', 'NEXT_RUNTIME'])

const isProcessEnv = (n: ts.Node): boolean =>
  ts.isPropertyAccessExpression(n) &&
  n.name.text === 'env' &&
  ((ts.isIdentifier(n.expression) && n.expression.text === 'process') ||
    (ts.isMetaProperty(n.expression) && n.expression.name.text === 'meta'))

const ENV_NAME_RE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/

/** A function whose parameter is the environment: `env: NodeJS.ProcessEnv` or `env = process.env`. */
function takesEnv(n: ts.Node, sf: ts.SourceFile): boolean {
  if (!ts.isFunctionLike(n)) return false
  return n.parameters.some(
    (p) => (p.type && /\bProcessEnv\b/.test(p.type.getText(sf))) || (p.initializer && isProcessEnv(p.initializer)),
  )
}

/** A function that answers whether something is set up: `isConfigured()`, `isEnabled`, `hasCredentials`. */
const DETECTOR_NAME =
  /^(is\w*(Configured|Enabled|Available|Set)|has\w*(Config|Configuration|Credentials|Key|Token)|configured|enabled)$/

function functionName(n: ts.Node): string | null {
  if (
    (ts.isMethodDeclaration(n) || ts.isFunctionDeclaration(n) || ts.isGetAccessorDeclaration(n)) &&
    n.name &&
    (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name))
  )
    return n.name.text
  if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && n.parent) {
    const p = n.parent
    if (
      (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) &&
      ts.isIdentifier(p.name)
    )
      return p.name.text
  }
  return null
}

const isNullish = (n: ts.Node): boolean =>
  n.kind === ts.SyntaxKind.NullKeyword ||
  (ts.isIdentifier(n) && n.text === 'undefined') ||
  (ts.isVoidExpression(n) && ts.isNumericLiteral(n.expression))

/**
 * Whether one read only checks that the name is set: the read, alone or in a chain of `||` and `&&`, is the
 * argument of `Boolean()`, follows `!`, is compared with `undefined` or `null`, or is the condition of an `if` or a
 * `? :`; or it sits in a function named like a detector (`isConfigured`), whatever it compares.
 */
export function onlyChecksSet(read: ts.Node): boolean {
  let top: ts.Node = read
  for (;;) {
    const p = top.parent
    if (!p) break
    if (ts.isParenthesizedExpression(p)) top = p
    else if (
      ts.isBinaryExpression(p) &&
      (p.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
    )
      top = p
    else break
  }
  const p = top.parent
  if (p) {
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 'Boolean') return true
    if (ts.isPrefixUnaryExpression(p) && p.operator === ts.SyntaxKind.ExclamationToken) return true
    if (
      ts.isBinaryExpression(p) &&
      [
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
      ].includes(p.operatorToken.kind) &&
      isNullish(p.left === top ? p.right : p.left)
    )
      return true
    if ((ts.isIfStatement(p) || ts.isWhileStatement(p)) && p.expression === top) return true
    if (ts.isConditionalExpression(p) && p.condition === top) return true
  }
  for (let n: ts.Node | undefined = read.parent; n; n = n.parent) {
    if (!ts.isFunctionLike(n)) continue
    const name = functionName(n)
    if (name && DETECTOR_NAME.test(name)) return true
  }
  return false
}

/**
 * Raw names (unvalidated; the caller sanitizes) in the given files, first occurrence wins. Besides direct reads, the
 * env names a function that takes the environment lists in array literals (`readEnvValue(env, ['OM_X', 'OM_Y'])`,
 * finding of 25 Oct: gateway-stripe read OM_INTEGRATION_STRIPE_* that way and the anatomy said no env).
 */
export function scanEnv(pkgRoot: string, files: readonly string[]): EnvRead[] {
  const out: EnvRead[] = []
  const seen = new Map<string, EnvRead>()
  // `check`: the read only checks that the name is set (onlyChecksSet); a name keeps ifSet while every read does
  const add = (name: string, sf: ts.SourceFile, node: ts.Node, file: string, check = false): void => {
    if (FRAMEWORK_ENV.has(name)) return
    const prev = seen.get(name)
    if (prev) {
      if (!check) delete prev.ifSet
      return
    }
    const read: EnvRead = { name, src: { file: relPath(pkgRoot, file), line: lineOf(sf, node) } }
    if (check) read.ifSet = true
    seen.set(name, read)
    out.push(read)
  }
  for (const file of files) {
    const sf = parseSource(file)
    if (!sf) continue
    const keyLists = (n: ts.Node): void => {
      if (ts.isArrayLiteralExpression(n))
        for (const el of n.elements)
          if (ts.isStringLiteralLike(el) && ENV_NAME_RE.test(el.text)) add(el.text, sf, el, file)
      ts.forEachChild(n, keyLists)
    }
    const visit = (n: ts.Node): void => {
      if (takesEnv(n, sf)) keyLists(n)
      if (ts.isPropertyAccessExpression(n) && isProcessEnv(n.expression))
        add(n.name.text, sf, n, file, onlyChecksSet(n))
      else if (
        ts.isElementAccessExpression(n) &&
        isProcessEnv(n.expression) &&
        ts.isStringLiteralLike(n.argumentExpression)
      )
        add(n.argumentExpression.text, sf, n, file, onlyChecksSet(n))
      else if (
        ts.isVariableDeclaration(n) &&
        n.initializer &&
        isProcessEnv(n.initializer) &&
        ts.isObjectBindingPattern(n.name)
      ) {
        for (const el of n.name.elements) {
          const key = el.propertyName ?? el.name
          if (ts.isIdentifier(key) || ts.isStringLiteral(key)) add(key.text, sf, el, file)
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  return out
}
