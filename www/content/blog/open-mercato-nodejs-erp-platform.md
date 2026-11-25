---
webflowId: 69d7c6cd3cc660439302f058
title: 'The Enterprise Stack Nobody Asked For: A Node.js ERP Platform'
description: Enterprise software doesn't have to mean Java, SAP, or Oracle. Open Mercato is a full Node.js ERP platform with production-ready modules, field-level encryption, and AI-native architecture.
date: '2026-04-09T12:00:00.000Z'
author: tomasz-karwatka
category: architecture
featured: false
thumbnail:
  src: /media/blog/69d88cd726f5c1095717e0ab-zrzut-ekranu-2026-04-10-o-07.38.13.png
  alt: ''
  decorative: true
draft: false
---

Name one serious ERP platform built on Node.js. Take your time.

Exactly. There isn't one. The enterprise world runs on Java (SAP, Oracle), C# (Dynamics), or legacy PHP. Meanwhile, Node.js powers Netflix, PayPal, LinkedIn, Uber, and NASA's mission control - but apparently it's not "enterprise enough" for an ERP.

That always struck me as absurd. So I built one.

## Why Node.js for Enterprise Software

I'm Tomasz Karwatka. I co-founded Divante (exit at $65M), Vue Storefront/Alokai (Y Combinator, $40M Series A), Callstack - a React Native consultancy working with Meta and Microsoft - and Open Loyalty. With my brother Piotr at Catch The Tornado, we've invested in over 40 companies, including ElevenLabs.

Callstack showed me something important: Node.js and the JavaScript ecosystem aren't just for startups and SPAs anymore. When Meta trusts your team to build their mobile infrastructure, the "Node.js isn't enterprise-ready" argument falls apart.

At Divante we built enterprise e-commerce systems for years. Big companies, big budgets, big integrations. And every time we needed a CRM or ERP component, we had two options: buy a Java/C# monolith and spend months configuring it, or build from scratch and spend months on infrastructure.

[Open Mercato](/) is the third option. A production-grade ERP platform, built entirely on Node.js and TypeScript.

## The Platform

Let me be specific about what "Node.js ERP platform" means. This isn't an Express app with a database connection.

Open Mercato is a full-stack platform built on:

**Node.js + Next.js** - the runtime and the framework. Server-side rendering for data-heavy dashboards, API routes for integrations, server components for complex business views. One runtime from the database query to the browser pixel.

**TypeScript end to end** - every entity, every service, every API input validated with Zod schemas. Type errors surface in the IDE, not in production. When your ERP handles payroll data, "it works on my machine" isn't acceptable.

**PostgreSQL + MikroORM** - mature relational database with a proper ORM. Migrations, relations, transactions, query building. Plus PGVector for semantic search across all your business data.

**Redis + Bull** - async job processing (report generation, email queues, webhook delivery, scheduled tasks) and tag-based cache invalidation. Sub-second dashboard loads even with millions of records.

**Single monorepo** - every module, every service, every test in one repository. `npm install && npm run dev` gives you a running ERP with 15+ modules in five minutes.

Why does the single runtime matter? Because when your order service talks to your inventory service talks to your notification service - they share types, they share validation schemas, they share the same deployment pipeline. No serialization overhead, no API contract drift, no "the Java backend team says the TypeScript was wrong."

## What Ships Out of the Box

Every ERP project I've seen starts the same way: six months building authentication, permissions, and audit logging before anyone writes a line of business logic. At Divante we spent $1-4 million per product on this infrastructure before it became self-sustaining.

Open Mercato eliminates that. Here's what you get on day one, backed by 1,000+ unit tests:

**Core Platform:**

- **Multi-tenant Engine** - organization hierarchies, user management, team structures. Not a bolt-on - it's the architectural foundation. TenantId enforced at the query layer, making cross-tenant data leaks structurally impossible
- **Authentication & Authorization** - session management, feature-based RBAC, access control lists. Every Node.js route, every service call, every database query respects the permission model
- **Encrypted Vault** - field-level AES-GCM encryption with per-tenant key rings. Encrypt salary fields, medical records, PII - each tenant with its own keys, backed by HashiCorp Vault or environment keys
- **Audit System** - every mutation is a Command (Command Pattern). Every Command is logged and reversible. Full undo/redo on all data. Complete operation history: who, what, when, from where
- **Query Engine** - flat-table indexing of base and custom fields. Sub-second queries on 1M+ records. This is what makes Node.js competitive with "enterprise" databases - smart indexing, not brute force

