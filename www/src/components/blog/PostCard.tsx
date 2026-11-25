// A post in a list (the blog list, featured posts, related posts and the filter island): thumbnail, category, title
// with the link, description, date and author. Rendered on the server, and by the BlogFilter island in the browser.
import { dayYear } from '../../../../site/src/lib/format.ts'
import type { PostCardData } from '../../lib/blog.ts'

export default function PostCard({ post, level = 3 }: { post: PostCardData; level?: 2 | 3 }) {
  const Heading = level === 2 ? 'h2' : 'h3'
  return (
    <article class="post-card">
      {post.thumbnail && (
        <img class="post-card__img" src={post.thumbnail.src} alt={post.thumbnail.alt} loading="lazy" decoding="async" />
      )}
      <div class="post-card__body">
        {post.category && <span class="chip chip--line post-card__cat">{post.category.name}</span>}
        <Heading class="post-card__title">
          <a href={post.href}>{post.title}</a>
        </Heading>
        <p class="post-card__desc">{post.description}</p>
        <p class="post-card__meta t-small t-muted">
          <time datetime={post.date}>{dayYear(post.date)}</time>
          {post.author && <span> · {post.author}</span>}
        </p>
      </div>
    </article>
  )
}
