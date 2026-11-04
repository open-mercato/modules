// Module inventory of a template (docs/specs/2026-10-29-templates.md, Data Model, "Module inventory", revision 7):
// the modules an app registers in `src/modules.ts`, read statically with the TypeScript parser that ts-morph bundles.
// No type checking, no module resolution beyond the one relative import a loop reads, and no app code run. Anything
// the reader cannot follow is listed in `unparsed` with its line, never dropped silently, and no source text is
// copied into an entry or a reason. The rules are those of create-mercato-template `src/inventory.ts` (the save tool
// writes `mercato-template.json` from them); the fixtures in test/fixtures/templates/modules-from-modules-ts/ are the
// contract both sides test against.
import * as posix from 'node:path/posix'
import { ts } from 'ts-morph'
import { MAX_PARSE_BYTES } from '../rentgen/ast.ts'
import { APP_FROM, DEFAULT_FROM } from '../core/template-facts.ts'

export { APP_FROM, DEFAULT_FROM }
export const MODULES_TS_PATH = 'src/modules.ts'

const MODULE_ID = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/
const ENV_NAME = /^[A-Z][A-Z0-9_]{1,63}$/
const NPM_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

/**
 * One registered module. `when` follows the manifest grammar: env flag names and `module:<id>` terms, each optionally
 * negated with `!`, joined with ` && `; `custom` for any other condition; absent when unconditional.
 */
export type ModulesTsEntry = { id: string; from: string; when?: string }
export type ModulesTsUnparsed = { line: number; reason: string }
export type ModulesTsInventory = { entries: ModulesTsEntry[]; unparsed: ModulesTsUnparsed[] }

/** True when `from` is `@app` or an npm package name. */
export function isKnownFrom(from: string): boolean {
  return from === APP_FROM || (from.length <= 214 && NPM_NAME.test(from))
}

/**
 * Reads the inventory of `src/modules.ts`. `files` maps other repo-relative paths (`src/official-modules.generated.ts`)
 * to their text, for the relative import a loop over official modules reads.
 */
export function modulesFromModulesTs(text: string, files: ReadonlyMap<string, string> = new Map()): ModulesTsInventory {
  if (new TextEncoder().encode(text).length > MAX_PARSE_BYTES)
    return {
      entries: [],
      unparsed: [{ line: 1, reason: `src/modules.ts is larger than ${MAX_PARSE_BYTES} bytes and is not read` }],
    }
  try {
    const error = syntaxErrorLine(MODULES_TS_PATH, text)
    if (error !== null) return { entries: [], unparsed: [{ line: error, reason: 'src/modules.ts has a syntax error' }] }
    const reader = new Reader(files, ts.createSourceFile(MODULES_TS_PATH, text, ts.ScriptTarget.Latest, true))
    reader.read()
    return reader.result()
  } catch (caught) {
    // the parser recurses: a file nested thousands of levels deep overflows the stack well below the size limit
    if (!(caught instanceof RangeError)) throw caught
    return { entries: [], unparsed: [{ line: 1, reason: 'src/modules.ts is nested too deeply to read' }] }
  }
}

/** The line of the first syntax error, or null. The parser's own diagnostics only, no type checking. */
function syntaxErrorLine(fileName: string, text: string): number | null {
  const output = ts.transpileModule(text, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: { noResolve: true, noLib: true, isolatedModules: false, target: ts.ScriptTarget.ES2022 },
  })
  const first = (output.diagnostics ?? []).find((d) => d.category === ts.DiagnosticCategory.Error)
  if (first === undefined) return null
  return first.file && first.start !== undefined ? first.file.getLineAndCharacterOfPosition(first.start).line + 1 : 1
}

/** The where of an addition: the `when` terms of the enclosing conditions, or the line of one outside the grammar. */
type Context = { terms: string[]; custom: number | null }
type Entry = { id: string; from: string; when?: string }

const UNCONDITIONAL: Context = { terms: [], custom: null }

