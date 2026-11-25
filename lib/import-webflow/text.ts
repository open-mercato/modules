// Text rules of the importer (spec API Contracts, "Links", "Text", "Dates"): long dashes (A5), count tokens (A6),
// site links, dates in UTC and media file names. Pure functions; the run counts what they changed.

const EM_DASH = '—'
const EN_DASH = '–'
const DASH_RE = /[–—]/g
/** C0 controls but tab, LF and CR; DEL; C1 controls; zero-width characters Webflow leaves in empty paragraphs. */
const INVISIBLE_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‍﻿]/g

/** What the text rules changed in one item, for the run report. */
export interface TextTally {
  dashes: number
  invisible: number
  tokens: { token: string; from: string }[]
}

export function emptyTally(): TextTally {
  return { dashes: 0, invisible: 0, tokens: [] }
}

/** A5: U+2014 and U+2013 become `-`, as lib/core/main-site.ts does for the navbar copy; invisible characters go. */
export function replaceDashes(value: string, tally?: TextTally): string {
  let out = value
  if (out.includes(EM_DASH) || out.includes(EN_DASH)) {
    out = out.replace(DASH_RE, () => {
      if (tally) tally.dashes++
      return '-'
    })
  }
  return out.replace(INVISIBLE_RE, () => {
    if (tally) tally.invisible++
    return ''
  })
}

/** The count tokens copy may hold (A6); the build fills them from data and never prints a typed number. */
export const COUNT_TOKENS = ['{githubStars}', '{moduleCount}'] as const

/**
 * Hand-typed counts that become tokens (A6): star counts of the GitHub repository and plugin or module counts. Only
 * landing and page copy is tokenized; a dated blog post keeps the number it was written with.
 */
const TOKEN_RULES: readonly { re: RegExp; token: (typeof COUNT_TOKENS)[number] }[] = [
  // a star count: "1,928 stars on GitHub", "1914 GitHub stars"
  { re: /(?<![\d,.])(?:\d{1,3}(?:,\d{3})+|\d+)\+?(?= (?:stars on GitHub|GitHub stars)\b)/g, token: '{githubStars}' },
  // a catalog count is written with a plus ("50+ plugins"); "install 2 modules" is not a count of the catalog
  { re: /(?<![\d,.])(?:\d{1,3}(?:,\d{3})+|\d+)\+(?= (?:plugins|modules)\b)/g, token: '{moduleCount}' },
]

export function replaceCounts(value: string, tally?: TextTally): string {
  let out = value
  for (const rule of TOKEN_RULES) {
    out = out.replace(rule.re, (from) => {
      if (tally) tally.tokens.push({ token: rule.token, from })
      return rule.token
    })
  }
  return out
}

/** Link targets the site writes: http(s), mailto, tel, a path or an anchor; anything else (`javascript:`) is refused. */
export function isSafeHref(href: string): boolean {
  const h = href.trim()
  if (h.startsWith('//')) return true
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(h)?.[1]?.toLowerCase()
  return scheme === undefined || ['http', 'https', 'mailto', 'tel'].includes(scheme)
}

/** Hosts of the main site: a link to them becomes a site path. */
const SITE_HOSTS = new Set(['www.openmercato.com', 'openmercato.com'])

export interface LinkContext {
  /** `/docs/<slug>` to its docs.openmercato.com target (the docs map). */
  docs: ReadonlyMap<string, string>
  /** Called for a link the run reports (a `*.webflow.io` address). */
  report?: (href: string, why: string) => void
}

/**
 * Spec "Links": `https://www.openmercato.com/<path>` becomes `/<path>`, `/docs/<slug>` the docs map target, and a link
 * to `*.webflow.io` is reported (and kept).
 */
