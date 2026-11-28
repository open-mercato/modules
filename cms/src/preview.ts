// The preview handler of Strapi 5 (spec, UI/UX, Preview): the path of a document on the draft build. It stays off
// until Phase 5 (config/admin.ts, CMS_PREVIEW); Step 5.2 replaces this map with the route map the site build reads.

/** The path of a document of a type, from its slug; null for a type the site has no page of. */
export function previewPath(uid: string, slug: string | undefined): string | null {
  if (!slug) return null
  switch (uid) {
    case 'api::landing.landing':
      return `/${slug}`
    case 'api::page.page':
      return slug === 'home' ? '/' : `/${slug}`
    case 'api::blog-post.blog-post':
      return `/blog-posts/${slug}`
    case 'api::case-study.case-study':
      return `/case-studies/${slug}`
    case 'api::partner.partner':
      return `/certified-partners/${slug}`
    case 'api::job.job':
      return `/careers-jobs/${slug}`
    default:
      return null
  }
}
