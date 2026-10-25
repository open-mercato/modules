// Preact views of the shared primitives. Astro components render these without hydration and islands reuse them,
// so a chip or a seal looks the same in the list and on the module page.
import type { CellStatus } from '../../../lib/schema/index.ts'
import { ICONS } from '../components/icons/paths.ts'
import type { IconName } from '../components/icons/paths.ts'
import { licenseChip, typeChip } from './chips.ts'
import type { SealModel } from './chips.ts'
import { STATUS } from './status.ts'
import { breakSegments } from './wrap.ts'
import type { StripCell } from './status.ts'

export function Icon({ name, size = 16, class: cls = 'icon' }: { name: IconName; size?: number; class?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
      class={cls}
    >
      <path d={ICONS[name]} />
    </svg>
  )
}

export function TypeChipView({ type }: { type: Parameters<typeof typeChip>[0] }) {
  const m = typeChip(type)
  return (
    <span class={`chip chip--${m.variant}`} title={m.title}>
      {m.num && <span class="chip__num">{m.num}</span>}
      {m.label}
    </span>
  )
}

export function LicenseChipView({ license }: { license: Parameters<typeof licenseChip>[0] }) {
  const m = licenseChip(license)
  const cls =
    m.variant === 'enterprise'
      ? 'chip chip--enterprise'
      : m.variant === 'unknown'
        ? 'chip chip--unknown'
        : 'chip chip--line'
  return (
    <span class={cls} title={m.title}>
      {m.mismatch && (
        <span class="chip__neq" aria-hidden="true">
          ≠
        </span>
      )}
      {m.label}
      {m.mismatch && <span class="sr-only"> (sources disagree)</span>}
    </span>
  )
}

const Check = () => (
  <svg viewBox="0 0 10 10" aria-hidden="true">
    <path d="M1.6 5.3 4 7.6 8.6 2.6" fill="none" stroke="currentColor" stroke-width="1.5" />
  </svg>
)

export function SealView({ seal }: { seal: SealModel }) {
  switch (seal.kind) {
    case 'quality':
      return (
        <span class="seal seal--quality" title={seal.title}>
          <span class="seal__main">OM Quality</span>
          <span class="seal__sub">
            {seal.version} · until {seal.until}
          </span>
        </span>
      )
    case 'revoked':
      return (
        <span class="seal seal--revoked" title={seal.title}>
          <span class="seal__main">OM Quality</span>
          <span class="seal__sub">
            Revoked {seal.at} · {seal.version}
          </span>
        </span>
      )
    case 'verified':
      return (
        <span class="seal seal--verified" title={seal.title}>
          <Check />
          Verified · {seal.line}
        </span>
      )
    case 'listed':
      return seal.note ? (
        <span class="seal seal--listed seal--note" title={seal.title}>
          <span class="chip__neq" aria-hidden="true">
            ≠
          </span>
          Listed
          <span class="sr-only">, not Verified. {seal.note}</span>
        </span>
      ) : (
        <span class="seal seal--listed" title={seal.title}>
          Listed
        </span>
      )
    case 'none':
      return null
  }
}

/** One 14 px state square (spec 6.7). `skipped` has no square: a centred dash keeps its column from reading empty;
 * `untested` (queued) is a quiet dot. `iso` adds the small mark of the signal `in isolation` at its top right corner
 * (an app from the empty preset, decision of 24 Oct): a second signal, never the square's state. A `quarantine` cell
 * with a failed step (`step`) is a run Yarn's age gate stopped on a dependency (round 14): a neutral plate with an
 * ink clock, like the other states that judged nothing; the yellow square stays for a release of the module itself. */
