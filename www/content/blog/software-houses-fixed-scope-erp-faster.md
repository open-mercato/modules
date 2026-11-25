---
webflowId: 69fb50239697f3d5006c9686
title: How Software Houses Can Deliver Fixed-Scope ERP Projects Faster with Open Mercato
description: Every software house delivering ERP projects spends 4-6 weeks on auth, RBAC, multi-tenancy and audit trails before writing a single business feature. That is the infrastructure tax. Here is how to skip it - and ship a full logistics ERP in six weeks instead of six months.
date: '2026-05-06T10:00:00.000Z'
updated: '2026-05-07T19:55:18.067Z'
author: tomasz-karwatka
category: architecture
featured: false
thumbnail:
  src: /media/blog/69fb50b323842f91c2dad1a5-b453f64d-d87d-4601-9073-ec6dc2b27158.png
  alt: ''
  decorative: true
draft: false
---

Every software house that delivers ERP projects has the same first six weeks. Auth. RBAC. Multi-tenancy. Audit trails. Data model. Six weeks before the team writes a single line of business logic the client actually paid for.

That's the infrastructure tax. It repeats on every project. It quietly destroys margins. And on a fixed-scope contract, it's the reason you finish behind, not ahead.

## The Real Cost of ERP Development for Software Houses

ERP is one of the most margin-sensitive categories in custom software delivery. Scope is large, expectations are enterprise-grade, and the underlying infrastructure is roughly identical across every engagement. The only real variable is whether your team rebuilds it from scratch each time, or starts from something better.

I've watched agencies repeat this loop for fifteen years. At Divante we shipped commerce platforms while clients kept asking us for the seventeenth dashboard. At Catch The Tornado, we now invest in software houses doing exactly the same dance. The pattern doesn't change - the leverage does.

## Why Fixed-Scope ERP Projects Go Over Budget

The problem isn't slow developers. It's the hidden infrastructure sprint that never makes it into the estimate.

Auth, role-based access, multi-tenancy, encrypted vaults, audit trails, search, caching - none of these are features the client asked for. They're prerequisites. They take weeks to build correctly.

Then there's the customization trap. Many teams reach for Odoo or ERPNext, only to spend weeks fighting framework conventions instead of writing client logic. Fork core to customize behavior, and you inherit maintenance debt that compounds with every release.

The result: projects that start late on real features, run over budget, and leave your team dreading the next engagement of the same type.

## What a Reusable ERP Foundation Actually Looks Like

A proper reusable foundation is not a template or a starter kit. It's a versioned, installable core that ships with the primitives every ERP project needs - and a customization model that does not require a fork.

[Open Mercato](/) is built exactly for this. An open-source CRM/ERP foundation framework on a Next.js and TypeScript stack. Run `npx create-mercato-app` and your team starts on business logic immediately. The infrastructure is already there.

### The Overlay Model: Extend Without Forking

The key architectural decision in Open Mercato is the **Overlay System** (built on the Open-Closed Principle). Customizations live in your layer, not in the core. You replace modules, override workflows, and extend behavior at build time - without touching the versioned core.

When a new release ships, you update the core package. Your overlays stay intact. No merge conflicts. No forked codebase to maintain across five client projects.

For a software house delivering the same type of ERP to multiple clients, that is the difference between a genuinely reusable product and a one-off build every time.

### What Ships Out of the Box

Open Mercato ships with the infrastructure your team would otherwise spend weeks building:

- **Auth, RBAC, multi-tenancy** - role-based access and tenant isolation, ready to configure
- **Audit trails and encrypted vault** - AES-256/AES-GCM encryption and full audit history with undo/redo
- **Domain modules** - CRM, Orders & Shipping, Catalog & CPQ, Workflows, ERP primitives
- **Performance layer** - Meilisearch-powered search and Redis caching included
- **AI assistant integration** - MCP support; agent-aware architecture specs ship with the repo
- **PostgreSQL** - a real relational database, not a proprietary data layer

Your first commit is a feature, not a setup task.

## How Open Mercato Changes the Delivery Math

### From Six Months to Six Weeks

