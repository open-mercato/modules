// Content collections of the main site (spec, Data Model): one per entry of WWW_SOURCES, validated by the schemas of
// lib/schema/www-content.ts with Astro's reference() for references, so a missing field or a reference to an id that
// does not exist fails `yarn build`. Astro reads src/content.config.ts, which re-exports this file. A collection whose
// folder or file does not exist yet is empty: content arrives with the importer (Phase 2 and later).
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineCollection, reference } from 'astro:content'
import { file, glob } from 'astro/loaders'
import { parse } from 'yaml'
import { WWW_COLLECTIONS, WWW_SOURCES, wwwSchemas, type WwwCollection } from '../lib/schema/www-content.ts'

const content = new URL('./content/', import.meta.url)
const contentDir = fileURLToPath(content)

const schemas = wwwSchemas((c) => reference(c as never))

/** The loader of a collection: a glob over its folder, or its one file; nothing while neither exists. */
function loaderOf(name: WwwCollection) {
  const s = WWW_SOURCES[name]
  if (s.kind === 'entries') {
    if (!existsSync(fileURLToPath(new URL(`${s.dir}/`, content)))) return () => []
    return glob({ base: `${contentDir}${s.dir}`, pattern: `*.${s.ext}` })
  }
  const path = fileURLToPath(new URL(s.file, content))
  if (!existsSync(path)) return () => []
  // redirects.yaml is a list of rules: each is keyed by its `from` path, and a path given twice stops the build
  if (name === 'redirects')
    return file(path, {
      parser: (text) => {
        const rules: Record<string, Record<string, unknown>> = {}
        for (const rule of parse(text) as { from: string }[]) {
          if (rule.from in rules) throw new Error(`redirects.yaml: ${rule.from} is given twice`)
          rules[rule.from] = rule
        }
        return rules
      },
    })
  return file(path)
}

export const collections = Object.fromEntries(
  WWW_COLLECTIONS.map((name) => [name, defineCollection({ loader: loaderOf(name), schema: schemas[name] })]),
)
