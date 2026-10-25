// Human | Agent (spec 1.1 item 4, 7.6): Agent shows what a coding agent reads for this module: the Markdown card
// `/m/<path>.md` and the static detail document `/m/<path>.json`, fetched from the site on first use.
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

/**
 * The two formats in their own words (finding of 25 Oct): the JSON tab is the static detail document, not the
 * `get_module` response, and its author text (the README excerpt) is not marked untrusted, so it is neither named nor
 * copied as what an agent gets. Only the card says its author text is marked.
 */
export const AGENT_FORMATS = {
  md: {
    label: 'Card',
    ext: '.md',
    aria: 'Agent card',
    copy: 'Copy for agent',
    copied: 'Copied for agent',
    note: 'This is the card an agent reads for this module; the MCP tool get_module and WebMCP return the same data. Author text inside it is marked untrusted.',
  },
  json: {
    label: 'Detail',
    ext: 'JSON',
    aria: 'Detail JSON',
    copy: 'Copy JSON',
    copied: 'Copied',
    note: "This is the static detail document of the module, with the author's text as published. The MCP tool get_module and WebMCP wrap author text with an untrusted notice.",
  },
} as const

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
          {(['md', 'json'] as const).map((k) => (
            <button type="button" aria-pressed={tab === k} aria-controls="agentv-pre" onClick={() => setTab(k)}>
              {AGENT_FORMATS[k].label} <code>{AGENT_FORMATS[k].ext}</code>
            </button>
          ))}
        </div>
        <span class="agentv__tokens">{text ? `≈ ${tokens.toLocaleString('en-US')} tokens` : ''}</span>
        <a class="agentv__raw" href={tab === 'md' ? md : json}>
          Raw <Icon name="external" size={14} />
        </a>
        <button
          type="button"
          class="btn btn--primary btn--sm"
          data-copy={text ?? ''}
          data-copied={AGENT_FORMATS[tab].copied}
          disabled={!text}
        >
          <Icon name="copy" size={14} /> {AGENT_FORMATS[tab].copy}
        </button>
      </div>
      <p class="agentv__note">{AGENT_FORMATS[tab].note}</p>
      {data.error ? (
        <p class="agentv__err">
          {data.error} <a href={md}>Card</a>
        </p>
      ) : (
        <pre class="agentv__pre" id="agentv-pre" tabIndex={0} aria-label={AGENT_FORMATS[tab].aria}>
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
