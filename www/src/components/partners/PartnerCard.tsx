// A partner in the list of /certified-partners: logo, tier, name with the link, location, industries, description and
// availability. Rendered on the server, and by the PartnerFilter island in the browser.
import type { PartnerCardData } from '../../lib/partner-filter.ts'

export default function PartnerCard({ partner }: { partner: PartnerCardData }) {
  return (
    <article class="partner-card">
      <div class="partner-card__head">
        {partner.logo && (
          <img
            class="partner-card__logo"
            src={partner.logo.src}
            alt={partner.logo.alt}
            loading="lazy"
            decoding="async"
          />
        )}
        <span class="chip chip--line tier-badge">{partner.tier}</span>
      </div>
      <h3 class="post-card__title">
        <a href={partner.href}>{partner.name}</a>
      </h3>
      <p class="partner-card__meta t-small t-muted">
        {partner.location}
        {partner.industries.length > 0 && <span> · {partner.industries.join(', ')}</span>}
      </p>
      <p class="post-card__desc">{partner.description}</p>
      <p class="partner-card__meta t-small t-muted">{partner.availability}</p>
    </article>
  )
}
