// The blog's collections as the pages read them (astro:content): published posts and the names of authors and
// categories. Build only; the selection rules live in www/src/lib/blog.ts.
import { getCollection } from 'astro:content'
import { postCard, publishedPosts, refId, type PostCardData, type PostEntry } from './blog.ts'

/** A blog category: its name, its Webflow order and the colours of its label. */
export interface BlogCategory {
  name: string
  order: number
  labelColor?: string
  textColor?: string
}

export interface BlogData {
  published: PostEntry[]
  authors: Map<string, string>
  categories: Map<string, BlogCategory>
  card(post: PostEntry): PostCardData
}

export async function blogData(): Promise<BlogData> {
  const posts = (await getCollection('blog')) as unknown as PostEntry[]
  const authorEntries = (await getCollection('authors')) as unknown as { id: string; data: { name: string } }[]
  const categoryEntries = (await getCollection('blogCategories')) as unknown as { id: string; data: BlogCategory }[]
  const authors = new Map(authorEntries.map((a) => [a.id, a.data.name]))
  const categories = new Map(categoryEntries.map((c) => [c.id, c.data]))
  const names = { authors, categories: new Map([...categories].map(([id, c]) => [id, c.name])) }
  return { published: publishedPosts(posts), authors, categories, card: (p) => postCard(p, names) }
}

/** The names a post's author and category resolve to. */
export function postNames(post: PostEntry, data: BlogData): { author?: string; category?: string } {
  const author = data.authors.get(refId(post.data.author) ?? '')
  const category = data.categories.get(refId(post.data.category) ?? '')?.name
  return { ...(author ? { author } : {}), ...(category ? { category } : {}) }
}
