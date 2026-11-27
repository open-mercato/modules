// Shared state of one import run: the export, the media registry, the docs map and the report the writers fill.
import type { WwwCollection } from '../schema/www-content.ts'
import { wwwSchemas } from '../schema/www-content.ts'
import type { WebflowExport } from './export.ts'
import type { MediaRegistry } from './media.ts'
import {
  ConvertError,
  htmlToMarkdown,
  htmlToText,
  inlineHtmlToMarkdown,
  type ConvertHooks,
  type ConvertMode,
} from './richtext.ts'
import { emptyTally, isSafeHref, replaceCounts, replaceDashes, rewriteLink, type TextTally } from './text.ts'

/** One entry the run writes: a YAML file, a Markdown file with frontmatter, or one entry of a one-file collection. */
export interface Entry {
  collection: WwwCollection
  id: string
  webflowId: string
  draft: boolean
  /** The entry as the schema reads it (frontmatter for Markdown files), keys in schema order. */
  data: Record<string, unknown>
  /** The Markdown body, for collections of `.md` files. */
  body?: string
  /** Rich-text embeds of the body, written to www/content/embeds/<name>.html (EMBEDS_DIR). */
  embeds?: { name: string; html: string }[]
}

export interface Report {
  /** Per collection: entries written and drafts among them. */
  counts: Map<string, { entries: number; drafts: number }>
  /** Items the run did not write, with the reason (a converter stop, an invalid entry). */
  stopped: { item: string; why: string }[]
  /** Items written with something a person should look at. */
  notes: { item: string; note: string }[]
  dashes: number
  invisible: number
  tokens: { item: string; token: string; from: string }[]
  /** Landings whose visible text matched strony/<slug>.txt. */
  crossChecked: string[]
  /** Unique pages: words of the visible text the copy blocks do not hold. */
  coverage: { page: string; words: number; missing: number }[]
}

export function emptyReport(): Report {
  return {
    counts: new Map(),
    stopped: [],
    notes: [],
    dashes: 0,
    invisible: 0,
    tokens: [],
    crossChecked: [],
    coverage: [],
  }
}

export interface RunCtx {
  exp: WebflowExport
  media: MediaRegistry
  /** `/docs/<slug>` to its target. */
  docs: ReadonlyMap<string, string>
  report: Report
  schemas: ReturnType<typeof wwwSchemas>
  /** Group titles of the capability matrices across the export's landings (parseMatrix). */
  matrixTitles: Set<string>
}

/** The text and link rules for one item, counting what they change into the report under `item`. */
export class ItemText {
  readonly tally: TextTally = emptyTally()
  /** Rich-text embeds met so far, in body order; only a collection that keeps embeds (blog) passes `embeds`. */
  readonly embeds: { name: string; html: string }[] = []
  readonly ctx: RunCtx
  readonly item: string
  readonly mediaDir: string
  readonly tokens: boolean

  constructor(ctx: RunCtx, item: string, mediaDir: string, tokens: boolean) {
    this.ctx = ctx
    this.item = item
    this.mediaDir = mediaDir
    this.tokens = tokens
  }

  /** A plain text value with the A5 dash rule (and A6 tokens on landings and pages). */
  text(value: string, code = false): string {
    const v = replaceDashes(value, this.tally)
    return this.tokens && !code ? replaceCounts(v, this.tally) : v
  }

  link(href: string): string {
    if (!isSafeHref(href)) throw new ItemStop(`the link "${href.slice(0, 60)}" has a scheme the site does not write`)
    return rewriteLink(href, {
      docs: this.ctx.docs,
      report: (h, why) => this.note(`${why}: ${h}`),
    })
  }

  /** Site path of a media file used by this item; a non-CDN address is kept and reported. */
  media(url: string): string {
    const path = this.ctx.media.use(url, this.mediaDir, this.item)
    if (path === undefined) {
      this.note(`an image outside the Webflow CDN is kept as a link: ${url}`)
      return url
    }
    return path
  }

  hooks(embeds = false): ConvertHooks {
    return {
      text: (v, c) => this.text(v, c.code),
      link: (h) => this.link(h),
      image: (s) => this.media(s),
      ...(embeds ? { embed: (html: string) => this.embed(html) } : {}),
    }
  }

  /**
   * Keeps a rich-text embed byte for byte, as Q4 ports a Webflow embed: `<collection>-<slug>-<n>`. Its images stay
   * on the Webflow CDN and its links are not rewritten; a long dash in it stops the item (A5 holds for every text).
   */
  embed(html: string): string {
    if (/[\u2013\u2014]/.test(html)) throw new ItemStop('an embed holds a long dash; replace it in Webflow')
    const name = `${this.item.replace('/', '-').toLowerCase()}-${this.embeds.length + 1}`
    this.embeds.push({ name, html })
    return name
  }

  markdown(html: string, mode: ConvertMode = 'strict', embeds = false): string {
    return htmlToMarkdown(html, this.hooks(embeds), mode)
  }

  inline(html: string, mode: ConvertMode = 'strict'): string {
    return inlineHtmlToMarkdown(html, this.hooks(), mode)
  }

  plain(html: string): string {
    return htmlToText(html, { text: (v) => this.text(v) })
  }

  note(note: string): void {
    this.ctx.report.notes.push({ item: this.item, note })
  }

  /** Adds this item's counts to the report; call once when the item is written. */
  commit(): void {
    this.ctx.report.dashes += this.tally.dashes
    this.ctx.report.invisible += this.tally.invisible
    for (const t of this.tally.tokens) this.ctx.report.tokens.push({ item: this.item, ...t })
  }
}

/** Runs `make` for one item: a ConvertError or a thrown reason stops the item and lands in the report. */
export function guard<T>(ctx: RunCtx, item: string, make: () => T): T | undefined {
  try {
    return make()
  } catch (err) {
    if (err instanceof ConvertError || err instanceof ItemStop) {
      ctx.report.stopped.push({ item, why: err.message })
      return undefined
    }
    throw err
  }
}

/** A reason to stop one item that is not a converter error. */
export class ItemStop extends Error {}

/** Validates an entry with its collection's schema; an invalid entry stops with the schema's issues. */
export function validate(ctx: RunCtx, entry: Entry): Entry {
  const r = ctx.schemas[entry.collection].safeParse(entry.data)
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    throw new ItemStop(`not valid for the ${entry.collection} schema: ${issues}`)
  }
  return entry
}

/** Drops keys whose value is undefined, keeping the order of the rest (schema order). */
export function compact<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v
  return out as T
}
