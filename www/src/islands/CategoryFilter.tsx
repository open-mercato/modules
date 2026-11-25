// The category filter of /blog (spec, UI/UX, Blog filter): one facet, any selected category matches, the state in the
// query string (`?category=architecture&category=security`), so a filtered view can be shared and Back works. The
// server renders every published post and no controls, so the page is complete without JavaScript; once hydrated the
// controls appear, the query string selects, and the number of posts shown is announced in a polite live region.
import { useEffect, useState } from 'preact/hooks'
import PostCard from '../components/blog/PostCard.tsx'
import { matchesCategories, readCategories, toggleCategory, writeCategories, type PostCardData } from '../lib/blog.ts'

export interface FilterCategory {
  id: string
  name: string
  /** Published posts of the category. */
  count: number
}

interface Props {
  posts: PostCardData[]
  categories: FilterCategory[]
}

/** The sentence of the live region. */
export function shownText(shown: number, total: number): string {
  return shown === total ? `Showing all ${total} posts.` : `Showing ${shown} of ${total} posts.`
}

export default function CategoryFilter({ posts, categories }: Props) {
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
    // the same view again (All posts while nothing is selected) adds no step to Back
    if (query !== search) window.history.pushState(null, '', `${pathname}${query}${hash}`)
  }

  const shown = posts.filter((p) => matchesCategories(p.category?.id, selected))
  return (
    <div class="category-filter">
      <div class="category-filter__controls" role="group" aria-label="Filter posts by category" hidden={!ready}>
        <button
          type="button"
          class="btn btn--sm btn--secondary"
          aria-pressed={selected.length === 0}
          onClick={() => choose([])}
        >
          All posts
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            class="btn btn--sm btn--secondary"
            aria-pressed={selected.includes(c.id)}
            onClick={() => choose(toggleCategory(selected, c.id, known))}
          >
            {c.name} <span class="category-filter__n">({c.count})</span>
          </button>
        ))}
      </div>
      <p class="category-filter__count t-small t-muted" role="status" aria-live="polite">
        {shownText(shown.length, posts.length)}
      </p>
      <ul class="post-grid">
        {shown.map((p) => (
          <li key={p.slug}>
            <PostCard post={p} />
          </li>
        ))}
      </ul>
    </div>
  )
}
