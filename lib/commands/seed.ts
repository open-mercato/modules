// `yarn om seed --from <i4.json>`: writes the starting descriptors (spec 11.1), policy/ignore.yml (11.3, 11.4)
// and policy/builtin-categories.yml (4.4). One-off (WP03): later changes to these files go through PRs.
// `--check` writes nothing: it compares the files on disk with what seed would write and validates them
// (Descriptor schema, path = locator, Prettier format), so the seed table and the files cannot drift.
//
// The texts below are written from each package's README and source (published tarball or monorepo),
// not from guesses. The i4 inventory is the cross-check: every entry must exist there, and type or
// repository differences are reported.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { Document, Scalar, isMap, isScalar, isSeq, parse } from 'yaml'
import * as prettier from 'prettier'
import type { CommandContext } from '../cli.ts'
import { EXIT_ENV, EXIT_OK, EXIT_VALIDATION } from '../cli.ts'
import type { CategoryId as CategoryIdType, DescriptorInput, IgnoreFile as IgnoreFileType } from '../schema/index.ts'
import {
  BuiltinCategoriesFile,
  DESCRIPTOR_KEY_ORDER,
  Descriptor,
  IgnoreFile,
  assertPathMatches,
  descriptorFile,
  descriptorLocator,
} from '../schema/index.ts'

export const description = 'write descriptors and policy maps from the i4 inventory (once)'

/** Expected origin type from spec 11.1 (sync computes the real one, 6.1; D-OPEN-6 = no). */
export type ExpectedType = 'official' | 'community' | '3rd-party'

export interface SeedEntry {
  /** Row number in spec 11.1. */
  no: number
  type: ExpectedType
  /** Optional YAML comment above the first key (why a field is missing). */
  note?: string
  d: DescriptorInput
}

const DOCS = 'https://docs.openmercato.com'
const mono = (pkg: string): string => `open-mercato/open-mercato#main/packages/${pkg}`
const WEB_RESEARCH_DOCS = `${DOCS}/framework/ai-assistant/web-research`

