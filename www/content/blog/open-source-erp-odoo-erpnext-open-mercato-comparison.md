---
webflowId: 69db7e7b7b79ed239c2cc5fc
title: 'Open Source ERP in 2026: Where Open Mercato Fits Next to Odoo and ERPNext'
description: The open-source ERP market is worth $2.85 billion and growing 10% a year. Odoo and ERPNext dominate. So why did I build a third option? Because neither solves the problem I keep seeing.
date: '2026-04-12T11:14:03.241Z'
updated: '2026-04-24T11:48:05.308Z'
author: tomasz-karwatka
category: architecture
featured: false
thumbnail:
  src: /media/blog/69db7f0de3746738bde2e01b-open-mercato-cover-opensource-erp-brand.svg
  alt: ''
  decorative: true
draft: false
---

The open-source ERP market hit $2.85 billion in 2025 and is on track for $4.6 billion by 2030, according to Mordor Intelligence. Adoption grew 32% in a single year because companies are tired of paying Oracle and SAP license fees that could fund a small startup.

Two players dominate: Odoo and ERPNext. Both have 32,000+ GitHub stars. Both have massive communities. Both are battle-tested in production.

So why did I build a third one?

## What I Learned From 20 Years of Enterprise Software

I'm Tomasz Karwatka. I co-founded Divante (exit at $65M), Vue Storefront/Alokai (Y Combinator, $40M Series A), Callstack, and Open Loyalty. With my brother Piotr at Catch The Tornado, we've invested in over 40 companies, including ElevenLabs.

Over these 20 years, I've deployed, integrated with, or built custom modules for practically every enterprise system out there. Odoo. ERPNext. SAP. Dynamics. And dozens of custom-built systems that companies created because none of the above fit their processes.

Here's what I kept seeing: companies fall into one of three traps.

**Trap 1: The Configuration Trap.** You pick Odoo or ERPNext. You spend months configuring it. Then you discover your business process doesn't fit the data model. You hire consultants. They write Python customizations. Three years later, you can't upgrade because your custom code is tangled with the core.

**Trap 2: The Build-From-Scratch Trap.** You decide none of the ERPs fit. You build your own. You spend 12-18 months and $1-4 million before you even have basic functionality. I know this number precisely because at Divante we spent exactly that on Vue Storefront and Open Loyalty before they became self-sustaining.

**Trap 3: The Frankenstein Trap.** You cobble together 5-10 SaaS tools - a CRM here, a project manager there, an inventory system somewhere else. Each has its own data model, its own login, its own subscription fee. Nothing talks to anything else without duct tape and Zapier.

[Open Mercato](/) exists because I got tired of watching companies fall into these traps. But let me be fair - Odoo and ERPNext are excellent products. The question isn't which one is "best." The question is which one fits your specific situation.

## Odoo: The Full-Service Restaurant

Odoo is the market leader for a reason. It's a beautifully polished, feature-rich ecosystem with 38,000+ modules in its app store. If you're looking for something that works out of the box with minimal development, Odoo is hard to beat.

**Stack:** Python backend, custom JavaScript frontend, PostgreSQL. Built as a monolithic application with a proprietary ORM.

**Business model:** Open Core. The Community edition is free and open source, but the Enterprise edition - where the really useful features live (accounting, marketing automation, full HR) - starts at $37.40/user/month. After the first year, that jumps to $46.70. For a company with 200 users, you're looking at $112,000/year.

**Strengths:** The best UI/UX of any open-source ERP. Massive module ecosystem. Strong community (the Odoo Community Association on GitHub is huge). Excellent documentation. Three hosting options - cloud, on-premise, or Odoo.sh.

**The catch:** Odoo follows the "Apple model." Polished, but opinionated. When your business process doesn't fit Odoo's data model, you have two options: bend your process, or write Python customizations that are painful to maintain across upgrades. The open-core model also means you'll eventually need Enterprise for anything serious, and then you're back to per-seat pricing.

## ERPNext: The Community Garden

ERPNext is the philosophical opposite of Odoo. It's 100% free, 100% open source (GPL v3), no open-core tricks, no paywall for features. What you see is what you get.

**Stack:** Python + JavaScript on the Frappe framework, MariaDB. Frappe is a full-stack framework with its own ORM, its own UI toolkit, its own build system.

**Business model:** Truly free. Frappe makes money on cloud hosting (starting at $25/month on Frappe Cloud) and consulting. The software itself has zero license cost.

**Strengths:** No vendor lock-in. Active community, especially in India and Southeast Asia. Strong manufacturing and distribution modules. Built-in website builder. 100% of the codebase is available - no hidden Enterprise features.

**The catch:** ERPNext is rough around the edges compared to Odoo. The Frappe framework has a steep learning curve - it's not a standard Python web framework, it's its own world with its own conventions. Finding Frappe developers outside of India is hard. And the UI, while functional, feels dated compared to modern web apps.

## Where Both Fall Short

Here's the thing nobody wants to say: both Odoo and ERPNext were architected in the early 2010s. They're Python monoliths with server-rendered frontends. They work. They're proven. But they carry design decisions from an era before:

**TypeScript.** Both are Python + JavaScript without a shared type system. Your backend data model and your frontend forms are connected by convention, not by types. Bugs show up at runtime, not at compile time.

