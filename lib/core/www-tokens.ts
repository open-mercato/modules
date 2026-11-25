// Count tokens of the main site's copy (www site migration spec, A6; AGENTS.md rule 8): copy holds `{githubStars}` and
// `{moduleCount}` instead of a hand-typed number, and the build fills them from data. A token without a value prints
// nothing (never a typed number): "{moduleCount} plugins" reads "plugins". Isomorphic: no Node APIs.

/** The count tokens copy may hold, by name. */
export const COUNT_TOKEN_NAMES = ['githubStars', 'moduleCount'] as const
export type CountToken = (typeof COUNT_TOKEN_NAMES)[number]

/** The values of the tokens for one build; a missing value is a token the build cannot fill. */
export type CountValues = Partial<Record<CountToken, number>>

/** A part of a text with tokens: plain text, or a token with its value formatted (null when the build has none). */
export type TokenPart = { text: string } | { token: CountToken; value: string | null }

const TOKEN_RE = new RegExp(`\\{(${COUNT_TOKEN_NAMES.join('|')})\\}`, 'g')

/** A count as the site prints it: digits grouped with commas, as the navbar does ("1,928"). */
export function formatCount(n: number): string {
  return n.toLocaleString('en-US')
}

/**
 * The parts of `text`: plain runs and tokens. A token with no value takes the space after it along, so the rest of
 * the sentence reads without a gap ("{githubStars} stars on GitHub" without a value is "stars on GitHub").
 */
export function tokenParts(text: string, values: CountValues): TokenPart[] {
  const parts: TokenPart[] = []
  let at = 0
  let dropSpace = false
  for (const m of text.matchAll(TOKEN_RE)) {
    let before = text.slice(at, m.index)
    if (dropSpace) before = before.replace(/^ /, '')
    if (before) parts.push({ text: before })
    const token = m[1] as CountToken
    const n = values[token]
    const ok = typeof n === 'number' && Number.isInteger(n) && n >= 0
    parts.push({ token, value: ok ? formatCount(n) : null })
    dropSpace = !ok
    at = m.index + m[0].length
  }
  let rest = text.slice(at)
  if (dropSpace) rest = rest.replace(/^ /, '')
  if (rest) parts.push({ text: rest })
  return parts
}

/** `text` with its tokens filled, as plain text. */
export function fillCounts(text: string, values: CountValues): string {
  return tokenParts(text, values)
    .map((p) => ('text' in p ? p.text : (p.value ?? '')))
    .join('')
}

/** True when `text` holds a count token. */
export function hasCountToken(text: string): boolean {
  return text.match(TOKEN_RE) !== null
}

/**
 * `{moduleCount}` from the catalog's modules.json of the same build (spec, Build and deploy): the modules an app can
 * add, the catalog's listed modules and the built-in modules of the current core. Undefined for a file of another
 * shape.
 */
export function moduleCountOf(modulesJson: unknown): number | undefined {
  const counts = (modulesJson as { counts?: { modules?: unknown; builtIn?: unknown } } | null)?.counts
  const { modules, builtIn } = counts ?? {}
  if (typeof modules !== 'number' || typeof builtIn !== 'number') return undefined
  return modules + builtIn
}
