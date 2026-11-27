// The words of the landing template (www/content/landing-template.yaml, Strapi CMS spec Step 1.1b), read once for the
// landing parser and its text cross-check: the importer must find the same words the site prints around the data.
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import {
  landingTemplateEntries,
  type LandingLocale,
  type LandingTemplateText,
  type WwwCollection,
} from '../schema/www-content.ts'

const FILE = new URL('../../www/content/landing-template.yaml', import.meta.url)
let entries: Record<LandingLocale, LandingTemplateText> | undefined

/** The template words of a locale, from the content file of this checkout. */
export function landingTemplateText(locale: LandingLocale): LandingTemplateText {
  entries ??= landingTemplateEntries(parse(readFileSync(FILE, 'utf8')))
  return entries[locale]
}

/** Collections of www/content that Webflow does not hold: the importer never writes them, and --only refuses them. */
export const NOT_IMPORTED: ReadonlySet<WwwCollection> = new Set(['landingTemplate'])