/** Array methods that never change the array or its entries. `forEach` is not one: its callback may. */
const READ_ONLY_METHODS = new Set([
  'some',
  'every',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'includes',
  'indexOf',
  'lastIndexOf',
  'map',
  'filter',
  'flatMap',
  'reduce',
  'slice',
  'concat',
  'join',
  'at',
  'entries',
  'keys',
  'values',
  'toString',
])
const MUTATING_METHODS = new Set(['push', 'unshift', 'splice', 'pop', 'shift', 'sort', 'reverse', 'fill', 'copyWithin'])

function unwrap(node: ts.Expression): ts.Expression {
  let current = node
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current)
  )
    current = current.expression
  return current
}

function stringValue(node: ts.Expression | undefined): string | null {
  if (!node) return null
  const value = unwrap(node)
  return ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value) ? value.text : null
}

function propertyName(name: ts.PropertyName): string | null {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)
    ? name.text
    : null
}

function hasExport(statement: ts.Statement): boolean {
  return (
    ts.canHaveModifiers(statement) &&
    (ts.getModifiers(statement) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  )
}

function blockStatements(statement: ts.Statement): readonly ts.Statement[] {
  return ts.isBlock(statement) ? statement.statements : [statement]
}

function hasIdProperty(node: ts.Expression): boolean {
  const value = unwrap(node)
  return (
    ts.isObjectLiteralExpression(value) &&
    value.properties.some((p) => p.name !== undefined && propertyName(p.name) === 'id')
  )
}

/** One `{id, from}` object literal, or the reason it cannot be read. */
function readObject(node: ts.ObjectLiteralExpression): { id: string; from: string } | { reason: string } {
  const values = new Map<string, ts.Expression | null>()
  for (const property of node.properties) {
    if (ts.isSpreadAssignment(property)) return { reason: 'an entry with a spread (...) the inventory cannot read' }
    const name = property.name === undefined ? null : propertyName(property.name)
    if (name === null) return { reason: 'an entry with a computed property name' }
    values.set(name, ts.isPropertyAssignment(property) ? property.initializer : null)
  }
  if (!values.has('id')) return { reason: 'an entry without an id' }
  const id = stringValue(values.get('id') ?? undefined)
  if (id === null) return { reason: 'an entry whose id is not a string literal' }
  if (!MODULE_ID.test(id) || id.length > 64)
    return { reason: 'an entry whose id is not a module id (lower-case snake_case)' }
  if (!values.has('from')) return { id, from: DEFAULT_FROM }
  const from = stringValue(values.get('from') ?? undefined)
  if (from === null || from === '') return { reason: 'an entry whose from is not a string literal' }
  // an unknown from is kept only when it looks like a path or alias; anything else (a URL that may hold a
  // credential, a line break) is never copied
  if (!isKnownFrom(from) && !/^[A-Za-z0-9@~._/-]{1,214}$/.test(from))
    return { reason: 'an entry whose from is neither @app, an npm package name nor a path' }
  return { id, from }
}

class Reader {
  private readonly handled = new Set<ts.Node>()
  private readonly reported = new Set<string>()
  private readonly entries: Entry[] = []
  private readonly unparsedItems: ModulesTsUnparsed[] = []
  private binding: ts.Identifier | null = null
  private readonly files: ReadonlyMap<string, string>
  private readonly source: ts.SourceFile

  constructor(files: ReadonlyMap<string, string>, source: ts.SourceFile) {
    this.files = files
    this.source = source
  }

  read(): void {
    const found = this.findBinding()
    if (found === null) return this.unparsed(1, 'no exported array of {id, from} module entries')
    this.binding = found.name
    for (const element of found.array.elements) this.add(this.elementEntries(element, UNCONDITIONAL), 'end')
    this.walk(this.source.statements.slice(found.index + 1), UNCONDITIONAL)
    this.scanMutations()
  }

  result(): ModulesTsInventory {
    return { entries: this.entries, unparsed: [...this.unparsedItems].sort((a, b) => a.line - b.line) }
  }

  private line(node: ts.Node): number {
    return this.source.getLineAndCharacterOfPosition(node.getStart(this.source)).line + 1
  }

  private unparsed(line: number, reason: string): void {
    const key = `${line}\n${reason}`
    if (this.reported.has(key)) return
    this.reported.add(key)
    this.unparsedItems.push({ line, reason })
  }

  private isBinding(node: ts.Expression): boolean {
    const value = unwrap(node)
    return this.binding !== null && ts.isIdentifier(value) && value.text === this.binding.text
  }

  /** The first exported array binding that holds `{id, ...}` object literals (`enabledModules` in the scaffold). */
  private findBinding(): { index: number; name: ts.Identifier; array: ts.ArrayLiteralExpression } | null {
    const statements = this.source.statements
    for (let index = 0; index < statements.length; index += 1) {
      const statement = statements[index]!
      if (!ts.isVariableStatement(statement) || !hasExport(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) continue
        const array = unwrap(declaration.initializer)
        if (ts.isArrayLiteralExpression(array) && array.elements.some((e) => hasIdProperty(e)))
          return { index, name: declaration.name, array }
      }
    }
    return null
  }

  private add(entries: Entry[], position: 'start' | 'end'): void {
    if (position === 'end') this.entries.push(...entries)
    else this.entries.unshift(...entries)
  }

  private entry(id: string, from: string, context: Context): Entry {
    if (context.custom !== null)
      this.unparsed(context.custom, 'a condition outside the when grammar (entry kept with when: "custom")')
    const when = context.custom !== null ? 'custom' : context.terms.length > 0 ? context.terms.join(' && ') : undefined
    return when === undefined ? { id, from } : { id, from, when }
  }

  /** One element of the initial array, a `push`/`unshift` argument or a reassigned array. */
  private elementEntries(element: ts.Expression, context: Context): Entry[] {
    const value = unwrap(element)
    const line = this.line(element)
    if (ts.isObjectLiteralExpression(value)) {
      const read = readObject(value)
      if ('reason' in read) {
        this.unparsed(line, read.reason)
        return []
      }
      return [this.entry(read.id, read.from, context)]
    }
    if (ts.isSpreadElement(value) && this.isBinding(value.expression)) {
      this.unparsed(line, 'a spread of the module list into itself')
      return []
    }
    if (ts.isSpreadElement(value)) {
      const spread = unwrap(value.expression)
      if (ts.isIdentifier(spread)) {
        const array = this.readArray(spread, line)
        return array === null ? [] : array.map((item) => this.entry(item.id, item.from, context))
      }
    }
    this.unparsed(
      line,
      ts.isSpreadElement(value)
        ? 'a spread of an expression the inventory cannot read'
        : 'an addition that is not an object literal',
    )
    return []
  }

  /** The statements after the initial array, in source order, with their conditions. */
  private walk(statements: readonly ts.Statement[], context: Context): void {
    // a block that declares its own variable of the list's name holds another list (scanMutations lists it)
    if (this.binding !== null && declaresName(statements, this.binding.text)) return
    for (const statement of statements) {
      if (ts.isBlock(statement)) this.walk(statement.statements, context)
      else if (ts.isExpressionStatement(statement)) this.expression(statement.expression, context)
      else if (ts.isIfStatement(statement)) this.ifStatement(statement, context)
      else if (ts.isForOfStatement(statement)) this.loop(statement, context)
      // any other statement that changes the list is found by scanMutations
    }
  }

  private expression(node: ts.Expression, context: Context): void {
    const value = unwrap(node)
    if (
      ts.isCallExpression(value) &&
      ts.isPropertyAccessExpression(value.expression) &&
      this.isBinding(value.expression.expression)
    ) {
      const method = value.expression.name.text
      if (method !== 'push' && method !== 'unshift') return
      this.handled.add(value)
      const added = value.arguments.flatMap((argument) => this.elementEntries(argument, context))
      this.add(added, method === 'push' ? 'end' : 'start')
      return
    }
    if (
      ts.isBinaryExpression(value) &&
      value.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      this.isBinding(value.left)
    ) {
      this.handled.add(value)
      const right = unwrap(value.right)
      const self = ts.isArrayLiteralExpression(right)
        ? right.elements.flatMap((e, i) => (ts.isSpreadElement(e) && this.isBinding(e.expression) ? [i] : []))
        : []
      if (!ts.isArrayLiteralExpression(right) || self.length !== 1) {
        this.unparsed(this.line(value), 'a reassignment of the module list the inventory cannot read')
        return
      }
      const at = self[0]!
      const before = right.elements.slice(0, at).flatMap((e) => this.elementEntries(e, context))
      const after = right.elements.slice(at + 1).flatMap((e) => this.elementEntries(e, context))
      this.add(before, 'start')
      this.add(after, 'end')
    }
  }

  private ifStatement(statement: ts.IfStatement, context: Context): void {
    const line = this.line(statement)
    const terms = this.termsOf(statement.expression)
    this.walk(blockStatements(statement.thenStatement), this.join(context, terms, line))
    if (statement.elseStatement === undefined) return
    // the else of a one-term condition negates it; any other else is custom
    const negated = terms !== null && terms.length === 1 ? [negate(terms[0]!)] : null
    this.walk(blockStatements(statement.elseStatement), this.join(context, negated, line))
  }

  private join(context: Context, terms: string[] | null, line: number): Context {
    if (context.custom !== null) return context
    if (terms === null) return { terms: context.terms, custom: line }
    const joined = [...context.terms]
    for (const term of terms) if (!joined.includes(term)) joined.push(term)
    return { terms: joined, custom: null }
  }

  /** The `when` terms of a condition, or null when it is outside the grammar. */
  private termsOf(node: ts.Expression): string[] | null {
    const value = unwrap(node)
    if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      const left = this.termsOf(value.left)
      const right = this.termsOf(value.right)
      return left === null || right === null ? null : [...left, ...right]
    }
    if (ts.isPrefixUnaryExpression(value) && value.operator === ts.SyntaxKind.ExclamationToken) {
      const inner = this.termsOf(value.operand)
      return inner !== null && inner.length === 1 ? [negate(inner[0]!)] : null
    }
    if (ts.isIdentifier(value)) {
      const initializer = this.constInitializer(value.text)
      const name = initializer === null ? null : envRead(initializer)
      return name === null ? null : [name]
    }
    const name = envRead(value)
    if (name !== null) return [name]
    const id = this.someIdCheck(value)
    return id === null ? null : [`module:${id}`]
  }

  /** The initializer of a top-level `const` of this name, or null. */
  private constInitializer(name: string): ts.Expression | null {
    for (const statement of this.source.statements) {
      if (!ts.isVariableStatement(statement) || (statement.declarationList.flags & ts.NodeFlags.Const) === 0) continue
      for (const declaration of statement.declarationList.declarations)
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name) return declaration.initializer ?? null
    }
    return null
  }

  /** `<binding>.some((x) => x.id === '<id>')` gives `<id>`. */
  private someIdCheck(node: ts.Expression): string | null {
    if (!ts.isCallExpression(node) || node.arguments.length !== 1) return null
    const callee = node.expression
    if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'some' || !this.isBinding(callee.expression))
      return null
    const predicate = unwrap(node.arguments[0]!)
    if (!ts.isArrowFunction(predicate) || predicate.parameters.length !== 1) return null
    const parameterName = predicate.parameters[0]!.name
    if (!ts.isIdentifier(parameterName) || ts.isBlock(predicate.body)) return null
    const body = unwrap(predicate.body)
    if (!ts.isBinaryExpression(body) || !isEquality(body.operatorToken.kind)) return null
    const sides = [unwrap(body.left), unwrap(body.right)]
    const literal = sides.map((side) => stringValue(side)).find((s) => s !== null)
    const reads = sides.some((side) => isPropertyRead(side, parameterName.text, 'id'))
    return reads && typeof literal === 'string' && MODULE_ID.test(literal) ? literal : null
  }

  /**
   * `for (const entry of <array>) <binding>.push(entry)`, with or without the dedupe guard
   * `if (!<binding>.some((existing) => existing.id === entry.id))`. The array is read from this file or from the file it
   * is imported from (`./official-modules.generated`, revision 7).
   */
  private loop(statement: ts.ForOfStatement, context: Context): void {
    const line = this.line(statement)
    const list = statement.initializer
    const iterated = unwrap(statement.expression)
    if (!ts.isVariableDeclarationList(list) || list.declarations.length !== 1 || !ts.isIdentifier(iterated)) return
    const variableName = list.declarations[0]!.name
    if (!ts.isIdentifier(variableName)) return
    const variable = variableName.text
    const body = blockStatements(statement.statement)
    if (body.length !== 1) return
    let push = body[0]!
    let dedupe = false
    if (ts.isIfStatement(push) && push.elseStatement === undefined && this.isDedupeGuard(push.expression, variable)) {
      const inner = blockStatements(push.thenStatement)
      if (inner.length !== 1) return
      push = inner[0]!
      dedupe = true
    }
    if (!ts.isExpressionStatement(push)) return
    const call = unwrap(push.expression)
    if (
      !ts.isCallExpression(call) ||
      !ts.isPropertyAccessExpression(call.expression) ||
      call.expression.name.text !== 'push' ||
      !this.isBinding(call.expression.expression) ||
      call.arguments.length !== 1 ||
      !isIdentifierNamed(call.arguments[0]!, variable)
    )
      return
    this.handled.add(call)
    const array = this.readArray(iterated, line)
    if (array === null) return
    const ids = new Set(this.entries.map((e) => e.id))
    for (const item of array) {
      if (dedupe && ids.has(item.id)) continue
      ids.add(item.id)
      this.entries.push(this.entry(item.id, item.from, context))
    }
  }

  /** `!<binding>.some((existing) => existing.id === <variable>.id)`. */
  private isDedupeGuard(node: ts.Expression, variable: string): boolean {
    const value = unwrap(node)
    if (!ts.isPrefixUnaryExpression(value) || value.operator !== ts.SyntaxKind.ExclamationToken) return false
    const call = unwrap(value.operand)
    if (!ts.isCallExpression(call) || call.arguments.length !== 1) return false
    const callee = call.expression
    if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'some' || !this.isBinding(callee.expression))
      return false
    const predicate = unwrap(call.arguments[0]!)
    if (!ts.isArrowFunction(predicate) || predicate.parameters.length !== 1 || ts.isBlock(predicate.body)) return false
    const parameterName = predicate.parameters[0]!.name
    if (!ts.isIdentifier(parameterName)) return false
    const body = unwrap(predicate.body)
    if (!ts.isBinaryExpression(body) || !isEquality(body.operatorToken.kind)) return false
    const left = unwrap(body.left)
    const right = unwrap(body.right)
    const parameter = parameterName.text
    return (
      (isPropertyRead(left, parameter, 'id') && isPropertyRead(right, variable, 'id')) ||
      (isPropertyRead(left, variable, 'id') && isPropertyRead(right, parameter, 'id'))
    )
  }

  /**
   * The `{id, from}` entries of an array named by an identifier: a top-level `const` array of this file, or an array
   * exported by the relative module it is imported from. Null, with an `unparsed` item, when it cannot be read.
   */
  private readArray(identifier: ts.Identifier, line: number): { id: string; from: string }[] | null {
    const local = this.constInitializer(identifier.text)
    if (local !== null) {
      const array = unwrap(local)
      return ts.isArrayLiteralExpression(array)
        ? this.arrayEntries(array, this.source, line)
        : this.fail(line, 'the array the loop reads is not an array literal')
    }
    const imported = this.importOf(identifier.text)
    if (imported === null)
      return this.fail(
        line,
        'the array the loop reads is neither declared in src/modules.ts nor imported from a relative module',
      )
    const file = resolveImport(this.files, imported.specifier)
    if (file === null) return this.fail(line, 'the module the array is imported from is not in the snapshot')
    const text = this.files.get(file)!
    if (new TextEncoder().encode(text).length > MAX_PARSE_BYTES)
      return this.fail(line, `${file} is larger than ${MAX_PARSE_BYTES} bytes`)
    let source: ts.SourceFile
    try {
      if (syntaxErrorLine(file, text) !== null) return this.fail(line, `${file} has a syntax error`)
      source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
    } catch (caught) {
      if (!(caught instanceof RangeError)) throw caught
      return this.fail(line, `${file} is nested too deeply to read`)
    }
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement) || !hasExport(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== imported.name) continue
        if (declaration.initializer === undefined) continue
        const array = unwrap(declaration.initializer)
        if (!ts.isArrayLiteralExpression(array))
          return this.fail(line, `${file}: the imported array is not an array literal`)
        return this.arrayEntries(array, source, line)
      }
    }
    return this.fail(line, `${file} does not export the imported array as a const array`)
  }

  private fail(line: number, reason: string): null {
    this.unparsed(line, reason)
    return null
  }

  private arrayEntries(array: ts.ArrayLiteralExpression, source: ts.SourceFile, line: number) {
    const entries: { id: string; from: string }[] = []
    for (const element of array.elements) {
      const value = unwrap(element)
      const at =
        source === this.source
          ? ''
          : `${source.fileName} line ${source.getLineAndCharacterOfPosition(element.getStart(source)).line + 1}: `
      if (!ts.isObjectLiteralExpression(value)) {
        this.unparsed(line, `${at}an element that is not an object literal`)
        continue
      }
      const read = readObject(value)
      if ('reason' in read) this.unparsed(line, `${at}${read.reason}`)
      else entries.push(read)
    }
    return entries
  }

  /** The module specifier and exported name of a named import, or null. */
  private importOf(local: string): { specifier: string; name: string } | null {
    for (const statement of this.source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
      const bindings = statement.importClause?.namedBindings
      if (!bindings || !ts.isNamedImports(bindings)) continue
      for (const element of bindings.elements)
        if (element.name.text === local)
          return { specifier: statement.moduleSpecifier.text, name: (element.propertyName ?? element.name).text }
    }
    return null
  }

  /**
   * Every other reference that can change the list (a mutating method not read above, an assignment, the list passed
   * to a function or aliased) is `unparsed` with its line. Reads (`some`, `map`, `length`, `export`) are not.
   */
  private scanMutations(): void {
    const binding = this.binding!
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && node !== binding && node.text === binding.text) this.classify(node)
      ts.forEachChild(node, visit)
    }
    visit(this.source)
  }

  /**
   * One reference to the list's name. Only an explicit set of uses is safe: the forms read above, a read-only method,
   * `length`, a spread copy, an export or a type query. Reasons never name source identifiers.
   */
  private classify(node: ts.Identifier): void {
    const parent = node.parent
    // the name in another role: `x.enabledModules`, `{ enabledModules: ... }`, an export or import
    if (
      (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
      (ts.isPropertyAssignment(parent) && parent.name === node)
    )
      return
    if (
      ts.isExportSpecifier(parent) ||
      ts.isImportSpecifier(parent) ||
      ts.isTypeQueryNode(parent) ||
      ts.isQualifiedName(parent)
    )
      return
    if (
      (ts.isVariableDeclaration(parent) ||
        ts.isParameter(parent) ||
        ts.isFunctionDeclaration(parent) ||
        ts.isBindingElement(parent)) &&
      parent.name === node
    )
      return this.unparsed(this.line(parent), 'another variable with the name of the module list')
    let top: ts.Node = node
    while (
      ts.isParenthesizedExpression(top.parent) ||
      ts.isAsExpression(top.parent) ||
      ts.isSatisfiesExpression(top.parent) ||
      ts.isNonNullExpression(top.parent) ||
      ts.isTypeAssertionExpression(top.parent)
    )
      top = top.parent
    const user = top.parent
    if (ts.isExportAssignment(user) || ts.isSpreadElement(user) || ts.isTypeOfExpression(user)) return
    if (ts.isForOfStatement(user) && user.expression === top) {
      if (loopWritesEntries(user)) this.unparsed(this.line(user), 'a loop that changes entries of the module list')
      return
    }
    // a pure global check: `Array.isArray(list)`, `JSON.stringify(list)`
    if (ts.isCallExpression(user) && user.arguments.length === 1 && isPureGlobalCall(user.expression)) return
    if (ts.isPropertyAccessExpression(user) && user.expression === top) {
      const method = user.name.text
      const call = user.parent
      if (ts.isCallExpression(call) && call.expression === user) {
        if (this.handled.has(call)) return
        if (READ_ONLY_METHODS.has(method)) {
          // the entries are objects: a callback, or the returned entry, can still rewrite an id
          if (call.arguments.some((a) => callbackWritesParameters(a)) || resultIsWritten(call))
            this.unparsed(this.line(call), 'a change to entries of the module list the inventory cannot follow')
          return
        }
        return this.unparsed(
          this.line(call),
          MUTATING_METHODS.has(method)
            ? `a ${method}() on the module list in a form the inventory cannot read`
            : 'a method call on the module list the inventory cannot follow',
        )
      }
      if (method === 'length' && !isAssignmentTarget(user)) return
      return this.unparsed(this.line(user), 'a use of the module list the inventory cannot follow')
    }
    if (ts.isBinaryExpression(user) && user.left === top && isAssignmentOperator(user.operatorToken.kind)) {
      if (!this.handled.has(user))
        this.unparsed(this.line(user), 'an assignment to the module list the inventory cannot read')
      return
    }
    if ((ts.isCallExpression(user) || ts.isNewExpression(user)) && user.expression !== top)
      return this.unparsed(this.line(user), 'the module list passed to a function, which may add modules')
    this.unparsed(this.line(user), 'a use of the module list the inventory cannot follow')
  }
}

