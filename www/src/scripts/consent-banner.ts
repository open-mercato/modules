// ConsentBanner (www/src/lib/consent.ts): the live banner's behavior. Without an answer in the cookie it appends the
// banner to the body and fades it in from below (0.4 s); Dismiss or Accept sets `cookieAccepted` for 180 days and fades
// it out. Reduced motion skips the fades. Without JavaScript there is no banner, which changes nothing: it gates nothing.
import { consentBannerHtml, consentCookie, hasConsent } from '../lib/consent.ts'

const FADE_MS = 400

function show(): void {
  if (hasConsent(document.cookie)) return
  const host = document.createElement('div')
  host.innerHTML = consentBannerHtml()
  const banner = host.firstElementChild
  if (!(banner instanceof HTMLElement)) return
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const hidden = { opacity: '0', transform: 'translateY(16px)' }
  if (!still) Object.assign(banner.style, { transition: 'opacity 0.4s ease, transform 0.4s ease', ...hidden })
  document.body.append(banner)
  if (!still)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => Object.assign(banner.style, { opacity: '1', transform: 'translateY(0)' })),
    )

  const dismiss = (): void => {
    document.cookie = consentCookie(new Date())
    if (still) {
      banner.style.display = 'none'
      return
    }
    Object.assign(banner.style, hidden)
    setTimeout(() => (banner.style.display = 'none'), FADE_MS)
  }
  for (const el of banner.querySelectorAll<HTMLElement>('[cookie-banner="dismiss"], [cookie-banner="accept"]')) {
    el.addEventListener('click', dismiss)
    // the live Dismiss is a div: reachable by keyboard here, with the same look
    if (el.tagName === 'DIV') {
      el.setAttribute('role', 'button')
      el.tabIndex = 0
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        dismiss()
      })
    }
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show)
else show()