export function Square({
  status,
  other = false,
  iso,
  step = null,
}: {
  status: CellStatus
  other?: boolean
  /** The line's last receipt in an app from the empty preset (`compat.isolation`), as a dot. */
  iso?: 'verified' | 'broken' | 'other' | null
  /** The cell's failed step: with `quarantine`, a dependency held back (`heldBack`), not a release in the gate. */
  step?: string | null
}) {
  const s = STATUS[status]
  // a red dot on a green square read as an error of a verified module (finding of 25 Oct): there it is a quiet grey
  // dot, the labels and titles still say `broken in isolation`; the dot stays (D10)
  const dot = iso === 'broken' && status === 'verified' && !other ? 'quiet' : iso
  const mark = dot ? <span class={`sq-iso sq-iso--${dot}`} aria-hidden="true" /> : null
  // the line's receipt judged another version (review r6): a dashed outline, the mark of the preview chip, never the
  // other version's colour; the letter stays U (no verdict for the version a fresh app installs)
  if (other)
    return (
      <span class="strip__cell">
        <svg viewBox="0 0 14 14" aria-hidden="true" focusable="false">
          <rect x="1" y="1" width="12" height="12" rx=".5" class="sq-other" />
        </svg>
        <span class="sq-letter" aria-hidden="true">
          {s.letter}
        </span>
        {mark}
      </span>
    )
  if (!s.drawn)
    return (
      <span class="strip__cell" aria-hidden="true">
        <svg viewBox="0 0 14 14" aria-hidden="true" focusable="false">
          <rect x="3.5" y="6.25" width="7" height="1.5" style="fill:var(--ink-3)" />
        </svg>
        <span class="sq-letter">{s.letter}</span>
        {mark}
      </span>
    )
  let body
  switch (status) {
    case 'verified':
      body = (
        <>
          <rect width="14" height="14" rx="1" fill="#B4F372" />
          <path d="M3.6 7.3 6 9.6 10.6 4.5" fill="none" stroke="#2F520B" stroke-width="1.6" />
        </>
      )
      break
    case 'broken':
      body = (
        <>
          <rect width="14" height="14" rx="1" fill="#F32828" />
          <path d="M4.6 4.6 9.4 9.4M9.4 4.6 4.6 9.4" stroke="#FFFFFF" stroke-width="1.6" />
        </>
      )
      break
    case 'quarantine':
      body = step ? (
        <>
          <rect x=".5" y=".5" width="13" height="13" rx=".5" class="sq-held" />
          <circle cx="7" cy="7" r="3.7" fill="none" class="sq-held__mark" stroke-width="1.2" />
          <path d="M7 5v2.3l1.5 1" fill="none" class="sq-held__mark" stroke-width="1.2" />
        </>
      ) : (
        <>
          <rect width="14" height="14" rx="1" fill="#EEFB63" />
          <circle cx="7" cy="7" r="3.7" fill="none" stroke="#0C0C0C" stroke-width="1.2" />
          <path d="M7 5v2.3l1.5 1" fill="none" stroke="#0C0C0C" stroke-width="1.2" />
        </>
      )
      break
    case 'harness-red':
      body = (
        <>
          <rect x=".5" y=".5" width="13" height="13" rx=".5" fill="none" style="stroke:var(--ink-3)" />
          <path d="M.5 7 7 .5M.5 13.5 13.5 .5M7 13.5 13.5 7" style="stroke:var(--ink-3)" stroke-width="1.1" />
        </>
      )
      break
    case 'infra-error':
      body = (
        <>
          <rect x=".5" y=".5" width="13" height="13" rx=".5" class="sq-infra" />
          <path d="M7 3.4v4.6M7 9.9v.9" class="sq-infra__mark" stroke-width="1.6" />
        </>
      )
      break
    default:
      // untested (queued): a quiet dot, never a square (review r1: 110 dashed U squares read as a wall of tofu); the
      // letter U stays for screen readers (aria-label) and print
      body = <circle cx="7" cy="7" r="2" class="sq-dot" />
  }
  return (
    <span class="strip__cell">
      <svg viewBox="0 0 14 14" aria-hidden="true" focusable="false">
        {body}
      </svg>
      <span class="sq-letter" aria-hidden="true">
        {s.letter}
      </span>
      {mark}
    </span>
  )
}

/** Identifier text that wraps only at token boundaries (after '/', before '@' and ' --'), never mid-name. */
export function Wrap({ text, dots = false }: { text: string; dots?: boolean }) {
  const segs = breakSegments(text, { dots })
  return (
    <>
      {segs.map((seg, i) => {
        const space = seg.endsWith(' ')
        const body = space ? seg.slice(0, -1) : seg
        const last = i === segs.length - 1
        return (
          <>
            {body && <span class="nw">{body}</span>}
            {!last && (space ? ' ' : <wbr />)}
          </>
        )
      })}
    </>
  )
}

