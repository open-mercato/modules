// Text rules shared by the descriptor schema, the validator, the emitter and check-text.
// Isomorphic: no Node APIs (lib/core runs in Node, the browser and the MCP Worker).

const EM_DASH = String.fromCharCode(0x2014)
const EN_DASH = String.fromCharCode(0x2013)

// C0 controls except tab, LF and CR, plus DEL and C1 controls.
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/

/** Characters banned in every human-facing text of the repo (CI check `om check-text`). */
export const BANNED_CHARS: readonly { char: string; name: string }[] = [
  { char: EM_DASH, name: 'U+2014 EM DASH' },
  { char: EN_DASH, name: 'U+2013 EN DASH' },
]

const PLAIN_TEXT_RULES: readonly { re: RegExp; reason: string }[] = [
  { re: /https?:\/\//i, reason: 'URL' },
  { re: /www\./i, reason: 'URL' },
  { re: /[[\]]/, reason: 'markdown link' },
  { re: /`/, reason: 'backtick' },
  { re: /[<>]/, reason: 'HTML' },
  { re: /(^|\s)\*/, reason: 'markdown emphasis' },
  { re: /^\s*#/, reason: 'markdown heading' },
  { re: CONTROL_RE, reason: 'control character' },
  { re: /[\n\r\t]/, reason: 'control character' },
  { re: /[\u2013\u2014]/, reason: 'long dash' },
]

/** First reason why `s` is not plain text, or null when it is. */
export function plainTextViolation(s: string): string | null {
  for (const rule of PLAIN_TEXT_RULES) if (rule.re.test(s)) return rule.reason
  return null
}

/** Plain text: no URLs, markdown, HTML, backticks, control characters or long dashes. */
export function isPlainText(s: string): boolean {
  return plainTextViolation(s) === null
}

/** Names of the catalog MCP tools (tools@1). A text that names them is suspicious. */
export const TOOL_NAMES = ['search_modules', 'get_module', 'check_compat', 'plan_install', 'get_changes'] as const

const INJECTION_RULES: readonly { re: RegExp; flag: string }[] = [
  { re: /ignore\s+(all|previous)/i, flag: 'ignore-instructions' },
  { re: /system\s+prompt/i, flag: 'system-prompt' },
  { re: /\byou\s+are\b/i, flag: 'you-are' },
  { re: /assistant\s*:/i, flag: 'assistant-turn' },
  { re: /run\s+the\s+following/i, flag: 'run-the-following' },
  { re: /curl .*\|\s*(ba)?sh/i, flag: 'curl-pipe-shell' },
  { re: new RegExp(`\\b(${TOOL_NAMES.join('|')})\\b`, 'i'), flag: 'tool-name' },
  { re: /[A-Za-z0-9+/]{41,}={0,2}/, flag: 'base64' },
]

/**
 * Phrase heuristics for prompt injection in author text. Hits are flags for a human
 * in the PR summary, never a validation error.
 */
export function injectionFlags(s: string): string[] {
  const out: string[] = []
  for (const rule of INJECTION_RULES) if (rule.re.test(s) && !out.includes(rule.flag)) out.push(rule.flag)
  return out
}

export interface BannedCharHit {
  line: number
  column: number
  name: string
}

/** Long dashes and control characters in a text file, with 1-based line and column. */
export function findBannedChars(text: string): BannedCharHit[] {
  const hits: BannedCharHit[] = []
  const lines = text.split('\n')
  lines.forEach((raw, i) => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    for (let c = 0; c < line.length; c++) {
      const ch = line[c] as string
      const banned = BANNED_CHARS.find((b) => b.char === ch)
      if (banned) hits.push({ line: i + 1, column: c + 1, name: banned.name })
      else if (ch !== '\t' && CONTROL_RE.test(ch))
        hits.push({
          line: i + 1,
          column: c + 1,
          name: `control U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
        })
    }
  })
  return hits
}

/**
 * A text cut to at most `max` characters at a word boundary, with an ellipsis (review of 24 Oct: `check_compat` notes
 * ended mid-word, `...does not enable the workflows`, and policy reasons with a period in the middle of a word).
 * Unchanged when it fits.
 */
export function clipText(s: string, max: number): string {
  if (s.length <= max) return s
  const room = s.slice(0, max - 1)
  const cut = room.lastIndexOf(' ')
  const head = (cut > max / 2 ? room.slice(0, cut) : room).replace(/[\s,;:.(]+$/, '')
  return `${head}\u2026`
}
