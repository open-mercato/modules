---
webflowId: 69d7c415f04abe44bb591438
title: "Open Mercato: Why I'm Building a TypeScript CRM Framework Instead of Another SaaS"
description: After building and exiting multiple software companies, I decided the CRM/ERP market needs a framework, not another product to configure.
date: '2026-04-09T12:00:00.000Z'
author: piotr-karwatka
category: architecture
featured: false
thumbnail:
  src: /media/blog/69d7f828b0ed99430d3fd785-title.png
  alt: ''
  decorative: true
draft: false
---

How many times have you heard: "Salesforce is too expensive, but we don't have an alternative"?

I've heard it dozens of times. From Divante's clients, from companies in our Catch The Tornado portfolio, from founders I grab coffee with. Everyone complains about the same thing: CRMs are either too rigid, too expensive, or both.

So I thought - fine, let's build something different.

## A Problem I've Seen for 20 Years

Over the past two decades I've built and co-founded several software companies. Divante (exit at a $65M valuation), Vue Storefront/Alokai (Y Combinator, Series A - $40M), Callstack, Open Loyalty. Together with my brother Piotr at Catch The Tornado, we invest in about 10 companies a year. We have over 40 in our portfolio, including ElevenLabs.

Throughout all these years I've seen one repeating pattern: companies buy off-the-shelf SaaS, then cry because they can't adapt it to their processes. Or they build everything from scratch and cry because it takes 18 months and costs millions.

There's nothing in between. Zero.

## What Open Mercato Actually Is

[Open Mercato](/) is an open-source TypeScript framework for building CRM and ERP applications. It's not another product to configure. It's the foundation on which you build exactly what your company needs.

Think of it this way: React is not a website. React is a framework you use to build a website. Open Mercato is not a CRM. It's a framework you use to build your CRM.

The tech stack? Next.js, React, PostgreSQL, MikroORM, Redis, Zod. Full TypeScript, from frontend to backend. One monorepo, full context for the developer - and for AI.

## "Start with 80% Done"

Building an enterprise CRM from scratch is hell. I know this because at Divante we spent $1-4 million on each product before it became self-sustaining - I'm talking about Vue Storefront and Open Loyalty.

Most of that cost isn't business logic. It's infrastructure: authentication, multi-tenancy, RBAC, audit logging, data encryption, caching, queuing. Every enterprise needs the same set, and every company builds it from scratch.

Open Mercato gives you that 80% out of the box. You build the remaining 20% - the part that makes your business unique.

What you get on day one:

- **Directory** - multi-tenant core with organization hierarchy and user management
- **Auth** - sessions, roles, feature-based RBAC, access control lists
- **Encrypted Vault** - field-level encryption with per-tenant keys (AES-GCM)
- **CRM Foundation** - customers, deals, sales pipeline, activity timeline
- **Catalog** - products, categories, variants, custom fields per category
- **Workflows** - visual designer for business processes
- **Search Engine** - full-text and vector search (PGVector)
- **Audit & Undo/Redo** - every operation is reversible and logged

These aren't mocks. These are production modules backed by over 1,000 unit tests.

## Overlay Pattern - Or Why You Won't Have Technical Debt

The biggest pain when customizing frameworks? You fork, modify the core, and then every update is merge hell.

In Open Mercato we applied the Open-Closed Principle literally. The core is closed for modification but open for extension. All your custom code lives in the Overlay layer - you never touch core files.

In practice it looks like this:

```
// Want to override tax calculation?
// Don't fork the core. Override the service via DI.

import { TaxCalculationService } from '@open-mercato/core';

export class MyCustomTaxService extends TaxCalculationService {
  calculate(order: Order): Money {
    // Your logic, your rules, your country
    return this.applyLocalTaxRules(order);
  }
}

// Register in the DI container (Awilix) and you're done.
```

When Open Mercato releases a new version - you update the core and your Overlay stays untouched. Zero merge conflicts, zero technical debt.

Same on the frontend. Want to replace a customer page? Page Override. Want to inject a widget from one module into another? Widget Injection. Want to add a custom endpoint? Scaffolding generates CRUD in seconds.

## AI-Native - And I Don't Mean Marketing Fluff

I know everyone slaps "AI-powered" and "AI-native" on everything now, including toasters. But here it means something specific.

Open Mercato is built so that AI agents (Claude, Cursor, GitHub Copilot) can effectively extend it. How?

First - monorepo. AI needs context. When an agent sees the entire codebase, it understands dependencies between modules. When it sees a single file - it hallucinates.

Second - deterministic patterns. Every module in Open Mercato has the same structure. Services, commands, events, Zod schemas, tests. The AI doesn't have to guess how to write a new module - it follows the pattern it sees in 20 existing ones.

Third - `AGENTS.MD`. Every module contains a machine-readable file that describes the extensibility contract: which services can be overridden, which events it emits, which endpoints it exposes. This isn't documentation for humans. It's instructions for AI.

In practice the workflow looks like this:

1. You define the feature spec in markdown
2. You point the AI agent to the module's `AGENTS.MD`
3. The agent generates code in the Overlay layer
4. TypeScript + Zod catch errors at compile time
5. Playwright tests verify behavior
6. A human does code review

Sounds simple? It actually is - because the architecture enforces it.

## Enterprise Security Without Enterprise Complexity

At Vue Storefront and Open Loyalty we worked with companies in finance and HealthTech. I know how much pain it costs to meet security requirements when the framework doesn't support them out of the box.

Open Mercato has it baked in from day zero:

**Field-level encryption** - not the whole database, but specific fields (e.g., SSN, card number). Each tenant has its own encryption keys. Even if someone gains server access - without the KMS (Key Management System, e.g., HashiCorp Vault) the data is useless.

**Audit log on every operation** - who, what, when, from which IP. We use the Command Pattern, which also gives us undo/redo on all data. A regulator asks "who modified patient record X on March 14 at 3:32 PM"? You have the answer in one second.

**Multi-tenant isolation** - TenantId and organizationId are enforced at every layer. Cross-tenant data leak? Architecturally impossible, not just "hard to do."

This isn't nice-to-have. For regulated industries it's a deal breaker.

## Who This Is For

Let me be clear - Open Mercato is not for everyone. If you're running a 5-person startup and need a basic CRM, get HubSpot. Seriously.

Open Mercato makes sense when:

- Your company has unique processes that no SaaS can handle
- You're paying for 5-10 different SaaS tools and want to consolidate
- You're in a regulated industry (HealthTech, finance) and need field-level encryption plus audit trails
- You have a dev team (or a software house) that can build in TypeScript/Next.js
- You want to replace low-code platforms (Retool and the like) with something that gives you full control over code and data

## Why Open Source

I could build a closed SaaS. I know how to build SaaS - I've done it multiple times. But CRM/ERP is the backbone of a company. It's the system where your most important business data lives.

I don't want you to depend on us. I want you to see every line of code that handles your data. I want you to be able to deploy it on your own server, in your own data center, with your own KMS.

Vendor lock-in in a CRM is like renting an apartment where you can't change the locks. Open source is a mortgage - more work, but the house is yours.

## What's Next

Open Mercato is already in production. We have CRM, Catalog, Sales Operations, Staff Management, Workflows, and HRM modules. In the pipeline: WMS (warehouse), POS (point of sale), an accounting module, and an integration marketplace.

If you're building enterprise business applications in TypeScript and you're tired of writing infrastructure from scratch - [check out the repo](https://github.com/open-mercato/open-mercato). Take the 80%, build your 20%.

And if you have questions - reach out. I'm not a great writer and never will be, but I can talk about building tech products for hours :)
