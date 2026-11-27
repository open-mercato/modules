// The `redirects` collection of the main site end to end (www site migration spec, Merged root files, Phase 8):
// www/content/redirects.yaml (the docs map of the importer, the Webflow 301 list of D8, manual rules) is read and
// validated by the www build, which writes its rules, in file order, to dist-www/_redirects (www/astro.config.ts);
// `yarn om pages-site --merge` appends that file to the root _redirects of the merged layout (lib/emit/pages-merge.ts),
// and `--check` proves the upload: the same rules as the yaml, no loop, no chain longer than one hop, Pages limits.
import { parse } from 'yaml'
import { fileEntries, redirectSchema } from '../schema/www-content.ts'

/** The www build's file of rules, at the root of dist-www/; the merge moves its rules into the root _redirects. */
export const WWW_REDIRECTS_FILE = '_redirects'

/** The first line of dist-www/_redirects and of its part of the merged _redirects. */
export const WWW_REDIRECTS_HEAD = '# The main site (www/content/redirects.yaml), in its order.'

export interface WwwRedirect {
  from: string
  to: string
  status: 301
  source: 'webflow-panel' | 'docs-map' | 'manual'
}

/**
 * The rules of a redirects.yaml text, validated as the content collection validates them (redirectSchema, a `from`
 * given once). Throws naming the first bad rule. An empty file has no rules.
 */
export function parseWwwRedirects(text: string, file = 'redirects.yaml'): WwwRedirect[] {
  const data = parse(text) as unknown
  const entries = fileEntries('redirects', data)
  const schema = redirectSchema()
  return Object.values(entries).map((rule, i) => {
    const r = schema.safeParse(rule)
    if (!r.success)
      throw new Error(`${file}: rule ${i + 1} (${JSON.stringify(rule).slice(0, 100)}): ${r.error.issues[0]?.message}`)
    return r.data as WwwRedirect
  })
}

/** dist-www/_redirects for `rules`: the head line, then one `from to status` line per rule; empty without rules. */
export function wwwRedirectsText(rules: readonly WwwRedirect[]): string {
  if (rules.length === 0) return ''
  return [WWW_REDIRECTS_HEAD, ...rules.map((r) => `${r.from} ${r.to} ${r.status}`)].join('\n') + '\n'
}

/** Why a dist-www/_redirects text is not one wwwRedirectsText() writes: its head, then `from to 301` lines. */
export function wwwRedirectsTextProblems(text: string): string[] {
  if (text === '') return []
  const lines = text.split('\n')
  if (lines[0] !== WWW_REDIRECTS_HEAD) return [`does not begin with "${WWW_REDIRECTS_HEAD}"`]
  if (!text.endsWith('\n')) return ['does not end with a line break']
  const problems: string[] = []
  const schema = redirectSchema()
  for (const [i, line] of lines.slice(1, -1).entries()) {
    const [from, to, status, ...rest] = line.split(' ')
    const ok =
      rest.length === 0 &&
      schema.safeParse({ from, to, status: Number(status), source: 'manual' }).success &&
      status === '301'
    if (!ok) problems.push(`line ${i + 2} is not a rule "from to 301": ${line.slice(0, 120)}`)
  }
  return problems
}

/** One rule of a _redirects text as Pages reads it. */
export interface PagesRule {
  from: string
  to: string
  status: string
}

/** The rules of a _redirects text, comments and blank lines left out. */
export function pagesRules(text: string): PagesRule[] {
  const out: PagesRule[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const [from = '', to = '', status = '302'] = line.split(/\s+/)
    out.push({ from, to, status })
  }
  return out
}

/** A _redirects source as a pattern: `*` matches the rest of the path, `:name` one segment. */
export function sourcePattern(from: string): RegExp {
  const body = from
    .split(/(\*|:[A-Za-z][A-Za-z0-9_]*)/)
    .map((part) => (part === '*' ? '.*' : part.startsWith(':') ? '[^/]+' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')))
    .join('')
  return new RegExp(`^${body}$`)
}

/**
 * The path a rule sends a request for its own source to, on `origin`, or null when it leaves the site. A splat or a
 * placeholder takes a sample segment, so a rule `/a/* /b/:splat` is followed as `/a/x` to `/b/x`.
 */
export function ruleTargetPath(rule: PagesRule, origin: string): string | null {
  const to = rule.to.replace(/:splat|:[A-Za-z][A-Za-z0-9_]*/g, 'x')
  let url: URL
  try {
    url = new URL(to, `${origin}/`)
  } catch {
    return null
  }
  return url.origin === origin ? url.pathname : null
}

/** A _redirects target that takes the splat or a placeholder of its source. */
export const DYNAMIC_TO = /:splat|\/:[A-Za-z]/

/** The paths a target with the splat or placeholders can name: `:splat` any rest, `:name` one segment. */
function targetPattern(path: string): RegExp {
  const body = path
    .split(/(:splat|:[A-Za-z][A-Za-z0-9_]*)/)
    .map((part) =>
      part === ':splat' ? '.*' : part.startsWith(':') ? '[^/]+' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('')
  return new RegExp(`^${body}$`)
}

/**
 * Loops and chains of a _redirects text on `origin`: a rule whose target is the source of a rule (itself included)
 * makes a visitor follow two redirects or more, and a loop never ends. Pages applies the first rule that matches, so
 * a target is followed through the first matching rule. One problem per rule that starts one.
 */
export function redirectChainProblems(text: string, origin: string): string[] {
  const rules = pagesRules(text)
  const patterns = rules.map((r) => sourcePattern(r.from))
  const matching = (path: string): number => patterns.findIndex((p) => p.test(path))
  const problems: string[] = []
  for (const [i, rule] of rules.entries()) {
    // a rule that only collapses a run of slashes (`/run//* /run/:splat`, lib/emit/pages-merge.ts) answers addresses
    // nothing links; the rest of the cleanup after it is one more hop by design
    if (rule.from.includes('//')) continue
    const seen = [i]
    const hops = [rule.from]
    let loop = false
    for (let at = rule; seen.length < 4;) {
      const path = ruleTargetPath(at, origin)
      if (path === null) break
      const next = matching(path)
      if (next < 0) break
      hops.push(path)
      if (seen.includes(next)) {
        loop = true
        break
      }
      seen.push(next)
      at = rules[next]!
    }
    // a target with the splat or a placeholder names many paths: a fixed source among them is a second hop too. A
    // target that is all splat (`/:splat`, a folder dropped) is left out: it reaches every fixed rule of the site.
    if (!loop && seen.length === 1 && DYNAMIC_TO.test(rule.to)) {
      const target = ruleTargetPath(rule, origin) === null ? null : new URL(rule.to, `${origin}/`).pathname
      const pattern = target === null || /^\/:splat/.test(target) ? null : targetPattern(target)
      const under = pattern === null ? undefined : rules.find((r) => !/[*:]/.test(r.from) && pattern.test(r.from))
      if (under) {
        problems.push(
          `the redirect from ${rule.from} is a chain of 2 hops: ${rule.from} -> ${under.from}; point it at the last target`,
        )
        continue
      }
    }
    if (loop) problems.push(`the redirect from ${rule.from} loops: ${hops.join(' -> ')}`)
    else if (seen.length > 1)
      problems.push(
        `the redirect from ${rule.from} is a chain of ${seen.length} hops${seen.length >= 4 ? ' or more' : ''}: ${hops.join(' -> ')}; point it at the last target`,
      )
  }
  return problems
}
