// `yarn om webflow-export --dir <dir> [--site <id>] [--no-text]`: a fresh export directory from the Webflow API with
// the read-only token in WEBFLOW_TOKEN (spec API Contracts). Run by the owner on a workstation for the final delta
// (cutover step C3); never in CI, never on the Cezar server, and the token never enters the repository or a log.
// `yarn om webflow-export --dir <dir> --from-site <export>`: no token; the blog posts and case studies of the live
// sitemap, read from their public pages over an earlier export (lib/import-webflow/published.ts). Read-only GETs to
// https://www.openmercato.com; the next API export replaces what it brings.
import { isAbsolute, resolve } from 'node:path'
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK } from '../cli.ts'
import { ExportError } from '../import-webflow/export.ts'
import { exportFromSite, PublishedPageError } from '../import-webflow/published.ts'
import { exportSite, SITE_ORIGIN, WebflowApiError } from '../import-webflow/webflow-api.ts'

export const description =
  'write a Webflow export directory from the API (WEBFLOW_TOKEN, read-only; owner only) or, with --from-site, from the published pages'

/** The Webflow site of www.openmercato.com ("Open Mercato", openmercato-dev). */
export const DEFAULT_SITE_ID = '69a97e33d587824eef365d83'

export default async function webflowExport(ctx: CommandContext): Promise<number> {
  let dir: string | undefined
  let site = DEFAULT_SITE_ID
  let text = true
  let fromSite: string | undefined
  for (let i = 0; i < ctx.args.length; i++) {
    const a = ctx.args[i]!
    if (a === '--dir') dir = ctx.args[++i]
    else if (a.startsWith('--dir=')) dir = a.slice(6)
    else if (a === '--site') site = ctx.args[++i] ?? ''
    else if (a.startsWith('--site=')) site = a.slice(7)
    else if (a === '--no-text') text = false
    else if (a === '--from-site') fromSite = ctx.args[++i]
    else if (a.startsWith('--from-site=')) fromSite = a.slice(12)
    else {
      console.error(`webflow-export: unknown argument ${a}`)
      return EXIT_ENV
    }
  }
  if (!dir) {
    console.error('webflow-export: --dir <dir> is required (outside the repository; the export is never committed)')
    return EXIT_ENV
  }
  if (!/^[0-9a-f]{24}$/.test(site)) {
    console.error('webflow-export: --site takes a Webflow site id (24 hex digits)')
    return EXIT_ENV
  }
  if (fromSite !== undefined) return fromSiteExport(ctx, dir, fromSite)
  if (process.env.CI) {
    console.error('webflow-export: refused in CI; the owner runs it on a workstation')
    return EXIT_ENV
  }
  const token = process.env.WEBFLOW_TOKEN
  if (!token) {
    console.error('webflow-export: WEBFLOW_TOKEN is not set')
    return EXIT_ENV
  }
  if (ctx.flags.offline) {
    console.error('webflow-export: reads the Webflow API; --offline has nothing to read')
    return EXIT_ENV
  }
  const target = isAbsolute(dir) ? dir : resolve(process.cwd(), dir)
  try {
    const r = await exportSite({
      token,
      siteId: site,
      dir: target,
      text,
      log: (l) => console.log(`webflow-export: ${l}`),
    })
    console.log(
      `webflow-export: ${r.collections} collections, ${r.items} items, ${r.pages} pages, ${r.assets} assets in ${target}`,
    )
    return EXIT_OK
  } catch (err) {
    if (err instanceof WebflowApiError) {
      console.error(`webflow-export: ${err.message.split(token).join('[token]')}`)
      return EXIT_ENV
    }
    throw err
  }
}

async function fromSiteExport(ctx: CommandContext, dir: string, base: string): Promise<number> {
  if (!base) {
    console.error('webflow-export: --from-site takes the earlier export directory its items are written over')
    return EXIT_ENV
  }
  if (ctx.flags.offline) {
    console.error('webflow-export: --from-site reads the published pages; --offline has nothing to read')
    return EXIT_ENV
  }
  const abs = (p: string) => (isAbsolute(p) ? p : resolve(process.cwd(), p))
  try {
    const r = await exportFromSite({
      base: abs(base),
      dir: abs(dir),
      origin: SITE_ORIGIN,
      log: (l) => console.log(`webflow-export: ${l}`),
    })
    for (const [slug, c] of Object.entries(r.counts))
      if (c.added.length > 0) console.log(`webflow-export: new ${slug}: ${c.added.join(', ')}`)
    console.log(`webflow-export: written to ${abs(dir)}; import it with yarn om import-webflow --export ${dir}`)
    return EXIT_OK
  } catch (err) {
    if (err instanceof PublishedPageError || err instanceof ExportError) {
      console.error(`webflow-export: ${err.message}`)
      return EXIT_ENV
    }
    throw err
  }
}