/** `Array.isArray` or `JSON.stringify`. */
function isPureGlobalCall(callee: ts.Expression): boolean {
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    ((callee.expression.text === 'Array' && callee.name.text === 'isArray') ||
      (callee.expression.text === 'JSON' && callee.name.text === 'stringify'))
  )
}

/** The root identifier of an access chain: `m` in `m.id`, `m['id']`, `m.a.b`. */
function accessRoot(node: ts.Expression): string | null {
  let current = unwrap(node)
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current))
    current = unwrap(current.expression)
  return ts.isIdentifier(current) ? current.text : null
}

/** True when `body` assigns to, deletes or increments a property reached through one of `names`, or passes one on. */
function writesThrough(body: ts.Node, names: ReadonlySet<string>): boolean {
  const visit = (node: ts.Node): boolean => {
    let target: ts.Expression | null = null
    if (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind)) target = node.left
    else if (ts.isDeleteExpression(node)) target = node.expression
    else if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && isIncrement(node.operator))
      target = node.operand
    if (target !== null) {
      const value = unwrap(target)
      if (
        (ts.isPropertyAccessExpression(value) || ts.isElementAccessExpression(value)) &&
        names.has(accessRoot(value) ?? '')
      )
        return true
    }
    // passing an entry on (`Object.assign(m, ...)`, `rename(m)`) may change it too
    if (
      ts.isCallExpression(node) &&
      node.arguments.some((a) => {
        const value = unwrap(a)
        return ts.isIdentifier(value) && names.has(value.text)
      })
    )
      return true
    return ts.forEachChild(node, visit) ?? false
  }
  return visit(body)
}

