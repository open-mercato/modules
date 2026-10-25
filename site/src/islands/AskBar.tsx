// Ask bar (spec 7.6, 7.7 A.2): the search field of the hero. It only owns the text: every keystroke goes out as an
// `om:query` event, and the Registry and the Hive answer it. The search index (/search-index.json) is fetched on the
// first focus, prefetched on hover, and shared by every island through `loadSearcher` (one request per page).
import { useEffect, useRef, useState } from 'preact/hooks'
import type { Searcher } from '../../../lib/core/search.ts'
import { Icon } from '../lib/ui.tsx'

/** Event carrying the query text from the Ask bar (and from the Registry's own field) to every listener. */
export const QUERY_EVENT = 'om:query'
/** Event the Registry sends after a search: the keys that matched (`npm:...`, `core:<id>`), null without a query. */
export const RESULTS_EVENT = 'om:results'

export interface QueryDetail {
  q: string
  /** Sent by the Registry itself (keeps the Ask bar text in sync without echoing back). */
  source?: 'askbar' | 'registry'
}
export interface ResultsDetail {
  q: string
  keys: string[] | null
  /** Modules that contain every word of the query (the count the list shows). */
  matches?: number
  /** Built-in modules in the `Already in Open Mercato core` group. */
  core?: number
  /** Titles of those built-in modules, best first. */
  coreTitles?: string[]
  /** Held entries the query matches while no module does (the list offers `Show held entries`). */
  held?: number
}

/** `One held entry matches`, `2 held entries match`: the Ask bar and the list header (finding of 25 Oct). */
export function heldMatchText(n: number): string {
  return n === 1 ? 'One held entry matches' : `${n} held entries match`
}

let pending: Promise<Searcher> | null = null
/** Last text sent by the Ask bar: the Registry hydrates later (client:painted="idle") and starts from it. */
let lastQuery = ''

/** The Ask bar's current query, for islands that mount after it was typed. */
export function askQuery(): string {
  return lastQuery
}

/**
 * Loads /search-index.json and the search code once per page. The code is a separate chunk: pages that never search
 * never download MiniSearch. A failed load is not cached, so the next attempt tries again.
 */
export function loadSearcher(url: string): Promise<Searcher> {
  if (!pending) {
    pending = Promise.all([
      import('../../../lib/core/search.ts'),
      fetch(url, { credentials: 'same-origin' }).then((r) => {
        if (!r.ok) throw new Error(`search index: HTTP ${r.status}`)
        return r.json()
      }),
    ]).then(([mod, data]) => mod.loadSearchIndex(data as Parameters<typeof mod.loadSearchIndex>[0]))
    pending.catch(() => {
      pending = null
    })
  }
  return pending
}

export function readQueryParam(): string {
  try {
    return new URLSearchParams(window.location.search).get('q')?.slice(0, 200) ?? ''
  } catch {
    return ''
  }
}

export interface AskBarProps {
  indexUrl: string
  /** `features.cliSearch`: OM ships `yarn mercato module search` (9.1), so the prefix shows the CLI command. */
  cliSearch: boolean
  /** Example queries under the field. */
  examples: string[]
  /** Element id the field scrolls to on Enter or on an example (the registry). */
  resultsId: string
  tone?: 'film' | 'page'
}

