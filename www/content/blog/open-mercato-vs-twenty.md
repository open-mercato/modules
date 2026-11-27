---
webflowId: 69f19fb5cacb2dca2c92271c
title: 'Open Mercato vs Twenty: Two Approaches to Open-Source CRM'
description: Twenty is the best modern open-source CRM. Open Mercato is a different category - a CRM/ERP foundation framework. A concrete, fair comparison and when to pick which.
date: '2026-04-29T08:00:00.000Z'
author: tomasz-karwatka
category: architecture
featured: false
thumbnail:
  src: /media/blog/69f1a025176d80cd98cc491d-open-mercato-cover-twenty-brand.png
  alt: ''
  decorative: true
draft: false
---

Open-source CRM has had three good years. After a decade where the category was synonymous with SuiteCRM and SugarCRM - both still alive, both showing their age - a new generation has finally landed. The most visible name in that wave is **Twenty**: a modern, well-funded, fast-moving project that actually deserves the GitHub stars it gets.

I want to talk about Twenty seriously, because the comparison most teams are about to make is "Twenty vs Salesforce" - and that's the wrong axis for a lot of them. The harder question is "Twenty vs a foundation framework like Open Mercato", and that's the one I get asked in CTO conversations every week.

This is not a takedown. Twenty is genuinely good at what it does. The point of this post is to be precise about what it does, what it doesn't, and when each model wins.

## How I Know What I'm Talking About

I'm Tomasz Karwatka. I co-founded Divante (exit at $65M), Vue Storefront/Alokai (Y Combinator, $40M Series A), Callstack, and Open Loyalty. With my brother Piotr at Catch The Tornado, we've invested in 40+ companies, including ElevenLabs.

I've shipped CRM systems on every stack from custom PHP to Salesforce to Microsoft Dynamics, and I've watched the open-source CRM category cycle through three generations. Twenty is the strongest entry I've seen on the "modern CRM that competes with Salesforce" axis. Open Mercato lives on a different axis. Both can be right answers - for different problems.

## What Twenty Actually Does Well

Let me be specific about Twenty's strengths, because they are real.

**A clean modern stack.** React on the frontend, NestJS + GraphQL on the backend, PostgreSQL as the system of record, TypeScript end to end. No PHP, no Java EE, no plugin marketplace from 2009. If you've built modern web apps in the last five years, the codebase reads the way you'd expect.

**Dynamic objects, no migrations.** Twenty's killer feature is runtime data model customization. From Settings → Data Model you create new objects ("Properties", "Patients", "Legal Cases"), add custom fields, and the UI immediately reflects them. No SQL migrations, no redeploy. For a CRM where the schema needs to bend to the customer rather than the other way around, this is exactly right.

**Views that feel like 2026.** Airtable-style tables, Kanban boards, saved views, multi-level filters, group-by, sort. The UX is fast and familiar.

**Workflows and AI integration.** Twenty 2.0 added a workflow engine, OAuth-secured Model Context Protocol (MCP) support, and AI agents that can act on CRM data. An LLM client like Claude can pull live records through a standardized interface. That's a genuinely modern primitive.

**Real community traction.** YC S23, 44,000+ GitHub stars, 300+ contributors, an active enterprise tier, Docker self-host that actually works on the first try. The project is not a hobby.

If your problem is "we need a modern, self-hostable CRM that handles contacts, companies, deals, and pipelines, and we want it to feel like a real SaaS product" - **Twenty is the right answer**. I will recommend it for that case tomorrow.

## Where the Twenty Model Hits Its Limits

The clean line in Twenty's positioning is "the open alternative to Salesforce". That positioning is honest about the scope: Salesforce-class CRM, in the open. Where the model bumps into limits is when the ambition stops being "CRM" and starts being "operating system of the company".

**Limit #1: Twenty is a CRM, not a platform.** The data model is dynamic, but the building blocks are CRM building blocks - contacts, companies, deals, notes, tasks. You don't get a product catalog with category-level custom fields. You don't get a sales-operations stack with quotes, orders, shipping, and payment integrations. You don't get an audit log with full undo/redo on every mutation. You don't get a workflow engine that can drive ERP-class processes. If you need those, you either bolt them on by integrating five SaaS tools, or you start customizing core, which is where the second limit shows up.

