// /about, Sources and rhythm (live review of 30 Oct, item 10): the page said `daily at 02:17 UTC` and `every 6 hours at
// minute 17`, and the data stamps under it read 09:17 and 05:55. GitHub starts a scheduled run late when it is busy,
// may drop one, and the workflows also run by hand and (watch) on a push to main. The page now calls the times
// schedules, names the push trigger the workflow file has, and says why the data times can differ.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SCHEDULE_CAVEAT, workflowWhen } from '../../site/src/lib/schedule.ts'
import { findBannedChars } from '../../lib/core/text.ts'
import { ROOT } from '../emit/helpers.ts'

const wf = (f: string): string => readFileSync(join(ROOT, '.github', 'workflows', f), 'utf8')
const about = readFileSync(join(ROOT, 'site', 'src', 'pages', 'about.astro'), 'utf8')

describe('the schedule on /about', () => {
  it('reads each workflow file: the cron as a schedule, and the push trigger where there is one', () => {
    expect(workflowWhen(wf('watch.yml'))).toBe('scheduled every 6 hours at minute 17, and after a push to main')
    expect(workflowWhen(wf('nightly.yml'))).toBe('scheduled daily at 02:17 UTC')
    expect(workflowWhen(wf('sync.yml'))).toBe('scheduled every Monday at 04:17 UTC')
    expect(workflowWhen('on:\n  workflow_dispatch:\n')).toBeNull()
  })

  it('says why the data times can differ from the schedules', () => {
    expect(SCHEDULE_CAVEAT).toBe(
      'These are the schedules of the GitHub workflows. GitHub can start a scheduled run late or skip it when busy, and a run can also be started by hand, so the data times below can differ from them.',
    )
    expect(findBannedChars(SCHEDULE_CAVEAT)).toEqual([])
    expect(about).toContain('{SCHEDULE_CAVEAT}')
    // one reading of the workflow files: the page keeps no copy of its own
    expect(about).not.toMatch(/function cron(?:Of|Text)\(/)
    for (const f of ['watch.yml', 'sync.yml', 'nightly.yml']) expect(about).toContain(`workflowWhenOf('${f}')`)
  })
})
