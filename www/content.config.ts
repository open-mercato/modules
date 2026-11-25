// Content collections of the main site (spec, Data Model): one per entry of WWW_SOURCES, validated by the schemas of
// lib/schema/www-content.ts with Astro's reference() for references, so a missing field or a reference to an id that
// does not exist fails `yarn build`. Astro reads src/content.config.ts, which re-exports this file. A collection whose
// folder or file does not exist yet is empty: content arrives with the importer (Phase 2 and later).
// Before any collection loads, the file names of the one-file-per-entry collections must be slugs (an entry's id is
// its file name, kept exactly, D3) and `pages` and `landings` must share the root namespace without a collision or a
// reserved first segment (routeNamespaceProblems); either stops the build, and `astro check` with it.
import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineCollection, reference } from 'astro:content'
import { file, glob } from 'astro/loaders'
import { parse } from 'yaml'
import {
  entryFileProblems,
  fileEntries,
  routeNamespaceProblems,
  WWW_COLLECTIONS,
  WWW_SOURCES,
  wwwSchemas,
  type WwwCollection,
} from '../lib/schema/www-content.ts'

const content = fileURLToPath(new URL('./content/', import.meta.url))

/** File names of a one-file-per-entry collection; none while its folder does not exist. */
function entryFiles(name: WwwCollection): string[] {
  const s = WWW_SOURCES[name]
  if (s.kind !== 'entries' || !existsSync(`${content}${s.dir}`)) return []
  return readdirSync(`${content}${s.dir}`).sort()
}

const ids = (name: WwwCollection): string[] =>
  entryFiles(name)
    .filter((f) => !f.startsWith('.'))
    .map((f) => f.replace(/\.[^.]+$/, ''))

const problems = [
  ...WWW_COLLECTIONS.flatMap((name) =>
    WWW_SOURCES[name].kind === 'entries' ? entryFileProblems(name, entryFiles(name)) : [],
  ),
  ...routeNamespaceProblems(ids('pages'), ids('landings')),
]
if (problems.length > 0) throw new Error(`www/content:\n${problems.map((p) => `  ${p}`).join('\n')}`)

const schemas = wwwSchemas((c) => reference(c as never))

/** The loader of a collection: a glob over its folder, or its one file; nothing while neither exists. */
function loaderOf(name: WwwCollection) {
  const s = WWW_SOURCES[name]
  if (s.kind === 'entries') {
    if (!existsSync(`${content}${s.dir}`)) return () => []
    // the id is the file name as it is (checked above), never a slugified form of it
    return glob({
      base: `${content}${s.dir}`,
      pattern: `*.${s.ext}`,
      generateId: ({ entry }) => entry.replace(/\.[^.]+$/, ''),
    })
  }
  const path = `${content}${s.file}`
  if (!existsSync(path)) return () => []
  return file(path, { parser: (text) => fileEntries(name, parse(text)) })
}

export const collections = Object.fromEntries(
  WWW_COLLECTIONS.map((name) => [name, defineCollection({ loader: loaderOf(name), schema: schemas[name] })]),
)
