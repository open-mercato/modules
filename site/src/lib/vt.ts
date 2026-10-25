// View-transition names (spec 7.3): the sigil and the title fly from a list row to the module header.
import { sha256Hex } from '../../../lib/sigil/sha256.ts'

export function transitionNames(locator: string): { sigil: string; title: string } {
  const h = sha256Hex(locator).slice(0, 8)
  return { sigil: `sig-${h}`, title: `ttl-${h}` }
}
