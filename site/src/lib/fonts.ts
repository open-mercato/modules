// @font-face rules for the three self-hosted Geist files (spec 7.3, D44), with the base path applied.
//
// The files are subsets of the three woff2 that www.openmercato.com serves (Geist 1.401, from the Webflow CDN, 14 Nov),
// so a word in the navbar is as wide here as there: the newer files of `geist` 1.7.2 without hinting drew 14 px
// Medium about 5 % wider in Chromium on Linux ("Developers" 80 px against 76). Spec 7.11: 49 KB for the three instead
// of 89 KB, the first paint of a slow phone waits for all three. Kept: Latin with Latin Extended-A, punctuation,
// arrows, math, the box and shape characters the pages draw, the default OpenType features plus tnum, the hinting
// (its prep table, which keeps the advances of the main site) and the glyph names (without them, post table format
// 3, Chromium on macOS antialiases small text differently at 1x). Made with fontTools 4.67:
//   pyftsubset <file>.woff2 --flavor=woff2 --glyph-names --layout-features+=tnum --name-IDs='*' \
//     --unicodes="U+0000-017F,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,\
//     U+2122,U+2190-21FF,U+2200-22FF,U+2500,U+2502,U+250C,U+2510,U+2514,U+2518,U+251C,U+2524,U+252C,U+2534,\
//     U+253C,U+25A0,U+25A1,U+25B2,U+25B6,U+25BC,U+25C0,U+25CB,U+25CF,U+2713,U+2717,U+27A4,U+FEFF,U+FFFD"
// Geist 1.401 has no U+2028, U+2029 and U+2236, and its Mono no corner and cross box characters (U+2510 and up);
// none of them is in the pages' code. A character outside the subset falls back to the next font of the stack for
// that glyph only.
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