/** Spec 11.1: 59 descriptors. Order = table order. */
export const SEED: readonly SeedEntry[] = [
  {
    no: 1,
    type: 'official',
    d: {
      npm: '@open-mercato/ai-assistant',
      repo: mono('ai-assistant'),
      category: 'ai-automation',
      tags: ['ai', 'mcp', 'chat', 'agents'],
      summary:
        'Chat panel on Cmd+J, an MCP server over the platform API and typed AI agents whose writes wait for approval.',
      whenToUse:
        'Use when staff should search and change app data in plain language, or an external AI agent needs MCP access to the app.',
      whenNotToUse: 'Skip it when app data must not reach an external LLM provider.',
      providers: [
        { name: 'anthropic', label: 'Anthropic' },
        { name: 'openai', label: 'OpenAI' },
        { name: 'google', label: 'Google' },
      ],
      links: { docs: `${DOCS}/framework/ai-assistant/overview` },
    },
  },
  {
    no: 2,
    type: 'official',
    d: {
      npm: '@open-mercato/channel-apns',
      repo: mono('channel-apns'),
      category: 'communication',
      tags: ['push', 'ios', 'mobile'],
      summary:
        'Sends push notifications to iOS apps through Apple Push Notification service with token-based .p8 auth.',
      whenToUse:
        'Use when the app must push order or account updates to your own iOS app and you have an APNs key, Team ID and bundle ID.',
      whenNotToUse: 'For apps built with Expo use channel-expo. For Android devices use channel-fcm.',
      providers: [{ name: 'apns', label: 'Apple Push Notification service' }],
      links: { docs: `${DOCS}/framework/modules/push-notifications` },
    },
  },
  {
    no: 3,
    type: 'official',
    d: {
      npm: '@open-mercato/channel-discord',
      repo: mono('channel-discord'),
      category: 'communication',
      tags: ['discord', 'chat', 'bot'],
      summary:
        'Two-way Discord bot channel: REST outbound, real-time Gateway inbound, slash commands and optional AI auto-reply.',
      whenToUse:
        "Use when customers or staff talk to the business in a Discord server and those threads belong in the app's communication channels.",
      providers: [{ name: 'discord', label: 'Discord' }],
      links: { docs: `${DOCS}/user-guide/communication-channels-discord` },
    },
  },
  {
    no: 4,
    type: 'official',
    d: {
      npm: '@open-mercato/channel-expo',
      repo: mono('channel-expo'),
      category: 'communication',
      tags: ['push', 'expo', 'mobile'],
      summary: 'Sends push notifications to Expo apps through the Expo push service, with an optional access token.',
      whenToUse: 'Use when your mobile app is built with Expo and order or account updates should reach users as push.',
      whenNotToUse: 'For native iOS or Android apps without Expo use channel-apns or channel-fcm.',
      providers: [{ name: 'expo', label: 'Expo' }],
      links: { docs: `${DOCS}/framework/modules/push-notifications` },
    },
  },
  {
    no: 5,
    type: 'official',
    d: {
      npm: '@open-mercato/channel-fcm',
      repo: mono('channel-fcm'),
      category: 'communication',
      tags: ['push', 'android', 'firebase', 'mobile'],
      summary: 'Sends push notifications to Android and iOS devices through Firebase Cloud Messaging HTTP v1.',
      whenToUse: 'Use when your mobile app already uses Firebase and you can provide a service account JSON for FCM.',
      whenNotToUse: 'For apps built with Expo use channel-expo.',
      providers: [{ name: 'fcm', label: 'Firebase Cloud Messaging' }],
      links: { docs: `${DOCS}/framework/modules/push-notifications` },
    },
  },
  {
    no: 6,
    type: 'official',
    d: {
      npm: '@open-mercato/channel-gmail',
      repo: mono('channel-gmail'),
      category: 'communication',
      tags: ['email', 'gmail', 'oauth'],
      summary:
        'Connects each user Gmail account over OAuth2: sends through the Gmail API and pulls replies with History API polling.',
      whenToUse:
        'Use when sales or support staff work from Google Workspace mailboxes and their email threads should appear in the app.',
      whenNotToUse:
        'For other mail servers use channel-imap. For transactional sending only use channel-resend or channel-ses.',
      providers: [{ name: 'gmail', label: 'Gmail' }],
      links: { docs: `${DOCS}/user-guide/communication-channels-gmail` },
    },
  },
  {
    no: 7,
    type: 'official',
    d: {
      npm: '@open-mercato/channel-imap',
      repo: mono('channel-imap'),
      category: 'communication',
      tags: ['email', 'imap', 'smtp'],
      summary: 'Connects any mailbox over IMAP for inbound polling and SMTP for outbound mail.',
      whenToUse:
        'Use when staff mailboxes live on a provider without a dedicated channel and the server offers IMAP and SMTP access.',
      whenNotToUse:
        'For Google Workspace mailboxes use channel-gmail, which signs in with OAuth2 instead of a stored password.',
      providers: [{ name: 'imap', label: 'IMAP and SMTP' }],
      links: { docs: `${DOCS}/user-guide/communication-channels-imap` },
    },
  },
  {
    no: 8,
    type: 'official',
    d: {
      npm: '@open-mercato/channel-resend',
      repo: mono('channel-resend'),
      category: 'communication',
      tags: ['email', 'transactional'],
      summary: 'Sends transactional email through the Resend API from a configured from address. Outbound only.',
      whenToUse:
        'Use when the app sends receipts, notifications or other transactional email and you have a Resend account.',
      whenNotToUse: 'It does not receive mail. For two-way mailboxes use channel-gmail or channel-imap.',
      providers: [{ name: 'resend', label: 'Resend' }],
      links: { docs: `${DOCS}/user-guide/communication-channels` },
    },
  },
  {
    no: 9,
    type: 'official',
    d: {
      npm: '@open-mercato/channel-ses',
      repo: mono('channel-ses'),
      category: 'communication',
      tags: ['email', 'transactional', 'aws'],
      summary:
        'Sends transactional email through Amazon SES v2 with a region, from address and optional configuration set.',
      whenToUse:
        'Use when the app sends transactional email and your infrastructure already runs on AWS with a verified SES identity.',
      whenNotToUse: 'It does not receive mail. For two-way mailboxes use channel-gmail or channel-imap.',
      providers: [{ name: 'ses', label: 'Amazon SES' }],
      links: { docs: `${DOCS}/user-guide/communication-channels` },
    },
  },
  {
    no: 10,
    type: 'official',
    d: {
      npm: '@open-mercato/checkout',
      repo: mono('checkout'),
      category: 'orders-checkout',
      tags: ['pay-links', 'payments', 'checkout'],
      summary:
        'Pay links with fixed, custom or price-list amounts, reusable templates and public pay pages with password and usage limits.',
      whenToUse:
        'Use when you collect one-off payments such as deposits, workshop fees or tickets without a storefront or a sales document.',
      whenNotToUse: 'It takes no money on its own: pair it with a payment gateway such as gateway-stripe.',
      links: { docs: `${DOCS}/user-guide/checkout` },
    },
  },
  {
    no: 11,
    type: 'official',
    d: {
      npm: '@open-mercato/content',
      repo: mono('content'),
      category: 'content-portal',
      tags: ['legal', 'pages'],
      summary:
        'Adds public terms of service and privacy policy pages to the app, rendered from code in the app layout.',
      whenToUse:
        'Use when the app needs public terms and privacy pages and their text can live in code next to the app.',
      whenNotToUse: 'It is not a CMS: the admin panel has no page editor.',
    },
  },
  {
    no: 12,
    type: 'official',
    d: {
      npm: '@open-mercato/documents',
      repo: mono('documents'),
      category: 'content-portal',
      tags: ['documents', 'collaboration', 'editor'],
      summary:
        'Internal rich-text documents that staff co-edit in real time, with folders, sharing roles, comments, versions and export.',
      whenToUse:
        'Use when teams write proposals, procedures or notes inside the app and export them to .docx or PDF, instead of a separate wiki.',
      whenNotToUse:
        'Real-time co-editing needs a separate WebSocket sidecar process; without it one person edits at a time.',
    },
  },
  {
    no: 13,
    type: 'official',
    note: 'Enterprise: one entry, license.kind enterprise, anatomy hidden, nightly install skipped (spec 11.4).',
    d: {
      npm: '@open-mercato/enterprise',
      repo: mono('enterprise'),
      category: 'auth-security',
      tags: ['sso', 'mfa', 'record-locks', 'enterprise'],
      summary:
        'Commercial modules: SSO with directory sync, MFA and sudo, record locks, agent orchestrator and status overlays.',
      whenToUse:
        'Use when a production app needs SSO, multi-factor auth or record locking and the company holds an Open Mercato Enterprise subscription.',
      whenNotToUse: 'Not open source: the license is per project, with tiers set by company revenue.',
      links: { docs: `${DOCS}/enterprise/overview` },
      pricing: 'contact',
      enterprise: {
        offerUrl: 'https://www.openmercato.com/enterprise-level-support',
        modules: ['agent_orchestrator', 'record_locks', 'security', 'sso', 'system_status_overlays'],
      },
    },
  },
  {
    no: 14,
    type: 'official',
    note: 'In the empty preset of 0.9.0: the nightly add step is yarn add without registration (D10).',
    d: {
      npm: '@open-mercato/events',
      repo: mono('events'),
      category: 'storage-infrastructure',
      tags: ['events', 'subscribers', 'queue'],
      summary: 'Event bus with module subscribers, inline or persistent delivery and a queue worker for async events.',
      whenToUse:
        "Use when modules must react to each other's domain events, with retries for persistent ones. New apps already enable it.",
      links: { docs: `${DOCS}/framework/events/overview` },
    },
  },
  {
    no: 15,
    type: 'official',
    d: {
      npm: '@open-mercato/gateway-stripe',
      repo: mono('gateway-stripe'),
      category: 'payments-finance',
      tags: ['payments', 'cards'],
      summary:
        'Card, Apple Pay, Google Pay and bank transfer payments through Stripe for checkout and sales documents.',
      whenToUse:
        'Use when the app takes card or wallet payments in any currency and you already have a Stripe account.',
      whenNotToUse: 'For PLN bank transfers and BLIK use gateway-tpay.',
      providers: [{ name: 'stripe', label: 'Stripe' }],
      links: { docs: `${DOCS}/user-guide/stripe-payments` },
    },
  },
  {
    no: 16,
    type: 'official',
    note: 'No stable release yet (latest is a develop build): preview, nightly on next only (spec 11.4).',
    d: {
      npm: '@open-mercato/gateway-tpay',
      repo: mono('gateway-tpay'),
      category: 'payments-finance',
      tags: ['payments', 'blik', 'poland'],
      summary:
        'PLN payments on the Tpay hosted page: online transfers, BLIK and other methods enabled on your Tpay account.',
      whenToUse: 'Use when Polish customers pay in PLN by bank transfer or BLIK and you have a Tpay merchant account.',
      whenNotToUse: 'For card payments in other currencies use gateway-stripe.',
      providers: [{ name: 'tpay', label: 'Tpay' }],
      links: { docs: `${DOCS}/user-guide/tpay-payments` },
    },
  },
  {
    no: 17,
    type: 'official',
    d: {
      npm: '@open-mercato/onboarding',
      repo: mono('onboarding'),
      category: 'content-portal',
      tags: ['onboarding', 'signup', 'tenants'],
      summary:
        'Self-service sign-up: email verification, then a new tenant, organization and admin account with demo CRM data.',
      whenToUse:
        'Use when visitors of a demo, sandbox or pilot program should create their own tenant without an operator.',
      whenNotToUse:
        'Off by default and not meant for most production apps: everyone who signs up gets an admin account.',
      links: { docs: `${DOCS}/user-guide/self-service-onboarding` },
    },
  },
  {
    no: 18,
    type: 'official',
    d: {
      npm: '@open-mercato/scheduler',
      repo: mono('scheduler'),
      category: 'storage-infrastructure',
      tags: ['cron', 'jobs', 'scheduling'],
      summary: 'Database-managed scheduled jobs with cron or interval timing, time zones, run history and an admin UI.',
      whenToUse:
        'Use when the app must run commands or enqueue queue jobs on a schedule that admins can change without a deploy.',
      links: { docs: `${DOCS}/framework/scheduler/overview` },
    },
  },
  {
    no: 19,
    type: 'official',
    note: 'In the empty preset of 0.9.0 like events. The author field in index.ts is ignored (spec 11.1).',
    d: {
      npm: '@open-mercato/search',
      repo: mono('search'),
      category: 'search-analytics',
      tags: ['search', 'fulltext', 'vector'],
      summary:
        'Hybrid search that fuses fulltext (Meilisearch), vector and token strategies with Reciprocal Rank Fusion.',
      whenToUse:
        'Use when users need global search across records and AI agents need a search tool. New apps already enable it.',
      providers: [{ name: 'meilisearch', label: 'Meilisearch' }],
      links: { docs: `${DOCS}/framework/database/hybrid-search` },
    },
  },
  {
    no: 20,
    type: 'official',
    d: {
      npm: '@open-mercato/storage-s3',
      repo: mono('storage-s3'),
      category: 'storage-infrastructure',
      tags: ['s3', 'files', 'attachments'],
      summary:
        'Stores attachments in Amazon S3 or an S3-compatible store such as DigitalOcean Spaces, MinIO, Cloudflare R2 or B2.',
      whenToUse:
        'Use when uploaded files must live in object storage instead of the app server disk, for example with several app instances.',
      providers: [
        { name: 'aws-s3', label: 'Amazon S3' },
        { name: 'digitalocean-spaces', label: 'DigitalOcean Spaces' },
        { name: 'minio', label: 'MinIO' },
        { name: 'cloudflare-r2', label: 'Cloudflare R2' },
        { name: 'backblaze-b2', label: 'Backblaze B2' },
      ],
      links: { docs: `${DOCS}/user-guide/storage-hub` },
    },
  },
  {
    no: 21,
    type: 'official',
    d: {
      npm: '@open-mercato/sync-akeneo',
      repo: mono('sync-akeneo'),
      category: 'integrations-sync',
      tags: ['pim', 'products', 'import'],
      summary:
        'Imports categories, product attributes and products from Akeneo PIM into the catalog, on demand or on a schedule.',
      whenToUse: 'Use when product data is mastered in Akeneo PIM and the app catalog must follow it.',
      whenNotToUse: 'Import only: changes made in Open Mercato do not go back to Akeneo.',
      providers: [{ name: 'akeneo', label: 'Akeneo PIM' }],
      links: { docs: `${DOCS}/user-guide/akeneo-pim` },
    },
  },
  {
    no: 22,
    type: 'official',
    d: {
      npm: '@open-mercato/telemetry',
      repo: mono('telemetry'),
      category: 'storage-infrastructure',
      tags: ['opentelemetry', 'tracing', 'metrics'],
      summary:
        'Exports traces, metrics, logs and errors over OTLP/HTTP. Off by default and not loaded until TELEMETRY_BACKEND is set.',
      whenToUse:
        'Use when you run an OpenTelemetry collector or a managed OTLP backend and want app traces and errors there.',
      links: { docs: `${DOCS}/framework/runtime/telemetry` },
    },
  },
  {
    no: 23,
    type: 'official',
    d: {
      npm: '@open-mercato/tillio',
      repo: mono('tillio'),
      category: 'communication',
      tags: ['voip', 'telephony', 'calls'],
      summary:
        'Tillio VoIP bridge for the phone_calls hub: attaches a Ringostat operator and pulls its calls into the app.',
      whenToUse:
        'Use when the team phones customers through Tillio with a Ringostat operator and the calls should be logged in the app.',
      providers: [
        { name: 'tillio', label: 'Tillio' },
        { name: 'ringostat', label: 'Ringostat' },
      ],
    },
  },
  {
    no: 24,
    type: 'official',
    d: {
      npm: '@open-mercato/webhooks',
      repo: mono('webhooks'),
      category: 'integrations-sync',
      tags: ['webhooks', 'events', 'integrations'],
      summary:
        'Standard Webhooks delivery of platform events: signed payloads, retries, delivery logs, test sends and inbound receive.',
      whenToUse:
        'Use when an external system must learn about changes in the app as they happen, without polling the API.',
      links: { docs: `${DOCS}/user-guide/webhooks` },
    },
  },
  {
    no: 25,
    type: 'official',
    d: {
      npm: '@open-mercato/web-research',
      repo: mono('web-research'),
      kind: 'library',
      category: 'ai-automation',
      tags: ['web-search', 'ai', 'agents'],
      summary:
        'Engine that runs several web search adapters under one deadline, fuses their results and reports each step.',
      whenToUse:
        'Use when AI agents in the app need web search or page reading. Add at least one adapter, for example web-research-model.',
      links: { docs: WEB_RESEARCH_DOCS },
    },
  },
  {
    no: 26,
    type: 'official',
    d: {
      npm: '@open-mercato/web-research-browser',
      repo: mono('web-research-browser'),
      kind: 'provider',
      category: 'ai-automation',
      tags: ['web-search', 'playwright', 'browser'],
      summary: 'Renders blocked search pages and JavaScript-only sites in a Playwright sidecar for web-research.',
      whenToUse:
        'Use when other web-research adapters come back blocked or empty and the server may run headless Chromium.',
      whenNotToUse:
        'It downloads Chromium on first use and starts a separate process, so skip it where that is not allowed.',
      providers: [{ name: 'playwright', label: 'Playwright' }],
      extends: 'npm:@open-mercato/web-research',
      links: { docs: WEB_RESEARCH_DOCS },
    },
  },
  {
    no: 27,
    type: 'official',
    d: {
      npm: '@open-mercato/web-research-exa',
      repo: mono('web-research-exa'),
      kind: 'provider',
      category: 'ai-automation',
      tags: ['web-search', 'ai'],
      summary:
        'Exa adapter for web-research: embeddings index, native domain and date filters, and the cost of each search.',
      whenToUse: 'Use when agents need relevant passages from recent sources and you accept a per-call price from Exa.',
      providers: [{ name: 'exa', label: 'Exa' }],
      extends: 'npm:@open-mercato/web-research',
      links: { docs: WEB_RESEARCH_DOCS },
    },
  },
  {
    no: 28,
    type: 'official',
    d: {
      npm: '@open-mercato/web-research-firecrawl',
      repo: mono('web-research-firecrawl'),
      kind: 'provider',
      category: 'ai-automation',
      tags: ['web-search', 'scraping', 'ai'],
      summary: 'Firecrawl adapter for web-research that returns page content inline with each search result.',
      whenToUse: 'Use when agents must read whole pages, not just snippets, and you have a Firecrawl API key.',
      providers: [{ name: 'firecrawl', label: 'Firecrawl' }],
      extends: 'npm:@open-mercato/web-research',
      links: { docs: WEB_RESEARCH_DOCS },
    },
  },
  {
    no: 29,
    type: 'official',
    d: {
      npm: '@open-mercato/web-research-model',
      repo: mono('web-research-model'),
      kind: 'provider',
      category: 'ai-automation',
      tags: ['web-search', 'llm', 'ai'],
      summary:
        'Web search through the native search tool of the agent LLM on Anthropic, OpenAI or Azure OpenAI. On by default.',
      whenToUse:
        'Use when you want web search without another vendor or key, through the model the agent already calls.',
      providers: [
        { name: 'anthropic', label: 'Anthropic' },
        { name: 'openai', label: 'OpenAI' },
        { name: 'azure-openai', label: 'Azure OpenAI' },
      ],
      extends: 'npm:@open-mercato/web-research',
      links: { docs: WEB_RESEARCH_DOCS },
    },
  },
  {
    no: 30,
    type: 'official',
    d: {
      npm: '@open-mercato/web-research-searxng',
      repo: mono('web-research-searxng'),
      kind: 'provider',
      category: 'ai-automation',
      tags: ['web-search', 'self-hosted'],
      summary:
        'Client adapter for web-research that queries a SearXNG instance you run. The AGPL server is not bundled.',
      whenToUse: 'Use when agent searches must go through a metasearch server you control instead of a paid API.',
      providers: [{ name: 'searxng', label: 'SearXNG' }],
      extends: 'npm:@open-mercato/web-research',
      links: { docs: WEB_RESEARCH_DOCS },
    },
  },
  {
    no: 31,
    type: 'official',
    d: {
      npm: '@open-mercato/web-research-serp',
      repo: mono('web-research-serp'),
      kind: 'provider',
      category: 'ai-automation',
      tags: ['web-search', 'free'],
      summary:
        'Free web-research adapter that reads public DuckDuckGo result pages. No API key, no dependencies, off by default.',
      whenToUse:
        'Use when you need a no-cost search source and accept that result pages can block requests or change markup.',
      providers: [{ name: 'duckduckgo', label: 'DuckDuckGo' }],
      extends: 'npm:@open-mercato/web-research',
      links: { docs: WEB_RESEARCH_DOCS },
    },
  },
  {
    no: 32,
    type: 'official',
    d: {
      npm: '@open-mercato/web-research-tavily',
      repo: mono('web-research-tavily'),
      kind: 'provider',
      category: 'ai-automation',
      tags: ['web-search', 'ai'],
      summary: 'Tavily adapter for web-research: a search API whose results are shaped for LLM consumption.',
      whenToUse: 'Use when agents need search results ready for an LLM and you have a Tavily API key.',
      providers: [{ name: 'tavily', label: 'Tavily' }],
      extends: 'npm:@open-mercato/web-research',
      links: { docs: WEB_RESEARCH_DOCS },
    },
  },
  {
    no: 33,
    type: 'community',
    d: {
      npm: '@piotrkarwatka/marketing-consents',
      github: 'pkarw/marketing-consents',
      category: 'marketing-loyalty',
      tags: ['consents', 'gdpr', 'marketing'],
      summary:
        'Register of marketing consent proofs: exact text with a SHA-256 digest, withdrawal with a reason, personal fields encrypted.',
      whenToUse:
        'Use when the app must keep evidence of each marketing consent and let staff withdraw it with a recorded reason.',
      whenNotToUse:
        'It sends nothing and grants no permission to send: your sending system must read the consent state.',
    },
  },
  {
    no: 34,
    type: 'community',
    note: 'No github field: pkarw/visits-example returns 404 (23 Oct 2026), so the entry stays Unclaimed.',
    d: {
      npm: '@piotrkarwatka/visits',
      category: 'crm-sales',
      tags: ['example', 'crm'],
      summary: 'Example module with one backend page that lists CRM interactions in a table with search and paging.',
      whenToUse:
        'Use when you want a small reference for a module page that reads CRM data, for example while learning modules.',
      whenNotToUse: 'Not a feature module: it adds no tables and no API routes of its own.',
    },
  },
  {
    no: 35,
    type: '3rd-party',
    d: {
      npm: '@fastwhitecat/integration-ksef-direct',
      github: 'FastWhiteCat/openmercato-module-ksef',
      category: 'localization-compliance',
      tags: ['ksef', 'e-invoicing', 'poland'],
      summary: 'Sends and receives Polish structured e-invoices through the KSeF API v2.',
      whenToUse:
        'Use when the app must issue or receive structured invoices in KSeF (Poland) and you have a KSeF token for the NIP.',
      providers: [{ name: 'ksef', label: 'KSeF' }],
      renamedFrom: ['npm:@fast-white-cat/integration-ksef-direct'],
    },
  },
  {
    no: 36,
    type: '3rd-party',
    note: 'No github field: the npm package has no repository.url. Source: FreightTech/open-mercato-modules.',
    d: {
      npm: '@freighttech/shipment-tracking',
      repo: 'FreightTech/open-mercato-modules#main/packages/shipment-tracking',
      category: 'warehouse-shipping',
      tags: ['containers', 'ocean-freight', 'tracking', 'dcsa'],
      summary:
        'Tracks ocean containers through DCSA carrier APIs such as Maersk and MSC, with a ShipsGo fallback and a journey timeline.',
      whenToUse:
        'Use when a forwarder needs container milestones from carriers on its shipment records, with an optional live vessel map.',
      providers: [
        { name: 'maersk', label: 'Maersk' },
        { name: 'msc', label: 'MSC' },
        { name: 'cma-cgm', label: 'CMA CGM' },
        { name: 'hapag-lloyd', label: 'Hapag-Lloyd' },
        { name: 'zim', label: 'ZIM' },
        { name: 'cosco', label: 'COSCO' },
        { name: 'evergreen', label: 'Evergreen' },
        { name: 'shipsgo', label: 'ShipsGo' },
      ],
    },
  },
  {
    no: 37,
    type: '3rd-party',
    note: 'No github field: the npm package repository.url points to the monorepo; repo gives the package path.',
    d: {
      npm: '@freighttech/terminal-tracking',
      repo: 'FreightTech/open-mercato-modules#main/packages/terminal-tracking',
      category: 'warehouse-shipping',
      tags: ['containers', 'terminals', 'tracking', 'ports'],
      summary:
        'Polls container terminal APIs (Navis N4, GCT and BCT in Gdynia) and turns container moves into tracking events.',
      whenToUse:
        'Use when you need gate-in, discharge and departure times for containers at Navis N4 terminals or the Gdynia terminals.',
      providers: [
        { name: 'navis-n4', label: 'Navis N4' },
        { name: 'gct', label: 'Gdynia Container Terminal' },
        { name: 'bct', label: 'BCT Gdynia' },
      ],
    },
  },
  {
    no: 38,
    type: '3rd-party',
    d: {
      npm: '@fullstackhouse/open-mercato-health',
      github: 'fullstackhouse/open-mercato-health',
      category: 'storage-infrastructure',
      tags: ['health-check', 'kubernetes', 'probes'],
      summary:
        'Liveness and readiness endpoints that check the database, cache, queue, search, KMS, email and AI providers.',
      whenToUse: 'Use when Kubernetes or a load balancer must know whether the app is up and ready to take traffic.',
    },
  },
  {
    no: 39,
    type: '3rd-party',
    note: 'No github field: fullstackhouse/open-mercato-durable (repository.url) returns 404 (23 Oct 2026).',
    d: {
      npm: '@fullstackhouse/open-mercato-durable-work',
      category: 'storage-infrastructure',
      tags: ['background-jobs', 'durable', 'postgres'],
      summary:
        'Durable at-least-once background jobs on leased Postgres records, with epoch fencing, resumable slices and a reconciler.',
      whenToUse:
        'Use when background jobs run for hours or days and must survive deploys, crashes and worker kills without starting over.',
      whenNotToUse: 'Short jobs that are cheap to retry run fine on the standard queue.',
    },
  },
  {
    no: 40,
    type: '3rd-party',
    note: 'No github field: fullstackhouse/open-mercato-durable (repository.url) returns 404 (23 Oct 2026).',
    d: {
      npm: '@fullstackhouse/open-mercato-data-sync-durable',
      category: 'integrations-sync',
      tags: ['data-sync', 'durable', 'imports'],
      summary:
        'Drop-in replacement for the built-in data_sync module that runs imports as durable jobs and resumes after a crash.',
      whenToUse:
        'Use when long data_sync imports must survive deploys and worker kills and resume from the last committed cursor.',
      whenNotToUse: 'It takes the data_sync slot of core. It needs open-mercato-durable-work at the same version.',
      replaces: ['core:data_sync'],
    },
  },
  {
    no: 41,
    type: '3rd-party',
    d: {
      npm: '@northbound-run/sync-shopify',
      github: 'Northbound-Run/open-mercato-shopify',
      category: 'integrations-sync',
      tags: ['shopify', 'import', 'ecommerce'],
      summary:
        'Imports Shopify products, collections, customers, orders and inventory into native catalog, customer and sales records.',
      whenToUse:
        'Use when a Shopify store stays the sales front and the app needs its catalog, customers and orders on a schedule.',
      whenNotToUse: 'Import only: nothing is written back to Shopify.',
      providers: [{ name: 'shopify', label: 'Shopify' }],
    },
  },
  {
    no: 42,
    type: '3rd-party',
    d: {
      npm: '@northbound-run/sync-google-sheets',
      github: 'Northbound-Run/open-mercato-google-sheets',
      category: 'integrations-sync',
      tags: ['google-sheets', 'import', 'spreadsheets'],
      summary:
        'Adapter for data_sync that imports Google Sheets rows into any entity, with scheduled sync and an experimental two-way export.',
      whenToUse:
        'Use when a team keeps data in Google Sheets and needs it imported into app records without writing code.',
      providers: [{ name: 'google-sheets', label: 'Google Sheets' }],
    },
  },
  {
    no: 43,
    type: '3rd-party',
    d: {
      npm: '@northbound-run/channel-cloudflare-email',
      github: 'Northbound-Run/open-mercato-cloudflare-email',
      category: 'communication',
      tags: ['email', 'cloudflare'],
      summary:
        'Cloudflare Email Service channel: inbound mail through Email Routing and a Worker, outbound through the REST API.',
      whenToUse:
        "Use when your domain mail runs on Cloudflare and threads should land in the app's communication channels with real delivery status.",
      whenNotToUse:
        'There is no history import: the channel sees mail only from the moment its routing rule goes live.',
      providers: [{ name: 'cloudflare-email', label: 'Cloudflare Email Service' }],
    },
  },
  {
    no: 44,
    type: '3rd-party',
    d: {
      npm: '@northbound-run/search-cloudflare',
      github: 'Northbound-Run/open-mercato-cloudflare-ai-search',
      category: 'search-analytics',
      tags: ['search', 'cloudflare', 'fulltext'],
      summary:
        'Cloudflare AI Search as a fulltext driver for search: hybrid BM25 and vector retrieval with no search server to run.',
      whenToUse:
        'Use when you would rather not operate Meilisearch and accept about 250 ms search latency from a managed service.',
      whenNotToUse:
        'Indexed text leaves your infrastructure: decide which fields may be sent before indexing production data.',
      providers: [{ name: 'cloudflare-ai-search', label: 'Cloudflare AI Search' }],
    },
  },
  {
    no: 45,
    type: '3rd-party',
    d: {
      npm: '@dainamite/cpq',
      github: 'dainamite-technologies/dainamite-core',
      repo: 'dainamite-technologies/dainamite-core#main/packages/cpq',
      category: 'catalog-pricing',
      tags: ['cpq', 'quotes', 'pricing', 'subscriptions'],
      summary:
        'Configurable products, multi-charge price tables, guided quotes and amend, renew or cancel flows for subscriptions.',
      whenToUse:
        'Use when you sell configurable products or subscriptions and sales reps build quotes that turn into orders.',
    },
  },
  {
    no: 46,
    type: '3rd-party',
    d: {
      npm: '@dainamite/billing',
      github: 'dainamite-technologies/dainamite-core',
      repo: 'dainamite-technologies/dainamite-core#main/packages/billing',
      category: 'payments-finance',
      tags: ['billing', 'subscriptions', 'invoices', 'usage'],
      summary:
        'Recurring billing: one-time, recurring and usage items, scheduled bill runs and draft invoices in sales for approval.',
      whenToUse:
        'Use when you charge subscriptions or metered usage and want draft invoices in the app before anything is posted.',
      whenNotToUse: 'It does not replace your accounting system: it prepares invoices for a person to approve.',
    },
  },
  {
    no: 47,
    type: '3rd-party',
    d: {
      npm: '@dainamite/cpq-billing-connector',
      github: 'dainamite-technologies/dainamite-core',
      repo: 'dainamite-technologies/dainamite-core#main/packages/cpq-billing-connector',
      category: 'payments-finance',
      tags: ['cpq', 'billing', 'subscriptions'],
      summary:
        'Turns CPQ subscription events (activated, amended, renewed, cancelled, merged) into billing accounts and items.',
      whenToUse:
        'Use when you run both Dainamite CPQ and Billing and subscriptions sold in CPQ must be billed automatically.',
      whenNotToUse: 'It has no UI or tables of its own: without cpq and billing it does nothing.',
    },
  },
  {
    no: 48,
    type: '3rd-party',
    d: {
      github: 'Chmarusso/open-mercato-enrichment-treg',
      category: 'crm-sales',
      tags: ['enrichment', 'crm', 'leads'],
      summary:
        'Enriches CRM people and companies through treg.to, adds hiring and news signals and finds similar companies.',
      whenToUse:
        'Use when sales reps need job titles, company size or industry filled in on CRM records and pay-per-call lookups are fine.',
      providers: [{ name: 'treg', label: 'treg.to' }],
    },
  },
  {
    no: 49,
    type: '3rd-party',
    d: {
      github: 'fullstackhouse/open-mercato-client-auth',
      category: 'auth-security',
      tags: ['auth', 'oauth', 'sessions', 'mobile'],
      summary:
        'Sign-in for SPAs and mobile apps: JSON session endpoints and Google and Apple OAuth, all issuing core auth sessions.',
      whenToUse:
        'Use when a customer-facing SPA or mobile app needs login, signup, refresh and password reset against the same users as the app.',
      providers: [
        { name: 'google', label: 'Google' },
        { name: 'apple', label: 'Apple' },
      ],
    },
  },
  {
    no: 50,
    type: '3rd-party',
    note: 'No github field: the npm package has no repository.url. Source: FreightTech/open-mercato-modules.',
    d: {
      npm: '@freighttech/ui',
      repo: 'FreightTech/open-mercato-modules#main/packages/ui',
      kind: 'library',
      category: 'devtools',
      tags: ['ui', 'components', 'backoffice'],
      summary:
        'UI toolkit for Open Mercato backoffices: DynamicTable, forms, dialogs, detail sections and notifications.',
      whenToUse:
        'Use when you build backoffice pages with FreightTech components, or install terminal-tracking, which depends on it.',
      whenNotToUse: 'Every app already ships the standard @open-mercato/ui components.',
    },
  },
  {
    no: 51,
    type: '3rd-party',
    d: {
      npm: '@fullstackhouse/open-mercato-demo-auth',
      github: 'fullstackhouse/open-mercato-demo-auth',
      kind: 'tool',
      category: 'devtools',
      tags: ['dev-only', 'login', 'preview'],
      summary:
        'Dev-only widget that fills in and submits the login form from server env vars on dev and preview deployments.',
      whenToUse:
        'Use when a team signs in to dev or preview deployments many times a day and one image runs in every environment.',
      whenNotToUse: 'Never set its env vars in production: leaving them unset is the only safety gate.',
    },
  },
  {
    no: 52,
    type: 'official',
    d: {
      npm: 'create-mercato-module',
      github: 'open-mercato/create-mercato-module',
      kind: 'tool',
      category: 'devtools',
      tags: ['cli', 'publishing', 'scaffold'],
      summary:
        'CLI that turns one module of your app into an npm package and a GitHub repository, and installs or links modules.',
      whenToUse:
        'Use when a module built inside your app should be published for other apps, or you install a module from GitHub.',
    },
  },
  {
    no: 53,
    type: 'official',
    d: {
      npm: 'mercato-readiness-scanner',
      github: 'open-mercato/mercato-readiness-scanner',
      kind: 'tool',
      category: 'devtools',
      tags: ['cli', 'security', 'production', 'ci'],
      summary:
        'Read-only scan of a create-mercato-app project for weak credentials, encryption keys and deployment gaps.',
      whenToUse:
        'Use when you prepare an app for production or want a CI gate that fails on high-severity readiness findings.',
      renamedFrom: ['npm:@open-mercato/readiness-scanner'],
    },
  },
  {
    no: 54,
    type: '3rd-party',
    d: {
      npm: 'open-mercato-generator',
      github: 'mkadziolka/open-mercato-rust-client',
      kind: 'tool',
      category: 'devtools',
      tags: ['rust', 'openapi', 'codegen'],
      summary: 'Generates Rust types and a Rust API client from the Open Mercato OpenAPI schema.',
      whenToUse: 'Use when a Rust service has to call the Open Mercato API with typed requests and responses.',
    },
  },
  {
    no: 55,
    type: 'official',
    d: {
      npm: '@open-mercato/forms',
      category: 'content-portal',
      tags: ['forms', 'questionnaires'],
      summary:
        'Old canary of the forms module: versioned questionnaires, append-only submissions and role-sliced rendering.',
      whenToUse:
        'Use when you need audit-grade questionnaires: the forms module that ships with Open Mercato core now does this.',
      whenNotToUse: 'Do not install this canary. Enable forms from core instead.',
      status: 'hold',
      reason: 'Moved into Open Mercato core (open-mercato#6770).',
      supersededBy: 'core:forms',
    },
  },
  {
    no: 56,
    type: 'official',
    d: {
      npm: '@open-mercato/carrier-inpost',
      category: 'warehouse-shipping',
      tags: ['shipping', 'parcel-lockers', 'poland'],
      summary: 'InPost shipping carrier integration. Only a canary build from March 2026 is published.',
      whenToUse: 'Use when parcels ship through InPost, once Open Mercato publishes a stable release of this module.',
      providers: [{ name: 'inpost', label: 'InPost' }],
      status: 'hold',
      reason: 'Returning to the monorepo (open-mercato#7081). Only a canary is published.',
    },
  },
  {
    no: 57,
    type: 'official',
    d: {
      npm: '@open-mercato/gateway-payu',
      category: 'payments-finance',
      tags: ['payments', 'poland'],
      summary: 'PayU payment gateway provider. Only an orphaned canary build from March 2026 is published.',
      whenToUse:
        'Use when customers pay through PayU, once a maintained release exists. No source code is available today.',
      whenNotToUse: 'For PLN payments today use gateway-tpay or gateway-stripe.',
      providers: [{ name: 'payu', label: 'PayU' }],
      status: 'hold',
      reason: 'Orphaned canary from March 2026. No source in any repository.',
    },
  },
  {
    no: 58,
    type: 'official',
    d: {
      npm: '@open-mercato/gateway-przelewy24',
      category: 'payments-finance',
      tags: ['payments', 'poland'],
      summary: 'Przelewy24 payment gateway provider. Only an orphaned canary build from March 2026 is published.',
      whenToUse:
        'Use when customers pay through Przelewy24, once a maintained release exists. No source code is available today.',
      whenNotToUse: 'For PLN payments today use gateway-tpay or gateway-stripe.',
      providers: [{ name: 'przelewy24', label: 'Przelewy24' }],
      status: 'hold',
      reason: 'Orphaned canary from March 2026. No source in any repository.',
    },
  },
  {
    no: 59,
    type: 'official',
    d: {
      npm: '@open-mercato/pay-by-links',
      category: 'payments-finance',
      tags: ['pay-links', 'payments'],
      summary: 'Pay-by-link pages (module payment_link_pages) from an orphaned canary build of March 2026.',
      whenToUse:
        'Use when you need public payment link pages: the checkout module now provides them with templates and limits.',
      whenNotToUse: 'Do not install this canary. Use checkout instead.',
      status: 'hold',
      reason: 'Orphaned canary from March 2026. No source in any repository.',
      alternatives: ['npm:@open-mercato/checkout'],
    },
  },
]

