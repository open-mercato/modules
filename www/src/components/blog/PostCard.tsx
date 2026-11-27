// A post in the list of /blog (the featured post and the filter island's feed), in the live Webflow markup
// (`blog-list_card`): the whole card is the link; thumbnail, category, title and description. The "Read more" button is
// in the markup as live and hidden by the feed's style (www/src/styles/webflow/pages.css). Rendered on the server, and
// by the CategoryFilter island in the browser.
import type { PostCardData } from '../../lib/blog.ts'
import { ARROW_ICON } from '../../lib/webflow-icons.ts'

export default function PostCard({ post, featured = false }: { post: PostCardData; featured?: boolean }) {
  return (
    <a href={post.href} class={`blog-list_card${featured ? ' is-featured' : ''} w-inline-block`}>
      <div class={`blog-list_thumbnail-wrapper${featured ? ' is-featured' : ''}`}>
        {post.thumbnail && (
          <img
            class="blog-list_thumbnail"
            src={post.thumbnail.src}
            alt={post.thumbnail.alt}
            loading="lazy"
            decoding="async"
          />
        )}
      </div>
      <div class="blog-list_card-content-wrapper">
        <div class="blog_label">{post.category && <div class="blog_label-text">{post.category.name}</div>}</div>
        <div class="blog-list_card-content">
          <h2 class="heading-style-h5">{post.title}</h2>
          <div class="spacer-1rem"></div>
          <p class="text-color-secondary">{post.description}</p>
          <div class="spacer-medium"></div>
          <div class="button-group">
            <div class="button is-arrow is-blog">
              <div>Read more</div>
              <div class="button_icon is-arrow" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ARROW_ICON }} />
            </div>
          </div>
        </div>
      </div>
    </a>
  )
}
