// Shared static-reading helpers for Rentgen: file walking, parsing, literal evaluation.
// Nothing here imports or executes module code; files are read as text and parsed into an AST.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { ts } from 'ts-morph'

/** Directories the OM generator skips (scanner.ts walkDir) plus our own test folders. */
export const SKIP_DIRS: ReadonlySet<string> = new Set(['__tests__', '__mocks__', '__integration__', 'node_modules'])
/** Source files larger than this are not parsed (pathological or generated). */
export const MAX_PARSE_BYTES = 2_000_000

export const isTestFile = (name: string): boolean => /\.(test|spec)\.[cm]?[jt]sx?$/.test(name)
export const isCodeFile = (name: string): boolean => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name) && !name.endsWith('.d.ts')
const skipName = (name: string): boolean => SKIP_DIRS.has(name) || name === '.DS_Store' || name.startsWith('._')

export function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

export function isFile(p: string): boolean {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

/** Every file below `dir` (absolute paths, sorted), skipping test and dependency folders. */
export function walkFiles(dir: string, skipDir?: (name: string) => boolean): string[] {
  const out: string[] = []
  if (!isDir(dir)) return out
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )
  for (const e of entries) {
    if (skipName(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (skipDir?.(e.name)) continue
      out.push(...walkFiles(p, skipDir))
    } else if (e.isFile()) out.push(p)
  }
  return out
}

/** Code files of a source tree without tests and declaration files. */
export function codeFiles(dir: string): string[] {
  return walkFiles(dir).filter((f) => {
    const name = f.slice(f.lastIndexOf(sep) + 1)
    return isCodeFile(name) && !isTestFile(name)
  })
}

/** POSIX path of `file` relative to `root`. */
export function relPath(root: string, file: string): string {
  return relative(root, file).split(sep).join('/')
}

const sourceCache = new Map<string, ts.SourceFile | null>()

/** Parsed source file (cached per run), or null when missing, too large or unreadable. */
export function parseSource(file: string): ts.SourceFile | null {
  if (sourceCache.has(file)) return sourceCache.get(file) ?? null
  let sf: ts.SourceFile | null = null
  try {
    if (existsSync(file) && statSync(file).size <= MAX_PARSE_BYTES) {
      const text = readFileSync(file, 'utf8')
      const kind = /\.[jt]sx$/.test(file)
        ? ts.ScriptKind.TSX
        : /\.[cm]?js$/.test(file)
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS
      sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
    }
  } catch {
    sf = null
  }
  sourceCache.set(file, sf)
  return sf
}

/** Drop the parse cache (between packages, so memory stays flat on long queues). */
export function clearParseCache(): void {
  sourceCache.clear()
}

/** 1-based line of a node. */
export function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
}

/** 1-based line of the first match of `re` in a text file, or null. */
export function findLine(file: string, re: RegExp): number | null {
  if (!isFile(file)) return null
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return null
  }
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i] as string)) return i + 1
  return null
}

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---------------------------------------------------------------- literal evaluation

/** Marker for a value that cannot be known without executing code. */
export const UNKNOWN: unique symbol = Symbol('unknown')
export type Lit = string | number | boolean | null | typeof UNKNOWN | Lit[] | { [key: string]: Lit }
export type LitObject = { [key: string]: Lit }

export const isUnknown = (v: unknown): v is typeof UNKNOWN => v === UNKNOWN
export const isLitObject = (v: Lit | undefined): v is LitObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !isUnknown(v)

/** Top-level `const x = <expr>` and `function x() {}` declarations of a file. */
export function fileConsts(sf: ts.SourceFile): Map<string, ts.Expression> {
  const consts = new Map<string, ts.Expression>()
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue
    for (const d of st.declarationList.declarations)
      if (ts.isIdentifier(d.name) && d.initializer) consts.set(d.name.text, d.initializer)
  }
  return consts
}

function propName(name: ts.PropertyName, sf: ts.SourceFile): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  if (ts.isNoSubstitutionTemplateLiteral(name)) return name.text
  if (ts.isComputedPropertyName(name)) return null
  return name.getText(sf)
}

/**
 * Static value of an expression: literals, arrays, objects, `as`/`satisfies`/parentheses, and up to
 * three hops through top-level consts of the same file (including `X.metadata` where
 * `const X = make({ metadata: {...} })`). Anything else is UNKNOWN.
 */
