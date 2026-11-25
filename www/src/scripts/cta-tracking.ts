// CTA tracking of the main site (lib/core/cta.ts): a click, or a middle click, on an element with `data-cta-action`
// sends the live GA4 event `cta_<placement>_<action>` through the gtag of www/site-behavior.ts. Listens in the capture
// phase, as the live tracker, so a handler that stops the event (the video carousel) does not hide the click.
import { CTA_ACTION_ATTR, CTA_PLACEMENT_ATTR, ctaEventName, ctaParams } from '../../../lib/core/cta.ts'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

function track(e: MouseEvent): void {
  if (e.type === 'auxclick' && e.button !== 1) return
  const el = (e.target as Element | null)?.closest?.(`[${CTA_ACTION_ATTR}]`)
  if (!el) return
  const action = el.getAttribute(CTA_ACTION_ATTR) ?? ''
  const placement = el.closest(`[${CTA_PLACEMENT_ATTR}]`)?.getAttribute(CTA_PLACEMENT_ATTR) ?? ''
  if (!action || !placement) return
  const href = el instanceof HTMLAnchorElement ? el.href : undefined
  const params = ctaParams({ placement, action, href, label: el.getAttribute('aria-label') ?? undefined })
  window.gtag?.('event', ctaEventName(placement, action), params)
}

document.addEventListener('click', track, true)
document.addEventListener('auxclick', track, true)
