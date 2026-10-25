// Registry row (spec 7.6): 64 px on desktop, a card on phones. The same component renders on the server (list
// without JS) and inside the Registry island. Copy uses the page-wide [data-copy] handler from the layout.
import type { IndexEntry, Line } from '../../../lib/schema/index.ts'
import { renderSigil, sigilLabel } from '../../../lib/sigil/sigil.ts'
import { EMPTY_PRESET_LEAD, emptyPresetOn, presetOn } from '../../../lib/core/policy.ts'
import { licenseChip, sealOf, typeChip } from '../lib/chips.ts'
import { stripCells } from '../lib/status.ts'
import type { Others } from '../lib/status.ts'
import { Icon, LicenseChipView, SealView, StripView, TypeChipView, Wrap } from '../lib/ui.tsx'
import { href, modulePage } from '../lib/url.ts'
import { transitionNames } from '../lib/vt.ts'

/** translate="no" (Preact types the attribute as boolean; the HTML value is the string "no"). */
const NO_TRANSLATE = { translate: 'no' } as Record<string, string>

export interface ModuleRowProps {
  /** An index entry, or the registry's slim projection with the sigil label computed in the build. */
  /** `others`: lines whose receipt judged another version (review r6). */
  entry: IndexEntry & { anatomyLabel?: string; others?: Others }
  lines: Pick<Line, 'key' | 'source'>[]
  categoryTitle: string
  /** Anatomy hit of the query, e.g. "event customers.deal.won". */
  matched?: string | null
  /**
   * Receipt strip and level columns. Off before the first night (review r1): every row would print the same queue
   * state and the same `Listed`, so the columns go and the list says once that receipts come after the first night.
   */
  signals?: boolean
  /** The receipts come from a preview run: the Verified seal's title says so (review r10). */
  preview?: boolean
}

