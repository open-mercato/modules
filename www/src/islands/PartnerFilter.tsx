// The partner filter of /certified-partners (spec, UI/UX, Partner filter; replaces Finsweet fs-list), in the live
// Webflow markup (`agencies_component`: the filter column, the tags of the selected values, the cards). Seven facets:
// any selected value within a facet matches, every facet with a selection must match. The state lives in the query
// string (`?tier=agency&industry=finance&industry=retail`), so a filtered view can be shared and Back works. The data
// is the partner list, inlined into the page as JSON at build (the island's props). The server renders every published
// partner and no controls, so the page is complete without JavaScript; once hydrated the controls appear, the query
// string selects, and the number of partners shown is announced in a polite live region.
import { useEffect, useRef, useState } from 'preact/hooks'
import PartnerCard from '../components/partners/PartnerCard.tsx'
import {
  emptySelection,
  FACETS,
  FILTER_HEADINGS,
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
import { CLOSE_ICON } from '../lib/webflow-icons.ts'

interface Props {
  partners: PartnerCardData[]
  options: Record<Facet, FacetOption[]>
}

/** The sentence of the live region. */
export function partnersShownText(shown: number, total: number): string {
  if (shown === total) return `Showing all ${total} partners.`
  return `Showing ${shown} of ${total} partners.`
}

/** How the live page offers each facet: a radio look, checkboxes, or a select. */
const LOOK: Record<Facet, 'radio' | 'checkbox' | 'select'> = {
  tier: 'radio',
  industry: 'checkbox',
  location: 'select',
  language: 'select',
  service: 'checkbox',
  budget: 'radio',
  availability: 'radio',
}
const PROMPT: Partial<Record<Facet, string>> = { location: 'Select a country', language: 'Select a language' }

/** Webflow's custom input: the visible box is a div, the real input sits under it, still focusable. */
const HIDDEN_INPUT = { opacity: 0, position: 'absolute', zIndex: -1 } as const

export default function PartnerFilter({ partners, options }: Props) {
  const known = Object.fromEntries(FACETS.map((f) => [f, options[f].map((o) => o.value)])) as unknown as FacetOptions
  const [selected, setSelected] = useState<Selection>(emptySelection())
  const [ready, setReady] = useState(false)
  const controls = useRef<HTMLFormElement>(null)

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
  const only = (f: Facet, values: string[]): Selection => ({ ...selected, [f]: values })

  const shown = partners.filter((p) => matchesSelection(p.values, selected))
  const facets = FACETS.filter((f) => options[f].length > 0)
  const tags = facets.flatMap((f) =>
    selected[f].map((v) => ({ f, v, label: options[f].find((o) => o.value === v)?.label ?? v })),
  )

  const option = (f: Facet, o: FacetOption) => {
    const on = selected[f].includes(o.value)
    const input = (
      <input
        type="checkbox"
        name={f}
        value={o.value}
        checked={on}
        style={HIDDEN_INPUT}
        onChange={() => choose(toggleValue(selected, f, o.value, known))}
      />
    )
    if (LOOK[f] === 'checkbox')
      return (
        <div class="agencies_filter-collection-item" key={o.value}>
          <label class="w-checkbox agencies-checkbox_field">
            <div
              class={`w-checkbox-input w-checkbox-input--inputType-custom agencies-checkbox_input${on ? ' w--redirected-checked' : ''}`}
            ></div>
            {input}
            <span class="agencies-checkbox_label w-form-label">{o.label}</span>
          </label>
        </div>
      )
    return (
      <label class="agencies_radio-field w-radio" key={o.value}>
        <div
          class={`w-form-formradioinput w-form-formradioinput--inputType-custom agency_radio-button w-radio-input${on ? ' w--redirected-checked' : ''}`}
        ></div>
        {input}
        {f === 'tier' ? (
          <span class="agency_label is-radio w-form-label" style={o.style}>
            {o.label}
          </span>
        ) : (
          <span class="w-form-label">{o.label}</span>
        )}
      </label>
    )
  }

  return (
    <div class="agencies_component">
      <div class="agencies_filters-column" hidden={!ready}>
        <div class="agencies_filters-form-block">
          <form
            class="agencies_filters-form"
            ref={controls}
            aria-label="Filter partners"
            onSubmit={(e) => e.preventDefault()}
          >
            {facets.map((f) => (
              <div key={f} class="agencies_filter-block" role="group" aria-labelledby={`partner-filter-${f}`}>
                <div class="agencies_filter-header">
                  <div class="text-style-tagline is-big" id={`partner-filter-${f}`}>
                    {FILTER_HEADINGS[f]}
                  </div>
                  <button
                    type="button"
                    class="agencies_filter-clear"
                    disabled={selected[f].length === 0}
                    onClick={() => choose(only(f, []))}
                  >
                    Clear<span class="sr-only"> {FILTER_HEADINGS[f]}</span>
                  </button>
                </div>
                {LOOK[f] === 'select' ? (
                  <select
                    class="form_input is-select-input w-select"
                    name={f}
                    aria-label={FILTER_HEADINGS[f]}
                    onChange={(e) => {
                      const v = (e.target as HTMLSelectElement).value
                      choose(only(f, v === '' ? [] : [v]))
                    }}
                  >
                    <option value="" selected={selected[f].length === 0}>
                      {PROMPT[f]}
                    </option>
                    {options[f].map((o) => (
                      <option key={o.value} value={o.value} selected={selected[f][0] === o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div class="agencies_filter-list">
                    {LOOK[f] === 'checkbox' ? (
                      <div class="agencies_filter-collection-list">{options[f].map((o) => option(f, o))}</div>
                    ) : (
                      options[f].map((o) => option(f, o))
                    )}
                  </div>
                )}
              </div>
            ))}
          </form>
        </div>
      </div>
      <div class="agencies_list">
        <p class="sr-only" role="status" aria-live="polite">
          {partnersShownText(shown.length, partners.length)}
        </p>
        {tags.length > 0 && (
          <div class="agencies_list-tags-wrapper">
            {tags.map((t) => (
              <div class="agencies_list-tag" key={`${t.f}=${t.v}`}>
                <div class="agencies_list-content">
                  <div>{t.label}</div>
                </div>
                <button
                  type="button"
                  class="agencies_list-close"
                  aria-label={`Remove ${t.label}`}
                  onClick={() => choose(toggleValue(selected, t.f, t.v, known))}
                >
                  <span
                    class="agencies_list-close-icon"
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: CLOSE_ICON }}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
        <div class="agencies_collection-list-wrapper">
          <div role="list" class="agencies_collection-list">
            {shown.map((p) => (
              <div role="listitem" class="agencies_collection-item" key={p.slug}>
                <PartnerCard partner={p} />
              </div>
            ))}
          </div>
        </div>
        {shown.length === 0 && (
          <div class="agencies_empty-state">
            <div class="heading-style-h6">No agency found. Try different filters</div>
            <button
              type="button"
              class="button is-secondary"
              disabled={selectedCount(selected) === 0}
              onClick={() => {
                choose(emptySelection())
                // the button goes with the empty result: focus stays in the filter
                controls.current?.querySelector('input')?.focus()
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
