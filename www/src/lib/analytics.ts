// Analytics of the main site (www site migration spec, UI/UX "Analytics", D9): Google Analytics 4 `G-64ZQGMNZKB` on
// every page, as www.openmercato.com loads it on 25 Nov 2026 (gtag.js, async, then `js` and `config`), with no Consent
// Mode call and nothing gated by the cookie banner. www/site-behavior.ts puts this script in the head of every page of
// the main site build; the catalog's build (/run) never sees it, so /run loads what it loads today. Isomorphic.
import { GA_MEASUREMENT_ID } from '../../../lib/core/cta.ts'

/** The address of gtag.js for a property. */
export function gtagSrc(id: string = GA_MEASUREMENT_ID): string {
  return `https://www.googletagmanager.com/gtag/js?id=${id}`
}

/**
 * The inline head script: loads gtag.js asynchronously (the live `<script async src>`, appended from the script since
 * the build injects scripts, not tags) and runs the live snippet, which defines the global `gtag`.
 */
export function gaHeadScript(id: string = GA_MEASUREMENT_ID): string {
  return [
    `(function(){var s=document.createElement('script');s.async=true;s.src=${JSON.stringify(gtagSrc(id))};document.head.appendChild(s)})();`,
    'window.dataLayer=window.dataLayer||[];',
    'function gtag(){dataLayer.push(arguments);}',
    "gtag('js',new Date());",
    `gtag('config',${JSON.stringify(id)});`,
  ].join('')
}
