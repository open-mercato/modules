// Log excerpts for receipts (spec 4.5, 5.3): the first error of a failed step, at most 1200 characters, escaped.
// Logs are untrusted text (module code writes them), so an excerpt keeps printable text only: no ANSI codes, no control
// or bidi characters, long hex runs masked (our generated secrets look like that). It stays plain text: renderers escape
// it (Astro does), so `<` in a TypeScript error keeps reading as `<`.

export const EXCERPT_MAX = 1200
const LINES_AFTER = 12

// Written as RegExp sources so this file has no literal control characters.
const ANSI = new RegExp(
  String.raw`\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]`,
  'g',
)
const DASHES = new RegExp(String.raw`[\u2013\u2014]`, 'g')
const INVISIBLE = new RegExp(String.raw`[\u2028\u2029\u200b-\u200f\u202a-\u202e\u2066-\u2069]`, 'g')
const CONTROL = new RegExp(String.raw`[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u0080-\u009f]`, 'g')

export function stripAnsi(s: string): string {
  return s.replace(ANSI, '')
}

/** Printable text: ANSI, control and bidi characters removed, long dashes as `-`, long hex runs masked. */
export function sanitizeLogText(s: string): string {
  return stripAnsi(s)
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(DASHES, '-')
    .replace(INVISIBLE, '')
    .replace(/\b[a-f0-9]{40,}\b/gi, (m) => `${m.slice(0, 6)}...`)
}

/** Log lines with ANSI codes and carriage returns removed (input of the classifier). */
export function logLines(log: string): string[] {
  return stripAnsi(log).replace(/\r\n?/g, '\n').split('\n')
}

/** Harness bookkeeping lines are not errors of the app or the module. */
export function isHarnessLine(line: string): boolean {
  return line.startsWith('[harness] ') && !line.includes('tampered-files') && !line.includes('timed out')
}

const GENERIC_ERROR = /\b(error|failed|failure|fatal|exception|cannot|unable to|not found|ERR!|YN\d{4})\b/i

/** Index of the first line that matches one of the patterns, else the first generic error line, else the last line. */
export function firstErrorIndex(lines: readonly string[], patterns: readonly RegExp[]): number {
  for (const re of patterns) {
    const i = lines.findIndex((l) => !isHarnessLine(l) && re.test(l))
    if (i >= 0) return i
  }
  const g = lines.findIndex((l) => !isHarnessLine(l) && GENERIC_ERROR.test(l) && !/\b0 errors?\b/i.test(l))
  if (g >= 0) return g
  for (let i = lines.length - 1; i >= 0; i--) if ((lines[i] as string).trim() !== '') return i
  return 0
}

/** The error line and the lines after it, sanitized, cut to EXCERPT_MAX characters. */
export function excerptAt(lines: readonly string[], index: number): string | null {
  const block = lines
    .slice(index, index + 1 + LINES_AFTER)
    .join('\n')
    .trimEnd()
  if (block.trim() === '') return null
  const s = sanitizeLogText(block)
  return s.length <= EXCERPT_MAX ? s : s.slice(0, EXCERPT_MAX)
}
