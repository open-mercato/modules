// The build command of the site (live review of 30 Oct, item 4): the 404 page and the empty search gave
// `npx create-mercato-module init`, which create-mercato-module 0.5.1 rejects (`init` without a name throws `Use a
// module name in snake_case, for example customer_visits.`), and the home page gave the bare command, which only
// prints the help. One constant now: `init` with a placeholder name that passes the tool's own check.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUILD_MODULE_COMMAND, BUILD_MODULE_HINT, BUILD_MODULE_NAME } from '../../site/src/lib/build-module.ts'
import { findBannedChars } from '../../lib/core/text.ts'
import { ROOT } from '../emit/helpers.ts'

const SITE = join(ROOT, 'site', 'src')
/** The module-name check of create-mercato-module 0.5.1 (dist/common.js validateId). */
const VALID_ID = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/

function files(dir = SITE): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return files(p)
    return /\.(astro|tsx?)$/.test(n) ? [p] : []
  })
}

describe('build your own module', () => {
  it('is `init` with a snake_case placeholder name the tool accepts', () => {
    expect(BUILD_MODULE_COMMAND).toBe(`npx create-mercato-module init ${BUILD_MODULE_NAME}`)
    expect(BUILD_MODULE_NAME).toMatch(VALID_ID)
    expect(BUILD_MODULE_NAME).toBe('my_module')
    // the hint says the name is a placeholder
    expect(BUILD_MODULE_HINT).toBe('Replace my_module with your module name in snake_case.')
    expect(findBannedChars(BUILD_MODULE_HINT)).toEqual([])
  })

  it('no page, island or component types the command by hand', () => {
    const typed = files()
      .filter((f) => !f.endsWith(join('lib', 'build-module.ts')))
      .filter((f) => /create-mercato-module init\b|command="npx create-mercato-module"/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SITE, f))
    expect(typed).toEqual([])
  })

  it('the 404 page, the home page, the empty search and the agent pane use the constant', () => {
    for (const f of [
      'pages/404.astro',
      'components/catalog/HowToAdd.astro',
      'islands/Registry.tsx',
      'islands/AgentPane.tsx',
    ])
      expect(readFileSync(join(SITE, f), 'utf8'), f).toContain('BUILD_MODULE_COMMAND')
  })
})
