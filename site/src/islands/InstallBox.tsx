// Install box (spec 7.6, 7.7 B.5): line choice, one policy line, the third-party warning, one command, one
// "Open in Claude Code" button with a menu of other agents, the install plan and "More ways to install". The server
// renders the default line, so the command, the plan (children) and the Claude Code link work without JavaScript.
// On phones (7.10) it becomes a sticky bar at the bottom that opens the same box as a bottom sheet.
import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { CellStatus } from '../../../lib/schema/index.ts'
import type { Policy } from '../../../lib/schema/data/health.ts'
import { CLIPBOARD_NOTE, FIRST_TIME_HINT, buildDeeplinks, sanitizeCwd } from '../../../lib/core/deeplinks.ts'
import { renderPrompt } from '../../../lib/core/prompt.ts'
import type { PromptParts } from '../../../lib/core/prompt.ts'
import { CommandChipView, Icon, Square } from '../lib/ui.tsx'
import { installBarText, presetBarText } from '../lib/status.ts'
import { nbspDates } from '../lib/format.ts'

export interface InstallLine {
  key: string
  /** `0.9.0 · latest`. */
  label: string
  status: CellStatus
  /** The failed step of the line's cell (a run the age gate stopped on a dependency has one, round 13). */
  step?: string | null
  /** Exact command for this line, or null when nothing may be installed (hold, not installable, policy refuse). */
  command: string | null
  /**
   * Edits by hand the line's plan makes before the command (the removal of a built-in module the entry replaces), as
   * sentences; never joined into the command (audit of 29 Oct, R3). Absent or empty: none.
   */
  manual?: string[]
  /** Policy `refuse` on an installable package: the command, shown only behind "Show the command anyway". */
  anyway: string | null
  /**
   * A package with preview builds only, on a line the run skips (review r9): the develop build's command, shown only
   * behind a disclosure that says it was not tested on the line. Null otherwise.
   */
  previewBuild?: string | null
  /** Under the command when it is not a verified version (D46): the line's state in the strip's words. */
  note: string | null
  /**
   * The note says a night judged nothing (a dependency the age gate held back, a run that did not finish, our test
   * app): the quiet ink of facts, not the colour of waiting (round 15), as the neutral square of that state.
   */
  noteCalm?: boolean
  /**
   * Under a verified command whose line saw a newer version break (review r7): why the command pins this version,
   * `0.9.0 is broken at typecheck on 0.8 (23 Oct), so the install command for 0.8 pins 0.8.0.` Null otherwise.
   */
  pinned?: string | null
  /**
   * A backend route a new app already has, on a line without a verdict (round 14, lint `backend-route-collision`): the
   * static check and what the same version did on the other lines, said with the command. Never a verdict.
   */
  collision?: string | null
  /**
   * The line's receipt judged another version than this one, which a fresh app installs (review r6): the line shows
   * the outlined `untested` square, never the other version's verdict. Null otherwise.
   */
  noReceiptFor?: string | null
  /**
   * A new app of the line (the classic preset, decision of 24 Oct) already registers the package (`compat.inPresets`):
   * `In a new app` in the phone bar, the box says there is nothing to install.
   */
  preset?: boolean
  /** The module IDs a new app registers in src/modules.ts, set in mono in `shippedText`. */
  shippedIds?: string[]
  /**
   * The one install sentence of such a line (lib/core/policy.ts `presetInstallText`, review r10), the words of
   * raw/modules.md and the agent card: `Nothing to install: a new app already registers events in src/modules.ts.`
   */
  shippedText?: string
  /**
   * On such a line, the command of an app from the empty preset when that preset does not register the package
   * (checkout), under `emptyLead` (`In an app from the empty preset:`); null when it does (events), and the command
   * then only moves the app to another version (`Change the version`).
   */
  emptyCommand?: string | null
  emptyLead?: string
  /**
   * Under that command, the signal `in isolation` of the version it installs (`isolationText`, review of 24 Oct: on 0.8
   * the command of checkout 0.9.0 stood with no word of its own receipt, broken at typecheck in that very app).
   */
  emptyNote?: string | null
  /**
   * `Change the version` would install the version a new app already ships on the line (events 0.9.0 on 0.9): the
   * disclosure is left out.
   */
  sameAsShipped?: boolean
  /**
   * The signal `in isolation` next to the line's verdict (an app from the empty preset): its dot and its one sentence.
   * Null where the line's note already says it (no receipt from a new app yet).
   */
  isolation?: { dot: 'verified' | 'broken' | 'other'; sentence: string } | null
  /** The dot of the signal `in isolation` on the line's tab and bar, also where the note says it. */
  isoDot?: 'verified' | 'broken' | 'other' | null
  policy: Policy
  /** Newer release in the age gate next to the recommended one (6.8), or null. */
  quarantine: string | null
  /** Validated prompt pieces for the deeplinks (lib/core/prompt.ts), or null without a command. */
  prompt: PromptParts | null
  /** `npx create-mercato-module install <npm>@<version of this line>`, or null. */
  cmm: string | null
  /** Command for the Open Mercato Cloud sandbox terminal (same version), or null. */
  cloud: string | null
}