const INFRA = 'Framework infrastructure or tooling, not a module.'
const APP = 'Application, not a published module.'

/** Spec 11.3 (plus the old name of a renamed tool, 11.4): packages discovery never proposes. */
export const IGNORE: IgnoreFileType = [
  {
    locator: 'npm:@fast-white-cat/integration-ksef-direct',
    reason: 'Old name of @fastwhitecat/integration-ksef-direct.',
  },
  { locator: 'npm:@open-mercato/readiness-scanner', reason: 'Old name of mercato-readiness-scanner.' },
  { locator: 'npm:@sensinum/strapi-plugin-open-mercato', reason: 'Strapi plugin, not an Open Mercato module.' },
  { locator: 'npm:n8n-nodes-open-mercato', reason: 'An n8n integration, not a module.' },
  { locator: 'github:open-mercato/n8n-nodes', reason: 'An n8n integration, not a module.' },
  { locator: 'npm:@softiq/tokscale-om', reason: 'Unrelated package.' },
  { locator: 'npm:opencode-mercato', reason: 'Unrelated package.' },
  { locator: 'npm:@cyberhub/trust-open-mercato-core', reason: 'Generated spam report.' },
  {
    locator: 'github:michalper/open-mercato-marketing-automation',
    reason: 'Fork of the monorepo; the code goes to core (#6749).',
  },
  { locator: 'github:dainamite-technologies/dainamite-core', reason: 'Demo application modules.' },
  { locator: 'npm:@open-mercato/shared', reason: INFRA },
  { locator: 'npm:@open-mercato/ui', reason: INFRA },
  { locator: 'npm:@open-mercato/cli', reason: INFRA },
  { locator: 'npm:@open-mercato/cache', reason: INFRA },
  { locator: 'npm:@open-mercato/queue', reason: INFRA },
  { locator: 'npm:@open-mercato/starter', reason: INFRA },
  { locator: 'npm:@open-mercato/client', reason: INFRA },
  { locator: 'npm:@open-mercato/test-package', reason: INFRA },
  { locator: 'npm:create-mercato-app', reason: INFRA },
  { locator: 'npm:@open-mercato/cezar*', reason: INFRA },
  { locator: 'npm:cezar-cli', reason: INFRA },
  { locator: 'npm:cezar-run', reason: INFRA },
  { locator: 'npm:@pat-lewczuk/cezar', reason: INFRA },
  { locator: 'npm:mercato-sandbox', reason: INFRA },
  { locator: 'github:matgren/oss-prm', reason: APP },
  { locator: 'github:open-mercato/ready-app-oss-prm', reason: APP },
  { locator: 'github:open-mercato/need-termin', reason: APP },
  { locator: 'github:evojam/blueprint-2-quote', reason: APP },
  { locator: 'github:jkojro/itad-poc', reason: APP },
  { locator: 'github:RadnoK/open-mercato-open-logistico', reason: APP },
  { locator: 'github:matchojecki/logistiko-celny', reason: APP },
  { locator: 'github:itrix-Open-Mercato/open_logistiko', reason: APP },
  { locator: 'github:FreightTech/open-mercato-modules', reason: APP },
]

