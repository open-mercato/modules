// Hosts a package talks to, observed statically, best effort (K1 §3.4 step 6):
//   high: a URL literal passed to fetch(), new URL(), new WebSocket()/EventSource(), an HTTP client
//         call (`x.get(url)`, `request(url)`), or assigned to a base-URL style property or const;
//   low:  any other URL literal in code.
// Excluded: documentation-style properties (docsUrl, homepage, href, ...), JSX attributes, comments
// (not in the AST), tests (the caller passes non-test files), example and local hosts.
import { ts } from 'ts-morph'
import { fileConsts, lineOf, parseSource, relPath } from './ast.ts'

export interface HostRead {
  host: string
  src: { file: string; line: number }
  confidence: 'high' | 'low'
}

const CLIENT_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'request', 'fetch', 'options'])
const CALLS = new Set(['fetch', 'request', 'got', 'ky', 'axios', 'ofetch', '$fetch', 'undici'])
const CTORS = new Set(['URL', 'WebSocket', 'EventSource', 'Request'])
const BASE_KEYS =
  /^(base_?url|baseURI|api_?url|api_?base(_?url)?|endpoint|server_?url|host_?url|origin|url|uri|webhook_?url)$/i
const DOC_KEYS =
  /(docs?|documentation|homepage|website|help|guide|learn|support|link|href|reference|schema|image|icon|logo|avatar|tos|terms|privacy|placeholder|example)/i
const EXCLUDED =
  /(^|\.)(example\.(com|org|net)|localhost|local|test|invalid|w3\.org|json-schema\.org|schema\.org|xmlns\.com)$/

/** Host of a URL text, or null when the host part is not static or not a public DNS name. */
export function hostOf(text: string): string | null {
  const m = /^(?:https?|wss?):\/\/([^/:?#\s`'"$]+)(?::\d+)?(?:[/?#]|$)/i.exec(text)
  if (!m) return null
  const host = (m[1] as string).toLowerCase().replace(/\.$/, '')
  if (!/^(\*\.)?([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(host)) return null
  if (EXCLUDED.test(host)) return null
  return host
}

function urlTextOf(n: ts.Node, consts: Map<string, ts.Expression>, depth = 0): string | null {
  if (ts.isStringLiteralLike(n)) return n.text
  if (ts.isTemplateExpression(n)) return n.head.text
  if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n)) return urlTextOf(n.expression, consts, depth)
  if (ts.isIdentifier(n) && depth < 2) {
    const init = consts.get(n.text)
    return init ? urlTextOf(init, consts, depth + 1) : null
  }
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken)
    return urlTextOf(n.left, consts, depth)
  return null
}

function keyName(name: ts.PropertyName | ts.BindingName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text
  return null
}

/** Raw host reads in the given files; one entry per host, the strongest evidence wins. */
export function scanHosts(pkgRoot: string, files: readonly string[]): HostRead[] {
  const byHost = new Map<string, HostRead>()
  const add = (
    host: string | null,
    file: string,
    sf: ts.SourceFile,
    node: ts.Node,
    confidence: 'high' | 'low',
  ): void => {
    if (!host) return
    const prev = byHost.get(host)
    if (prev && (prev.confidence === 'high' || confidence === 'low')) return
    byHost.set(host, { host, src: { file: relPath(pkgRoot, file), line: lineOf(sf, node) }, confidence })
  }
  for (const file of files) {
    const sf = parseSource(file)
    if (!sf) continue
    const consts = fileConsts(sf)
    const strong = new Set<ts.Node>()
    const weakSkip = new Set<ts.Node>()
    const mark = (arg: ts.Node | undefined): void => {
      if (!arg) return
      const t = urlTextOf(arg, consts)
      if (t !== null) {
        strong.add(arg)
        add(hostOf(t), file, sf, arg, 'high')
      }
    }
    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n)) {
        const callee = n.expression
        const name = ts.isIdentifier(callee)
          ? callee.text
          : ts.isPropertyAccessExpression(callee)
            ? callee.name.text
            : null
        if (name && (CALLS.has(name) || (ts.isPropertyAccessExpression(callee) && CLIENT_METHODS.has(name))))
          mark(n.arguments[0])
      } else if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && CTORS.has(n.expression.text)) {
        mark(n.arguments?.[0])
      } else if (ts.isPropertyAssignment(n)) {
        const k = keyName(n.name)
        if (k && BASE_KEYS.test(k)) mark(n.initializer)
        else if (k && DOC_KEYS.test(k)) weakSkip.add(n.initializer)
      } else if (ts.isVariableDeclaration(n) && n.initializer) {
        const k = keyName(n.name)
        if (k && /(base_?url|api_?url|endpoint|api_?base|host)$/i.test(k)) mark(n.initializer)
        else if (k && DOC_KEYS.test(k)) weakSkip.add(n.initializer)
      } else if (ts.isJsxAttribute(n) && n.initializer) {
        weakSkip.add(n.initializer)
        if (ts.isJsxExpression(n.initializer) && n.initializer.expression) weakSkip.add(n.initializer.expression)
      } else if ((ts.isStringLiteralLike(n) || ts.isTemplateExpression(n)) && !strong.has(n) && !weakSkip.has(n)) {
        const parent = n.parent
        const inImport =
          parent &&
          (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent))
        if (!inImport) {
          const t = ts.isTemplateExpression(n) ? n.head.text : n.text
          add(hostOf(t), file, sf, n, 'low')
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  return [...byHost.values()].sort((a, b) => (a.host < b.host ? -1 : a.host > b.host ? 1 : 0))
}

/** True when `host` is covered by a declared entry (exact, or `*.domain`). */
export function hostDeclared(host: string, declared: readonly string[]): boolean {
  return declared.some((d) => d === host || (d.startsWith('*.') && (host.endsWith(d.slice(1)) || host === d.slice(2))))
}
