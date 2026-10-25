// JSON-LD inside `<script type="application/ld+json">` (finding of 25 Oct): JSON.stringify leaves `</script>` and
// `<!--` as they are, so a value from the registry (a license string, a name) could close the script and open an
// executable one. `<`, `>` and `&` become \u escapes, which JSON.parse reads back to the same value; U+2028 and
// U+2029 are escaped for older parsers that treat them as line ends. Isomorphic.

// U+2028 and U+2029 built from their code points, so this file holds no invisible line separators
const UNSAFE = new RegExp(`[<>&${String.fromCharCode(0x2028, 0x2029)}]`, 'g')

/** Script-safe JSON text of `value`: no `<`, `>`, `&`, U+2028 or U+2029 survive literally. */
export function jsonLdText(value: unknown): string {
  return JSON.stringify(value).replace(UNSAFE, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
}