export default function AskBar({ indexUrl, cliSearch, examples, resultsId, tone = 'film' }: AskBarProps) {
  const [q, setQ] = useState('')
  const [found, setFound] = useState<ResultsDetail | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const send = (text: string, now = false): void => {
    lastQuery = text.trim()
    clearTimeout(timer.current)
    const fire = () =>
      document.dispatchEvent(
        new CustomEvent<QueryDetail>(QUERY_EVENT, { detail: { q: text.trim(), source: 'askbar' } }),
      )
    if (now) fire()
    else timer.current = setTimeout(fire, 120)
  }
  const prefetch = (): void => {
    void loadSearcher(indexUrl).catch(() => undefined)
  }
  const reveal = (): void => {
    const el = document.getElementById(resultsId)
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  useEffect(() => {
    const initial = readQueryParam()
    if (initial) setQ(initial)
    const onQuery = (ev: Event): void => {
      const d = (ev as CustomEvent<QueryDetail>).detail
      if (d?.source === 'registry') setQ(d.q)
    }
    // the answer above the fold: how many modules and built-in ones the list below shows
    const onResults = (ev: Event): void => setFound((ev as CustomEvent<ResultsDetail>).detail ?? null)
    document.addEventListener(QUERY_EVENT, onQuery)
    document.addEventListener(RESULTS_EVENT, onResults)
    return () => {
      document.removeEventListener(QUERY_EVENT, onQuery)
      document.removeEventListener(RESULTS_EVENT, onResults)
    }
  }, [])

  const prefix = cliSearch ? '$ yarn mercato module search' : '/ search modules'
  const live = q.trim() !== '' && found !== null && found.q === q.trim() && found.keys !== null
  // the answer above the fold. When no module matches but core has it, the answer is the core module itself
  // ("In core: Currencies"), never "No exact match" next to a hit (review r1, demo C1)
  // A query that finds only held entries names them as the list does (finding of 25 Oct: `No exact match` stood
  // above `One held entry matches: Przelewy24 Gateway`)
  const answer = !live
    ? ''
    : !found.matches && found.core
      ? `In core: ${(found.coreTitles ?? []).slice(0, 2).join(', ') || `${found.core} modules`}`
      : !found.matches && found.held
        ? heldMatchText(found.held)
        : [
            found.matches ? `${found.matches} ${found.matches === 1 ? 'match' : 'matches'}` : 'No exact match',
            ...(found.core ? [`${found.core} in core`] : []),
          ].join(' · ')
  return (
    <div class={`ask ask--${tone}${q.trim() ? ' ask--q' : ''}`}>
      <form
        class="ask__field"
        role="search"
        aria-label="Search modules"
        action={`#${resultsId}`}
        onSubmit={(ev) => {
          ev.preventDefault()
          send(q, true)
          reveal()
        }}
        onMouseEnter={prefetch}
      >
        <span class="ask__prefix" aria-hidden="true">
          {prefix}
        </span>
        <label class="sr-only" for="ask-input">
          Search modules, built-in features, events and permissions
        </label>
        <input
          ref={input}
          id="ask-input"
          class="ask__input"
          type="search"
          name="q"
          value={q}
          autocomplete="off"
          spellcheck={false}
          enterKeyHint="search"
          maxLength={200}
          placeholder="name, event or table"
          data-search-input
          onFocus={prefetch}
          onInput={(ev) => {
            const v = (ev.currentTarget as HTMLInputElement).value
            setQ(v)
            send(v)
          }}
          onKeyDown={(ev) => {
            if (ev.key === 'Escape') {
              ev.preventDefault()
              setQ('')
              send('', true)
            }
          }}
        />
        {q ? (
          <button
            type="button"
            class="ask__clear"
            aria-label="Clear search"
            onClick={() => {
              setQ('')
              send('', true)
              input.current?.focus()
            }}
          >
            <span aria-hidden="true">Esc</span>
          </button>
        ) : (
          <kbd class="ask__kbd" aria-hidden="true">
            /
          </kbd>
        )}
        <button type="submit" class="ask__go" aria-label="Show results">
          <Icon name="search" size={18} />
        </button>
      </form>
      <ul class="ask__examples" role="list" aria-label="Examples">
        {examples.map((x) => (
          <li>
            <button
              type="button"
              class="ask__example"
              onMouseEnter={prefetch}
              onClick={() => {
                setQ(x)
                send(x, true)
                reveal()
              }}
            >
              {x}
            </button>
          </li>
        ))}
      </ul>
      <p class="ask__found" aria-live="polite">
        {answer && (
          <a
            href={`#${resultsId}`}
            onClick={(ev) => {
              ev.preventDefault()
              reveal()
            }}
          >
            {answer} <span aria-hidden="true">↓</span>
          </a>
        )}
      </p>
    </div>
  )
}