[FreightTech.org](https://freighttech.org) built a fully owned logistics ERP on Open Mercato in **six weeks**. Scope: CRM with automated quote handling, estimated vs. actual cost control, and live Track & Trace integration with major shipping lines and AIS vessel positioning data. No license fees. No lock-in. One platform for the full operational cycle.

That kind of timeline is only possible when you start with 80% of the infrastructure already done. Your team writes the 20% specific to the client - domain logic, integrations, workflows that make the product theirs.

For a software house, that math changes everything. Shorter delivery cycles mean more projects per year. More projects per year means better margins on fixed-scope work. And a reusable foundation means each new engagement starts faster than the last.

### AI-Assisted Development from Day One

Open Mercato ships with agent-aware architecture specs in the repo. When your developers use Cursor, Claude Code, or OpenAI Codex, those tools understand the architecture from the start - writing overlay-aware code that stays consistent with the domain model.

You don't spend time correcting AI output that ignores your conventions. The specs are already there. A feature that takes two days to scaffold cleanly in a Django/Laravel codebase gets generated in 30-60 minutes - with Playwright tests, in your own Git, on your own infrastructure.

## Comparing Your Options in 2026

Software houses evaluating ERP foundations in 2026 have several options. Here's an honest comparison:

![](/media/blog/69fb53e8b832d3f41c75f42e-25f5a1e9-0a9c-4d8b-97e5-9317ee8743e0.png)

The honest differentiator: Open Mercato is the only option on a modern TypeScript/Next.js stack that ships full ERP/CRM primitives with an upgrade-safe customization model. That combination doesn't exist elsewhere right now.

## How to Get Your Team Started

Getting started takes minutes, not days.

`npx create-mercato-app my-erp-project`

That command scaffolds a working environment with the full Open Mercato foundation. From there, read the [architecture docs](/architecture) to understand the overlay system and modular monolith structure, then start building overlays for your client's specific requirements.

Open Mercato is **MIT licensed** - no cost for the core. Enterprise support tiers and a certified implementation partner network are available for teams that need SLAs and structured onboarding. Details at [openmercato.com/enterprise-level-support](/enterprise-level-support).

If your agency delivers multiple ERP projects per year, the [agencies page](/agencies) explains how the overlay model protects your margins across engagements.

The GitHub repo has **1,200+ stars and 100+ contributors** as of 2026. The community is active on Discord. Latest release: v0.4.8.

## FAQs

**What is ERP development for software houses, and why is it different from building internal tools?**

ERP development for software houses means delivering a full business system - CRM, order management, inventory, workflows - to a client on a fixed scope and budget. Unlike internal tools, these systems must be maintainable, extensible, and owned by the client long-term. That raises the infrastructure bar significantly.

**How does Open Mercato reduce delivery time on ERP projects?**

Open Mercato ships with auth, RBAC, multi-tenancy, audit trails, an encrypted vault, and business modules already built. Your team skips the infrastructure sprint and writes client-specific features from day one. The FreightTech.org case study shows a full logistics ERP delivered in six weeks on this foundation.

**What is the overlay system and why does it matter for agencies?**

The overlay system lets your team extend or override Open Mercato's behavior without touching the core codebase. Customizations live in your layer. When the core updates, your overlays stay intact. For agencies delivering similar ERP systems to multiple clients, this means a genuinely reusable foundation - not a one-off fork each time.

**Is Open Mercato suitable for client-facing ERP projects, or just internal use?**

Built for client-facing delivery. The multi-tenancy, RBAC, audit trails, and encrypted vault are enterprise-grade primitives. FreightTech.org is a documented example of a production deployment for a real business.

**What does it cost to use Open Mercato for commercial client projects?**

The core framework is MIT licensed - no licensing cost. You can deliver commercial client projects without paying for the foundation. Enterprise support tiers and implementation partner services are available for teams that need them.

**How does Open Mercato compare to building on Odoo or ERPNext for client projects?**

Odoo and ERPNext are mature ERP suites on Python stacks. Deep customization typically requires forking, which creates upgrade conflicts over time. Open Mercato runs on Next.js and TypeScript, uses an overlay model that preserves upgradeability, and gives your team a modern stack that AI coding tools understand natively.

**Can AI coding tools like Cursor or Copilot work effectively with Open Mercato?**

Yes. Agent-aware architecture specs ship with the repo. Tools like Cursor, Claude, and OpenAI Codex read those specs and generate code that follows the overlay model and domain conventions. Your team spends less time correcting AI output and more time shipping features.

## Stop Rebuilding. Start Delivering.

The infrastructure sprint is optional. Your team doesn't have to rebuild auth, RBAC, multi-tenancy, and data models from scratch on every ERP engagement. That time belongs to your client's features, not your boilerplate.

Open Mercato gives your software house a reusable foundation on a modern stack, with an overlay model that protects your investment across every project you deliver.

Clone the repo. Write your first overlay. Ship faster.

Learn more at [openmercato.com](/).
