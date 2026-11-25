// CTA events of the main site (www site migration spec, UI/UX "Analytics", D9). www.openmercato.com sends a GA4 event
// `cta_<placement>_<action>` (cut at 40 characters) with `cta_placement`, `cta_action`, `link_url` and, for a video,
// `video_title` on every click of a call to action. Webflow found the CTA by a selector map in its custom code
// (`om-cta-tracking`, live HTML of 25 Nov 2026; the export's custom_code.json is a 403 answer of the API); here an element
// declares `data-cta-action`, and `data-cta-placement` on itself or on a parent. The names below are the live ones, so
// reports continue across the switch. Isomorphic: the navbar (site/src/components/Header.astro) and the tracker
// (www/src/scripts/cta-tracking.ts) share it.

/** The GA4 property of the main site (D9). */
export const GA_MEASUREMENT_ID = 'G-64ZQGMNZKB'

/** The longest event name the live tracker sends: it cuts `cta_<placement>_<action>` at this length. */
export const CTA_EVENT_LENGTH = 40

/** The attributes a CTA carries. */
export const CTA_PLACEMENT_ATTR = 'data-cta-placement'
export const CTA_ACTION_ATTR = 'data-cta-action'

/** The live map's slug of a label: lower case, runs of other characters as one `_`, none at the ends. */
export function ctaSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

/**
 * The event name the tracker sends, cut as the live tracker cuts it (lib/schema/www-content.ts ctaEventName() is the
 * whole name, which a typed Cta may not let grow past this length).
 */
export function sentCtaEventName(placement: string, action: string): string {
  return `cta_${placement}_${action}`.slice(0, CTA_EVENT_LENGTH)
}

/** What one click of a CTA tells the tracker. */
export interface CtaClick {
  placement: string
  action: string
  /** The absolute address of the clicked link, when it is one. */
  href?: string
  /** The accessible name of the element (aria-label), for a video's title. */
  label?: string
}

/** The parameters of a CTA event, as the live tracker sends them. */
export interface CtaParams {
  send_to: string
  cta_placement: string
  cta_action: string
  link_url?: string
  video_title?: string
}

/**
 * The parameters of one CTA event: `link_url` is the origin and path of an http(s) link (no query, no hash); a video
 * button (`play_video`) names its video, from its label without the "Play: " prefix, and has no link (on the live site
 * it is a button; here it is a link to YouTube that works without JavaScript, so its address is left out for parity).
 */
export function ctaParams(c: CtaClick): CtaParams {
  const params: CtaParams = { send_to: GA_MEASUREMENT_ID, cta_placement: c.placement, cta_action: c.action }
  if (c.action === 'play_video') params.video_title = (c.label ?? '').replace(/^Play:\s*/i, '')
  else if (c.href && /^https?:/.test(c.href)) {
    const u = new URL(c.href)
    params.link_url = u.origin + u.pathname
  }
  return params
}

/** The repository and the sandbox sign-up, which the live map names whatever the label says. */
const GITHUB = 'github.com/open-mercato/open-mercato'
const SANDBOX = 'app.openmercatocloud.com/signup'

/**
 * The action of a navbar element, by the live map: the logo is `home`, the phone menu button `menu_toggle`, a menu
 * toggle `<label>_menu`, a link to the repository `github`, to the sandbox `launch_sandbox`, any other link its label.
 */
export function navCtaAction(
  el:
    | { kind: 'logo' }
    | { kind: 'menu-button' }
    | { kind: 'menu'; label: string }
    | { kind: 'link'; label: string; href: string },
): string {
  switch (el.kind) {
    case 'logo':
      return 'home'
    case 'menu-button':
      return 'menu_toggle'
    case 'menu':
      return `${ctaSlug(el.label)}_menu`
    case 'link':
      return el.href.includes(GITHUB) ? 'github' : el.href.includes(SANDBOX) ? 'launch_sandbox' : ctaSlug(el.label)
  }
}

/** The data attributes of a CTA (placement may also sit on a parent). */
export function ctaAttrs(action: string, placement?: string): Record<string, string> {
  return placement ? { [CTA_PLACEMENT_ATTR]: placement, [CTA_ACTION_ATTR]: action } : { [CTA_ACTION_ATTR]: action }
}
