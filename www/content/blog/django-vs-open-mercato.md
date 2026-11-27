---
webflowId: 69f08f893d586b33e7ffc4fa
title: "Django vs Open Mercato: Why a Mature Framework Isn't Always the Right Foundation in 2026"
description: Django has been the default for serious web apps for almost 20 years. But for ERP/CRM-class systems in the AI-coding era, a TypeScript-first platform with production modules out of the box is a stronger bet. Here's a concrete comparison.
date: '2026-04-28T10:00:00.000Z'
author: tomasz-karwatka
category: architecture
featured: false
thumbnail:
  src: /media/blog/69f09146d0d07a4ea99ab3b2-zrzut-ekranu-2026-04-28-o-12.51.37.png
  alt: ''
  decorative: true
draft: false
---

Django is the framework I respect the most and recommend the least these days.

That sentence will annoy a few people, so let me explain. I’ve shipped Django apps. I’ve hired Django teams. I’ve been in due diligence rooms where a clean Django codebase saved a deal. The framework is excellent. But the question I keep getting from CTOs in 2026 isn’t “is Django good” - it’s “is Django still the right starting point for an ERP/CRM system we’ll run for the next 10 years?”

Different question. Different answer.

## How I Know What I’m Talking About

I’m Tomasz Karwatka. I co-founded Divante (exit at $65M), Vue Storefront/Alokai (Y Combinator, $40M Series A), Callstack, and Open Loyalty. With my brother Piotr at Catch The Tornado, we’ve invested in over 40 companies, including ElevenLabs.

I’ve watched three generations of “framework wars” play out - Rails vs Django, Django vs Node, and now whatever-you-have vs AI-assisted codebases. Django won the second round on merit. The third round has different rules.

## What Django Actually Does Well

I don’t want to start with the criticism, because most of it is fair only in a specific context.

**Django ORM and migrations.** Twenty years of polish. The query API is one of the cleanest in any framework. Migration handling is mature in a way only Rails comes close to.

**Django Admin.** The killer feature of 2005 that’s still impressive in 2026. Five lines of code, a working admin panel for any model. For internal tools and content management, this alone has justified Django for two decades.

**Batteries included.** Auth, sessions, forms, i18n, signals, cache, file storage, security middleware. Out of the box. No 47-package npm install just to get a login form.

**Django REST Framework.** The de facto standard for building APIs in Python. Serializers, viewsets, permissions, pagination - all consistent.

**Talent and ecosystem.** Pip installable everything. Stack Overflow answers from 2009 are often still correct. Senior Django developers are not hard to find.

If your problem is “build a content-driven web app, an internal admin, a research tool, a CMS, or a Python-shop microservice” - Django is still close to optimal. I will recommend it for those cases tomorrow.

## Where Django Stops Being the Right Tool

The trouble starts when you try to use Django as the **operating system of a company** - a long-running ERP/CRM platform with multi-tenancy, complex permissions, custom fields, business workflows, modern frontend, and AI-assisted development as a baseline.

**Pain #1: Django gives you a framework, not a system.** You don’t get a CRM. You don’t get a product catalog. You don’t get a workflow engine, an audit log with undo/redo, field-level encryption, or vector search. You get a foundation - and 12-18 months of building those layers yourself. At Divante we did the math repeatedly: every ERP project starts with $1-4M of infrastructure work before anyone writes business logic.

**Pain #2: the frontend gap.** Django templates were great in 2010. In 2026, your users expect React, your designers ship Figma to React, your business wants real-time dashboards. The standard answer - “Django backend + separate React/Next.js frontend” - means two repos, two deploy pipelines, two type systems, and a permanent contract drift between Pydantic-or-DRF on one side and TypeScript on the other.

**Pain #3: the AI-coding mismatch.** This is the one nobody wants to talk about yet. The current generation of coding agents (Claude Code, Cursor, Copilot) is dramatically more productive on TypeScript codebases than on Python ones. Not because Python is worse - because the type system is weaker, the editor signal is noisier, and the agent has to reason about runtime behavior instead of compile-time guarantees. If you’re building a system you’ll extend with AI for the next 5 years, that gap compounds.