**Business Modules:**

- **Catalog** - products, services, categories, variants, custom fields per category. Works for physical goods, digital services, whatever your business manages
- **Sales Operations** - the full order lifecycle: quotes, orders, negotiation flows, shipping, payment integrations
- **Workflows** - visual process designer for approval chains, document lifecycles, state machines. No-code for simple flows, full Node.js/TypeScript for complex business rules
- **Staff Management** - employees, teams, availability, leave management, resource allocation
- **Resource Management** - company assets, equipment tracking, availability scheduling
- **CRM Foundation** - customer 360, deals pipeline, activity timeline
- **Search Engine** - full-text plus vector search (PGVector) across all entities, including encrypted field search
- **Messaging & Helpdesk** - internal communication and support ticket management

WMS, POS, and accounting modules are in the pipeline.

## The Node.js Advantage Nobody Talks About

Here's what I've learned building enterprise software across multiple stacks: the bottleneck isn't the runtime. It's developer velocity and talent availability.

**Talent pool.** There are approximately 20 million JavaScript/TypeScript developers worldwide, according to SlashData's 2024 State of the Developer Nation report. Compare that to maybe 9 million Java developers, with a fraction of those knowing SAP's ABAP or Oracle's PL/SQL. When you need to scale your ERP team, Node.js gives you 10x the hiring pool.

**Shared stack.** Your frontend team and your backend team speak the same language. Literally. The same developer who builds the workflow designer UI can write the workflow execution engine. No "throw it over the wall" between frontend and backend teams.

**npm ecosystem.** Need to integrate with Stripe? `npm install stripe`. Need PDF generation? `npm install puppeteer`. Need to parse Excel? `npm install exceljs`. The npm registry has over 2 million packages. The SAP ecosystem has... SAP consultants at $300/hour.

**Async I/O.** Node.js was built for I/O-heavy workloads. ERP systems are I/O-heavy workloads - database queries, API calls, file processing, webhook delivery. Node.js handles concurrent I/O without threading complexity. An ERP dashboard that queries six different services renders them all in parallel without you writing a single line of concurrency code.

## Overlay Pattern - Enterprise Customization Without Enterprise Pain

The biggest risk in any ERP platform: customization lock-in. You fork the code, modify the core, and then every platform update becomes a week-long merge nightmare. I've watched companies spend more on maintaining their SAP customizations than on the original license.

Open Mercato uses the Overlay Pattern - Open-Closed Principle as architecture:

```
// Your industry needs custom inventory valuation?
// Override the service through DI. Core stays untouched.

import { InventoryValuationService } from '@open-mercato/catalog';

export class FIFOValuationService extends InventoryValuationService {
  valuate(item: StockItem): Money {
    const lots = this.getLotsByDate(item.id, 'asc');
    return this.calculateFIFO(lots, item.currentQuantity);
  }
}

// Register in the Awilix DI container. Done.
// Core updates? Pull and go. Your overlay is untouched.
```

This works at every level of the Node.js stack:

- **Service overrides** - replace any business logic via dependency injection
- **API extension** - add custom endpoints with scaffolding that generates full CRUD in seconds
- **Page overrides** - replace any React/Next.js page without touching core
- **Widget injection** - add UI components from one module into another
- **Event subscriptions** - react to domain events across modules
- **Custom fields** - add tenant-specific fields to any entity at runtime, no migration needed

When we release an update, you pull it. Your custom code lives in a separate layer. Zero merge conflicts. Zero technical debt from platform updates.

## AI-Native - Built By AI, For AI

I know "AI-native" is thrown around like confetti. Here's what it means for Open Mercato concretely:

