// Writes the emit result: site/.generated/public and site/.generated/data are replaced as a whole, so a file of an
// entry that left the catalog never lingers.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import type { FileMap } from './types.ts'

function safeJoin(root: string, rel: string): string {
  const out = resolve(root, rel)
  if (rel.startsWith('/') || rel.split('/').includes('..') || !(out === root || out.startsWith(root + sep)))
    throw new Error(`emit: refusing to write outside ${root}: ${rel}`)
  return out
}

export function writeFiles(root: string, files: FileMap): void {
  const abs = resolve(root)
  rmSync(abs, { recursive: true, force: true })
  mkdirSync(abs, { recursive: true })
  for (const [rel, content] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    const file = safeJoin(abs, rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }
}

/** Writes `public/` and `data/` under the generated folder. */
export function writeEmit(generated: string, result: { public: FileMap; site: FileMap }): void {
  writeFiles(join(generated, 'public'), result.public)
  writeFiles(join(generated, 'data'), result.site)
}
