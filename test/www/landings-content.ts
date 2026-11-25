// The landing entries of www/content/ as the build sees them: each file through the schema of lib/schema/www-content.ts.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { landingSchema } from '../../lib/schema/www-content.ts'
import type { LandingEntry } from '../../www/src/lib/landings.ts'
import { CONTENT } from './blog-content.ts'

export function landingEntries(): LandingEntry[] {
  const dir = join(CONTENT, 'landings')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .map((f) => ({
      id: f.slice(0, -5),
      data: landingSchema().parse(parse(readFileSync(join(dir, f), 'utf8'))) as LandingEntry['data'],
    }))
}