export interface InstallBoxProps {
  lines: InstallLine[]
  /** Line selected first (`latest`). */
  initial: string
  /** 6.8 warning for community, third-party and proprietary code, or null. */
  warning: string | null
  /** Try in Open Mercato Cloud: the dashboard link (the command comes from the chosen line). */
  cloudUrl: string
  /** Shown instead of the command (hold, delisted, not listed). */
  blocked: string | null
  /** No line can be chosen (every line skipped: the catalog never installs it): the picker is hidden. */
  hideLines?: boolean
  /** Plans per line, rendered by the page (`<div data-plan-line="0.9">`). */
  children?: ComponentChildren
  /** Words for the reason codes (lib/core/policy.ts REASON_LABELS), passed in so the island bundles no policy code. */
  reasonLabels?: Record<string, string>
}

/** The edits by hand of a line's plan, before its command (audit of 29 Oct, R3: only the main card had them). */
function ManualSteps({ steps }: { steps: readonly string[] | undefined }) {
  if (!steps || steps.length === 0) return null
  return (
    <ul class="ib__manual" role="list">
      {steps.map((t) => (
        <li>{t}</li>
      ))}
    </ul>
  )
}

/** A sentence with the given identifiers in mono (`events`, `src/modules.ts`), the rest plain text. */
function monoIds(text: string, ids: readonly string[]): ComponentChildren {
  const list = [...new Set(ids)].filter(Boolean).sort((a, b) => b.length - a.length)
  if (list.length === 0) return text
  const esc = (x: string): string => x.replace(/[.*+?^$()|[\]\\/{}]/g, '\\$&')
  const re = new RegExp(`\\b(${list.map(esc).join('|')})(?![\\w/])`, 'g')
  const out: ComponentChildren[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0
    if (i > last) out.push(text.slice(last, i))
    out.push(<code>{m[0]}</code>)
    last = i + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/**
 * A warning with its backend routes and npm packages in mono (round 14: `(@open-` and `mercato/webhooks)` stood on two
 * lines); a package never breaks at its hyphen.
 */
function routeIds(text: string): ComponentChildren {
  const re =
    /((?<=\s)\/backend(?:\/[^\s,;)']*[^\s.,;)'])?(?=[\s,.;)]|$)|(?<=\()@[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*[a-z0-9](?=\)))/g
  const out: ComponentChildren[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0
    if (i > last) out.push(nbspDates(text.slice(last, i)))
    out.push(<code class={m[0].startsWith('@') ? 'nw' : undefined}>{m[0]}</code>)
    last = i + m[0].length
  }
  if (last < text.length) out.push(nbspDates(text.slice(last)))
  return out
}

/** A reason for people: its word and its text without the word repeated (`License: proprietary` -> `Proprietary`). */
function reasonText(
  r: { code: string; text: string },
  labels: Record<string, string>,
): { label: string; text: string } {
  const label = labels[r.code] ?? r.code.replace(/_/g, ' ').toLowerCase()
  const text = r.text.toLowerCase().startsWith(`${label.toLowerCase()}:`)
    ? r.text.slice(label.length + 1).trim()
    : r.text
  return { label, text: text.charAt(0).toUpperCase() + text.slice(1) }
}

const DECISION = { allow: 'Allow', ask: 'Ask first', refuse: 'Refuse' } as const
/**
 * What `Allow` lets an agent do, after the word (review r9: `Allow` did not say what it allows), as /for-agents says it
 * (spec 6.5: show the plan, go ahead after the user's plain yes). `Ask first` and `Refuse` say it themselves, and their
 * reasons and the consent line are right under them.
 */
const ALLOW_MEANING = 'after your yes'
const FOLDER_KEY = 'om-app-folder'

function say(text: string): void {
  const toast = document.getElementById('om-toast')
  if (!toast) return
  toast.textContent = text
  toast.setAttribute('data-on', '')
  setTimeout(() => toast.removeAttribute('data-on'), 2400)
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export default function InstallBox({
  lines,
  initial,
  warning,
  cloudUrl,
  blocked,
  hideLines = false,
  children,
  reasonLabels = {},
}: InstallBoxProps) {
  const [key, setKey] = useState(initial)
  const [folder, setFolder] = useState('')
  const [sheet, setSheet] = useState(false)
  const [live, setLive] = useState(false)
  /** The inline box is out of view (phones): the sticky bar takes its place. */
  const [away, setAway] = useState(false)
  const [holdHeight, setHoldHeight] = useState<number | null>(null)
  /** Phones show only the bar (the box opens as a sheet). */
  const [phone, setPhone] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLElement>(null)
  const bar = useRef<HTMLButtonElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  /** The sheet was open: on close, focus returns to the bar that opened it. */
  const wasOpen = useRef(false)
  const line = lines.find((l) => l.key === key) ?? lines[0]

  useEffect(() => {
    setLive(true)
    const mq = window.matchMedia('(max-width: 767px)')
    const onMq = (): void => setPhone(mq.matches)
    onMq()
    mq.addEventListener('change', onMq)
    const el = box.current
    let io: IntersectionObserver | undefined
    if (el && 'IntersectionObserver' in window) {
      io = new IntersectionObserver(([e]) => setAway(!!e && !e.isIntersecting && e.boundingClientRect.bottom < 0), {
        threshold: 0,
      })
      io.observe(el)
    }
    try {
      setFolder(localStorage.getItem(FOLDER_KEY) ?? '')
    } catch {
      // storage blocked: the field starts empty
    }
    return () => {
      io?.disconnect()
      mq.removeEventListener('change', onMq)
    }
  }, [])

  // show the plan of the chosen line (the plans are server-rendered children)
  useEffect(() => {
    for (const el of Array.from(root.current?.querySelectorAll<HTMLElement>('[data-plan-line]') ?? []))
      el.hidden = el.dataset.planLine !== key
  }, [key])

  // the sheet is a modal dialog (review r2): focus moves to its Close button, Tab stays inside it, Escape closes it,
  // and focus goes back to the bar
  useEffect(() => {
    if (!sheet) {
      if (wasOpen.current) bar.current?.focus()
      wasOpen.current = false
      return
    }
    wasOpen.current = true
    closeBtn.current?.focus()
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') {
        setSheet(false)
        return
      }
      if (ev.key !== 'Tab' || !box.current) return
      const focusable = Array.from(
        box.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement)
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      const active = document.activeElement
      if (ev.shiftKey && (active === first || !box.current.contains(active))) {
        ev.preventDefault()
        last.focus()
      } else if (!ev.shiftKey && (active === last || !box.current.contains(active))) {
        ev.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    document.documentElement.classList.add('ib-lock')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.documentElement.classList.remove('ib-lock')
      setHoldHeight(null)
    }
  }, [sheet])

  const openSheet = (): void => {
    // keep the inline place while the box floats as a sheet, so the page under it does not jump
    setHoldHeight(root.current?.getBoundingClientRect().height ?? null)
    setSheet(true)
  }

  if (!line) return null
  const cwd = sanitizeCwd(folder)
  const parts = line.prompt
  const links = parts ? buildDeeplinks((n) => renderPrompt(parts, n), { cwd }) : null
  const primary = links?.links.find((l) => l.id === 'claude-cli') ?? null
  const others = links?.links.filter((l) => l.id !== 'claude-cli') ?? []
  const decision = line.policy.decision

  const openLink = (clipped: boolean) => (ev: MouseEvent) => {
    if (!links || !clipped) return
    // the link carries a shortened prompt: put the full one on the clipboard first
    ev.preventDefault()
    const url = (ev.currentTarget as HTMLAnchorElement).href
    void copyText(links.prompt).then((ok) => {
      if (ok) say(CLIPBOARD_NOTE)
      window.location.href = url
    })
  }
  const uninstallable = line.policy.reasons.some((r) => r.code === 'NOT_INSTALLABLE' || r.code === 'UNPINNED_GIT')
  // the bar says what the receipts say (review r4: `queued` stood under a red strip on every broken module)
  const barText = installBarText(lines, {
    refuse: decision === 'refuse',
    blocked: line.policy.reasons.some((r) => r.code === 'HOLD')
      ? 'hold'
      : uninstallable || blocked
        ? 'not-installable'
        : null,
  })
  // what the box lists as reasons: an entry the catalog cannot install never gets a receipt, so NOT_VERIFIED would
  // promise one; the third-party sentence stands once, in the warning below (review r1)
  const reasons = line.policy.reasons
    .filter((r) => !(uninstallable && r.code === 'NOT_VERIFIED'))
    .map((r) => (r.code === 'THIRD_PARTY' && warning && !blocked ? { ...r, text: 'See the warning below.' } : r))

  return (
    <div
      class={`ib${live ? ' is-live' : ''}${sheet ? ' is-open' : ''}${away ? ' is-away' : ''}`}
      ref={root}
      style={holdHeight ? `min-height:${holdHeight}px` : undefined}
    >
      <button
        type="button"
        class="ib__bar"
        ref={bar}
        aria-expanded={sheet}
        aria-controls="install-box"
        tabIndex={away || phone ? 0 : -1}
        onClick={openSheet}
      >
        {/* a line that ships the package names its state, not an action there is none of (review r10) */}
        <span class="ib__bar-main">
          {line.preset ? (
            <>
              <Icon name="check" size={18} />
              Nothing to install
            </>
          ) : (
            <>
              <Icon name="terminal" size={18} />
              Install
            </>
          )}
        </span>
        <span class="ib__bar-sub">{nbspDates(line.preset ? presetBarText(lines, barText) : barText)}</span>
        <Icon name="chevron-down" size={16} class="icon ib__bar-chev" />
      </button>
      {sheet && <div class="ib__scrim" onClick={() => setSheet(false)} aria-hidden="true" />}
      <section
        class="ib__box"
        id="install-box"
        ref={box}
        aria-labelledby="ib-h"
        role={sheet ? 'dialog' : undefined}
        aria-modal={sheet ? true : undefined}
      >
        <div class="ib__head">
          <h2 class="ib__h" id="ib-h">
            Install
          </h2>
          <button type="button" class="btn btn--ghost btn--sm ib__close" ref={closeBtn} onClick={() => setSheet(false)}>
            Close
          </button>
        </div>
        <fieldset class="ib__lines" hidden={hideLines}>
          <legend class="ib__legend">Open Mercato line</legend>
          <div class="ib__seg">
            {lines.map((l) => (
              <label class={`ib__segbtn${l.key === key ? ' is-on' : ''}`} title={l.label}>
                <input
                  type="radio"
                  name="ib-line"
                  value={l.key}
                  checked={l.key === key}
                  onChange={() => setKey(l.key)}
                />
                <span>
                  {/* a square only once the line has a receipt: three identical U squares say nothing; a receipt of
                      another version keeps the outlined U, so the tab never shows its red (review r6) */}
                  {((l.status !== 'untested' && l.status !== 'skipped') || l.noReceiptFor || l.isoDot) && (
                    <Square status={l.status} step={l.step ?? null} other={!!l.noReceiptFor} iso={l.isoDot ?? null} />
                  )}
                  {l.key}
                </span>
              </label>
            ))}
          </div>
          <p class="ib__linelabel">{line.label}</p>
        </fieldset>

        <details class={`ib__policy ib__policy--${decision}`} open={decision === 'refuse'}>
          <summary>
            <span>
              Agent policy: <strong>{DECISION[decision]}</strong>
              {decision === 'allow' && (
                <span class="ib__pmean"> · {line.preset ? 'nothing to install' : ALLOW_MEANING}</span>
              )}
            </span>
            <Icon name="chevron-down" size={14} />
          </summary>
          <ul class="ib__reasons" role="list">
            {reasons.map((r) => {
              const p = reasonText(r, reasonLabels)
              return (
                <li>
                  <span class="ib__rk">{p.label}</span>
                  <span>{nbspDates(p.text)}</span>
                </li>
              )
            })}
            {line.policy.consentText && (
              <li class="ib__consent">
                Your agent waits until you type: <code>{line.policy.consentText}</code>
              </li>
            )}
          </ul>
        </details>

        {blocked ? (
          <p class="ib__blocked">{uninstallable ? 'Nothing to install. The reasons are above.' : blocked}</p>
        ) : (
          <>
            {warning && (
              <p class="ib__warn">
                <Icon name="warning" size={16} />
                <span>{warning}</span>
              </p>
            )}
            {line.preset && (line.command || line.anyway) ? (
              // a new app already registers it (review r9, 24 Oct): nothing to install; an app from the empty preset
              // gets its command under the lead, except where an agent refuses (the lead then sits in `anyway`)
              <div class="ib__shipped">
                <p class="ib__shipped-h">Already on in a new app.</p>
                <p class="ib__shipped-t">
                  {monoIds(line.shippedText ?? 'Nothing to install.', [...(line.shippedIds ?? []), 'src/modules.ts'])}
                </p>
                {line.note && <p class="ib__note">{nbspDates(line.note)}</p>}
                {line.emptyCommand && line.command && (
                  <>
                    <p class="ib__shipped-t">{line.emptyLead}</p>
                    <ManualSteps steps={line.manual} />
                    <CommandChipView
                      command={line.emptyCommand}
                      label="Copy the command for an app from the empty preset"
                    />
                    {line.emptyNote && (
                      <p class="ib__iso">
                        {line.isoDot && <span class={`sq-iso-key sq-iso-key--${line.isoDot}`} aria-hidden="true" />}
                        <span>{nbspDates(line.emptyNote)}</span>
                      </p>
                    )}
                  </>
                )}
                {!line.command && line.anyway && line.emptyCommand && (
                  // refused (review r12 P2): no lead that ends in a colon and nothing; it sits with the command
                  <details class="ib__anyway">
                    <summary>
                      <span>Show the command anyway</span>
                      <Icon name="chevron-down" size={14} />
                    </summary>
                    <p class="ib__unverified">{line.emptyLead}</p>
                    <ManualSteps steps={line.manual} />
                    <CommandChipView command={line.anyway} label="Copy the command for an app from the empty preset" />
                    {line.emptyNote && <p class="ib__unverified">{nbspDates(line.emptyNote)}</p>}
                  </details>
                )}
              </div>
            ) : line.command ? (
              <>
                <ManualSteps steps={line.manual} />
                <CommandChipView command={line.command} label="Copy install command" />
                {line.note && (
                  <p class={line.noteCalm ? 'ib__unverified ib__unverified--calm' : 'ib__unverified'}>
                    {nbspDates(line.note)}
                  </p>
                )}
                {line.pinned && <p class="ib__pinned">{nbspDates(line.pinned)}</p>}
                {line.collision && (
                  <p class="ib__warn ib__collide">
                    <Icon name="warning" size={16} />
                    <span>{routeIds(line.collision)}</span>
                  </p>
                )}
              </>
            ) : line.anyway ? (
              <>
                <p class="ib__blocked">
                  An agent refuses to install this{hideLines ? '' : ` on ${line.key}`}. Read the reasons above before
                  you install by hand.
                </p>
                <details class="ib__anyway">
                  <summary>
                    <span>Show the command anyway</span>
                    <Icon name="chevron-down" size={14} />
                  </summary>
                  <ManualSteps steps={line.manual} />
                  <CommandChipView command={line.anyway} label="Copy install command" />
                </details>
              </>
            ) : line.previewBuild ? (
              <>
                <p class="ib__calm">{line.note ?? 'Only preview builds are published.'}</p>
                <details class="ib__anyway">
                  <summary>
                    <span>Show the preview build</span>
                    <Icon name="chevron-down" size={14} />
                  </summary>
                  <p class="ib__unverified">Preview build, not tested on {line.key}.</p>
                  <ManualSteps steps={line.manual} />
                  <CommandChipView command={line.previewBuild} label="Copy preview build command" />
                </details>
              </>
            ) : (
              <p class="ib__blocked">
                {uninstallable
                  ? 'The catalog cannot install this package.'
                  : `No version is installable on ${line.key} yet.`}
              </p>
            )}
            {line.isolation && (
              <p class="ib__iso">
                <span class={`sq-iso-key sq-iso-key--${line.isolation.dot}`} aria-hidden="true" />
                <span>{nbspDates(line.isolation.sentence)}</span>
              </p>
            )}
            {line.quarantine && (
              <p class="ib__quarantine">
                <Icon name="clock" size={14} />
                <span>{nbspDates(line.quarantine)}</span>
              </p>
            )}
            {primary && links && (
              <div class="ib__agent">
                <div class="ib__split">
                  <a class="btn btn--tertiary ib__open" href={primary.url} onClick={openLink(primary.clipped)}>
                    <Icon name="terminal" size={16} />
                    {line.preset ? 'Ask about it in Claude Code' : 'Open in Claude Code'}
                  </a>
                  <details class="ib__menu">
                    <summary class="btn btn--tertiary ib__arrow" aria-label="More agents and options">
                      <Icon name="chevron-down" size={16} />
                    </summary>
                    <div class="ib__pop">
                      <ul role="list">
                        {others.map((l) => (
                          <li>
                            <a href={l.url} onClick={openLink(l.clipped)}>
                              {l.label}
                            </a>
                          </li>
                        ))}
                        <li>
                          <button
                            type="button"
                            onClick={() =>
                              void copyText(links.prompt).then((ok) => say(ok ? 'Prompt copied' : 'Copy failed'))
                            }
                          >
                            Copy prompt
                          </button>
                        </li>
                      </ul>
                      <label class="ib__folder">
                        <span>App folder (optional)</span>
                        <input
                          type="text"
                          value={folder}
                          placeholder="/path/to/my-app"
                          spellcheck={false}
                          autocomplete="off"
                          onInput={(ev) => {
                            const v = (ev.currentTarget as HTMLInputElement).value
                            setFolder(v)
                            try {
                              localStorage.setItem(FOLDER_KEY, v)
                            } catch {
                              // not remembered
                            }
                          }}
                        />
                        {folder && !cwd && <small>Use an absolute path without "..".</small>}
                      </label>
                    </div>
                  </details>
                </div>
                <p class="ib__hint">{FIRST_TIME_HINT}</p>
              </div>
            )}
          </>
        )}

        {children && (
          <details class="ib__plan" open={false}>
            <summary>
              <span>Install plan</span>
              <Icon name="chevron-down" size={14} />
            </summary>
            <div class="ib__plans">{children}</div>
          </details>
        )}

        {!blocked && line.command && line.preset && !line.emptyCommand && !line.sameAsShipped && (
          <details class="ib__more">
            <summary>
              <span>Change the version</span>
              <Icon name="chevron-down" size={14} />
            </summary>
            <div class="ib__ways">
              <div class="ib__way">
                <p class="ib__way-t">
                  A new app already depends on it. Run this only to move the app to this version of the package.
                </p>
                <CommandChipView command={line.command} label="Copy command" />
              </div>
            </div>
          </details>
        )}

        {!blocked && line.command && !line.preset && (line.cmm || line.cloud) && (
          <details class="ib__more">
            <summary>
              <span>More ways to install</span>
              <Icon name="chevron-down" size={14} />
            </summary>
            <div class="ib__ways">
              {line.cmm && (
                <div class="ib__way">
                  <p class="ib__way-h">create-mercato-module</p>
                  <CommandChipView command={line.cmm} label="Copy command" />
                </div>
              )}
              {line.cloud && (
                <div class="ib__way">
                  <p class="ib__way-h">Try in Open Mercato Cloud</p>
                  <p class="ib__way-t">
                    Create a sandbox, then run this in its terminal. Needs an Open Mercato Cloud account.
                  </p>
                  <CommandChipView command={line.cloud} label="Copy command" />
                  <a class="btn btn--secondary btn--sm" href={cloudUrl} rel="noopener noreferrer">
                    Go to Open Mercato Cloud <Icon name="external" size={14} />
                  </a>
                </div>
              )}
            </div>
          </details>
        )}
      </section>
    </div>
  )
}
