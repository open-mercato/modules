// data/health/<locpath>.json (spec 4.5); Policy is the agentPolicy decision (spec 6.5).
import { z } from 'zod'
import {
  CellStatus,
  IsoDate,
  IsoDateTime,
  LicenseKind,
  LineKey,
  Locator,
  OriginType,
  SemVer,
  StableSemVer,
} from '../common.ts'
import { FitStatus } from './fit.ts'

export const Policy = z
  .object({
    decision: z.enum(['allow', 'ask', 'refuse']),
    reasons: z.array(z.object({ code: z.string(), text: z.string().max(160) }).strict()).max(10),
    until: IsoDate.optional(),
    consentText: z.string().max(160).optional(),
  })
  .strict()

export const Signals = z
  .object({
    receipt: z.record(LineKey, CellStatus),
    fit: z.record(LineKey, FitStatus),
    anatomy: z.enum(['full', 'partial', 'hidden', 'none']),
    supplyChain: z
      .object({ status: z.enum(['ok', 'warn', 'fail']), reasons: z.array(z.string().max(160)).max(10) })
      .strict(),
    hygiene: z.object({ status: z.enum(['ok', 'warn', 'fail']), failing: z.array(z.string()).max(30) }).strict(),
    maintenance: z
      .object({
        status: z.enum(['current', 'behind', 'stale', 'archived', 'deprecated']),
        lastRelease: IsoDate.nullable(),
        catchUpDays: z.number().int().nullable(),
      })
      .strict(),
    declaredVsObserved: z
      .object({ status: z.enum(['match', 'mismatch']), notes: z.array(z.string().max(160)).max(10) })
      .strict(),
  })
  .strict()

export const Health = z
  .object({
    locator: Locator,
    version: SemVer.nullable(),
    computedAt: IsoDateTime,
    identity: z
      .object({
        type: OriginType,
        typeReason: z.string(),
        enterprise: z.boolean(),
        license: z.object({ spdx: z.string().nullable(), kind: LicenseKind, mismatch: z.boolean() }).strict(),
        builtFrom: z
          .object({
            status: z.enum(['verified', 'none', 'lost']),
            repo: z.string().nullable(),
            commit: z.string().nullable(),
            workflow: z.string().nullable(),
          })
          .strict(),
        claimed: z
          .object({
            value: z.boolean(),
            by: z.string().nullable(),
            method: z.enum(['provenance', 'repo-owner', 'org-member']).nullable(),
            pr: z.number().int().nullable(),
          })
          .strict(),
        source: z.enum(['npm', 'github']),
      })
      .strict(),
    signals: Signals,
    rules: z.array(
      z.object({ id: z.string().regex(/^(LST|VER)-\d$/), pass: z.boolean(), detail: z.string().max(200) }).strict(),
    ),
    tier: z.enum(['listed', 'verified']).nullable(), // null: fails LST or status hold/delisted
    quality: z
      .object({
        version: StableSemVer,
        integrity: z.string(),
        reviewedAt: IsoDate,
        until: IsoDate,
        report: z.string().url(),
        reviewers: z.array(z.string()).min(2),
      })
      .strict()
      .nullable(),
    agentPolicy: z.record(LineKey, Policy),
    state: z.enum(['active', 'hold', 'unmaintained', 'delisted', 'deprecated', 'archived', 'stale']),
    // additive (spec 4.7), written by `yarn om health`: D46 `recommended` per line (spec 5.4) and the version each
    // line was judged on (orchestrator decision E5: recommended, else the newest stable that fits the line)
    recommended: z.record(LineKey, SemVer.nullable()).optional(),
    evaluated: z.record(LineKey, SemVer.nullable()).optional(),
    // additive (24 Oct): the starter preset whose receipts gave this level and policy. Absent: written before the
    // decision of 24 Oct, from receipts of an app from the empty preset; a level change against such a file is the change
    // of the test model, not of the module (`Change.reason: preset-model`)
    verdictPreset: z
      .literal('classic')
      .optional()
      .describe(
        'The starter preset whose receipts gave the level and the policy (classic: a new app). Absent: computed before 24 Oct from receipts of the empty preset.',
      ),
  })
  .strict()

export type Policy = z.infer<typeof Policy>
export type Signals = z.infer<typeof Signals>
export type Health = z.infer<typeof Health>
