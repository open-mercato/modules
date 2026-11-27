// ConsentBanner of the main site (www site migration spec, UI/UX "Consent banner", D9): the cookie banner of
// www.openmercato.com as it is on 25 Nov 2026, with its texts, its Webflow markup and classes (cookie-banner_*, styled by
// www/src/styles/webflow/consent.css) and its cookie `cookieAccepted=true` for 180 days on path /, so a visitor who
// accepted on Webflow is not asked again. Dismiss and Accept do the same, as there. It gates nothing: Google Analytics
// loads on every page whatever the answer (D9). www/src/scripts/consent-banner.ts shows it. Isomorphic.

/** The cookie the live banner sets. */
export const CONSENT_COOKIE = 'cookieAccepted'

/** Its value. */
export const CONSENT_VALUE = 'true'

/** Its lifetime in days (the live script: `setCookie('cookieAccepted', 'true', 180)`). */
export const CONSENT_DAYS = 180

/** The banner's texts, as live. */
export const CONSENT_TEXT = {
  lead: 'We use essential cookies to remember your preferences. Learn how we handle data in our ',
  privacy: 'Privacy',
  privacyHref: '/terms-conditions',
  dismiss: 'Dismiss',
  accept: 'Accept cookies',
} as const

const DAY_MS = 864e5

/** The `document.cookie` assignment of an answer given at `now`, as the live script writes it. */
export function consentCookie(now: Date): string {
  const expires = new Date(now.getTime() + CONSENT_DAYS * DAY_MS).toUTCString()
  return `${CONSENT_COOKIE}=${CONSENT_VALUE}; expires=${expires}; path=/`
}

/** Whether `document.cookie` already holds an answer (any value, as the live check reads only the name). */
export function hasConsent(cookies: string): boolean {
  return cookies.split('; ').some((c) => c.startsWith(`${CONSENT_COOKIE}=`))
}

/** The banner's markup, the live one (the script appends it to the body when there is no answer yet). */
export function consentBannerHtml(): string {
  const t = CONSENT_TEXT
  return (
    '<div class="cookie-banner_component"><div class="cookie-banner_content"><div class="cookie-banner_text">' +
    `${t.lead}<a href="${t.privacyHref}" class="text-color-alternate">${t.privacy}</a>.</div>` +
    `<div class="cookie-banner_buttons"><div cookie-banner="dismiss" class="cookie-banner_link-text">${t.dismiss}</div>` +
    `<a cookie-banner="accept" href="#" class="button is-secondary is-small w-inline-block"><div>${t.accept}</div></a>` +
    '</div></div></div>'
  )
}