**AI-assisted development.** Neither was designed for AI code generation. Their custom frameworks (Odoo ORM, Frappe) have far less representation in AI training data than mainstream stacks like Next.js and TypeScript. Ask Claude to write an Odoo module and it struggles. Ask it to write a Next.js API route and it nails it.

**Modern frontend architecture.** Both use their own UI frameworks rather than React or Vue. This means fewer available frontend developers and a smaller pool of reusable components.

**Field-level encryption.** Neither offers per-tenant, per-field encryption out of the box. For regulated industries - HealthTech, finance, insurance - this is increasingly a hard requirement, not a nice-to-have.

These aren't criticisms. Odoo and ERPNext made the right choices for their time. But the landscape has changed.

## Open Mercato: The Framework Approach

[Open Mercato](/) takes a fundamentally different approach. It's not a product you configure. It's a framework you build on.

**Stack:** Next.js, React, TypeScript end to end, PostgreSQL + MikroORM, Redis, Zod validation. One monorepo. One language from database to browser.

**Business model:** Open source. No open-core split, no per-seat pricing. Professional services for companies that want implementation support.

**The key difference:** Open Mercato gives you 80% of the infrastructure (auth, multi-tenancy, RBAC, field-level encryption, audit logging, workflows, search) and lets you build the 20% that makes your business unique - in the Overlay layer that never touches the core, so you can upgrade without merge conflicts.

## The Honest Comparison

Let me put this in a table, because I know that's what you're looking for:

**Odoo** - Best when: you want a full-featured ERP out of the box, your processes mostly fit standard ERP workflows, you have budget for Enterprise licensing, you want the widest module ecosystem.

**ERPNext** - Best when: you want 100% free and open source with no gotchas, you're comfortable with the Frappe framework, your team includes or can find Python/Frappe developers, you're a small-to-medium manufacturer or distributor.

**Open Mercato** - Best when: your processes are too unique for off-the-shelf configuration, you have a TypeScript/Next.js dev team (or a software house partner), you're in a regulated industry needing field-level encryption and audit trails, you want AI agents to reliably extend your ERP, you're consolidating multiple SaaS tools into one custom-built system.

## When NOT to Use Open Mercato

I need to be direct about this. Don't use Open Mercato if:

- You want a working ERP in a week without writing code. Use Odoo or ERPNext.
- You don't have access to TypeScript developers. The framework requires developers, period.
- Your processes fit standard ERP templates. If Odoo's modules cover 90% of what you need, don't over-engineer it.
- You're a 10-person company with simple operations. Use Monday.com or HubSpot.

I'm not building Open Mercato to replace Odoo or ERPNext. I'm building it for the cases where they don't fit - and in my experience, those cases are more common than the ERP industry wants to admit.

## The Technical Differentiators

For the developers reading this, here's what separates Open Mercato architecturally:

**Overlay Pattern.** Your custom code lives in a separate layer from the core. Override any service via dependency injection, any page via file-based routing, any entity with custom fields at runtime. When we release an update, you pull it. Your code is untouched. Zero merge conflicts. This is the Open-Closed Principle as architecture - and it solves the upgrade problem that plagues every Odoo and ERPNext deployment.

`// Override the pricing engine. Core stays untouched.
import { PricingService } from '@open-mercato/sales';

export class MyPricingService extends PricingService {
 calculate(item: CatalogItem, ctx: PricingContext): Money {
   return this.applyCustomRules(item, ctx);
 }
}
// Register in Awilix DI → done. Upgrade-safe forever.
`

**Field-level encryption.** AES-GCM with per-tenant key rings. Not database-level encryption - individual fields. The salary column. The medical record. Each tenant has its own keys backed by HashiCorp Vault. Even with full database access, data is useless without the KMS.

**AI-native architecture.** Every module follows the same structure with `AGENTS.MD` files that describe extensibility contracts for AI agents. Monorepo gives full context. Zod + TypeScript catch errors at compile time. Features that take 2-3 days to scaffold manually get generated in 30 minutes.

**Modern stack.** React, Next.js App Router, Shadcn UI, Playwright tests. Your team already knows these tools. The npm ecosystem (2M+ packages) is your module library. No proprietary ORM language, no custom UI framework to learn.

## The Real Decision Framework

After deploying, building, and consulting on enterprise systems for 20 years, here's how I'd approach the decision:

**Start with your team.** If you have Python developers and no JavaScript expertise, Open Mercato is the wrong choice. Use ERPNext. If you have TypeScript/Next.js developers, Open Mercato will feel like home.

**Then look at your processes.** If 80% of what you need exists as standard ERP modules (accounting, inventory, HR, manufacturing), start with Odoo. If your operations are unique enough that you'd need heavy customization anyway, the "build on a framework" approach saves time in the long run.

**Then look at your industry.** If you're in HealthTech, finance, or insurance - field-level encryption and audit trails aren't optional. Open Mercato has them from day zero. Adding them to Odoo or ERPNext is a significant custom development effort.

**Finally, look at the next 5 years.** AI-assisted development is not a trend - it's the new baseline. The framework that AI agents can extend most reliably will win in the long run. TypeScript + Next.js is that framework.

## Get Started

Open Mercato is production-ready with 15+ modules and 1,000+ unit tests.

`git clone https://github.com/open-mercato/open-mercato.git
cd open-mercato
npm install
npm run dev
`

Five minutes to a running ERP. Then build the part that matters - your business logic.

[Check out the repo](https://github.com/open-mercato/open-mercato). Star it if you think the ERP market needs a modern alternative :)
