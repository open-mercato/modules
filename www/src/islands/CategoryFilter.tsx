// The category filter of /blog and /case-studies (spec, UI/UX, Blog filter; replaces Finsweet fs-list), in the live
// Webflow markup (`blog-list_component`, `blog-filters_form`, `cms-filters_filed`). One facet, any selected category
// matches, the state in the query string (`?category=architecture&category=security`), so a filtered view can be shared
// and Back works. The server renders every entry and no controls, so the page is complete without JavaScript; once
// hydrated the controls appear, the query string selects, and the number of entries shown is announced in a polite
// live region.
import { useEffect, useState } from 'preact/hooks'
import PostCard from '../components/blog/PostCard.tsx'
import CaseStudyCard from '../components/case-studies/CaseStudyCard.tsx'
import { matchesAnyCategory, readCategories, toggleCategory, writeCategories, type PostCardData } from '../lib/blog.ts'
import type { CaseStudyCardData } from '../lib/case-studies.ts'

export interface FilterCategory {
  id: string
  name: string
  /** Published entries of the category. */
  count: number
}

interface Props {
  categories: FilterCategory[]
  /** The posts of /blog, or */
  posts?: PostCardData[]
  /** the case studies of /case-studies. */
  caseStudies?: CaseStudyCardData[]
}

/** The sentence of the live region. */
export function shownText(shown: number, total: number, noun = 'posts'): string {
  return shown === total ? `Showing all ${total} ${noun}.` : `Showing ${shown} of ${total} ${noun}.`
}

/** One control of the filter: Webflow's custom radio, as a toggle button. */
function Choice({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      class={`cms-filters_filed${on ? ' is-active-inputactive' : ''}`}
      aria-pressed={on}
      onClick={onClick}
    >
      <span class={`cms-filters_radio-button${on ? ' w--redirected-checked' : ''}`} aria-hidden="true"></span>
      <span class="cms-filters_radio-label">{label}</span>
    </button>
  )
}

export default function CategoryFilter({ categories, posts, caseStudies }: Props) {
  const known = categories.map((c) => c.id)
  const [selected, setSelected] = useState<string[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const read = (): void => setSelected(readCategories(window.location.search, known))
    read()
    setReady(true)
    window.addEventListener('popstate', read)
    return () => window.removeEventListener('popstate', read)
  }, [])

  const choose = (next: string[]): void => {
    setSelected(next)
    const { pathname, search, hash } = window.location
    const query = writeCategories(search, next)
    // the same view again (View all while nothing is selected) adds no step to Back
    if (query !== search) window.history.pushState(null, '', `${pathname}${query}${hash}`)
  }

  const items = caseStudies
    ? caseStudies.map((cs) => ({ key: cs.slug, ids: cs.categoryIds, card: <CaseStudyCard cs={cs} /> }))
    : (posts ?? []).map((p) => ({ key: p.slug, ids: p.category ? [p.category.id] : [], card: <PostCard post={p} /> }))
  const shown = items.filter((i) => matchesAnyCategory(i.ids, selected))
  const what = caseStudies ? 'case studies' : 'posts'
  return (
    <div class="blog-list_component">
      <div class="blog-filters_component no-scrollbar" hidden={!ready}>
        <div class="blog-filters_form-block">
          <div class="blog-filters_form no-scrollbar" role="group" aria-label={`Filter ${what} by category`}>
            <Choice label="View all" on={selected.length === 0} onClick={() => choose([])} />
            <div class="cms-filters_collection-list-wrapper">
              <div class="cms-filters_collection-list">
                {categories.map((c) => (
                  <div class="cms-filters_collection-item" key={c.id}>
                    <Choice
                      label={c.name}
                      on={selected.includes(c.id)}
                      onClick={() => choose(toggleCategory(selected, c.id, known))}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <p class="sr-only" role="status" aria-live="polite">
        {shownText(shown.length, items.length, what)}
      </p>
      <div class={caseStudies ? 'case-list_collection-list-wrapper' : 'blog-list_collection-list-wrapper'}>
        <div role="list" class={caseStudies ? 'case-list_collection-list' : 'blog-list_collection-list'}>
          {shown.map((i) => (
            <div
              role="listitem"
              key={i.key}
              class={caseStudies ? 'case-list_collection-item' : 'blog-list_collection-item'}
            >
              {i.card}
            </div>
          ))}
        </div>
      </div>
      {shown.length === 0 && (
        <div class="blog_empty-state">
          <h3 class="heading-style-h5">No items found for this category</h3>
        </div>
      )}
    </div>
  )
}
