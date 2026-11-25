---
webflowId: 6a58fb777c93f7e13678090c
title: 'Odoo vs Open Mercato: The Battle Card From Our Real Sales Calls'
description: 'Odoo comes up in half of our sales calls - and it should. Here is the actual battle card our partners use, and the real difference in philosophy: a suite you configure vs a foundation that adapts to you, with AI doing the heavy lifting.'
date: '2026-07-16T09:00:00.000Z'
updated: '2026-09-23T10:22:45.023Z'
author: tomasz-karwatka
category: ai-engineering-foundation-framework
featured: false
thumbnail:
  src: /media/blog/6a58fbf9b001dca9f6970cb1-odoo-vs-open-mercato-hero.png
  alt: ''
  decorative: true
draft: false
---

"There's a mature open-source suite with a thousand modules for this. Why would we pick you?"

I hear this in sales calls every month. Fair question. Odoo is the most successful open-source business suite ever built. So instead of dodging it, let me show you exactly how we answer - including the battle card our partners use.

## Where this comparison comes from

I'm Tomasz Karwatka. I co-founded Divante (exit at $65M), Vue Storefront/Alokai (Y Combinator, $40M Series A) and Open Loyalty. With my brother Piotr at Catch The Tornado we've invested in 40+ companies, including ElevenLabs. Over 20 years I've deployed, integrated or built custom modules for practically every enterprise system out there - Odoo included.

This summer we did something uncomfortable. We analyzed 50 transcripts of our own sales conversations across 17 enterprise accounts - insurance, construction, telco, pharma, logistics. Win/loss, MEDDICC, the whole thing. Odoo came up again and again as the default comparison. This article is built on what real buyers said in those rooms, not on a feature matrix from marketing.

## What Odoo gets right

Let's be honest first, because the battle card only works if you respect the opponent.

Odoo has 38,000+ modules in its app store. The best UI/UX of any open-source ERP. A massive community and excellent documentation. Low entry cost and three hosting options. If your processes fit standard ERP workflows and you want software that works out of the box with minimal development - Odoo is hard to beat. I've said it before and I'll keep saying it.

If that's you, stop reading and go install Odoo. Seriously.

## Why we refuse the feature war

Here's what we tell our own sales team: in a feature war with Odoo, we lose. On purpose.

Odoo has had 20 years to build modules. We will not out-module them. But our customer conversations showed something interesting: buyers compared us to everything at once - Salesforce, Dynamics, SAP, Comarch, Odoo, Monday, n8n, low-code platforms. When a buyer compares you to everything, they're really telling you the categories don't fit their problem.

And the problem we kept hearing wasn't "we lack modules." One client called their stack "an IT Frankenstein." Another ran sales on a CRM that "works 3 days out of 10." A third had been burned so badly by a suite vendor that "no golden chain" - no vendor lock-in - was their first requirement, before any feature.

Their problem was different: my processes don't fit any box, customizing the box is expensive and every customization makes the next upgrade worse.

That's not a feature gap. That's an architecture gap.

## Two philosophies, one decision

The real difference between Odoo and Open Mercato is not a list of checkboxes. It's what happens when your business process doesn't fit the software.

**Odoo is a product you configure.** When your process fits one of the 38,000 modules - wonderful, you're live in days. When it doesn't, you have two options: bend your process to the tool, or hire consultants to write Python customizations. Those customizations touch the framework. Every Odoo veteran knows what happens next: upgrades become a project of their own. Real customization means forking modules, and forks rot.

**Open Mercato is a foundation you build on.** Domain modules for CRM/ERP - orders, pricing, pipeline, multi-tenancy, RBAC, workflows - ship ready on day one. But the design center is different: your team extends the system with AI coding agents, on rails. Specs, guard-rails and review gates ship with the repo. Custom code lives in an overlay layer that never touches the core, so you pull our updates with zero merge conflicts. The open-closed principle as architecture, not as a code-review comment.

![](/media/blog/6a58fc7cf7ace8289f236524-odoo-vs-open-mercato-approach.png)