/** Spec 4.4: 46 modules of @open-mercato/core 0.9.0 plus ecommerce (0.10). No widgets (not a module). */
export const BUILTIN_CATEGORIES: Readonly<Record<string, CategoryIdType>> = {
  api_docs: 'devtools',
  api_keys: 'auth-security',
  attachments: 'storage-infrastructure',
  audit_logs: 'auth-security',
  auth: 'auth-security',
  availability: 'operations',
  business_rules: 'ai-automation',
  catalog: 'catalog-pricing',
  communication_channels: 'communication',
  configs: 'storage-infrastructure',
  currencies: 'payments-finance',
  customer_accounts: 'content-portal',
  customer_groups: 'crm-sales',
  customers: 'crm-sales',
  dashboards: 'search-analytics',
  data_sync: 'integrations-sync',
  design_system: 'devtools',
  devices: 'communication',
  dictionaries: 'storage-infrastructure',
  directory: 'auth-security',
  ecommerce: 'orders-checkout',
  entities: 'storage-infrastructure',
  eudr: 'localization-compliance',
  feature_toggles: 'devtools',
  forms: 'content-portal',
  inbox_ops: 'ai-automation',
  integrations: 'integrations-sync',
  messages: 'communication',
  notifications: 'communication',
  payment_gateways: 'payments-finance',
  perspectives: 'search-analytics',
  phone_calls: 'communication',
  planner: 'operations',
  portal: 'content-portal',
  progress: 'storage-infrastructure',
  push_notifications: 'communication',
  query_index: 'search-analytics',
  resources: 'operations',
  sales: 'orders-checkout',
  seeds: 'devtools',
  shipping_carriers: 'warehouse-shipping',
  staff: 'operations',
  sync_excel: 'integrations-sync',
  translations: 'localization-compliance',
  warranty_claims: 'operations',
  wms: 'warehouse-shipping',
  workflows: 'ai-automation',
}

