// A partner in the list of /certified-partners in the live Webflow markup (`agencies_card`): a link over the whole card,
// logo, the tier label in its colours, name, location and description. Rendered on the server, and by the
// PartnerFilter island in the browser.
import { PARTNER_LOGO_PLACEHOLDER, type PartnerCardData } from '../../lib/partner-filter.ts'

export default function PartnerCard({ partner }: { partner: PartnerCardData }) {
  return (
    <div class="agencies_card">
      <a href={partner.href} class="agencies_card-link w-inline-block" aria-label={partner.name}></a>
      <div class="agencies_card-top">
        {/* without a logo, the live card shows Webflow's default image of the field, the site's logo */}
        <img
          class="agencies_card-logo"
          src={partner.logo?.src ?? PARTNER_LOGO_PLACEHOLDER}
          alt={partner.logo?.alt ?? ''}
          loading="lazy"
          decoding="async"
        />
        <div class="agencies_label-wrapper">
          <div class="agency_label is-radio" style={partner.tierStyle || undefined}>
            <div>{partner.tier}</div>
          </div>
        </div>
      </div>
      <div class="agencies_card-bottom">
        <div class="agencies_card-title">
          <h3 class="heading-style-h5">{partner.name}</h3>
          <div class="text-size-small text-color-secondary">{partner.location}</div>
        </div>
        <p class="text-color-secondary">{partner.description}</p>
      </div>
    </div>
  )
}
