// Environment variables a package reads: `process.env.X`, `process.env['X']`, `const { X } = process.env`
// and `import.meta.env.X`, with file and line of the first read. Names only, never values.
import { ts } from 'ts-morph'
import { lineOf, parseSource, relPath } from './ast.ts'

export interface EnvRead {
  name: string
  src: { file: string; line: number }
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

/**
 * Raw names (unvalidated; the caller sanitizes) in the given files, first occurrence wins. Besides direct reads, the
 * env names a function that takes the environment lists in array literals (`readEnvValue(env, ['OM_X', 'OM_Y'])`,
 * finding of 25 Oct: gateway-stripe read OM_INTEGRATION_STRIPE_* that way and the anatomy said no env).
 */
export function scanEnv(pkgRoot: string, files: readonly string[]): EnvRead[] {
  const out: EnvRead[] = []
  const seen = new Set<string>()
  const add = (name: string, sf: ts.SourceFile, node: ts.Node, file: string): void => {
    if (seen.has(name) || FRAMEWORK_ENV.has(name)) return
    seen.add(name)
    out.push({ name, src: { file: relPath(pkgRoot, file), line: lineOf(sf, node) } })
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
      if (ts.isPropertyAccessExpression(n) && isProcessEnv(n.expression)) add(n.name.text, sf, n, file)
      else if (
        ts.isElementAccessExpression(n) &&
        isProcessEnv(n.expression) &&
        ts.isStringLiteralLike(n.argumentExpression)
      )
        add(n.argumentExpression.text, sf, n, file)
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