// ---------------------------------------------------------------- rendering

const FLOW_SEQ_KEYS = ['tags', 'alternatives', 'replaces', 'renamedFrom', 'aliases'] as const
const LOCATOR_KEYS = ['extends', 'alternatives', 'replaces', 'renamedFrom', 'supersededBy'] as const
const DESCRIPTOR_DEFAULTS: Record<string, unknown> = {
  kind: 'module',
  pricing: 'free',
  status: 'active',
  featured: false,
}

/** Descriptor object with keys in DESCRIPTOR_KEY_ORDER; defaults and empty collections left out. */
export function orderedDescriptor(d: DescriptorInput): Record<string, unknown> {
  const src = d as Record<string, unknown>
  const unknown = Object.keys(src).filter((k) => !(DESCRIPTOR_KEY_ORDER as readonly string[]).includes(k))
  if (unknown.length > 0) throw new Error(`unknown descriptor keys: ${unknown.join(', ')}`)
  const out: Record<string, unknown> = {}
  for (const key of DESCRIPTOR_KEY_ORDER) {
    const v = src[key]
    if (v === undefined || DESCRIPTOR_DEFAULTS[key] === v) continue
    if (Array.isArray(v) && v.length === 0) continue
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue
    out[key] = v
  }
  return out
}

