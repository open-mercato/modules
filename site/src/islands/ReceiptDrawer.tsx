// Receipt drawer (spec 6.7, 7.7 B.4): the detailed signal strip is one `Receipts` button (data-receipts-open);
// it opens a drawer on the right on desktop and a bottom sheet on phones, with the last receipt per line and a
// link to each paper receipt `/r/<id>`. Without JavaScript the same receipts are in the Receipts tab.
import { useEffect, useRef, useState } from 'preact/hooks'
import type { CellStatus } from '../../../lib/schema/index.ts'
import { Square } from '../lib/ui.tsx'
import { nbspDates } from '../lib/format.ts'

export interface DrawerLine {
  key: string
  /** `0.9.0 · latest`. */
  label: string
  status: CellStatus
  /** The cell's failed step: a `quarantine` with a step is a dependency the age gate held back (neutral square). */
  step?: string | null
  /** The line's receipt judged another version than the one a fresh app installs (review r6): outlined square. */
  other?: boolean
  /**
   * The signal `in isolation` on the line (decision of 24 Oct): the last receipt in an app from the empty preset, as the
   * dot beside the square, its sentence and a link. Never the line's verdict.
   */
  isolation?: { dot: 'verified' | 'broken' | 'other'; sentence: string; href: string | null }
  /** One sentence: `Verified on 0.9 on 22 Oct.` or `Queued for tonight's run (02:17 UTC).` */
  sentence: string
  receipt: {
    href: string
    json: string
    moduleVersion: string | null
    omVersion: string
    at: string
    duration: string
    firstError: string | null
    /** `Preview, not CI` for a receipt of the local preview runner, else null. */
    preview: string | null
    /** Label of the receipt link when it is not the line's verdict (`View the 0.9.0 receipt`, review r6). */
    view?: string
  } | null
}

export interface ReceiptDrawerProps {
  title: string
  /** The one preview sentence (lib/core/source.ts), shown once under the title when every receipt is a preview. */
  previewSentence?: string | null
  lines: DrawerLine[]
  compatHref: string
  /** Label of the /compat link: `All receipts`, or `Compatibility matrix` before the first night (no receipt yet). */
  compatLabel?: string
}

export default function ReceiptDrawer({
  title,
  previewSentence = null,
  lines,
  compatHref,
  compatLabel = 'All receipts',
}: ReceiptDrawerProps) {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const onClick = (ev: MouseEvent): void => {
      const btn = (ev.target as Element | null)?.closest<HTMLElement>('[data-receipts-open]')
      if (!btn) return
      ev.preventDefault()
      opener.current = btn
      btn.setAttribute('aria-expanded', 'true')
      setOpen(true)
    }
    for (const b of Array.from(document.querySelectorAll('[data-receipts-open]'))) {
      b.setAttribute('aria-haspopup', 'dialog')
      b.setAttribute('aria-expanded', 'false')
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  // every receipt from the preview runner: one note under the title instead of a chip on every line (round 5)
  const withReceipt = lines.filter((l) => l.receipt)
  const allPreview = withReceipt.length > 0 && withReceipt.every((l) => l.receipt?.preview)
  const previewNote = allPreview ? withReceipt[0]?.receipt?.preview : null

  const close = (): void => {
    setOpen(false)
    opener.current?.setAttribute('aria-expanded', 'false')
    opener.current?.focus()
  }

  return (
    <>
      {/* client:painted="visible" watches the island's children; a closed dialog is never visible, this marker is */}
      <span class="rdrawer-mark" aria-hidden="true" />
      <dialog
        ref={dialog}
        class="rdrawer"
        aria-labelledby="rdrawer-h"
        onClose={close}
        onClick={(ev) => {
          if (ev.target === ev.currentTarget) close()
        }}
      >
        <div class="rdrawer__in">
          <div class="rdrawer__head">
            <div>
              <p class="t-tagline">Receipts</p>
              {/* an h3: the drawer sits under `Compatibility per Open Mercato version` (live review of 30 Oct) */}
              <h3 class="t-h3" id="rdrawer-h">
                {title}
              </h3>
              {previewNote && (
                <p class="rdrawer__preview">
                  <span class="chip chip--preview">{previewNote}</span>
                  {previewSentence && <span>{previewSentence}</span>}
                </p>
              )}
            </div>
            <button type="button" class="btn btn--ghost btn--sm" onClick={close}>
              Close
            </button>
          </div>
          <ol class="rdrawer__list" role="list">
            {lines.map((l) => (
              <li class="rdrawer__item">
                <div class="rdrawer__line">
                  <Square status={l.status} step={l.step ?? null} other={!!l.other} iso={l.isolation?.dot ?? null} />
                  <span class="rdrawer__key">{l.label}</span>
                  {l.receipt?.preview && !allPreview && (
                    <span class="chip chip--preview rdrawer__chip">{l.receipt.preview}</span>
                  )}
                </div>
                <p class="rdrawer__sentence">{nbspDates(l.sentence)}</p>
                {l.isolation && (
                  <p class="rdrawer__base rdrawer__iso">
                    {l.isolation.href ? (
                      <a href={l.isolation.href}>{nbspDates(l.isolation.sentence)}</a>
                    ) : (
                      nbspDates(l.isolation.sentence)
                    )}
                  </p>
                )}
                {l.receipt && (
                  <>
                    <dl class="rdrawer__facts">
                      <div>
                        <dt>Module</dt>
                        <dd>{l.receipt.moduleVersion ?? 'none'}</dd>
                      </div>
                      <div>
                        <dt>Open Mercato</dt>
                        <dd>{l.receipt.omVersion}</dd>
                      </div>
                      <div>
                        <dt>Run</dt>
                        <dd>
                          {l.receipt.at}
                          <span class="rdrawer__dur"> · {l.receipt.duration}</span>
                        </dd>
                      </div>
                    </dl>
                    {l.receipt.firstError && <p class="rdrawer__err">{nbspDates(l.receipt.firstError)}</p>}
                    <div class="rdrawer__acts">
                      <a class="btn btn--secondary btn--sm" href={l.receipt.href}>
                        {l.receipt.view ?? 'View receipt'}
                      </a>
                      <a class="btn btn--ghost btn--sm" href={l.receipt.json} download>
                        JSON
                      </a>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ol>
          <a class="rdrawer__all" href={compatHref}>
            {compatLabel} <span aria-hidden="true">→</span>
          </a>
        </div>
      </dialog>
    </>
  )
}
