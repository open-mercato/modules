// `integration.ts` of a module: the IntegrationDefinition literal(s) the extractor does not expand
// (i1 §1.2, §7.4). We read id, title, category, hub, providerKey, license, version and the credential
// fields (names, types and `required` only, never values or labels).
import { join } from 'node:path'
import { ts } from 'ts-morph'
import { evalLiteral, fileConsts, isFile, isLitObject, lineOf, parseSource, relPath, type LitObject } from './ast.ts'

export interface CredentialField {
  key: string
  type: string
  required: boolean
}

export interface IntegrationDef {
  id: string
  title: string | null
  category: string | null
  hub: string | null
  providerKey: string | null
  license: string | null
  version: string | null
  credentials: CredentialField[]
  src: { file: string; line: number }
}

export interface IntegrationRead {
  status: 'expanded' | 'absent' | 'unparsed'
  definitions: IntegrationDef[]
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

function credentialsOf(o: LitObject): CredentialField[] {
  const creds = o.credentials
  const fields = isLitObject(creds) ? creds.fields : undefined
  if (!Array.isArray(fields)) return []
  const out: CredentialField[] = []
  for (const f of fields) {
    if (!isLitObject(f) || typeof f.key !== 'string') continue
    out.push({ key: f.key, type: typeof f.type === 'string' ? f.type : 'text', required: f.required === true })
  }
  return out
}

/** Read `<moduleRoot>/integration.ts` (or `.tsx`) without executing it. */
export function readIntegration(pkgRoot: string, moduleRoot: string): IntegrationRead {
  const file = ['integration.ts', 'integration.tsx'].map((n) => join(moduleRoot, n)).find(isFile)
  if (!file) return { status: 'absent', definitions: [] }
  const sf = parseSource(file)
  if (!sf) return { status: 'unparsed', definitions: [] }
  const consts = fileConsts(sf)
  const defs: IntegrationDef[] = []
  const seen = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const v = evalLiteral(node, sf, consts)
      if (
        isLitObject(v) &&
        typeof v.id === 'string' &&
        typeof v.title === 'string' &&
        (typeof v.category === 'string' || typeof v.hub === 'string' || typeof v.providerKey === 'string') &&
        !seen.has(v.id)
      ) {
        seen.add(v.id)
        defs.push({
          id: v.id,
          title: str(v.title),
          category: str(v.category),
          hub: str(v.hub),
          providerKey: str(v.providerKey),
          license: str(v.license),
          version: str(v.version),
          credentials: credentialsOf(v),
          src: { file: relPath(pkgRoot, file), line: lineOf(sf, node) },
        })
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return { status: defs.length > 0 ? 'expanded' : 'unparsed', definitions: defs }
}