**Pain #4: multi-tenancy is bolt-on.** Django doesn’t have native multi-tenancy. You bolt on `django-tenants` (schema-per-tenant) or roll your own row-level filtering. Both work. Both leak. I’ve reviewed three Django systems where a junior developer forgot a `.filter(tenant=request.tenant)` and shipped a cross-tenant data leak to production.

**Pain #5: the customization problem.** When you build a Django ERP and a customer wants a custom invoicing rule, you fork. Forks rot. You end up maintaining a private branch that drifts from upstream. Sound familiar? It’s the same trap that ate every SAP/Odoo deployment in the last 20 years.

## Open Mercato - A Different Starting Line

[Open Mercato](/) is not “Django but in TypeScript”. That comparison undersells both.

Django is a **web framework** - you build apps on top of it.\
Open Mercato is a **production ERP/CRM platform** - you extend the modules that already exist.

The stack:

What you get on day one - not as scaffolding, as production modules with 1,000+ unit tests:

You start at 80%. The 20% you build is the part that actually differentiates your business.

## The Comparison You Came For

![](/media/blog/69f0917eb83762b2a7699770-zrzut-ekranu-2026-04-28-o-12.52.16.png)

## The Overlay Pattern - Why This Matters in Year Three

This is the difference most people only see when they’re already in pain.

In Django, customization for a specific customer means one of three things: (1) fork the project, (2) write a plugin and pray the upstream API doesn’t change, or (3) add config flags until the codebase is unreadable. Every option ages badly.

Open Mercato applies the Open-Closed Principle as architecture. All your code lives in the **Overlay** layer. You never touch core.

`// Override the pricing engine for a specific tenant.
// Core stays untouched.
import { PricingService } from '@open-mercato/sales';

export class IndustrySpecificPricingService extends PricingService {
 calculate(item: CatalogItem, ctx: PricingContext): Money {
   return this.applyRegulatoryRules(item, ctx);
 }
}
// Register in the Awilix DI container.
// Pull the latest Open Mercato release - zero merge conflicts.
`

Same on the frontend. **Page Override** swaps a page without forking. **Widget Injection** drops an element from one module into another. **Scaffolding** generates a CRUD in seconds.

The contract is explicit: business code never blocks a platform upgrade. That’s something a generic Django project, by definition, can’t promise.

## AI-Native Architecture - Concrete, Not Marketing

Every framework now claims to be “AI-friendly”. Django adds a `DJANGO_AI_README.md` and calls it done. The reality is different.

Open Mercato is built so that **your** AI agent (Claude Code, Cursor, Copilot) can extend it reliably:

In practice, a feature that takes 2 days to scaffold cleanly in Django (model + migration + admin + serializer + viewset + URL + frontend) gets generated by an agent in 30-60 minutes in Open Mercato - with Playwright tests, in your own Git, on your own infrastructure.

Python’s typing has improved dramatically (mypy, Pydantic v2, Django-stubs) but it’s still a retrofit. TypeScript was designed for this from day one, and agents exploit that.

## When to Pick Django (Honestly)

I’m not going to pretend Open Mercato beats Django on every axis. Pick Django when:

In those scenarios Django is still excellent. Don’t overcomplicate.

## When Django Is the Wrong Starting Point

Django becomes the wrong choice when:

In those scenarios Django isn’t a bad framework. It’s simply **the wrong category** for the job.

## A One-Page Decision Framework

The matrix I use when CTOs ask:

If 3 or more answers point you toward Open Mercato - Django is the wrong starting line.

## What to Do Tomorrow

Two concrete things.

**If you have a Django ERP/CRM project that’s growing painful:** run a 1-hour audit. Count how many of these you’ve already built or plan to build: multi-tenancy, RBAC, audit log, encrypted fields, catalog, workflows, vector search. Each one is 2-6 weeks of senior work. The honest math usually surprises people.

**If you’re starting a new ERP/CRM project:** instead of `django-admin startproject`, clone Open Mercato and see what you get in 5 minutes.

`git clone https://github.com/open-mercato/open-mercato.git
cd open-mercato
npm install
npm run dev
`

Five minutes to a running CRM/ERP with 15+ production modules. Then you build the part that actually makes a difference - your business logic.

[The repo is here](https://github.com/open-mercato/open-mercato). If you think enterprise software needs this kind of alternative, drop a star.
