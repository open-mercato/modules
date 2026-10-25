// Signature drift (spec 6.2 SIG-FIT, D14): a symbol a module uses whose declaration text changed between two
// OM versions. Port of spikes/g2/scripts/compat.mjs (declSig, sigOf, drift loop). The comparison is textual
// after removing comments and whitespace, so a renamed parameter also counts: drift means "check", not "broken".
import { createHash } from 'node:crypto'
import { ts } from 'ts-morph'

/** A program over one published OM package (built in static.ts). */
export interface PackageProgram {
  program: ts.Program
  checker: ts.TypeChecker
  resolveFromFile: (spec: string, from: string) => string | null
}

/** `pkg/subpath#Name` (subpath `.` gives `pkg#Name`): the key of drift, surface and radar entries. */
export function symbolKey(pkg: string, subpath: string, name: string): string {
  return subpath === '.' ? `${pkg}#${name}` : `${pkg}/${subpath}#${name}`
}

const norm = (x: string): string =>
  x
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim()

function cut(sf: ts.SourceFile, a: number, b: number): string {
  return sf.text.slice(a, b)
}

function declSig(d: ts.Declaration): string {
  const sf = d.getSourceFile()
  if (ts.isFunctionDeclaration(d) || ts.isMethodDeclaration(d))
    return norm(cut(sf, d.getStart(), d.body ? d.body.getStart() : d.end))
  if (ts.isVariableDeclaration(d)) {
    if (d.type) return norm(`${d.name.getText()}: ${d.type.getText()}`)
    const i = d.initializer
    if (i && (ts.isArrowFunction(i) || ts.isFunctionExpression(i)))
      return norm(d.name.getText() + cut(sf, i.getStart(), i.body.getStart()))
    const text = i ? i.getText() : ''
    return `const ${d.name.getText()} ${i ? ts.SyntaxKind[i.kind] + (text.length < 200 ? `:${norm(text)}` : '') : ''}`
  }
  if (ts.isClassDeclaration(d)) {
    const members = d.members.map((m: ts.ClassElement) =>
      ts.isMethodDeclaration(m) || ts.isConstructorDeclaration(m) || ts.isGetAccessor(m) || ts.isSetAccessor(m)
        ? norm(cut(sf, m.getStart(), m.body ? m.body.getStart() : m.end))
        : norm(m.getText()),
    )
    return `${norm(cut(sf, d.getStart(), d.members.pos))}{${members.join(';')}}`
  }
  if (ts.isInterfaceDeclaration(d) || ts.isTypeAliasDeclaration(d) || ts.isEnumDeclaration(d)) return norm(d.getText())
  return ts.SyntaxKind[d.kind] ?? String(d.kind)
}

/** Short hash of the declarations behind export `name` of `file`; `external` when it has none; null when absent. */
export function sigOf(prog: PackageProgram, file: string, name: string): string | null {
  const sf = prog.program.getSourceFile(file)
  if (!sf) return null
  const sym = prog.checker.getSymbolAtLocation(sf)
  if (!sym) return null
  let e = prog.checker.getExportsOfModule(sym).find((x: ts.Symbol) => x.name === name)
  if (!e) return null
  try {
    if (e.flags & ts.SymbolFlags.Alias) e = prog.checker.getAliasedSymbol(e)
  } catch {
    // keep the alias
  }
  const ds = e.declarations ?? []
  if (ds.length === 0) return 'external'
  return createHash('sha1').update(ds.map(declSig).join('\n')).digest('hex').slice(0, 10)
}

/** Keys present in both maps whose signature differs (compat.mjs: `k in a && k in b && a[k] !== b[k]`). */
export function driftBetween(
  base: Readonly<Record<string, string | null>>,
  other: Readonly<Record<string, string | null>>,
): { compared: number; changed: string[] } {
  const changed: string[] = []
  let compared = 0
  for (const k of Object.keys(other).sort()) {
    if (!(k in base)) continue
    compared++
    if (base[k] !== other[k]) changed.push(k)
  }
  return { compared, changed }
}