export default function ModuleRow({
  entry,
  lines,
  categoryTitle,
  matched,
  signals = true,
  preview = false,
}: ModuleRowProps) {
  const latest = lines.find((l) => l.source === 'latest')?.key ?? lines[0]?.key ?? ''
  const vt = transitionNames(entry.locator)
  const sigil = renderSigil({
    glyph: entry.sigil.glyph,
    phase: entry.sigil.phase,
    kind: entry.kind,
    enterprise: entry.enterprise,
    publicRoutes: entry.sigil.publicRoutes,
    size: 32,
    label: entry.anatomyLabel ?? sigilLabel(entry.anatomy?.counts ?? null, { enterprise: entry.enterprise }),
    transitionName: vt.sigil,
  })
  const name = entry.npm ?? entry.github ?? entry.locator
  const external = entry.links.npm ?? entry.links.repo
  // "event customers.deal.won": the kind word, then the identifier on its own line of tokens
  const hit = matched ? /^(\S+)\s+(.+)$/.exec(matched) : null
  // phones: one mono line instead of three chips ("02 COMMUNITY · MIT · LOCALIZATION")
  const tc = typeChip(entry.type)
  const mono = [
    `${tc.num ? `${tc.num} ` : ''}${tc.label}`,
    entry.enterprise ? 'Enterprise license' : licenseChip(entry.license).label,
    categoryTitle,
  ]
  const cls = ['mrow', matched ? 'mrow--hit' : '', signals ? '' : 'mrow--nosig'].filter(Boolean).join(' ')
  // a new app of the latest line already registers the package (review of 24 Oct: the copy button gave `module add`
  // with no label next to `Nothing to install`): the command is named as the empty preset's, or there is none to copy
  const inNewApp = presetOn(entry, latest)
  const copy = inNewApp && emptyPresetOn(entry, latest) ? null : entry.install.cli
  const copyTitle = inNewApp
    ? `Nothing to install in a new app. ${EMPTY_PRESET_LEAD} ${entry.install.cli}`
    : entry.install.cli
  const copyLabel = inNewApp
    ? `Copy the command for an app from the empty preset (${name})`
    : `Copy install command for ${name}`
  return (
    <article class={cls} data-locator={entry.locator} data-category={entry.category}>
      <div class="mrow__grid">
        <span class="mrow__sig" dangerouslySetInnerHTML={{ __html: sigil }} />
        <div class="mrow__head">
          <a class="mrow__title" href={href(modulePage(entry.path))} style={`view-transition-name:${vt.title}`}>
            {entry.title}
          </a>
          <span class="mrow__loc" title={name} {...NO_TRANSLATE}>
            <Wrap text={name} />
          </span>
        </div>
        <p class="mrow__summ">{entry.summary}</p>
        {matched && (
          <p class="mrow__hit">
            <span class="chip chip--match">
              <span class="chip--match__k">matched:</span> {hit ? `${hit[1]} ` : ''}
              <code {...NO_TRANSLATE}>
                <Wrap text={hit ? (hit[2] as string) : matched} dots />
              </code>
            </span>
          </p>
        )}
        <p class={`mrow__mono mrow__mono--${tc.variant}`}>
          {mono.map((m, i) => (
            <>
              {i > 0 && <span aria-hidden="true"> · </span>}
              <span>{m}</span>
            </>
          ))}
        </p>
        <div class="mrow__tags" title={categoryTitle}>
          <span class="mrow__meta">{categoryTitle}</span>
          <TypeChipView type={entry.type} />
          {!entry.enterprise && <LicenseChipView license={entry.license} />}
        </div>
        {signals && (
          <div class="mrow__strip">
            <StripView cells={stripCells(entry, lines, entry.others)} quiet />
          </div>
        )}
        {signals && (
          <div class="mrow__seal">
            {entry.enterprise ? (
              <span class="chip chip--enterprise chip--stack" title="Commercial license. Anatomy not published.">
                <span>Enterprise</span>
                <span>license</span>
              </span>
            ) : (
              <SealView seal={sealOf(entry, latest, preview)} />
            )}
          </div>
        )}
        <div class="mrow__act">
          {/* nothing to copy: a new app and an app from the empty preset both have it (Search, Events); the slot says
              so instead of standing empty (finding of 25 Oct) */}
          {!copy && inNewApp && (
            <span
              class="btn btn--ghost btn--icon btn--sm mrow__has"
              role="img"
              aria-label={`${name}: nothing to install, a new app already has it`}
              title="Nothing to install: a new app already has it"
            >
              <Icon name="check" size={16} />
            </span>
          )}
          {copy && (
            <button
              type="button"
              class="btn btn--ghost btn--icon btn--sm"
              data-copy={copy}
              aria-label={copyLabel}
              title={copyTitle}
            >
              <Icon name="terminal" size={16} />
            </button>
          )}
          {external && (
            <a
              class="btn btn--ghost btn--icon btn--sm"
              href={external}
              rel="noopener noreferrer"
              aria-label={entry.links.npm ? `${name} on npm` : `${name} on GitHub`}
              title={entry.links.npm ? 'npm' : 'GitHub'}
            >
              <Icon name="external" size={16} />
            </a>
          )}
        </div>
      </div>
    </article>
  )
}

/**
 * Column header of the registry (desktop, >= 992 px): prints the line labels `0.8 0.9 next` once above the strips,
 * so the rows can show bare squares. Hidden on phones and tablets, where each card keeps its own labels.
 */
export function ModuleRowHead({ lines, signals = true }: { lines: Pick<Line, 'key' | 'source'>[]; signals?: boolean }) {
  const keys = stripCells({ compat: { lines: {} } } as Pick<IndexEntry, 'compat'>, lines).map((c) => c.key)
  return (
    <div class={signals ? 'mrow mrow--head' : 'mrow mrow--head mrow--nosig'} aria-hidden="true">
      <div class="mrow__grid">
        <span class="mrow__hcell mrow__hcell--mod">Module</span>
        <span class="mrow__hcell mrow__tags">
          <span class="mrow__meta">Category</span>
          <span>
            Type<span class="mrow__hsep"> / License</span>
          </span>
          <span class="mrow__hlic">License</span>
        </span>
        {signals && (
          <span class="mrow__strip">
            <span class="strip strip--labels">
              {keys.map((k) => (
                <span class="strip__label">{k}</span>
              ))}
            </span>
          </span>
        )}
        {signals && <span class="mrow__hcell mrow__seal">Level</span>}
      </div>
    </div>
  )
}
