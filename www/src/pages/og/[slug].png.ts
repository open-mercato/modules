// /og/<slug>.png: the OG image of each landing and each routed unique page that has no `seo.ogImage` of its own,
// drawn at build from one template (www/src/lib/og-card.ts). A draft gets none.
import type { APIRoute, GetStaticPaths } from 'astro'
import { getCollection } from 'astro:content'
import { publishedLandings, type LandingEntry } from '../../lib/landings.ts'
import { pageOgCard, routedPages, type PageEntry } from '../../lib/pages.ts'
import { ogCardPng } from '../../lib/og-card.ts'

export const getStaticPaths: GetStaticPaths = async () => {
  const landings = publishedLandings((await getCollection('landings')) as unknown as LandingEntry[])
  const pages = routedPages((await getCollection('pages')) as unknown as PageEntry[])
  return [
    ...landings
      .filter((l) => l.data.seo.ogImage === undefined)
      .map((l) => ({ params: { slug: l.id }, props: { eyebrow: l.data.hero.eyebrow, title: l.data.hero.title } })),
    ...pages.flatMap((p) => {
      const card = pageOgCard(p)
      return card ? [{ params: { slug: p.id }, props: card }] : []
    }),
  ]
}

export const GET: APIRoute = async ({ props }) => {
  const png = await ogCardPng(props as { eyebrow: string; title: string })
  return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } })
}
