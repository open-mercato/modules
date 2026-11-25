// The partner filter of /certified-partners (spec, UI/UX, Partner filter; replaces Finsweet fs-list). Seven facets:
// any selected value within a facet matches, every facet with a selection must match. The state lives in the query
// string (`?tier=agency&industry=finance&industry=retail`), so a filtered view can be shared and Back works. The data
// is the partner list, inlined into the page as JSON at build (the island's props). The server renders every published
// partner and no controls, so the page is complete without JavaScript; once hydrated the controls appear, the query
// string selects, and the number of partners shown is announced in a polite live region.
import { useEffect, useState } from 'preact/hooks'
import PartnerCard from '../components/partners/PartnerCard.tsx'
import {
  emptySelection,
  FACET_LABELS,
  FACETS,
  matchesSelection,
  readSelection,
  selectedCount,
  toggleValue,
  writeSelection,
  type Facet,
  type FacetOption,
  type FacetOptions,
  type PartnerCardData,
  type Selection,
} from '../lib/partner-filter.ts'

interface Props {
  partners: PartnerCardData[]
  options: Record<Facet, FacetOption[]>
}

/** The sentence of the live region. */
export function partnersShownText(shown: number, total: number): string {
  if (shown === total) return `Showing all ${total} partners.`
  return `Showing ${shown} of ${total} partners.`
}

export default function PartnerFilter({ partners, options }: Props) {
  const known = Object.fromEntries(FACETS.map((f) => [f, options[f].map((o) => o.value)])) as unknown as FacetOptions
  const [selected, setSelected] = useState<Selection>(emptySelection())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const read = (): void => setSelected(readSelection(window.location.search, known))
    read()
    setReady(true)
    window.addEventListener('popstate', read)
    return () => window.removeEventListener('popstate', read)
  }, [])

  const choose = (next: Selection): void => {
    setSelected(next)
    const { pathname, search, hash } = window.location
    const query = writeSelection(search, next)
    if (query !== search) window.history.pushState(null, '', `${pathname}${query}${hash}`)
  }

  const shown = partners.filter((p) => matchesSelection(p.values, selected))
  const facets = FACETS.filter((f) => options[f].length > 0)
  return (
    <div class="partner-filter">
      <div class="partner-filter__controls" hidden={!ready}>
        {facets.map((f) => (
          <fieldset key={f} class="partner-filter__facet">
            <legend class="partner-filter__legend">{FACET_LABELS[f]}</legend>
            {options[f].map((o) => (
              <label key={o.value} class="partner-filter__option">
                <input
                  type="checkbox"
                  name={f}
                  value={o.value}
                  checked={selected[f].includes(o.value)}
                  onChange={() => choose(toggleValue(selected, f, o.value, known))}
                />{' '}
                {o.label} <span class="partner-filter__n">({o.count})</span>
              </label>
            ))}
          </fieldset>
        ))}
        <button
          type="button"
          class="btn btn--sm btn--secondary"
          disabled={selectedCount(selected) === 0}
          onClick={() => choose(emptySelection())}
        >
          Clear filters
        </button>
      </div>
      <div class="partner-filter__results">
        <p class="category-filter__count t-small t-muted" role="status" aria-live="polite">
          {partnersShownText(shown.length, partners.length)}
        </p>
        <ul class="post-grid">
          {shown.map((p) => (
            <li key={p.slug}>
              <PartnerCard partner={p} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
