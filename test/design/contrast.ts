// WCAG 2.x contrast for the colour pairs of spec 7.9, read from site/src/styles/tokens.css (light only, like
// openmercato.com since the move of 13 Nov; the film keeps its own dark pairs).
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

/** Token values of the page (there is one theme; tokens.css has a single :root block). */
export function readTokens(root: string): Record<string, string> {
  const css = readFileSync(join(root, 'site/src/styles/tokens.css'), 'utf8')
  if (/prefers-color-scheme|data-theme/.test(css)) throw new Error('tokens.css has a dark theme again')
  const i = css.indexOf(':root {')
  if (i < 0) throw new Error('no :root block')
  return Object.fromEntries(
    [...css.slice(i, css.indexOf('}', i)).matchAll(/(--[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\b/g)].map((m) => [
      m[1] as string,
      (m[2] as string).toUpperCase(),
    ]),
  )
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

/** Pairs of spec 7.9, resolved against the tokens; `t(L, name)` picks a token of the page. */
export function pairs(root: string): Pair[] {
  const L = readTokens(root)
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
    // film-2 is #1B1B1B, the dark surface of the main site, since the navbar of 14 Nov (was #141414, 6.88)
    { name: 'film-ink-2 on film-2', fg: t(L, '--film-ink-2'), bg: t(L, '--film-2'), min: 4.5, spec: 6.43 },
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
    // the receipt pair of 7.9, read from the --paper token (#F4F3EA)
    { name: 'paper-ink on paper', fg: t(L, '--paper-ink'), bg: t(L, '--paper'), min: 4.5, spec: 17.56 },
    { name: 'paper-ink-2 on paper', fg: t(L, '--paper-ink-2'), bg: t(L, '--paper'), min: 4.5, spec: 6.0 },
    { name: 'focus ring on bg (light)', fg: t(L, '--focus'), bg: t(L, '--bg'), min: 3 },
    { name: 'command chip on film: lime on #1B1B1B', fg: t(L, '--lime'), bg: '#1B1B1B', min: 4.5 },
    // the film's own overrides (base.css .band--film): ink-3 #8A8A8A and the ok, id, wait, bad inks on the film
    { name: 'ink-3 on film', fg: '#8A8A8A', bg: t(L, '--film'), min: 4.5, spec: 5.67 },
    { name: 'wait-ink on film', fg: t(L, '--yellow'), bg: t(L, '--film'), min: 4.5 },
    { name: 'bad-ink on film', fg: '#FF6B6B', bg: t(L, '--film'), min: 4.5 },
    { name: 'third-party chip: ink on yellow', fg: '#0C0C0C', bg: t(L, '--yellow'), min: 4.5 },
    { name: 'enterprise chip: lime on #1B1B1B', fg: t(L, '--lime'), bg: '#1B1B1B', min: 4.5 },
    { name: 'built-in chip: ink-2 on bg-3 (light)', fg: t(L, '--ink-2'), bg: t(L, '--bg-3'), min: 4.5 },
    // infra-error square: a solid ink-3 edge against the page and a '!' against the plate (graphic objects)
    { name: 'infra-error edge ink-3 on bg (light)', fg: t(L, '--ink-3'), bg: t(L, '--bg'), min: 3 },
    { name: 'infra-error mark on plate (light)', fg: '#434343', bg: '#E7E7E7', min: 3 },
    { name: 'infra-error mark on plate (film)', fg: '#FAFAFA', bg: '#1B1B1B', min: 3 },
    // plug diagram on light: requires and extends strokes (graphic objects)
    { name: 'requires stroke ok-ink on bg (light)', fg: t(L, '--ok-ink'), bg: t(L, '--bg'), min: 3 },
    { name: 'extends stroke id-ink on bg (light)', fg: t(L, '--id-ink'), bg: t(L, '--bg'), min: 3 },
    // the Install button of the module page: the dark tertiary button of the main site since the navbar of 14 Nov
    { name: 'Install button cta-ink on cta', fg: t(L, '--cta-ink'), bg: t(L, '--cta'), min: 4.5 },
    // the look of the main site (13 Nov): the dark primary button, its hover, the dark footer, the yellow mark
    { name: 'primary button cta-ink on cta', fg: t(L, '--cta-ink'), bg: t(L, '--cta'), min: 4.5 },
    { name: 'primary button hover cta-ink on cta-hover', fg: t(L, '--cta-ink'), bg: t(L, '--cta-hover'), min: 4.5 },
    { name: 'footer foot-ink on foot', fg: t(L, '--foot-ink'), bg: t(L, '--foot'), min: 4.5 },
    { name: 'footer foot-ink-2 on foot', fg: t(L, '--foot-ink-2'), bg: t(L, '--foot'), min: 4.5 },
    { name: 'heading ink on mark', fg: t(L, '--ink'), bg: t(L, '--mark'), min: 4.5 },
    { name: 'primary button on the film: film on cta-dark', fg: t(L, '--film'), bg: t(L, '--cta-dark'), min: 4.5 },
    { name: 'its hover: film on cta-dark-hover', fg: t(L, '--film'), bg: t(L, '--cta-dark-hover'), min: 4.5 },
  ]
}
