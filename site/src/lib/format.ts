// Formatting of dates, durations and counts for the site. Always UTC, English month abbreviations.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function toDate(v: string | Date): Date {
  if (v instanceof Date) return v
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00Z` : v)
}

/** `24 Oct` (dates in sentences). */
export function day(v: string | Date): string {
  const d = toDate(v)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/**
 * A day and its month never part at a line end (review r8: `since 23` / `Oct.` in the install box and the phone strip):
 * a no-break space between them, in the HTML only. JSON, the cards and the agent policy keep the plain space.
 */
export function nbspDates(text: string): string {
  return text.replace(/\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, '$1\u00A0$2')
}

/** `24 Oct 2026`. */
export function dayYear(v: string | Date): string {
  const d = toDate(v)
  return `${day(d)} ${d.getUTCFullYear()}`
}

/** `03:41 UTC`. */
export function timeUtc(v: string | Date): string {
  const d = toDate(v)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`
}

/** `24 Oct 03:41 UTC` (prose). */
export function dayTime(v: string | Date): string {
  return `${day(v)} ${timeUtc(v)}`
}

/** `24 OCT 03:41 UTC` (DataStamp, mono uppercase). */
export function stamp(v: string | Date): string {
  return `${day(v)} ${timeUtc(v)}`.toUpperCase()
}

/** `2027-10` from an IsoDate (OM Quality seal). */
export const yearMonth = (v: string): string => v.slice(0, 7)

/** `7m24s`, `58s`. */
export function duration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return '?'
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? `${m}m${String(s).padStart(2, '0')}s` : `${m}m`
}

/** `1,234`. */
export function count(n: number): string {
  return n.toLocaleString('en-US')
}

/** `3 tables` / `1 table`. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${count(n)} ${n === 1 ? one : many}`
}

/** Hours between two instants. */
export function hoursBetween(a: string | Date, b: string | Date): number {
  return (toDate(b).getTime() - toDate(a).getTime()) / 3_600_000
}

/** Short integrity for display: `sha512-9fA3…c1`. */
export function shortIntegrity(integrity: string | null): string {
  if (!integrity) return 'unknown'
  const [algo, hash = ''] = integrity.split('-', 2)
  return hash.length > 10 ? `${algo}-${hash.slice(0, 6)}…${hash.slice(-4)}` : integrity
}

/** Short exact version of a `next` snapshot: `0.10.1-develop.7583.1.0c886d0a14` -> `0.10.1-develop.7583`. */
export function shortVersion(v: string): string {
  const m = /^(\d+\.\d+\.\d+-[a-z]+\.\d+)/.exec(v)
  return m ? (m[1] as string) : v
}
