---
webflowId: 69d7c4b035de438fc14f223d
title: Why We Chose Next.js as the Foundation for an Open-Source CRM
description: Most CRMs are built on legacy stacks nobody wants to touch. We built Open Mercato on Next.js, React, and TypeScript. Here's what we learned and why it matters.
date: '2026-04-09T12:00:00.000Z'
author: tomasz-karwatka
category: architecture
featured: false
thumbnail:
  src: /media/blog/69d88ce63ee7e94729df52bc-zrzut-ekranu-2026-04-10-o-07.38.03.png
  alt: ''
  decorative: true
draft: false
---

When was the last time you were excited to work on CRM code?

I'm serious. CRM development has been stuck in a time warp for decades. Salesforce runs on Apex - a proprietary Java-like language that exists nowhere else. SugarCRM and SuiteCRM are PHP monoliths from the mid-2000s. Microsoft Dynamics is C# and a proprietary Power Platform. Even the "modern" players lock you into low-code builders that fall apart the moment you need real logic.

Meanwhile, the rest of the web moved on. React. TypeScript. Next.js. Server components. Edge functions. Vercel. The entire frontend ecosystem evolved - except CRM.

So we asked: what if you could build a CRM the same way you build a modern web app?

## The Bet

I'm Tomasz Karwatka. I co-founded Divante (exit at $65M), Vue Storefront/Alokai (Y Combinator, $40M Series A), Callstack, and Open Loyalty. With my brother Piotr at Catch The Tornado, we've invested in over 40 companies, including ElevenLabs.

I've spent 20 years watching enterprise software be built on stacks that developers dread. And I've spent those same 20 years watching the JavaScript ecosystem become the most productive development environment on the planet.

The bet behind [Open Mercato](/) is simple: a CRM built on Next.js, React, and TypeScript will attract better developers, ship faster, integrate easier, and - crucially - be the first CRM framework that AI agents can actually extend reliably.

## The Stack - And Why Every Choice Matters

Open Mercato is a full-stack Next.js application. Not "a React frontend with a random backend." The whole thing. Let me walk through the choices:

**Next.js App Router** - server components for data-heavy pages (customer lists, deal pipelines, reports), client components for interactive UI (drag-and-drop workflows, real-time activity feeds). One framework, one routing model, one deployment. No separate API gateway, no microservice spaghetti.

**TypeScript end to end** - from Zod schemas that validate API input, through MikroORM entities that map to PostgreSQL, to React components that render the data. One language. One type system. A type error in your CRM entity shows up in your IDE before you even save the file.

**PostgreSQL + MikroORM** - not MongoDB, not some proprietary database. PostgreSQL with a mature ORM that gives you migrations, relations, and query building. Plus PGVector for semantic search - because in 2026, a CRM without vector search is a CRM without AI.

**Redis** - Bull queues for async processing (email sending, webhook delivery, report generation), tag-based cache invalidation for sub-second page loads on large datasets.

**Zod** - runtime validation at every API boundary. This isn't just type safety - it's what makes AI code generation actually work (more on that later).

**Shadcn UI** - the design system. Accessible, composable, and built on Radix primitives. Your CRM doesn't have to look like it was designed in 2008.

The whole thing lives in one monorepo. One `npm install`. One `npm run dev`. You're staring at a working CRM with authentication, multi-tenancy, RBAC, encryption, and 15+ modules in under five minutes.

## What You Get Out of the Box

This isn't a starter template. These are production modules with over 1,000 unit tests:

**Core infrastructure** that every CRM needs but nobody wants to build:

- **Multi-tenant Directory** - organization hierarchies, user management, team structures. TenantId enforced at query level - cross-tenant data leaks are architecturally impossible
- **Auth & RBAC** - session management, feature-based roles, access control lists. Every API route, every server component, every client action respects the permission model
- **Encrypted Vault** - field-level AES-GCM encryption with per-tenant keys. Encrypt the SSN field, the credit card column, the medical record - each tenant with its own key ring, backed by HashiCorp Vault or environment keys
- **Audit & Undo/Redo** - every mutation is a Command. Every Command is logged and reversible. Complete operation history with who/what/when/where

**CRM domain modules** that you'd otherwise spend months building:

- **Customers & Contacts** - the customer 360 view with activity timeline, custom fields, relations, tagging
- **Deals & Pipeline** - sales opportunities, stage management, probability tracking, revenue forecasting
- **Catalog** - products, services, categories, variants, custom fields per category
- **Sales Operations** - quotes, orders, negotiation flows, shipping, payment integrations
- **Workflows** - visual process designer. Approval chains, status lifecycles, automated actions. No-code for simple flows, full TypeScript for complex ones
- **Search** - full-text search plus PGVector semantic search across all entities including custom fields. Encrypted index support
- **Query Engine** - flat-table indexing for sub-second queries on 1M+ customer records

## The Overlay Pattern - Why Next.js Makes It Work

Here's where it gets interesting. The classic problem with CRM frameworks: you fork, you customize, you can never update again.

Open Mercato solves this with the Overlay Pattern - and Next.js makes it elegant.

The core modules live in the monorepo. Your custom code lives in a separate Overlay layer. The build system scans both layers and generates route registries, DI containers, and component trees. Your code always wins over core defaults.