async function prettierYaml(text: string, filepath: string): Promise<string> {
  const options = (await prettier.resolveConfig(filepath)) ?? {}
  return prettier.format(text, { ...options, filepath, parser: 'yaml' })
}

/** YAML text of one seed entry, formatted like `om format` (key order, then Prettier). */
export async function renderDescriptor(entry: SeedEntry, root: string): Promise<string> {
  const doc = new Document(orderedDescriptor(entry.d))
  for (const key of FLOW_SEQ_KEYS) {
    const node = doc.get(key, true)
    if (isSeq(node)) node.flow = true
  }
  for (const key of ['providers'] as const) {
    const node = doc.get(key, true)
    if (isSeq(node)) for (const item of node.items) if (isMap(item)) item.flow = true
  }
  const ent = doc.getIn(['enterprise', 'modules'], true)
  if (isSeq(ent)) ent.flow = true
  // Locators are quoted, as in the spec 4.3 examples.
  for (const key of LOCATOR_KEYS) {
    const node = doc.get(key, true)
    if (isScalar(node)) node.type = Scalar.QUOTE_DOUBLE
    if (isSeq(node)) for (const item of node.items) if (isScalar(item)) item.type = Scalar.QUOTE_DOUBLE
  }
  if (entry.note) doc.commentBefore = ` ${entry.note}`
  const text = doc.toString({ lineWidth: 0, minContentWidth: 0, defaultStringType: 'PLAIN', defaultKeyType: 'PLAIN' })
  return prettierYaml(text, join(root, descriptorFile(descriptorLocator(entry.d))))
}

