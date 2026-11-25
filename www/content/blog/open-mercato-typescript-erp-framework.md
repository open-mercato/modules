---
webflowId: 69d7c45fce7fa6e2f0022ab4
title: I Got Tired of Building ERP Infrastructure From Scratch. So I Open-Sourced It.
description: After spending millions on enterprise infrastructure across multiple companies, I built Open Mercato - a TypeScript ERP framework that gives you 80% out of the box.
date: '2026-04-09T12:00:00.000Z'
updated: '2026-04-24T11:48:05.308Z'
author: piotr-karwatka
category: product-updates
featured: false
thumbnail:
  src: /media/blog/69d88d1b979d42bde32a61e2-zrzut-ekranu-2026-04-10-o-07.37.54.png
  alt: ''
  decorative: true
draft: false
---

How much of your "custom ERP" is actually custom?

I've been building enterprise software for 20 years. And here's a dirty secret: in every ERP project I've seen, about 80% of the code is the same boring infrastructure. Authentication. Multi-tenancy. Permissions. Audit logs. Encryption. Workflows. The remaining 20% is the actual business logic - the part that matters.

Yet every company builds that 80% from scratch. Every. Single. Time.

## The Money Pit I Know Too Well

Quick context: I co-founded Divante (exit at $65M valuation), Vue Storefront/Alokai (Y Combinator, Series A at $40M), Callstack, and Open Loyalty. With my brother Piotr at Catch The Tornado, we invest in about 10 companies a year - over 40 in our portfolio, including ElevenLabs.

Across all these companies, I've watched the same pattern play out. A business needs a custom system to manage operations - orders, inventory, staff, resources, documents. They look at SAP or Oracle. The price tag makes them faint. They decide to build their own. Eighteen months later they have a buggy system that handles authentication, permissions, and audit logs. The actual business logic? Maybe 30% done.

At Divante we spent $1-4 million on each product before it became self-sustaining. Most of that wasn't business logic. It was plumbing.

I got tired of watching this happen. So I built [Open Mercato](/).

## A Framework, Not a Product

Open Mercato is an open-source TypeScript framework for building ERP applications. And I need you to understand the difference between a framework and a product.

SAP is a product. You configure it. You bend your processes to fit its boxes. When the boxes don't fit - and they never fully do - you hire consultants at $300/hour to write ABAP code that nobody else can maintain.

Open Mercato is a framework. Like Next.js is a framework for web apps, Open Mercato is a framework for enterprise operations software. You build exactly what your business needs, on top of production-ready infrastructure.

The stack: Next.js, React, PostgreSQL, MikroORM, Redis, Zod. Full TypeScript end to end. One monorepo. No Java, no ABAP, no proprietary DSL. Just TypeScript - the language your team already knows.

## What "80% Done" Actually Means

Let me be specific about what you get on day one. This isn't a starter template with a login page. These are production modules backed by over 1,000 unit tests:

**Core Infrastructure:**

- **Multi-tenant Directory** - organization hierarchies, user management, team structures. Not bolted on as an afterthought - it's the architectural foundation
- **Auth & RBAC** - sessions, roles, feature-based permissions, access control lists. Every endpoint, every query, every UI component respects the permission model
- **Encrypted Vault** - field-level AES-GCM encryption with per-tenant keys. Not "encrypt the whole database." Encrypt the SSN column, the salary field, the medical record - each tenant with its own key
- **Audit & Undo/Redo** - every data operation logged (who, what, when, from where) via the Command Pattern. Full operation history. Full reversibility

**Business Modules:**

- **Catalog** - products, categories, variants, custom fields per category. Works for physical goods, services, digital products - whatever you sell or manage
- **Sales Operations** - orders, quotes, negotiation flows, shipping, payment integrations. The full order lifecycle
- **Workflows** - visual designer for business processes. Define document lifecycles, approval chains, state machines. No code for simple flows, full code access for complex ones
- **Staff Management** - employees, teams, availability, leave management, resource allocation
- **Resource Management** - company assets, equipment tracking, availability scheduling
- **Search Engine** - full-text and vector search (PGVector). Search across base fields and custom fields with encrypted index support
- **Query Engine** - flat-table indexing of base and custom fields. Sub-second queries on 1M+ records

WMS, POS, and an accounting module are in the pipeline.

## The Overlay Pattern - Your Code Never Touches Mine

Here's the thing that makes Open Mercato different from every other framework I've used: the Overlay Pattern.

We took the Open-Closed Principle and made it architectural law. The core is closed for modification. Your custom code lives in a separate Overlay layer. You extend, you override, you inject - but you never edit a core file.