export function rewriteLink(href: string, ctx: LinkContext): string {
  const raw = href.trim()
  let url: URL
  try {
    url = new URL(raw, 'https://www.openmercato.com')
  } catch {
    return raw
  }
  const isSite = SITE_HOSTS.has(url.host) && (url.protocol === 'https:' || url.protocol === 'http:')
  if (url.host.endsWith('.webflow.io')) ctx.report?.(raw, 'a link to webflow.io')
  if (!isSite) return raw
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const m = /^\/docs\/([^/]+)$/.exec(path)
  if (m) {
    const target = ctx.docs.get(`/docs/${m[1]}`)
    if (target) return target + url.hash
  }
  if (path === '/docs' || path === '/documentation' || path.startsWith('/docs/')) return `https://docs.openmercato.com/`
  // a relative link stays as written (it already is a path); an absolute one loses its origin
  const isRelative = !/^[a-z][a-z0-9+.-]*:/i.test(raw) && !raw.startsWith('//')
  if (isRelative && !raw.startsWith('/')) return raw
  return `${path}${url.search}${url.hash}`
}

/** ISO 8601 in UTC, as the schema's UtcDate takes it, or undefined for an empty or invalid value. */
export function isoUtc(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

const DAY_MS = 24 * 60 * 60 * 1000

/** `updated` is set only when the last publication is more than one day after `date`. */
export function updatedAfter(date: string, lastPublished: string | null | undefined): string | undefined {
  const last = isoUtc(lastPublished)
  if (!last) return undefined
  return new Date(last).getTime() - new Date(date).getTime() > DAY_MS ? last : undefined
}

/** The day of a date written in prose (`12 November 2026`, `12 listopada 2026`) in a locale, as `YYYY-MM-DD`. */
export function parseProseDate(text: string, locale: 'en' | 'pl'): string | undefined {
  const months = monthNames(locale)
  const m = /(\d{1,2}) (\p{L}+) (\d{4})/u.exec(text)
  if (!m) return undefined
  const month = months.indexOf(m[2]!.toLowerCase())
  if (month < 0) return undefined
  const day = Number(m[1])
  const iso = `${m[3]}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : undefined
}

/** A day (`YYYY-MM-DD`) written as prose in a locale, the inverse of parseProseDate. */
export function formatProseDate(day: string, locale: 'en' | 'pl'): string {
  return proseFormat(locale).format(new Date(`${day}T00:00:00Z`))
}

function proseFormat(locale: 'en' | 'pl'): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'pl', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function monthNames(locale: 'en' | 'pl'): string[] {
  const f = proseFormat(locale)
  return Array.from({ length: 12 }, (_, m) => {
    const part = f.formatToParts(new Date(Date.UTC(2026, m, 12))).find((p) => p.type === 'month')
    return (part?.value ?? '').toLowerCase()
  })
}

/** Webflow file id and file name of a CDN address (`…/<siteId>/<fileId>_<name>`), or undefined. */
export function cdnFile(url: string): { fileId: string; name: string } | undefined {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return undefined
  }
  if (!isWebflowCdn(u)) return undefined
  let last: string
  try {
    last = decodeURIComponent(u.pathname.split('/').pop() ?? '')
  } catch {
    // a malformed percent escape: keep the name as written
    last = u.pathname.split('/').pop() ?? ''
  }
  const m = /^([0-9a-f]{24})_(.+)$/.exec(last)
  return m ? { fileId: m[1]!, name: m[2]! } : undefined
}

/** Hosts where Webflow serves site and CMS files. */
export function isWebflowCdn(u: URL): boolean {
  return (
    u.host === 'cdn.prod.website-files.com' ||
    u.host === 'assets.website-files.com' ||
    u.host === 'uploads-ssl.webflow.com' ||
    (u.host === 's3.amazonaws.com' && u.pathname.startsWith('/webflow-prod-assets/'))
  )
}

/** `<fileId>-<name>.<ext>`: the name lowercased, anything but `[a-z0-9.-]` to `-` (spec "Media"). */
export function mediaFileName(fileId: string, name: string): string {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${fileId}-${clean || 'file'}`
}