/** YAML text of policy/ignore.yml. */
export async function renderIgnore(root: string): Promise<string> {
  const doc = new Document(IGNORE.map((e) => ({ locator: e.locator, reason: e.reason })))
  // Quoted strings as in the spec 4.4 example; block maps, because long entries do not fit one line.
  const seq = doc.contents
  if (isSeq(seq))
    for (const item of seq.items)
      if (isMap(item)) for (const pair of item.items) if (isScalar(pair.value)) pair.value.type = Scalar.QUOTE_DOUBLE
  doc.commentBefore =
    ' Packages and repositories discovery never proposes, each with a public reason (spec 11.3).\n' +
    ' An npm locator ending in * matches every package with that prefix.'
  const text = doc.toString({ lineWidth: 0 })
  return prettierYaml(text, join(root, 'policy', 'ignore.yml'))
}

/** YAML text of policy/builtin-categories.yml. */
export async function renderBuiltinCategories(root: string): Promise<string> {
  const doc = new Document({ ...BUILTIN_CATEGORIES })
  doc.commentBefore =
    ' Core module ID -> category (spec 4.4): the 46 modules of @open-mercato/core 0.9.0 plus ecommerce (0.10, listed in\n' +
    ' builtin-upcoming.yml until a released core ships it).\n' +
    ' widgets is not a module (core 0.9.0 has only src/modules/widgets/lib/injection.ts). The built-in generator\n' +
    ' puts a core module missing here in operations and warns; validate fails on it only in a PR.'
  const text = doc.toString({ lineWidth: 0 })
  return prettierYaml(text, join(root, 'policy', 'builtin-categories.yml'))
}

/** Every file seed writes, repo-relative path -> content. */
export async function renderAll(root: string): Promise<Map<string, string>> {
  const files = new Map<string, string>()
  for (const entry of SEED) files.set(descriptorFile(descriptorLocator(entry.d)), await renderDescriptor(entry, root))
  files.set('policy/ignore.yml', await renderIgnore(root))
  files.set('policy/builtin-categories.yml', await renderBuiltinCategories(root))
  return files
}

// ---------------------------------------------------------------- checks

