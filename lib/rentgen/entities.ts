// Tables of a module the engine does not read (finding of 25 Oct): `@Entity({ tableName: INVENTORY_TABLE })` with the
// name in a const of the package, and tables a migration creates that no entity names. Raw values; the caller
// sanitizes. Module code is parsed, never executed.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ts } from 'ts-morph'
import { codeFiles, evalLiteral, isDir, isLitObject, lineOf, moduleConsts, parseSource, relPath } from './ast.ts'

export interface TableRead {
  /** `<moduleId>:<snake_case class>` (the engine's entity ID), or `<moduleId>:<table>` for a migration-only table. */
  id: string
  table: string
  src: { file: string; line: number }
}

const snake = (s: string): string =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()

/** `@Entity({ tableName })` classes under `data/`, with the table name read through consts of the package. */
export function scanEntityTables(pkgRoot: string, moduleRoot: string, moduleId: string): TableRead[] {
  const dir = join(moduleRoot, 'data')
  if (!isDir(dir)) return []
  const out: TableRead[] = []
  for (const file of codeFiles(dir)) {
    const sf = parseSource(file)
    if (!sf) continue
    let consts: Map<string, ts.Expression> | null = null
    for (const st of sf.statements) {
      if (!ts.isClassDeclaration(st) || !st.name) continue
      for (const d of ts.getDecorators(st) ?? []) {
        const call = d.expression
        if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression) || call.expression.text !== 'Entity')
          continue
        consts ??= moduleConsts(sf, file)
        const arg = evalLiteral(call.arguments[0], sf, consts)
        const table = isLitObject(arg) && typeof arg.tableName === 'string' ? arg.tableName : null
        if (table)
          out.push({
            id: `${moduleId}:${snake(st.name.text)}`,
            table,
            src: { file: relPath(pkgRoot, file), line: lineOf(sf, st) },
          })
      }
    }
  }
  return out
}

const CREATE_TABLE = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?[a-z_][a-z0-9_]*"?\.)?"?([a-z_][a-z0-9_]*)"?/gi

/** Tables the module's migrations create (`create table "x"`), first migration first. */
export function scanMigrationTables(pkgRoot: string, moduleRoot: string, moduleId: string): TableRead[] {
  const dir = join(moduleRoot, 'migrations')
  if (!isDir(dir)) return []
  const out: TableRead[] = []
  for (const file of codeFiles(dir).sort()) {
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const m of text.matchAll(CREATE_TABLE)) {
      const table = (m[1] as string).toLowerCase()
      if (out.some((t) => t.table === table)) continue
      const line = text.slice(0, m.index).split('\n').length
      out.push({ id: `${moduleId}:${table}`, table, src: { file: relPath(pkgRoot, file), line } })
    }
  }
  return out
}
