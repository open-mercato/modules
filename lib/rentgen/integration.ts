// `integration.ts` of a module: the IntegrationDefinition literal(s) the extractor does not expand
// (i1 §1.2, §7.4). We read id, title, category, hub, providerKey, license, version and the credential
// fields (names, types and `required` only, never values or labels).
import { join } from 'node:path'
import { ts } from 'ts-morph'
import { evalLiteral, isFile, isLitObject, lineOf, moduleConsts, parseSource, relPath, type LitObject } from './ast.ts'

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
  const consts = moduleConsts(sf, file)
  const defs: IntegrationDef[] = []
  const seen = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const v = evalLiteral(node, sf, consts)
      // an IntegrationDefinition, or an IntegrationBundle that holds the credentials its integrations share
      // (sync-shopify: the definitions come from a factory function, the bundle is a literal)
      const definition =
        isLitObject(v) &&
        typeof v.title === 'string' &&
        (typeof v.category === 'string' || typeof v.hub === 'string' || typeof v.providerKey === 'string')
      const bundle = isLitObject(v) && credentialsOf(v).length > 0
      if (isLitObject(v) && typeof v.id === 'string' && (definition || bundle) && !seen.has(v.id)) {
        seen.add(v.id)
        defs.push({
          id: v.id,
          title: typeof v.title === 'string' ? str(v.title) : null,
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

/**
 * Widgets of `<moduleRoot>/widgets/injection-table.ts`: entries with a `widgetId` under any spot key, a computed one
 * (`[gatewayStripeDetailWidgetSpotId]`) included, which the engine cannot resolve and leaves out. 0 without the file.
 */
export function injectionWidgets(moduleRoot: string): number {
  const file = ['injection-table.ts', 'injection-table.tsx'].map((n) => join(moduleRoot, 'widgets', n)).find(isFile)
  const sf = file ? parseSource(file) : null
  if (!sf) return 0
  const ids = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'widgetId') {
      if (ts.isStringLiteralLike(node.initializer)) ids.add(node.initializer.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return ids.size
}