/** Problems in the seed table itself (schema, numbering, duplicates). Empty when the table is sound. */
export function checkSeedTable(): string[] {
  const problems: string[] = []
  const locators = new Set<string>()
  SEED.forEach((entry, i) => {
    if (entry.no !== i + 1) problems.push(`row ${i + 1}: numbered ${entry.no}`)
    const parsed = Descriptor.safeParse(entry.d)
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        problems.push(`row ${entry.no}: ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      return
    }
    const loc = descriptorLocator(parsed.data).toLowerCase()
    if (locators.has(loc)) problems.push(`row ${entry.no}: duplicate locator ${loc}`)
    locators.add(loc)
  })
  if (SEED.length !== 59) problems.push(`expected 59 descriptors, found ${SEED.length}`)
  if (!IgnoreFile.safeParse(IGNORE).success) problems.push('ignore list does not match IgnoreFile')
  if (!BuiltinCategoriesFile.safeParse(BUILTIN_CATEGORIES).success)
    problems.push('builtin categories do not match BuiltinCategoriesFile')
  for (const e of IGNORE)
    if (locators.has(e.locator.toLowerCase())) problems.push(`${e.locator} is both ignored and listed`)
  return problems
}

/** One row of research/i4-inventory-modulow.json (only the fields seed reads). */
export interface InventoryRow {
  name?: string
  npm: string | null
  repo: string | null
  type: string
  moduleIds?: string[]
  catalogListing?: string | null
}

export interface InventoryReport {
  /** Hard problems: a seed entry missing from the inventory, or a core module without a category. */
  errors: string[]
  /** Differences worth a human look (type, repository, rows covered by nothing). */
  warnings: string[]
}

const ghFromUrl = (url: string | null): string | null => {
  const m = url?.match(/^https:\/\/github\.com\/([^/]+\/[^/#?]+?)(?:\.git)?\/?$/)
  return m ? (m[1] as string) : null
}

/** Cross-check of the seed table and policy maps against the i4 inventory. */
export function checkInventory(rows: readonly InventoryRow[]): InventoryReport {
  const errors: string[] = []
  const warnings: string[] = []
  const covered = new Set<InventoryRow>()
  for (const entry of SEED) {
    const d = entry.d
    const row = d.npm
      ? rows.find((r) => r.npm === d.npm)
      : rows.find((r) => r.npm === null && ghFromUrl(r.repo)?.toLowerCase() === d.github?.toLowerCase())
    const loc = descriptorLocator(d)
    if (!row) {
      errors.push(`${loc}: not in the inventory`)
      continue
    }
    covered.add(row)
    if (row.type !== entry.type) warnings.push(`${loc}: inventory type ${row.type}, spec 11.1 type ${entry.type}`)
    const invRepo = ghFromUrl(row.repo)
    if (d.github && invRepo && invRepo.toLowerCase() !== d.github.toLowerCase())
      warnings.push(`${loc}: github ${d.github}, inventory repo ${invRepo}`)
    if (!d.github && !d.repo && invRepo) warnings.push(`${loc}: no github or repo field, inventory repo ${invRepo}`)
  }
  const ignored = (r: InventoryRow): boolean => {
    const locs = [r.npm ? `npm:${r.npm}` : null, ghFromUrl(r.repo) ? `github:${ghFromUrl(r.repo)}` : null]
    return IGNORE.some((e) =>
      locs.some((l) => {
        if (!l) return false
        if (e.locator.endsWith('*')) return l.startsWith(e.locator.slice(0, -1))
        return l.toLowerCase() === e.locator.toLowerCase()
      }),
    )
  }
  const coreIds = new Set<string>()
  for (const r of rows) {
    if (r.npm === '@open-mercato/core') {
      for (const id of r.moduleIds ?? []) coreIds.add(id)
      covered.add(r)
      continue
    }
    if (covered.has(r)) continue
    if (r.npm === null && ghFromUrl(r.repo) && ignored(r)) continue
    if (r.npm !== null && ignored(r)) continue
    warnings.push(`inventory row ${r.npm ?? r.repo}: no descriptor and not ignored`)
  }
  for (const id of coreIds)
    if (id !== 'widgets' && !(id in BUILTIN_CATEGORIES)) errors.push(`core module ${id} has no category`)
  for (const id of Object.keys(BUILTIN_CATEGORIES))
    if (!coreIds.has(id)) warnings.push(`builtin category ${id}: not a core module in the inventory`)
  return { errors, warnings }
}

function walkYaml(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return walkYaml(p)
    return e.isFile() && /\.ya?ml$/.test(e.name) ? [p] : []
  })
}

/** Problems with the files on disk: drift from the seed table, schema, path and Prettier format. */
export async function checkFiles(root: string): Promise<string[]> {
  const problems: string[] = []
  const expected = await renderAll(root)
  for (const [rel, text] of expected) {
    const abs = join(root, rel)
    if (!existsSync(abs)) {
      problems.push(`${rel}: missing (run yarn om seed)`)
      continue
    }
    if (readFileSync(abs, 'utf8') !== text) problems.push(`${rel}: differs from the seed table`)
  }
  const onDisk = walkYaml(join(root, 'modules')).map((p) => relative(root, p).split(sep).join('/'))
  for (const rel of onDisk) {
    const text = readFileSync(join(root, rel), 'utf8')
    const parsed = Descriptor.safeParse(parse(text))
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        problems.push(`${rel}: ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      continue
    }
    try {
      assertPathMatches(rel, parsed.data)
    } catch (err) {
      problems.push(`${rel}: ${(err as Error).message}`)
    }
    const options = (await prettier.resolveConfig(join(root, rel))) ?? {}
    if (!(await prettier.check(text, { ...options, filepath: join(root, rel), parser: 'yaml' })))
      problems.push(`${rel}: not Prettier formatted`)
  }
  for (const rel of onDisk) if (!expected.has(rel)) problems.push(`${rel}: not in the seed table`)
  return problems
}

// ---------------------------------------------------------------- command

function argValue(args: string[], name: string): string | undefined {
  const i = args.findIndex((a) => a === name || a.startsWith(`${name}=`))
  if (i < 0) return undefined
  const a = args[i] as string
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : args[i + 1]
}

function readInventory(file: string): InventoryRow[] {
  const rows = JSON.parse(readFileSync(file, 'utf8')) as unknown
  if (!Array.isArray(rows)) throw new Error(`${file}: expected a JSON array of inventory rows`)
  return rows as InventoryRow[]
}

export default async function seed(ctx: CommandContext): Promise<number> {
  const check = ctx.args.includes('--check')
  const from = argValue(ctx.args, '--from')
  if (!check && !from) {
    console.error('Usage: yarn om seed --from <i4-inventory.json> | yarn om seed --check [--from <i4-inventory.json>]')
    return EXIT_ENV
  }
  const tableProblems = checkSeedTable()
  let report: InventoryReport = { errors: [], warnings: [] }
  if (from) {
    try {
      report = checkInventory(readInventory(resolve(from)))
    } catch (err) {
      console.error(`seed: ${(err as Error).message}`)
      return EXIT_ENV
    }
  }
  const errors = [...tableProblems, ...report.errors]
  let written = 0
  if (errors.length === 0 && !check) {
    for (const [rel, text] of await renderAll(ctx.root)) {
      const abs = join(ctx.root, rel)
      mkdirSync(dirname(abs), { recursive: true })
      if (!existsSync(abs) || readFileSync(abs, 'utf8') !== text) {
        writeFileSync(abs, text)
        written++
      }
    }
  }
  const fileProblems = errors.length === 0 ? await checkFiles(ctx.root) : []
  errors.push(...fileProblems)
  if (ctx.flags.json) {
    console.log(JSON.stringify({ descriptors: SEED.length, written, errors, warnings: report.warnings }, null, 2))
  } else {
    for (const w of report.warnings) console.error(`warning: ${w}`)
    for (const e of errors) console.error(`error: ${e}`)
    const verb = check ? 'checked' : `wrote ${written} file(s),`
    console.log(
      `seed: ${verb} ${SEED.length} descriptors, ${IGNORE.length} ignore entries, ` +
        `${Object.keys(BUILTIN_CATEGORIES).length} built-in categories; ${errors.length} error(s), ${report.warnings.length} warning(s).`,
    )
  }
  return errors.length === 0 ? EXIT_OK : EXIT_VALIDATION
}
