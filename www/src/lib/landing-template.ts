// The words of the landing template in a landing's language: the entry of the `landingTemplate` collection
// (www/content/landing-template.yaml, Strapi CMS spec Step 1.1b) whose id is the locale. A locale without its entry
// stops the build.
import { getEntry } from 'astro:content'
import type { LandingLocale, LandingTemplateText } from '../../../lib/schema/www-content.ts'

export async function templateText(locale: LandingLocale): Promise<LandingTemplateText> {
  const entry = await getEntry('landingTemplate', locale)
  if (!entry) throw new Error(`www/content/landing-template.yaml: no entry for the locale ${locale}`)
  return entry.data as LandingTemplateText
}
