// Open Mercato API surface a package uses: every `@open-mercato/<pkg>[/<subpath>]` import, re-export,
// dynamic import, require and `import('...')` type, with the named symbols (port of g2 scan.mjs).
// Output shape {pkg: {subpath: [symbols]}} is the input of Fit (WP06). Markers in symbol lists:
// `default`, `*` (namespace or `export *`), `(side-effect)`, `(dynamic)`.
import { ts } from 'ts-morph'
import { parseSource } from './ast.ts'

export type OmImports = Record<string, Record<string, string[]>>

const OM = /^(@open-mercato\/[a-z0-9][a-z0-9._-]*)(\/[A-Za-z0-9._/@[\]-]*)?$/

export class ImportCollector {
  private readonly map = new Map<string, Map<string, Set<string>>>()

  add(spec: string, symbol: string): void {
    const m = OM.exec(spec)
    if (!m) return
    const pkg = m[1] as string
    const sub = m[2] ? (m[2] as string).slice(1) || '.' : '.'
    if (sub.includes('..')) return
    let subs = this.map.get(pkg)
    if (!subs) this.map.set(pkg, (subs = new Map()))
    let syms = subs.get(sub)
    if (!syms) subs.set(sub, (syms = new Set()))
    syms.add(symbol.slice(0, 120))
  }

  scanFile(file: string): boolean {
    const sf = parseSource(file)
    if (!sf) return false
    const visit = (n: ts.Node): void => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        const spec = n.moduleSpecifier.text
        const ic = n.importClause
        if (!ic) this.add(spec, '(side-effect)')
        else {
          if (ic.name) this.add(spec, 'default')
          if (ic.namedBindings) {
            if (ts.isNamespaceImport(ic.namedBindings)) this.add(spec, '*')
            else for (const e of ic.namedBindings.elements) this.add(spec, (e.propertyName ?? e.name).text)
          }
        }
      } else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
        const spec = n.moduleSpecifier.text
        if (n.exportClause && ts.isNamedExports(n.exportClause))
          for (const e of n.exportClause.elements) this.add(spec, (e.propertyName ?? e.name).text)
        else this.add(spec, '*')
      } else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) {
        const ex = n.moduleReference.expression
        if (ts.isStringLiteral(ex)) this.add(ex.text, '*')
      } else if (ts.isCallExpression(n) && n.arguments.length > 0) {
        const arg = n.arguments[0] as ts.Expression
        const isImport = n.expression.kind === ts.SyntaxKind.ImportKeyword
        const isRequire = ts.isIdentifier(n.expression) && n.expression.text === 'require'
        if ((isImport || isRequire) && ts.isStringLiteralLike(arg)) this.add(arg.text, '(dynamic)')
      } else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) {
        this.add(n.argument.literal.text, n.qualifier ? n.qualifier.getText(sf) : '*')
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
    return true
  }

  scanFiles(files: readonly string[]): this {
    for (const f of files) this.scanFile(f)
    return this
  }

  merge(other: ImportCollector): this {
    for (const [pkg, subs] of other.map)
      for (const [sub, syms] of subs) for (const s of syms) this.add(sub === '.' ? pkg : `${pkg}/${sub}`, s)
    return this
  }

  /** Sorted plain object. */
  toJSON(): OmImports {
    const out: OmImports = {}
    for (const pkg of [...this.map.keys()].sort()) {
      const subs = this.map.get(pkg) as Map<string, Set<string>>
      const o: Record<string, string[]> = {}
      for (const sub of [...subs.keys()].sort()) o[sub] = [...(subs.get(sub) as Set<string>)].sort()
      out[pkg] = o
    }
    return out
  }
}