One is a suite that adapts you to it. The other is a foundation that adapts to you - with AI doing the heavy lifting.

There's a third difference buyers care about more than I expected: **what happens to your existing systems.** Odoo's natural motion is replacement - it wants to be your ERP. Open Mercato's natural motion is orchestration: SAP, Comarch or your legacy ERP stays the system of record, and new processes run as modern apps beside it, one process at a time. Like prefabricated walls - a mistake in the layout is a moved wall, not a demolished building. No rip-and-replace, no big-bang migration.

## The battle card

This is the actual card from our partner enablement kit. Four fronts, four cards - this is card 03.

**When you hear:** _"There's a mature open-source suite with a thousand modules for this."_

**Their case - and its cost:**

- Huge marketplace and low entry cost - true
- Real customization = forking modules; upgrades become legendary pain
- Pre-AI architecture: coding agents fight the framework instead of working with it
- Community module quality is a lottery; security patching is on you
- Key upgrade tooling lives in the paid enterprise editions

**Our case:**

- Built for AI-engineering from day one: specs, harness, guard-rails in the repo
- Extend everything without forking (open-closed) - upgrades stay safe
- Modern stack your developers and agents already know: TypeScript, Next.js, PostgreSQL
- Enterprise security by default: field-level encryption, audit log, RBAC
- One certified foundation instead of a thousand unvetted modules

**The winning line:** "Odoo gives you a thousand modules to adapt to. We give you a foundation that adapts to you - with AI doing the heavy lifting."

![](/media/blog/6a58fc5a5fdec01683147933-odoo-vs-open-mercato-battlecard.png)

## The AI-architecture point deserves one more paragraph

Odoo was architected in the pre-AI era. Its proprietary ORM and custom JavaScript framework have thin representation in what coding agents know well. Ask an agent to write an Odoo module and it struggles. Ask it to extend a TypeScript/Next.js monorepo with deterministic module structure and machine-readable extensibility contracts - and it delivers, with tests.

This is not a detail. If AI-assisted development is your baseline for the next five years - and in every company we talk to, it is - then the platform your agents can extend reliably compounds. The one they fight, compounds too. In the wrong direction.

## The business model difference

Odoo is open core. The Community edition is free, but the features enterprises actually need live in the Enterprise edition - priced per user. List price is around $37 per user per month, rising after year one. At 200 users you're budgeting six figures a year, and the per-seat meter punishes growth.

Open Mercato is MIT open source with an Enterprise Subscription priced per project - never per seat. Unlimited users, unlimited servers, public tiers starting at €1,000/month, set by your annual revenue. And a no-ransom rule: if the license expires, your software keeps running in its last version. You lose updates and support - never your system, never your data.

One of our customers put it well: it's a manufacturer's warranty, not a toll.

## When Odoo is the right choice

I need to be direct, because pretending otherwise would insult your intelligence:

- Your processes mostly fit standard ERP workflows - Odoo covers 90% out of the box
- You want a working system in days without writing code
- You don't have (or don't want) a development team or a technical partner
- You're a small company with simple, standard operations

In those cases Odoo is excellent. Don't over-engineer your life.

## When Open Mercato is the right choice

- Your processes are your competitive advantage and don't fit any standard box
- You have engineers (or a certified partner) and AI-assisted development is your direction
- You're in a regulated industry - insurance, pharma, finance - where field-level encryption, audit trails and production gates are entry conditions, not add-ons
- Your ERP stays the system of record and you need modern process apps beside it, one at a time
- You've been burned by per-seat pricing or vendor lock-in and want to own the code

## See for yourself

A live demo takes 30 minutes: [openmercatocloud.com/demo](https://openmercatocloud.com/demo). Docs: [docs.openmercato.com](https://docs.openmercato.com). And if you're an Odoo shop reading this and disagreeing - I mean it, write to me. The best parts of our battle card came from conversations like that.

_Tomasz Karwatka - co-founder of Divante, Vue Storefront/Alokai, Catch The Tornado. Building and investing in tech companies since 2004._
