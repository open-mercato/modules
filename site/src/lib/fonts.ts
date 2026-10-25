// @font-face rules for the three self-hosted Geist files (spec 7.3, D44), with the base path applied.
//
// The files are subsets of the woff2 in `geist` 1.7.2 (spec 7.11: 43 KB for the three instead of 142 KB, the first
// paint of a slow phone waits for all three): Latin with Latin Extended-A, punctuation, arrows, math, the box and
// shape characters the pages draw, the default OpenType features plus tnum, no hinting. Glyph names stay: without
// them (post table format 3) Chromium on macOS antialiases small text differently at 1x. Made with fontTools 4.67:
//   pyftsubset node_modules/geist/dist/fonts/<dir>/<file>.woff2 --flavor=woff2 --no-hinting --glyph-names \
//     --layout-features+=tnum --name-IDs='*' --unicodes="U+0000-017F,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,\
//     U+2122,U+2190-21FF,U+2200-22FF,U+2500,U+2502,U+250C,U+2510,U+2514,U+2518,U+251C,U+2524,U+252C,U+2534,\
//     U+253C,U+25A0,U+25A1,U+25B2,U+25B6,U+25BC,U+25C0,U+25CB,U+25CF,U+2713,U+2717,U+27A4,U+FEFF,U+FFFD"
// A character outside the subset falls back to the next font of the stack for that glyph only.
import { href } from './url.ts'

export const FONT_FILES = {
  regular: '/fonts/Geist-Regular.woff2',
  medium: '/fonts/Geist-Medium.woff2',
  mono: '/fonts/GeistMono-Regular.woff2',
} as const

export function fontFaceCss(): string {
  const face = (family: string, weight: number, file: string): string =>
    `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url("${href(file)}") format("woff2")}`
  return [
    face('Geist', 400, FONT_FILES.regular),
    face('Geist', 500, FONT_FILES.medium),
    face('Geist Mono', 400, FONT_FILES.mono),
  ].join('')
}
