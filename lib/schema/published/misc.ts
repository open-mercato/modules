// Smaller published files of spec 4.6 and 8.3: /changes.json, /allowlist.json, badge endpoint,
// /.well-known/agent-skills/index.json and /.well-known/mcp/server-card.json.
import { z } from 'zod'
import { IsoDateTime, Locator } from '../common.ts'
import { Change } from '../data/changes.ts'

/** /changes.json: changes of the last 90 days. */
export const ChangesFile = z.array(Change)

/** /allowlist.json: active, tier >= listed, agentPolicy on latest != refuse. */
export const Allowlist = z.object({ schemaVersion: z.literal(1), generatedAt: IsoDateTime, locators: z.array(Locator) })

/** /badge/<locpath>.json: shields.io endpoint. */
export const ShieldsBadge = z.object({
  schemaVersion: z.literal(1),
  label: z.string(),
  message: z.string(),
  color: z.string().regex(/^[0-9A-Fa-f]{6}$/),
  labelColor: z
    .string()
    .regex(/^[0-9A-Fa-f]{6}$/)
    .optional(),
})

export const AgentSkillsIndex = z.object({
  $schema: z.literal('https://schemas.agentskills.io/discovery/0.2.0/schema.json'),
  skills: z.array(
    z.object({
      name: z.string(),
      type: z.literal('skill-md'),
      description: z.string().max(1024),
      url: z.string().url(),
      digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    }),
  ),
})

export const McpServerCard = z.object({
  serverInfo: z.object({ name: z.literal('om-modules'), title: z.string(), version: z.string() }),
  transport: z.object({ type: z.literal('streamable-http'), url: z.string().url() }),
  authentication: z.object({ required: z.boolean() }),
  tools: z.array(z.object({ name: z.string(), description: z.string() })),
  resources: z.array(z.object({ uri: z.string() })),
})
