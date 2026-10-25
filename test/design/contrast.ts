// WCAG 2.x contrast for the colour pairs of spec 7.9, read from site/src/styles/tokens.css (both themes).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const [r, g, b] = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(fg: string, bg: string): number {
  const a = luminance(fg)
  const b = luminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** Token values of the light theme and of the dark theme (light values overridden by the dark block). */
export function readTokens(root: string): { light: Record<string, string>; dark: Record<string, string> } {
  const css = readFileSync(join(root, 'site/src/styles/tokens.css'), 'utf8')
  const block = (start: string): string => {
    const i = css.indexOf(start)
    if (i < 0) throw new Error(`no block ${start}`)
    return css.slice(i, css.indexOf('}', i))
  }
  const vars = (text: string): Record<string, string> =>
    Object.fromEntries(
      [...text.matchAll(/(--[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\b/g)].map((m) => [
        m[1] as string,
        (m[2] as string).toUpperCase(),
      ]),
    )
  const light = vars(block(':root {'))
  const dark = { ...light, ...vars(block(':root[data-theme="dark"]')) }
  const media = { ...light, ...vars(block(':root:not([data-theme="light"])')) }
  if (JSON.stringify(media) !== JSON.stringify(dark)) throw new Error('dark media block and data-theme block differ')
  return { light, dark }
}

export interface Pair {
  name: string
  fg: string
  bg: string
  /** 4.5 for text, 3 for graphic objects (WCAG 1.4.11). */
  min: number
  /** Value printed in spec 7.9, when given. */
  spec?: number
}

/** Pairs of spec 7.9, resolved against the tokens; `t(name)` picks a token of the given theme. */
export function pairs(root: string): Pair[] {
  const { light: L, dark: D } = readTokens(root)
  const t = (theme: Record<string, string>, k: string): string => {
    const v = theme[k]
    if (!v) throw new Error(`missing token ${k}`)
    return v
  }
  return [
    { name: 'ink on bg (light)', fg: t(L, '--ink'), bg: t(L, '--bg'), min: 4.5, spec: 19.56 },
    { name: 'ink-2 on bg (light)', fg: t(L, '--ink-2'), bg: t(L, '--bg'), min: 4.5, spec: 5.17 },
    { name: 'ink-2 on bg-2 (light)', fg: t(L, '--ink-2'), bg: t(L, '--bg-2'), min: 4.5, spec: 4.96 },
    { name: 'ink-3 on bg (light)', fg: t(L, '--ink-3'), bg: t(L, '--bg'), min: 4.5, spec: 4.61 },
    { name: 'film-ink-2 on film', fg: t(L, '--film-ink-2'), bg: t(L, '--film'), min: 4.5, spec: 7.3 },
    { name: 'film-ink-2 on film-2', fg: t(L, '--film-ink-2'), bg: t(L, '--film-2'), min: 4.5, spec: 6.88 },
    { name: 'ok-ink on ok-fill (Verified chip)', fg: t(L, '--ok-ink'), bg: t(L, '--ok-fill'), min: 4.5, spec: 6.86 },
    { name: 'ok-text on bg (light)', fg: t(L, '--ok-text'), bg: t(L, '--bg'), min: 4.5, spec: 9.0 },
    {
      name: 'id-ink on id-fill (community, command chip)',
      fg: t(L, '--id-ink'),
      bg: t(L, '--id-fill'),
      min: 4.5,
      spec: 5.11,
    },
    { name: 'id-ink on bg (light)', fg: t(L, '--id-ink'), bg: t(L, '--bg'), min: 4.5, spec: 6.12 },
    { name: 'violet on film', fg: t(L, '--violet'), bg: t(L, '--film'), min: 4.5, spec: 8.57 },
    { name: 'lime on film', fg: t(L, '--lime'), bg: t(L, '--film'), min: 4.5, spec: 14.91 },
    { name: 'ink on wait-fill (quarantine)', fg: t(L, '--ink'), bg: t(L, '--wait-fill'), min: 4.5, spec: 17.34 },
    { name: 'wait-ink on bg (light)', fg: t(L, '--wait-ink'), bg: t(L, '--bg'), min: 4.5, spec: 6.51 },
    { name: 'bad-ink on bg (light)', fg: t(L, '--bad-ink'), bg: t(L, '--bg'), min: 4.5, spec: 6.54 },
    { name: 'bad-on on bad-fill (glyph only)', fg: t(L, '--bad-on'), bg: t(L, '--bad-fill'), min: 3, spec: 4.08 },
    { name: 'untested outline ink-3 on bg (light)', fg: t(L, '--ink-3'), bg: t(L, '--bg'), min: 3, spec: 4.61 },
    { name: 'untested outline ink-3 on bg (dark)', fg: t(D, '--ink-3'), bg: t(D, '--bg'), min: 3, spec: 5.67 },
    // the receipt pair of 7.9, read from the --paper token (#F4F3EA)
    { name: 'paper-ink on paper', fg: t(L, '--paper-ink'), bg: t(L, '--paper'), min: 4.5, spec: 17.56 },
    { name: 'paper-ink-2 on paper', fg: t(L, '--paper-ink-2'), bg: t(L, '--paper'), min: 4.5, spec: 6.0 },
    { name: 'ink on bg (dark)', fg: t(D, '--ink'), bg: t(D, '--bg'), min: 4.5 },
    { name: 'ink-2 on bg (dark)', fg: t(D, '--ink-2'), bg: t(D, '--bg'), min: 4.5, spec: 7.3 },
    { name: 'ink-2 on bg-2 (dark)', fg: t(D, '--ink-2'), bg: t(D, '--bg-2'), min: 4.5, spec: 6.88 },
    { name: 'ink-3 on bg (dark)', fg: t(D, '--ink-3'), bg: t(D, '--bg'), min: 4.5, spec: 5.67 },
    { name: 'ok-text on bg (dark)', fg: t(D, '--ok-text'), bg: t(D, '--bg'), min: 4.5, spec: 14.91 },
    { name: 'id-ink on bg (dark)', fg: t(D, '--id-ink'), bg: t(D, '--bg'), min: 4.5, spec: 8.57 },
    { name: 'wait-ink on bg (dark)', fg: t(D, '--wait-ink'), bg: t(D, '--bg'), min: 4.5 },
    { name: 'bad-ink on bg (dark)', fg: t(D, '--bad-ink'), bg: t(D, '--bg'), min: 4.5 },
    { name: 'focus ring on bg (light)', fg: t(L, '--focus'), bg: t(L, '--bg'), min: 3 },
    { name: 'focus ring on bg (dark)', fg: t(D, '--focus'), bg: t(D, '--bg'), min: 3 },
    { name: 'command chip dark: lime on bg-3', fg: t(L, '--lime'), bg: t(D, '--bg-3'), min: 4.5 },
    { name: 'third-party chip: ink on yellow', fg: '#0C0C0C', bg: t(L, '--yellow'), min: 4.5 },
    { name: 'enterprise chip: lime on #1B1B1B', fg: t(L, '--lime'), bg: '#1B1B1B', min: 4.5 },
    { name: 'built-in chip: ink-2 on bg-3 (light)', fg: t(L, '--ink-2'), bg: t(L, '--bg-3'), min: 4.5 },
    { name: 'built-in chip: ink-2 on bg-3 (dark)', fg: t(D, '--ink-2'), bg: t(D, '--bg-3'), min: 4.5 },
    // infra-error square: a solid ink-3 edge against the page and a '!' against the plate (graphic objects)
    { name: 'infra-error edge ink-3 on bg (light)', fg: t(L, '--ink-3'), bg: t(L, '--bg'), min: 3 },
    { name: 'infra-error edge ink-3 on bg (dark)', fg: t(D, '--ink-3'), bg: t(D, '--bg'), min: 3 },
    { name: 'infra-error mark on plate (light)', fg: '#434343', bg: '#E7E7E7', min: 3 },
    { name: 'infra-error mark on plate (dark)', fg: '#FAFAFA', bg: '#1B1B1B', min: 3 },
    // banners on dark: no tinted fill, the label in the signal colour on film-2
    { name: 'banner label yellow on film-2 (dark)', fg: t(L, '--yellow'), bg: t(L, '--film-2'), min: 4.5 },
    { name: 'banner label bad-ink on film-2 (dark)', fg: t(D, '--bad-ink'), bg: t(L, '--film-2'), min: 4.5 },
    // plug diagram on light: requires and extends strokes (graphic objects)
    { name: 'requires stroke ok-ink on bg (light)', fg: t(L, '--ok-ink'), bg: t(L, '--bg'), min: 3 },
    { name: 'extends stroke id-ink on bg (light)', fg: t(L, '--id-ink'), bg: t(L, '--bg'), min: 3 },
  ]
}
