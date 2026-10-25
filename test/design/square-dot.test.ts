// The isolation dot beside a square (finding of 25 Oct): another version's red never stands next to a line's square.
import { describe, expect, it } from 'vitest'
import { Square } from '../../site/src/lib/ui.tsx'

/** Classes of every element in a Preact vnode tree. */
function classes(v: unknown): string[] {
  if (!v || typeof v !== 'object') return []
  const props = (v as { props?: { class?: string; children?: unknown } }).props ?? {}
  const kids = props.children
  return [...(props.class ? [props.class] : []), ...(Array.isArray(kids) ? kids.flatMap(classes) : classes(kids))]
}

describe('Square isolation dot', () => {
  it('beside a square of another version the dot is hollow, never the red of that version', () => {
    const c = classes(Square({ status: 'untested', other: true, iso: 'broken' }))
    expect(c).toContain('sq-iso sq-iso--other')
    expect(c).not.toContain('sq-iso sq-iso--broken')
  })
  it('beside a verdict of the line the dot keeps its state, and a broken dot on a green square is quiet', () => {
    expect(classes(Square({ status: 'broken', iso: 'broken' }))).toContain('sq-iso sq-iso--broken')
    expect(classes(Square({ status: 'verified', iso: 'broken' }))).toContain('sq-iso sq-iso--quiet')
    expect(classes(Square({ status: 'untested', other: true, iso: null }))).not.toContain('sq-iso sq-iso--other')
  })
})