function parameterNames(fn: ts.SignatureDeclarationBase): Set<string> {
  const names = new Set<string>()
  const add = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) names.add(name.text)
    else for (const element of name.elements) if (!ts.isOmittedExpression(element)) add(element.name)
  }
  for (const parameter of fn.parameters) add(parameter.name)
  return names
}

/** True when an argument is a callback that writes through its parameters (`(m) => { m.id = 'x' }`). */
function callbackWritesParameters(argument: ts.Expression): boolean {
  const value = unwrap(argument)
  if (!ts.isArrowFunction(value) && !ts.isFunctionExpression(value)) return false
  return writesThrough(value.body, parameterNames(value))
}

/** True when a call's result is written through (`list.find(...)!.id = 'x'`) or iterated by a loop that writes it. */
function resultIsWritten(call: ts.CallExpression): boolean {
  let top: ts.Node = call
  while (
    ts.isParenthesizedExpression(top.parent) ||
    ts.isAsExpression(top.parent) ||
    ts.isNonNullExpression(top.parent) ||
    ts.isSatisfiesExpression(top.parent)
  )
    top = top.parent
  const user = top.parent
  if (ts.isForOfStatement(user) && user.expression === top) return loopWritesEntries(user)
  if ((ts.isPropertyAccessExpression(user) || ts.isElementAccessExpression(user)) && user.expression === top) {
    let outer: ts.Node = user
    while (
      (ts.isPropertyAccessExpression(outer.parent) || ts.isElementAccessExpression(outer.parent)) &&
      outer.parent.expression === outer
    )
      outer = outer.parent
    return isAssignmentTarget(outer as ts.Expression) || ts.isDeleteExpression(outer.parent)
  }
  // kept in a variable: `const m = list.find(...)`, then `m.id = 'x'`
  if (ts.isVariableDeclaration(user) && ts.isIdentifier(user.name))
    return writesThrough(user.getSourceFile(), new Set([user.name.text]))
  return false
}

