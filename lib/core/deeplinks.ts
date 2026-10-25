// Deeplinks that open a coding agent with the install prompt (spec 8.7). Budget: every URL at most 1800
// characters (Chrome cuts custom schemes near 2048). Over budget: lists shrink to 5 items (then 3 and 1), then the
// prompt is cut by code points with an ellipsis and the page copies the full prompt (`needsClipboard`). Isomorphic.

export const URL_BUDGET = 1800
export const FIRST_TIME_HINT = 'First time? Run any prompt in Claude Code once so it registers the link handler.'
export const CLIPBOARD_NOTE = 'Full prompt copied. Paste it if the link opens a shortened one.'

export type DeeplinkTarget = 'claude-cli' | 'claude-desktop' | 'vscode' | 'cursor' | 'codex'

interface TargetSpec {
  id: DeeplinkTarget
  label: string
  /** URL before the encoded prompt. */
  prefix: string
  /** Max prompt length in characters, when the target documents one. */
  maxPrompt: number | null
  /** Accepts `&cwd=`. */
  cwd: boolean
}

/** In menu order: Claude Code first (spec 8.7). */
export const TARGETS: readonly TargetSpec[] = [
  { id: 'claude-cli', label: 'Claude Code', prefix: 'claude-cli://open?q=', maxPrompt: 5000, cwd: true },
  { id: 'claude-desktop', label: 'Claude Desktop', prefix: 'claude://code/new?q=', maxPrompt: 14000, cwd: false },
  {
    id: 'vscode',
    label: 'VS Code',
    prefix: 'vscode://anthropic.claude-code/open?prompt=',
    maxPrompt: null,
    cwd: false,
  },
  { id: 'cursor', label: 'Cursor', prefix: 'https://cursor.com/link/prompt?text=', maxPrompt: null, cwd: false },
  { id: 'codex', label: 'Codex', prefix: 'codex://new?prompt=', maxPrompt: null, cwd: false },
]

export interface Deeplink {
  id: DeeplinkTarget
  label: string
  url: string
  /** The prompt in this URL was cut; the page must copy the full prompt. */
  clipped: boolean
}

export interface DeeplinkSet {
  /** Full prompt for `Copy prompt` (lists of 10). */
  prompt: string
  links: Deeplink[]
  needsClipboard: boolean
}

/**
 * `App folder (optional)`: an absolute path without `..` segments or control characters, else null.
 */
export function sanitizeCwd(cwd: string | null | undefined): string | null {
  if (!cwd) return null
  const p = cwd.trim()
  if (p.length === 0 || p.length > 500) return null
  if (/[\u0000-\u001F\u007F-\u009F]/.test(p)) return null
  if (!p.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(p)) return null
  if (p.split(/[\\/]/).some((seg) => seg === '..')) return null
  return p
}

function encode(s: string): string {
  return encodeURIComponent(s)
}

function urlFor(t: TargetSpec, prompt: string, cwd: string | null): string {
  const tail = t.cwd && cwd ? `&cwd=${encode(cwd)}` : ''
  return `${t.prefix}${encode(prompt)}${tail}`
}

/** Longest code-point prefix of `prompt` (plus an ellipsis) whose URL fits the budget. */
function clipToBudget(t: TargetSpec, prompt: string, cwd: string | null, budget: number): string {
  const cps = Array.from(prompt)
  let lo = 0
  let hi = cps.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const candidate = `${cps.slice(0, mid).join('')}\u2026`
    if (urlFor(t, candidate, cwd).length <= budget) lo = mid
    else hi = mid - 1
  }
  return `${cps.slice(0, lo).join('').trimEnd()}\u2026`
}

/**
 * Deeplinks for one prompt. `render(maxList)` renders the prompt with lists of at most `maxList` items
 * (see `renderPrompt`); it is called with 10 and, over budget, with 5, 3 and 1.
 */
export function buildDeeplinks(
  render: (maxList: number) => string,
  opts: { cwd?: string | null; budget?: number } = {},
): DeeplinkSet {
  const budget = opts.budget ?? URL_BUDGET
  const cwd = sanitizeCwd(opts.cwd)
  const full = render(10)
  // lists of 5 (spec 8.7), then 3 and 1, so a cut by code points rarely drops the closing safety line
  const shorter = [5, 3, 1].map((n) => render(n))
  let needsClipboard = false
  const links = TARGETS.map((t) => {
    const fits = (p: string) =>
      urlFor(t, p, cwd).length <= budget && (t.maxPrompt === null || Array.from(p).length <= t.maxPrompt)
    if (fits(full)) return { id: t.id, label: t.label, url: urlFor(t, full, cwd), clipped: false }
    needsClipboard = true
    const short = shorter.find(fits)
    if (short) return { id: t.id, label: t.label, url: urlFor(t, short, cwd), clipped: true }
    const cut = clipToBudget(t, shorter.at(-1) as string, cwd, budget)
    return { id: t.id, label: t.label, url: urlFor(t, cut, cwd), clipped: true }
  })
  return { prompt: full, links, needsClipboard }
}
