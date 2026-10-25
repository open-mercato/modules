import { z } from 'zod'
import { IsoDateTime, NpmName } from '../common.ts'

/** `data/official-coverage.json`: official packages that have no catalog entry yet (spec 4.6 officialCoverage). */
export const OfficialCoverageFile = z
  .object({
    at: IsoDateTime,
    listed: z.number().int(),
    missing: z.array(NpmName).max(50),
    /** Every official package considered (after ignore.yml and built-in sources). */
    packages: z.array(NpmName),
  })
  .strict()
export type OfficialCoverage = z.output<typeof OfficialCoverageFile>