**The platform was built using AI-assisted engineering.** Not "we added Copilot to our workflow." The architecture was designed from day one so that AI agents (Claude, Cursor, GitHub Copilot) can reliably generate production-quality extensions.

**Why Node.js/TypeScript is the best target for AI code generation:**

The JavaScript/TypeScript ecosystem has the largest representation in AI training data. Ask any LLM to write a Node.js service and it produces working code. Ask it to write ABAP and you get hallucinations. This isn't a minor advantage - it's the difference between AI-generated code you can ship and AI-generated code you throw away.

**How the architecture enforces quality:**

- **Monorepo = full context.** AI sees every module, every dependency, every type. No hallucinating across service boundaries
- **Deterministic patterns.** Every module follows the same structure: services, commands, events, Zod schemas, Playwright tests. AI replicates the pattern from 20 examples perfectly for the 21st
- **`AGENTS.MD` per module.** Machine-readable extensibility contracts: which services can be overridden, which events are emitted, what the schemas look like. Instructions for AI, not documentation for humans
- **Zod + TypeScript** catch schema errors at compile time. AI-generated code that doesn't match the type system fails before it runs

The workflow: write a feature spec → point AI to `AGENTS.MD` → agent generates Overlay code → TypeScript catches errors → Playwright tests verify → human reviews working code.

Features that take 2-3 days to scaffold manually get generated in 30 minutes. The human review is still essential. But the human reviews working code.

## Enterprise Security on Node.js - Yes, Really

The "Node.js isn't secure enough for enterprise" myth dies when you look at what's actually built in:

**Field-level encryption** - AES-GCM with per-tenant key rings. Not database-level encryption. Individual fields: the salary column, the SSN field, the medical record. Each tenant has its own keys. Even with full database and server access, data is useless without the KMS (HashiCorp Vault or environment keys).

**Complete audit trail** - every operation logged via Command Pattern. Who accessed what, when, from which IP. Regulators ask "who viewed employee X's salary on March 14 at 3:32 PM"? One query. One second. And the same Command Pattern gives you full undo/redo on all data.

**Multi-tenant isolation** - TenantId enforced at the ORM layer. Queries physically cannot return another tenant's data. The WHERE clause is injected automatically. Cross-tenant leaks are architecturally impossible.

**RBAC + ACL** - feature-based role definitions per module plus granular access control lists. "This HR manager can see EMEA employees but not APAC" - that's configuration, not custom Node.js code.

This clears the compliance bar for HealthTech, finance, government, and insurance. I know because we built similar systems at Vue Storefront and Open Loyalty for exactly these industries.

## Who Should Use This

Let me be direct about where Open Mercato makes sense and where it doesn't.

**Don't use it if:** you need a simple project tracker or a basic CRM for a small team. Use Monday.com, HubSpot, or Notion. They're great for that.

**Use it if:**

- Your operations are complex enough that no SaaS product fits without heavy customization
- You're paying for 5-10 different tools and want one integrated system built around your actual processes
- You're in a regulated industry needing field-level encryption, audit trails, and data sovereignty
- You have Node.js/TypeScript developers (in-house or a software house partner)
- You're replacing a legacy ERP or outgrowing low-code platforms
- You want to own your operational data on your infrastructure, with your encryption keys

## Why Open Source

Your ERP is the nervous system of your company. Orders, employees, inventory, workflows, financial transactions - everything flows through it. Locking that into a vendor's proprietary runtime with per-seat pricing and no data portability is a business risk.

Open Mercato gives you the full Node.js source. Deploy on AWS, GCP, your own servers, wherever you want. Control your encryption keys. Audit every line of code that touches your data. If we disappear tomorrow, your platform keeps running.

Vendor lock-in in an ERP is like building your factory's control system on rented hardware you can't inspect. Open source means you own the entire stack.

## Get Started

```
git clone https://github.com/open-mercato/open-mercato.git
cd open-mercato
npm install
npm run dev
```

Five minutes to a running ERP with authentication, multi-tenancy, encryption, and 15+ production modules. Then build the part that actually matters - your business logic.

[Check out the repo](https://github.com/open-mercato/open-mercato) and give it a star if you think enterprise software deserves a modern Node.js stack :)
