// The values of the count tokens of this build (spec A6, Build and deploy): `{moduleCount}` from the catalog's
// modules.json of the same run (site/.generated/public/, written by `yarn om emit` before the catalog's Astro build;
// `yarn build` builds the catalog first). `{githubStars}` has no source in the data branch yet (the sync gains the
// field for open-mercato/open-mercato in its own change), so it prints no number and the header's star script fills
// the badge in the browser. A build without the catalog's output prints no count at all: never a typed number.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { coreVersionOf, moduleCountOf, type CountValues } from '../../../lib/core/www-tokens.ts'

const MODULES_JSON = fileURLToPath(new URL('../../../site/.generated/public/modules.json', import.meta.url))

let cached: CountValues | undefined

export function countValues(): CountValues {
  if (cached) return cached
  const values: CountValues = {}
  if (existsSync(MODULES_JSON)) {
    const n = moduleCountOf(JSON.parse(readFileSync(MODULES_JSON, 'utf8')))
    if (n !== undefined) values.moduleCount = n
  }
  cached = values
  return values
}

/** The core version of the catalog's modules.json of this build (coreVersionOf), or undefined without the file. */
export function coreVersion(): string | undefined {
  return existsSync(MODULES_JSON) ? coreVersionOf(JSON.parse(readFileSync(MODULES_JSON, 'utf8'))) : undefined
}