/** True when a `for...of` body writes through its loop variable. A destructuring loop variable is not followed. */
function loopWritesEntries(loop: ts.ForOfStatement): boolean {
  const list = loop.initializer
  const names = new Set<string>()
  if (ts.isVariableDeclarationList(list)) {
    for (const declaration of list.declarations) if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text)
  } else if (ts.isIdentifier(list)) names.add(list.text)
  return names.size === 0 || writesThrough(loop.statement, names)
}

/** True when the statements declare a variable, function or class of this name at their own level. */
function declaresName(statements: readonly ts.Statement[], name: string): boolean {
  return statements.some(
    (s) =>
      (ts.isVariableStatement(s) &&
        s.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name)) ||
      ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) && s.name?.text === name),
  )
}

function negate(term: string): string {
  return term.startsWith('!') ? term.slice(1) : `!${term}`
}

function isEquality(kind: ts.SyntaxKind): boolean {
  return kind === ts.SyntaxKind.EqualsEqualsEqualsToken || kind === ts.SyntaxKind.EqualsEqualsToken
}

function isIncrement(operator: ts.SyntaxKind): boolean {
  return operator === ts.SyntaxKind.PlusPlusToken || operator === ts.SyntaxKind.MinusMinusToken
}

function isIdentifierNamed(node: ts.Expression, name: string): boolean {
  const value = unwrap(node)
  return ts.isIdentifier(value) && value.text === name
}