/**
 * A command wraps at its spaces (review r1): `module enable` never splits. A long package name may still break
 * after '/' and before its version, a URL never breaks (the chip scrolls sideways instead).
 */
export function CommandText({ text }: { text: string }) {
  const words = text.split(' ')
  return (
    <>
      {words.map((w, i) => {
        // a URL breaks after its host and after each '/' of its path, never inside the host and never after its
        // scheme (review r3: cut mid-glyph; review r4: `https://` alone on a line, the URL on three lines)
        const url = /^([a-z][a-z+.-]*:\/\/)([^/]+)(\/.*)?$/i.exec(w)
        const body = url ? (
          <>
            <span class="nw">
              {url[1]}
              {url[2]}
            </span>
            {url[3] ? (
              <>
                <wbr />
                <Wrap text={url[3]} />
              </>
            ) : null}
          </>
        ) : w.length > 24 ? (
          <Wrap text={w} />
        ) : (
          <span class="nw">{w}</span>
        )
        return (
          <>
            {body}
            {i < words.length - 1 ? ' ' : null}
          </>
        )
      })}
    </>
  )
}

/**
 * Command chip (spec 7.6): light #EFE7FF / #6B55A0, dark #1B1B1B / #B4F372. A copy target shows the whole
 * command: it wraps at token boundaries and the copy button grows with it.
 */
export function CommandChipView({
  command,
  prompt = '$',
  label = 'Copy command',
  oneLine = false,
  display,
}: {
  command: string
  prompt?: string
  label?: string
  /** One line with a fade and a thin scrollbar instead of wrapping (hero). */
  oneLine?: boolean
  /**
   * Shorter text to show when the command would take three lines in a narrow card (review r4: `curl` alone, then the
   * host, then the path); the copy button, its label and the tooltip keep the whole command.
   */
  display?: string
}) {
  return (
    <div class={oneLine ? 'cmd cmd--line' : 'cmd'}>
      {prompt && (
        <span class="cmd__prompt" aria-hidden="true">
          {prompt}
        </span>
      )}
      {/* translate="no": Preact types the attribute as boolean, the HTML value is the string "no" */}
      {/* a URL may scroll sideways: the scroll region is then reachable from the keyboard */}
      <code
        class="cmd__text"
        tabIndex={(display ?? command).includes('://') ? 0 : undefined}
        title={display ? command : undefined}
        {...({ translate: 'no' } as Record<string, string>)}
      >
        <CommandText text={display ?? command} />
      </code>
      <button type="button" class="cmd__copy" data-copy={command} aria-label={`${label}: ${command}`} title="Copy">
        <Icon name="copy" size={16} />
      </button>
    </div>
  )
}

/** Signal strip: a label above each square, one per line. The whole strip is one image for screen readers. */
export function StripView({
  cells,
  labels = true,
  collapse: _collapse = false,
  quiet = false,
}: {
  cells: StripCell[]
  labels?: boolean
  /** Kept for callers of the day-0 label; untested lines are quiet dots now, so it changes nothing. */
  collapse?: boolean
  /** Draw dashes for a strip of skipped lines instead of leaving the column empty (registry rows). */
  quiet?: boolean
}) {
  const aria = `Receipts. ${cells.map((c) => c.label).join('. ')}.`
  // nothing drawn (every line skipped, e.g. enterprise): no orphan labels, the text stays for screen readers; a
  // registry row keeps its dashes (`quiet`), the same mark as a skipped cell on /compat
  if (!quiet && !cells.some((c) => STATUS[c.status].drawn)) return <span class="sr-only">{aria}</span>
  return (
    <span
      class={labels ? 'strip' : 'strip strip--bare'}
      role="img"
      aria-label={aria}
      title={cells.map((c) => c.label).join('\n')}
    >
      {cells.map((c) => (
        <>
          {labels && (
            <span class="strip__label" aria-hidden="true">
              {c.key}
            </span>
          )}
          <Square status={c.status} other={!!c.other} iso={c.isolation?.dot ?? null} step={c.step} />
        </>
      ))}
    </span>
  )
}