**Limit #2: customization beyond custom fields gets hard.** Adding a new object in the UI is brilliant. Overriding the way the deal pipeline calculates probability, or injecting a tenant-specific pricing rule into the quote engine, is a different kind of work. Twenty supports it - as code, in the monorepo - but the contract between "core" and "your code" is not the central architectural commitment. In a system you'll run for ten years, that contract matters more than it looks.

**Limit #3: AGPL-3.0 has real-world consequences.** Twenty is licensed AGPL-3.0. For self-hosting your own internal CRM, AGPL is fine. For building a vertical SaaS on top of Twenty and selling it to customers, AGPL is a problem your legal team will eventually catch. Open Mercato is MIT-licensed precisely because the design assumption is "people will build commercial products on top of this."

**Limit #4: GraphQL + NestJS + separate frontend is two repos in spirit.** Twenty's architecture is three layers - REST/GraphQL backend, React frontend, dynamic data model in between. It works, and it's well-built, but if you want server components, server actions, and a single Next.js codebase that ships UI and API together, that's not the model. For ERP-class systems where forms, validation, and business rules dominate the work, the unified Next.js model is meaningfully more productive.

**Limit #5: multi-tenancy is workspace-level, not architectural.** Twenty has workspaces. They're good. But they're not the same as a Directory module enforcing `tenantId` at the query layer across every entity, with per-tenant key rings for field-level encryption. For a regulated B2B SaaS, the difference is large.

None of these limits make Twenty "bad". They make it a CRM, in the precise sense of that word.

## Open Mercato - A Different Category

[Open Mercato](/) is not "Twenty but better". That framing undersells both projects.

Twenty is a **modern CRM product** - you adopt it, customize it, and run your sales motion on it. Open Mercato is a **CRM/ERP foundation framework** - you extend the modules that already exist and build the parts that make your business different.

The stack: Next.js + React + TypeScript, PostgreSQL + MikroORM, Redis + Bull, PGVector, Zod schemas everywhere. One codebase, one type system, one deploy.

What you get on day one - as production modules with 1,000+ unit tests, not scaffolding:

- **Directory** - multi-tenant organization hierarchies; `tenantId` enforced at the query layer
- **Auth** - sessions, feature-based RBAC, access control lists
- **Encrypted Vault** - field-level AES-GCM with per-tenant key rings
- **CRM Foundation** - customers, deals, pipeline, activity timeline
- **Catalog** - products, categories, custom fields per category
- **Sales Operations** - quotes, orders, negotiations, shipping, payments
- **Workflows** - visual business process designer
- **Staff & Resources** - employees, teams, availability, equipment
- **Audit System** - every mutation is a Command, every Command is logged and reversible (full undo/redo)
- **Query Engine** - flat-table indexing, sub-second queries on 1M+ records, vector + lexical search

You start at 80%. The 20% you build is the part that actually differentiates your business.

## The Comparison You Came For

![](/media/blog/69f1a11c895b50e31a9e7892-zrzut-ekranu-2026-04-29-o-08.11.21.png)

## Why the License Difference Is Strategic, Not Cosmetic

I keep getting the same question from founders: "We want to build a vertical SaaS on top of an open-source CRM. Which do we pick?"