export function evalLiteral(
  node: ts.Node | undefined,
  sf: ts.SourceFile,
  consts?: Map<string, ts.Expression>,
  depth = 0,
): Lit {
  if (!node || depth > 4) return UNKNOWN
  const c = consts ?? fileConsts(sf)
  if (ts.isIdentifier(node)) {
    if (node.text === 'undefined') return null
    const init = c.get(node.text)
    return init ? evalLiteral(init, sf, c, depth + 1) : UNKNOWN
  }
  if (ts.isPropertyAccessExpression(node)) {
    const name = node.name.text
    const base = evalLiteral(node.expression, sf, c, depth)
    if (isLitObject(base) && name in base) return base[name] as Lit
    // `X.metadata` where `const X = makeCrudRoute({ metadata: {...} })`: the factory's config
    if (name === 'metadata' && ts.isIdentifier(node.expression)) {
      const init = c.get(node.expression.text)
      const arg = init && ts.isCallExpression(init) ? init.arguments[0] : undefined
      if (arg && ts.isObjectLiteralExpression(arg)) {
        const v = evalLiteral(arg, sf, c, depth + 1)
        if (isLitObject(v) && name in v) return v[name] as Lit
      }
    }
    return UNKNOWN
  }
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node))
    return evalLiteral(node.expression, sf, c, depth)
  if (ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node))
    return evalLiteral(node.expression, sf, c, depth)
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (node.kind === ts.SyntaxKind.NullKeyword) return null
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  )
    return -Number(node.operand.text)
  if (ts.isArrayLiteralExpression(node)) {
    const out: Lit[] = []
    for (const el of node.elements) {
      if (ts.isSpreadElement(el)) {
        const v = evalLiteral(el.expression, sf, c, depth)
        if (Array.isArray(v)) out.push(...v)
        else out.push(UNKNOWN)
      } else out.push(evalLiteral(el, sf, c, depth))
    }
    return out
  }
  if (ts.isObjectLiteralExpression(node)) {
    const o: LitObject = {}
    for (const p of node.properties) {
      if (ts.isPropertyAssignment(p)) {
        const k = propName(p.name, sf)
        if (k !== null) o[k] = evalLiteral(p.initializer, sf, c, depth)
      } else if (ts.isShorthandPropertyAssignment(p)) {
        o[p.name.text] = evalLiteral(p.name, sf, c, depth)
      } else if (ts.isSpreadAssignment(p)) {
        const v = evalLiteral(p.expression, sf, c, depth)
        if (isLitObject(v)) Object.assign(o, v)
        else o['...'] = UNKNOWN
      } else if (ts.isMethodDeclaration(p) || ts.isGetAccessorDeclaration(p)) {
        const k = propName(p.name, sf)
        if (k !== null) o[k] = UNKNOWN
      }
    }
    return o
  }
  return UNKNOWN
}

/** Strings of a literal array (unknown and non-string items dropped). */
export function stringList(v: Lit | undefined): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

// ---------------------------------------------------------------- exports

export interface ExportInfo {
  /** Exported names declared in this file (functions, consts, classes, `export { a as b }`). */
  names: Set<string>
  /** `export { x } from '...'` or `export * from '...'` present (names may be hidden). */
  reexports: boolean
  /** Initializer of each exported const, by exported name. */
  initializers: Map<string, ts.Expression>
  /** Declaration node of each exported name (for line numbers). */
  nodes: Map<string, ts.Node>
  /** Names re-exported from another module: exported name -> module specifier and original name. */
  from: Map<string, { spec: string; name: string }>
}

const hasExport = (n: ts.Node): boolean =>
  ts.canHaveModifiers(n) &&
  (ts.getModifiers(n) ?? []).some((m: ts.ModifierLike) => m.kind === ts.SyntaxKind.ExportKeyword)

/** Source file of a relative import specifier (`./x` -> x.ts, x.tsx, x/index.ts, ...), or null. */
export function resolveRelative(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const base = join(fromFile, '..', spec)
  const stripped = base.replace(/\.(js|jsx|mjs|cjs)$/, '')
  for (const c of [
    base,
    `${stripped}.ts`,
    `${stripped}.tsx`,
    `${stripped}.js`,
    join(stripped, 'index.ts'),
    join(stripped, 'index.tsx'),
    join(stripped, 'index.js'),
  ])
    if (isFile(c) && isCodeFile(c)) return c
  return null
}

/** Names a file exports at top level, with the initializers of exported consts. */
export function exportsOf(sf: ts.SourceFile): ExportInfo {
  const info: ExportInfo = {
    names: new Set(),
    reexports: false,
    initializers: new Map(),
    nodes: new Map(),
    from: new Map(),
  }
  const locals = fileConsts(sf)
  for (const st of sf.statements) {
    if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && hasExport(st)) {
      const isDefault = (ts.getModifiers(st) ?? []).some(
        (m: ts.ModifierLike) => m.kind === ts.SyntaxKind.DefaultKeyword,
      )
      if (isDefault) {
        info.names.add('default')
        info.nodes.set('default', st)
      }
      if (st.name && !isDefault) {
        info.names.add(st.name.text)
        info.nodes.set(st.name.text, st)
      }
    } else if (ts.isVariableStatement(st) && hasExport(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) {
          info.names.add(d.name.text)
          info.nodes.set(d.name.text, st)
          if (d.initializer) info.initializers.set(d.name.text, d.initializer)
        } else if (ts.isObjectBindingPattern(d.name)) {
          for (const el of d.name.elements) {
            const n = el.name.getText(sf)
            info.names.add(n)
            info.nodes.set(n, st)
          }
        }
      }
    } else if (ts.isExportDeclaration(st)) {
      if (st.moduleSpecifier) info.reexports = true
      if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          const exported = el.name.text
          info.names.add(exported)
          info.nodes.set(exported, st)
          if (!st.moduleSpecifier) {
            const local = (el.propertyName ?? el.name).getText(sf)
            const init = locals.get(local)
            if (init) info.initializers.set(exported, init)
          } else if (ts.isStringLiteral(st.moduleSpecifier)) {
            info.from.set(exported, { spec: st.moduleSpecifier.text, name: (el.propertyName ?? el.name).getText(sf) })
          }
        }
      }
    } else if (ts.isExportAssignment(st)) {
      info.names.add('default')
      info.nodes.set('default', st)
      info.initializers.set('default', st.expression)
    }
  }
  return info
}