```
// Need custom pricing logic for your industry?
// Override the service through DI. Core stays untouched.

import { PricingService } from '@open-mercato/sales';

export class WholesalePricingService extends PricingService {
  calculatePrice(item: CatalogItem, context: PricingContext): Money {
    const tierDiscount = this.getTierDiscount(context.customer);
    const volumeDiscount = this.getVolumeDiscount(context.quantity);
    return item.basePrice
      .multiply(1 - tierDiscount)
      .multiply(1 - volumeDiscount);
  }
}

// Register in the Awilix DI container. Done.
```

When we release an update - you pull it in. Your Overlay stays untouched. Zero merge conflicts. Zero technical debt from framework updates.

This works at every level: service overrides via dependency injection, page overrides on the frontend, widget injection across modules, event subscriptions for cross-module communication, custom fields on any entity at runtime without database migrations.

I've seen too many companies fork a framework, modify the core, and then spend years maintaining a diverging codebase. The Overlay Pattern makes that structurally impossible.

## Built for AI Agents - And I Mean It

I know "AI-native" has become meaningless marketing. But Open Mercato was literally built using AI-assisted engineering, and designed to be extended by AI agents. Here's what that means concretely:

**Monorepo = full context.** AI needs to see the whole picture. When Claude or Cursor sees 20 modules with the same structure - services, commands, events, Zod schemas, tests - it doesn't hallucinate. It follows the pattern.

**`AGENTS.MD` in every module.** Machine-readable contracts that describe: which services can be overridden, which events are emitted, which endpoints are available, what the Zod schemas look like. This isn't documentation for developers. It's instructions for AI.

**Deterministic patterns.** Every module follows the same architecture. Zod validates everything at the boundary. TypeScript catches the rest at compile time. The AI generates code that actually works because the guardrails are baked into the architecture.

The practical workflow:

1. Write a feature spec in markdown
2. Point the AI agent to the relevant `AGENTS.MD`
3. Agent generates Overlay code - never touching core
4. TypeScript + Zod catch schema errors at compile time
5. Playwright tests verify behavior
6. Human reviews and ships

We've seen features that would take a developer 2-3 days get scaffolded in 30 minutes this way. The human review is still essential - but the human reviews working code, not a blank editor.

## Enterprise Security That Doesn't Require a Consultancy

At Vue Storefront and Open Loyalty we worked with HealthTech and finance companies. I know what compliance audits look like. I know the pain of retrofitting security into a framework that wasn't designed for it.

Open Mercato has it from day zero:

**Field-level encryption** - each tenant gets its own AES-GCM encryption keys. Sensitive fields (salary, medical data, PII) are encrypted individually. Even with full database access, the data is useless without the KMS (we support HashiCorp Vault or environment-based keys).

**Complete audit trail** - every operation is a Command. Every Command is logged. Who accessed what, when, from which IP. Regulators love this. Your compliance team will love it more.

**Multi-tenant isolation** - TenantId and organizationId enforced at query level, service level, and API level. Cross-tenant data leakage is architecturally impossible. Not "we have tests for it." The query layer physically cannot return data from another tenant.

**RBAC + ACL** - feature-based role definitions per module, plus granular access control lists. "This sales manager can see deals in the EMEA region but not APAC" - that's a config, not custom code.

For regulated industries - HealthTech, finance, government, insurance - this isn't a feature list. It's the minimum bar. And most frameworks don't clear it.

## Who Should Use This

Open Mercato is not for everyone. If you need a simple task tracker or a basic CRM for a 10-person team, use Monday.com or HubSpot. Seriously - they're great for that.

Open Mercato makes sense when:

- Your operations are complex enough that no SaaS fits without heavy customization
- You're paying for 5-10 different tools and want one integrated system built around your actual processes
- You're in a regulated industry and need field-level encryption, audit trails, and data sovereignty
- You have a TypeScript dev team (or a software house partner) that can build and maintain custom modules
- You're replacing a legacy ERP or outgrowing low-code platforms like Retool
- You want to own your operational data - on your servers, in your data center, with your encryption keys

## Why Open Source

I could have built this as a closed SaaS with per-seat pricing. I know the playbook - I've run it multiple times.

But your ERP is the nervous system of your company. Every order, every employee record, every workflow, every financial transaction flows through it. Locking that into a vendor's black box is a business risk.

With Open Mercato you see every line of code. You deploy on your infrastructure. You control your encryption keys. If we disappear tomorrow - your system keeps running. Try that with SAP.

Vendor lock-in in an ERP is like building your factory on rented land. Open source means you own the ground under your feet.

## Get Started

Open Mercato is in production. The core modules are stable, tested, and documented.

If you're building enterprise operations software in TypeScript and you're tired of reinventing authentication, permissions, audit logs, and multi-tenancy for the hundredth time - [check out the repo](https://github.com/open-mercato/open-mercato). Take the 80%. Ship the 20% that actually matters.

And if you have questions - I'm always happy to talk about building enterprise software. It's been my life for 20 years and I still find it weirdly exciting :)