On the **backend**, you override services through Awilix dependency injection:

```
// Custom lead scoring? Override the service. Core untouched.
import { LeadScoringService } from '@open-mercato/crm';

export class MyLeadScoringService extends LeadScoringService {
  score(lead: Lead): number {
    const baseScore = super.score(lead);
    const industryBonus = this.getIndustryWeight(lead.industry);
    const engagementScore = this.calcEngagement(lead.activities);
    return baseScore * industryBonus + engagementScore;
  }
}
```

On the **frontend**, you override Next.js pages directly:

```
// Don't like the default customer detail page?
// Drop your version in the overlay. The router picks it up.

// overlay/app/customers/[id]/page.tsx
export default async function CustomerDetail({ params }: Props) {
  const customer = await getCustomer(params.id);

  return (
    <div className="grid grid-cols-3 gap-6">
      <CustomerProfile data={customer} />
      <ActivityTimeline customerId={customer.id} />
      <MyCustomRiskPanel customerId={customer.id} />
    </div>
  );
}
```

No patching. No monkey-patching. No build hacks. Just Next.js file-based routing with a two-layer resolution. When Open Mercato releases a new version, you update the core. Your overlay stays untouched. Zero merge conflicts.

Widget Injection lets you add components from one module into another's pages. Event subscriptions let modules react to each other's domain events. Custom fields can be added to any entity at runtime - no migrations needed.

## AI-Native - And Next.js Is Why

Every CRM now claims to be "AI-powered." They mean they added a chatbot. We mean something different.

Open Mercato is designed so that AI coding agents - Claude, Cursor, GitHub Copilot - can reliably extend the framework. Three things make this work:

**Monorepo = full context.** When an AI agent opens the Open Mercato repo, it sees every module, every service, every type, every test. It understands how `LeadScoringService` connects to `DealPipelineService` connects to `NotificationService`. No guessing. No hallucinating across service boundaries.

**Deterministic patterns.** Every module follows the same Next.js conventions. Routes, server actions, Zod schemas, MikroORM entities, DI registrations, Playwright tests. The AI sees the pattern in 20 modules and replicates it perfectly for the 21st. TypeScript + Zod catch any deviation at compile time.

**`AGENTS.MD` per module.** Each module ships with a machine-readable contract: which services can be overridden, which events are emitted, what the Zod schemas look like, where the extension points are. This isn't documentation for you. It's instructions for your AI agent.

The practical result: a feature that takes a senior developer 2-3 days to scaffold gets generated in 30 minutes. The human still reviews, tests, and ships - but reviews working code, not a blank editor.

Next.js matters here because it's the framework AI agents know best. More training data, more examples, more pattern recognition. Ask Claude to write a Next.js App Router page and it nails it. Ask it to write ABAP and... good luck.

## Enterprise Security Without the Enterprise Tax

I've worked with HealthTech and finance companies at Vue Storefront and Open Loyalty. I know what happens when you try to retrofit security onto a framework that wasn't built for it. It's expensive, it's painful, and it's never quite right.

Open Mercato has it from day zero:

**Field-level encryption** - AES-GCM with per-tenant key rings. Not database-level encryption that protects against disk theft but nothing else. Individual field encryption that protects data even if someone has full database access. Without the KMS, the data is useless.

**Complete audit trail** - every operation logged via the Command Pattern. Who accessed customer X's credit history on March 14 at 3:32 PM from IP 192.168.1.42? One query. One second.

**Multi-tenant isolation** - TenantId enforced at the ORM level. Queries physically cannot return another tenant's data. Not "we filter it out." The WHERE clause is injected automatically.

**RBAC + ACL** - "This sales rep can see EMEA deals but not APAC." That's configuration, not custom code.

For regulated industries this isn't a nice-to-have. It's table stakes.

## Who Should Use This

Open Mercato is not for a 5-person startup that needs a basic contact list. Get HubSpot. It's great for that.

Open Mercato makes sense when:

- You need a CRM that fits your processes, not the other way around
- You're consolidating 5-10 SaaS tools into one integrated system
- You're in a regulated industry and need field-level encryption plus audit trails
- Your team already builds in Next.js/TypeScript and wants to stay in that ecosystem
- You've outgrown Retool or similar low-code platforms and need full code control
- You want to deploy on your own infrastructure with your own encryption keys

## Why Open Source

Your CRM holds your customer relationships - the most valuable data your business has. Locking it inside a vendor's black box with per-seat pricing and no data portability is a business risk.

Open Mercato gives you full source code. Deploy anywhere - Vercel, AWS, your own data center. Control your encryption keys. Fork it if you want (though the Overlay Pattern means you'll never need to). If we disappear tomorrow, your CRM keeps running.

Vendor lock-in in a CRM is like storing your customer Rolodex in someone else's safe and paying monthly to look at it. Open source means you own the safe.

## Get Started

The repo is live. The modules are stable, tested, and documented.

```
git clone https://github.com/open-mercato/open-mercato.git
cd open-mercato
npm install
npm run dev
```

Five minutes to a running CRM with auth, multi-tenancy, encryption, and 15+ production modules. Then build the parts that make your business unique.

[Check out the repo](https://github.com/open-mercato/open-mercato) and give it a star if you think CRM deserves a modern stack :)
