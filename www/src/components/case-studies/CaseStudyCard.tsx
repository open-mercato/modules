// A case study in a list (/case-studies, its filter island, and the carousels of a case study and a partner page), in
// the live Webflow markup (`case-list_card`): a link over the whole card, thumbnail, categories, title, description and
// "Read case study". Rendered on the server, and by the CategoryFilter island in the browser. Its link sends the live CTA
// event cta_cases_open_story (lib/core/cta.ts), as the Webflow card did.
import type { CaseStudyCardData } from '../../lib/case-studies.ts'
import { ARROW_ICON } from '../../lib/webflow-icons.ts'

export default function CaseStudyCard({ cs }: { cs: CaseStudyCardData }) {
  return (
    <div class="case-list_card">
      <a
        href={cs.href}
        class="case-list_card-link w-inline-block"
        aria-label={cs.title}
        data-cta-placement="cases"
        data-cta-action="open_story"
      ></a>
      <div class="case-list_thumbnail-wrapper">
        {cs.thumbnail && (
          <img
            class="case-list_thumbnail"
            src={cs.thumbnail.src}
            alt={cs.thumbnail.alt}
            loading="lazy"
            decoding="async"
          />
        )}
      </div>
      <div class="case-list_card-content-wrapper">
        {cs.categories.length > 0 && (
          <div class="case-label_collection-list-wrapper">
            <div role="list" class="case-label_collection-list">
              {cs.categories.map((c) => (
                <div role="listitem" class="case-label_collection-item" key={c}>
                  <div class="case_label">
                    <div class="case_label-text">{c}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div class="case_card-content">
          <h2 class="heading-style-h5">{cs.title}</h2>
          <div class="spacer-1rem"></div>
          <p class="text-color-secondary">{cs.description}</p>
          <div class="spacer-medium"></div>
          <div class="button-group">
            <div class="button is-arrow is-blog">
              <div>Read case study</div>
              <div class="button_icon is-arrow" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ARROW_ICON }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