If your product is a SaaS sold to external customers, AGPL-3.0 means every modification you make has to be made available - to your competitors, to your customers, to the world. There are workarounds (cloud deployment loopholes, Twenty's commercial agreements), but the default position is "anything you build, you publish".

MIT means you keep your work. Open Mercato is MIT precisely because the project exists to be embedded in commercial products. If you're a founder building enterprise software, the license is not a footnote - it's a core decision.

## The Overlay Pattern - Why This Matters in Year Three

In Twenty, deeper customization happens in the monorepo. You fork, or you maintain a private branch. It works, until upstream changes the GraphQL schema or the workflow engine internals - then merge conflicts compound.

Open Mercato applies the Open-Closed Principle as architecture. All your code lives in the **Overlay** layer. You never touch core.

`// Override the deal-scoring engine for a specific tenant.
// Core stays untouched.
import { DealScoringService } from '@open-mercato/crm';

export class IndustrySpecificDealScoring extends DealScoringService {
  score(deal: Deal, ctx: ScoringContext): number {
    return this.applyVerticalRules(deal, ctx);
  }
}
// Register in the Awilix DI container.
// Pull the latest Open Mercato release - zero merge conflicts.
`

Same on the frontend. **Page Override** swaps a page without forking. **Widget Injection** drops a component from one module into another. **Scaffolding** generates a CRUD in seconds.

The contract is explicit: business code never blocks a platform upgrade. Twenty doesn't promise that - and on a CRM that lives 5-10 years, the difference is the entire upgrade story.

## AI-Native - Concrete, Not Marketing

Twenty 2.0's MCP support is a real step forward. It lets external AI clients act on CRM data through a standard interface. That's about agent-as-user.

Open Mercato adds the other half: agent-as-developer. The platform is built so that **your** AI agent (Claude Code, Cursor, Copilot) can extend it reliably:

- **Monorepo** - the agent sees the full codebase, doesn't hallucinate APIs
- **Deterministic module structure** - every module has the same layout (services, commands, events, Zod schemas, migrations)
- **`AGENTS.MD` per module** - a machine-readable extensibility contract: which services can be overridden, which events are emitted, which fields are encrypted
- **TypeScript end-to-end** - compile-time signal, not runtime guesses

A feature that takes a Twenty contributor a day to add cleanly (data model + GraphQL resolver + frontend view) gets generated by an agent in 30-60 minutes in Open Mercato - with Playwright tests, in your own Git, on your own infrastructure.

Both projects are AI-native. Twenty is AI-native for users. Open Mercato is AI-native for users **and** for the developers extending the system.

## When to Pick Twenty (Honestly)

- You need a modern, self-hostable CRM and your scope ends at "CRM"
- You want a beautiful UI for sales teams without building one
- Your customization budget is "custom objects + workflow rules", not "override the pricing engine"
- You're not selling a SaaS product on top of it (AGPL doesn't bite you)
- You'd rather adopt a finished product than assemble a foundation

In that world, Twenty is the right call. Don't overcomplicate.

## When Twenty Is the Wrong Starting Point

- You're building the **operating system of the company** - CRM is one module, not the whole product
- You need ERP capabilities - catalog, sales operations, workflows, staff management
- You're in a regulated industry where field-level encryption and full audit/undo are not optional
- You're building a **vertical SaaS** and AGPL-3.0 conflicts with your business model
- You want a single Next.js codebase, not a backend/frontend split
- AI-assisted development of the platform itself is your baseline for the next 3-5 years

In those scenarios, Twenty isn't a bad CRM. It's just the wrong category for the job.

## A One-Page Decision Framework

1. **Is the deliverable a CRM or a platform?** CRM → Twenty. Platform → Open Mercato.
2. **Will this run for 5+ years and absorb new business domains?** If yes - foundation framework wins on TCO.
3. **Are you building commercial SaaS on top of it?** AGPL-3.0 is a real constraint. MIT is freedom.
4. **Regulated industry?** Field-level encryption + native audit + undo/redo are table stakes, not optional.
5. **Is AI-assisted development of the system itself a baseline?** A unified TypeScript monorepo with deterministic patterns beats a backend/frontend split for current-gen agents.

Three or more answers pointing toward Open Mercato - Twenty is the wrong starting line.

## What to Do Tomorrow

**If your scope is CRM and your team is 5-50 people**, deploy Twenty this week and stop reading comparison posts.

**If you're building a long-running enterprise platform - or a vertical SaaS where CRM is one module of many**, clone Open Mercato and see what runs in 5 minutes:

`git clone https://github.com/open-mercato/open-mercato.git
cd open-mercato
npm install
npm run dev
`

Five minutes to a running CRM/ERP with 15+ production modules. Then you build the part that actually makes a difference - your business logic.

[The repo is here](https://github.com/open-mercato/open-mercato). If you think the open-source CRM/ERP space needs more than one good answer, drop a star.

_Tomasz Karwatka - co-founder of Divante, Vue Storefront/Alokai, Catch The Tornado. Building and investing in tech companies since 2004._
