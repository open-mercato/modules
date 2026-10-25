// Identifier hygiene for "facts from code" (spec 5.5): every ID, name, host and title read from a
// tarball passes the regexes of spec 4.1 before it is written. A value that fails is dropped and
// counted; the module gets one `invalid-identifier` lint per kind. Rejected values are never quoted,
// so a prompt-injection payload in an ID or title cannot travel into lint messages or prompts.
import { injectionFlags, isPlainText } from '../core/text.ts'
import { AclFeature, EnvName, EventId, Host, ModuleId, RoutePath } from '../schema/common.ts'
import type { LintFinding, Src } from '../schema/data/facts.ts'

export type IdKind =
  | 'module id'
  | 'ACL feature'
  | 'event ID'
  | 'subscribed event ID'
  | 'env name'
  | 'host'
  | 'route path'
  | 'page path'
  | 'queue name'
  | 'CLI command'
  | 'AI tool'
  | 'AI agent'
  | 'credential key'
  | 'credential type'
  | 'entity ID'
  | 'table name'
  | 'requires entry'
  | 'title'
  | 'description'
  | 'extension target'

const RE: Record<IdKind, (s: string) => boolean> = {
  'module id': (s) => ModuleId.safeParse(s).success,
  'ACL feature': (s) => AclFeature.safeParse(s).success,
  'event ID': (s) => EventId.safeParse(s).success,
  'subscribed event ID': (s) => EventId.safeParse(s).success,
  'env name': (s) => EnvName.safeParse(s).success,
  host: (s) => Host.safeParse(s).success,
  'route path': (s) => RoutePath.safeParse(s).success,
  'page path': (s) => RoutePath.safeParse(s).success,
  'queue name': (s) => /^[a-z0-9_.:-]{1,80}$/.test(s),
  'CLI command': (s) => /^[a-z0-9:_-]{1,60}$/.test(s),
  'AI tool': (s) => /^[a-z0-9_.-]{1,80}$/.test(s),
  'AI agent': (s) => /^[a-z0-9_.-]{1,80}$/.test(s),
  'credential key': (s) => /^[a-zA-Z0-9_]{1,64}$/.test(s),
  'credential type': (s) => /^[a-z][a-z0-9-]{0,19}$/.test(s),
  'entity ID': (s) => /^[a-z0-9_]+:[a-z0-9_]+$/.test(s) && s.length <= 120,
  'table name': (s) => /^[a-z_][a-z0-9_]{0,79}$/.test(s),
  'requires entry': (s) =>
    s.length <= 200 &&
    (ModuleId.safeParse(s).success ||
      /^(npm:(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*|github:[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100})$/.test(
        s,
      )),
  title: (s) => s.length <= 80 && isPlainText(s) && injectionFlags(s).length === 0,
  description: (s) => s.length <= 300 && isPlainText(s) && injectionFlags(s).length === 0,
  'extension target': (s) => /^[A-Za-z0-9_.:*/[\]@-]{1,120}$/.test(s),
}

/** Collects rejections while facts of one module are assembled. */
export class Sanitizer {
  readonly rejected = new Map<IdKind, { count: number; src: Src | null }>()

  ok(kind: IdKind, value: unknown, src: Src | null = null): value is string {
    if (typeof value === 'string' && RE[kind](value)) return true
    const prev = this.rejected.get(kind)
    if (prev) prev.count++
    else this.rejected.set(kind, { count: 1, src })
    return false
  }

  /** Values that pass, in order, without duplicates. */
  list(kind: IdKind, values: readonly unknown[], src: Src | null = null): string[] {
    const out: string[] = []
    for (const v of values) if (this.ok(kind, v, src) && !out.includes(v)) out.push(v)
    return out
  }

  /** Optional text (title, description): null when missing or rejected. */
  text(kind: 'title' | 'description', value: unknown, src: Src | null = null): string | null {
    if (value === null || value === undefined || value === '') return null
    // formatting only: long dashes become '-', backticks are dropped; everything else must pass
    const v =
      typeof value === 'string'
        ? value
            .replace(/[\u2013\u2014]/g, '-')
            .replace(/`/g, '')
            .replace(/\s+/g, ' ')
            .trim()
        : value
    return this.ok(kind, v, src) ? v : null
  }

  /** One `invalid-identifier` finding per rejected kind (never quotes the value). */
  findings(): LintFinding[] {
    return [...this.rejected.entries()].map(([kind, r]) => ({
      code: 'invalid-identifier',
      severity: 'warn',
      message: `Rejected ${r.count} ${kind}${r.count === 1 ? '' : 's'} that failed the catalog pattern.`,
      anchor: null,
      src: r.src,
    }))
  }
}

/** Remove control characters (keeps tab and line breaks). Used for README excerpts. */
export function stripControl(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
}
