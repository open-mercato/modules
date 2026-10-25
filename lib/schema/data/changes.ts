// data/changes/<yyyy-mm>.jsonl (spec 4.5); also /changes.json and get_changes.
import { z } from 'zod'
import { IsoDateTime, LineKey, Locator, SemVer } from '../common.ts'

export const Change = z
  .object({
    at: IsoDateTime,
    type: z.enum([
      'new-entry',
      'new-version',
      'receipt-transition',
      'tier-change',
      'status-change',
      'quality-granted',
      'quality-revoked',
    ]),
    locator: Locator,
    line: LineKey.optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    version: SemVer.optional(),
    // additive (24 Oct): why a level or status changed when it was not the module. `preset-model`: the switch of the
    // main verdict from the empty preset to a new app (classic) on 24 Oct; /changes.json and /feed.xml leave it out
    reason: z
      .enum(['preset-model'])
      .optional()
      .describe(
        'Why the change happened when the module did not change. preset-model: the main verdict moved from receipts of the empty preset to receipts of a new app (classic) on 24 Oct; left out of /changes.json and /feed.xml.',
      ),
  })
  .strict()

export type Change = z.infer<typeof Change>
