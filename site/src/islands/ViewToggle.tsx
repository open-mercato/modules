// Human | Agent (spec 1.1 item 4, 7.6): Agent shows exactly what a coding agent receives for this module: the
// Markdown card `/m/<path>.md` and the `get_module` JSON `/m/<path>.json`, fetched from the site on first use.
// The choice is remembered in localStorage (try/catch); Human is the default and the page works without it.
import { useEffect, useState } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import { Icon } from '../lib/ui.tsx'

export interface ViewToggleProps {
  /** `/m/<path>.md` under the base path. */
  md: string
  /** `/m/<path>.json` under the base path. */
  json: string
  /** Element that receives the agent panel. */
  target: string
}

type View = 'human' | 'agent'
type Tab = 'md' | 'json'
const KEY = 'om-view'

interface Loaded {
  md: string | null
  json: string | null
  error: string | null
}

export default function ViewToggle({ md, json, target }: ViewToggleProps) {
  const [view, setView] = useState<View>('human')
  const [tab, setTab] = useState<Tab>('md')
  const [data, setData] = useState<Loaded>({ md: null, json: null, error: null })
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setHost(document.getElementById(target))
    // a click before hydration (the island hydrates after first paint, spec 7.11) is kept by the page's inline
    // script and replayed here (finding of 25 Oct: the first click on Agent did nothing)
    const w = window as unknown as { __omView?: string }
    const early = w.__omView
    delete w.__omView
    if (early === 'agent' || early === 'human') {
      setView(early)
      return
    }
    try {
      if (localStorage.getItem(KEY) === 'agent') setView('agent')
    } catch {
      // storage blocked: Human
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.view = view
    try {
      localStorage.setItem(KEY, view)
    } catch {
      // not remembered
    }
    if (view !== 'agent' || data.md !== null || data.error) return
    Promise.all([
      fetch(md).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status))))),
      fetch(json).then((r) => (r.ok ? r.text() : null)),
    ])
      .then(([m, j]) => setData({ md: m, json: j ? JSON.stringify(JSON.parse(j), null, 2) : null, error: null }))
      .catch(() => setData({ md: null, json: null, error: 'The agent card could not be loaded. Open it directly.' }))
  }, [view])

  const text = tab === 'md' ? data.md : data.json
  const tokens = text ? Math.round(text.length / 4) : 0

  const panel = (
    <section class="agentv" aria-label="Agent view">
      <div class="agentv__bar">
        {/* a format switch, not a tab set: two toggle buttons (aria-pressed), like Human | Agent */}
        <div class="agentv__tabs" role="group" aria-label="Agent format">
          <button type="button" aria-pressed={tab === 'md'} aria-controls="agentv-pre" onClick={() => setTab('md')}>
            Card <code>.md</code>
          </button>
          <button type="button" aria-pressed={tab === 'json'} aria-controls="agentv-pre" onClick={() => setTab('json')}>
            get_module <code>JSON</code>
          </button>
        </div>
        <span class="agentv__tokens">{text ? `≈ ${tokens.toLocaleString('en-US')} tokens` : ''}</span>
        <a class="agentv__raw" href={tab === 'md' ? md : json}>
          Raw <Icon name="external" size={14} />
        </a>
        <button
          type="button"
          class="btn btn--primary btn--sm"
          data-copy={text ?? ''}
          data-copied="Copied for agent"
          disabled={!text}
        >
          <Icon name="copy" size={14} /> Copy for agent
        </button>
      </div>
      <p class="agentv__note">
        This is the exact text an agent gets from the catalog: the card, the MCP tool <code>get_module</code> and WebMCP
        return the same data. Author text inside it is marked untrusted.
      </p>
      {data.error ? (
        <p class="agentv__err">
          {data.error} <a href={md}>Card</a>
        </p>
      ) : (
        <pre
          class="agentv__pre"
          id="agentv-pre"
          tabIndex={0}
          aria-label={tab === 'md' ? 'Agent card' : 'get_module JSON'}
        >
          {text ?? 'Loading.'}
        </pre>
      )}
    </section>
  )

  return (
    <>
      <div class="vt" role="group" aria-label="View">
        <button type="button" data-view="human" aria-pressed={view === 'human'} onClick={() => setView('human')}>
          Human
        </button>
        <button type="button" data-view="agent" aria-pressed={view === 'agent'} onClick={() => setView('agent')}>
          Agent
        </button>
      </div>
      {view === 'agent' && host && createPortal(panel, host)}
    </>
  )
}