/** `<object>.<property>` where `<object>` is the identifier `object`. */
function isPropertyRead(node: ts.Expression, object: string, property: string): boolean {
  return (
    ts.isPropertyAccessExpression(node) && node.name.text === property && isIdentifierNamed(node.expression, object)
  )
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment
}

function isAssignmentTarget(node: ts.Expression): boolean {
  const parent = node.parent
  if (ts.isBinaryExpression(parent) && parent.left === node && isAssignmentOperator(parent.operatorToken.kind))
    return true
  return (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) && isIncrement(parent.operator)
}

/**
 * `process.env.NAME` or `process.env['NAME']`, directly or as the first argument of a call such as
 * `parseBooleanWithDefault(process.env.NAME, false)` (no other argument reading `process.env`), gives `NAME`.
 */
function envRead(node: ts.Expression): string | null {
  const value = unwrap(node)
  const direct = envName(value)
  if (direct !== null) return direct
  if (!ts.isCallExpression(value) || value.arguments.length === 0) return null
  const name = envName(unwrap(value.arguments[0]!))
  if (name === null) return null
  return value.arguments.slice(1).some((a) => mentionsProcessEnv(a)) ? null : name
}

function envName(node: ts.Expression): string | null {
  let name: string | null
  let object: ts.Expression
  if (ts.isPropertyAccessExpression(node)) {
    name = node.name.text
    object = unwrap(node.expression)
  } else if (ts.isElementAccessExpression(node)) {
    name = stringValue(node.argumentExpression)
    object = unwrap(node.expression)
  } else return null
  if (name === null || !ENV_NAME.test(name)) return null
  return ts.isPropertyAccessExpression(object) &&
    object.name.text === 'env' &&
    isIdentifierNamed(object.expression, 'process')
    ? name
    : null
}

function mentionsProcessEnv(node: ts.Node): boolean {
  if (ts.isIdentifier(node) && node.text === 'process') return true
  return ts.forEachChild(node, mentionsProcessEnv) ?? false
}

/** The repo-relative path of a relative import from `src/modules.ts` among `files`, or null. */
export function resolveImport(files: ReadonlyMap<string, string>, specifier: string): string | null {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null
  const base = posix.normalize(posix.join(posix.dirname(MODULES_TS_PATH), specifier))
  if (base.startsWith('../')) return null
  const stem = base.replace(/\.(?:js|mjs|cjs)$/, '')
  for (const candidate of [base, `${stem}.ts`, `${stem}.tsx`, `${stem}.mts`, `${stem}/index.ts`])
    if (/\.(?:ts|tsx|mts)$/.test(candidate) && files.has(candidate)) return candidate
  return null
}
