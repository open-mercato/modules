// The Grant step of an install plan as the page prints it (round 16): `plan.then` lists ten permissions and counts the
// rest (`a, b, ..., x and 4 more, see the card`, for an agent that reads the card next), so the page counts and lists
// them from the plan's full list (`adds.aclFeatures`, `emptyPreset.aclFeatures`), never from that text: freighttech
// shipment-tracking read `11 permissions` for its 14, and `see the card` stood as a permission ID on the card itself.
import { commonSegmentPrefix } from './wrap.ts'

/** The Grant step of `plan.then` (lib/core/plan.ts), with its list after the colon. */
export const GRANT_RE = /^Grant (?:these|the new) permissions to roles the user names:?\s*(.*)$/

/** IDs shown before `+N more` (the anatomy's limit is 5 per section; the plan's text lists 10). */
export const GRANT_SHOWN = 10

export interface GrantRow {
  /** `14 permissions to roles the user names`. */
  label: string
  /** The shared module prefix, printed once (`shipment_tracking.`); '' for none. */
  prefix: string
  /** The IDs shown, without the prefix. */
  shown: string[]
  /** The IDs behind `+N more`, without the prefix (opened in place). */
  rest: string[]
  /** Permissions the page counts but cannot name (an old plan without the full list): `+N more`, not expandable. */
  unnamed: number
}

/**
 * The Grant step as the page prints it, or null for any other step. `features` is the plan's full list; without it
 * the text's own list is read, and its `and N more, see the card` tail becomes a count.
 */
export function grantRow(step: string, features?: readonly string[] | null, max = GRANT_SHOWN): GrantRow | null {
  const m = GRANT_RE.exec(step)
  if (!m) return null
  let ids: string[]
  let unnamed = 0
  if (features && features.length > 0) ids = [...new Set(features)]
  else {
    let list = (m[1] ?? '').trim()
    const tail = /^(.*?)\s+and (\d+) more(?:, see the card)?\.?$/.exec(list)
    if (tail) {
      list = tail[1] as string
      unnamed = Number(tail[2])
    }
    ids = list
      .replace(/\.$/, '')
      .split(/,\s*/)
      .map((x) => x.trim())
      .filter(Boolean)
  }
  const count = ids.length + unnamed
  const prefix = commonSegmentPrefix(ids, 4)
  const cut = (id: string) => id.slice(prefix.length)
  return {
    label: count
      ? `${count} permission${count === 1 ? '' : 's'} to roles the user names`
      : 'the new permissions to roles the user names',
    prefix,
    shown: ids.slice(0, max).map(cut),
    rest: ids.slice(max).map(cut),
    unnamed,
  }
}
