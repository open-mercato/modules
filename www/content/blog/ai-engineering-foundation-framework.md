---
webflowId: 69f1c949c1422e5c2f2a48ad
title: AI-Engineering Foundation Framework
description: "84% of developers use AI. 66% spend more time debugging it. The fix isn't a better model - it's a better foundation. Welcome to a new category: AI-Engineering Foundation Framework."
date: '2026-04-29T00:00:00.000Z'
author: tomasz-karwatka
category: ai-engineering-foundation-framework
featured: true
thumbnail:
  src: /media/blog/69f1c9c894096c371d087414-open-mercato-cover-ai-engineering-foundation.png
  alt: ''
  decorative: true
draft: false
---

A CTO told me last month: _“We rolled out Cursor across the team. Productivity went up. Code quality went down. I have no idea what's worse - junior devs writing bad code, or junior devs prompting Cursor to write bad code 5x faster.”_

That sentence stuck with me. Because it's exactly what the data shows.

## The numbers nobody's talking about

Stack Overflow Developer Survey 2025 - 49,000 respondents:

- **84%** of developers use AI tools
- **46%** don't trust AI output accuracy (up from 31% YoY)
- **66%** spend _more_ time debugging “almost-correct” AI code
- Only **17%** believe AI agents have improved team collaboration

JetBrains Developer Ecosystem 2025 (24,534 devs) ranks the top concerns about AI in coding: inconsistent quality, limited understanding of complex logic, privacy/security risk, negative impact on coding skills, lack of context-awareness.

Read those again. This is not a model problem. **This is a foundation problem.**

## A bit about why I care

I'm Tomasz Karwatka. I co-founded Divante (exited at €65M), Vue Storefront/Alokai (Y Combinator, $40M Series A), Callstack, and Open Loyalty. With my brother Piotr at Catch The Tornado, we've invested in 40+ companies, ElevenLabs included.

I've watched three generations of “framework wars” - Rails vs Django, Django vs Node, and now whatever-you-have vs AI-assisted codebases. Every wave changed the rules. This one changes them more than the previous two combined.

I'm now building Open Mercato with Piotr. The reason I'm writing this blog post: every CTO conversation I had in Q1 2026 ended in the same place - _“AI works for my two seniors. It doesn't work for the team.”_ That's not random. That's structural.

## Cursor won the editor. The architecture layer is open.

Cursor hit $2B ARR. 50% of Fortune 500 use it. The “AI in the editor” layer is _won_ - and it's a great win. But that's the easy half.

The hard half is what happens when 30 engineers, prompting differently, pushing into the same monorepo, generate code that's _individually_ fine and _collectively_ incoherent. That's where the 66% of “more time debugging” lives.

The pattern is the same one that ate every SAP/Odoo deployment in the last 20 years: _each customization is reasonable; the system as a whole becomes unmaintainable._

What's missing is a layer between the AI-in-the-editor and the project itself - a foundation that tells the agent _where_ code goes, _how_ it's layered, _what conventions_ it must follow. Not a style guide PDF. An executable architecture.

That's the category I want to name: **AI-Engineering Foundation Framework**.

## The category map

Here's where the white space sits:

- **AI Code Assistants** (Cursor, Copilot, Codex) - solve in-file code generation. Don't solve architectural consistency or “where does this go”.
- **Low-code / No-code** (Retool, Bubble) - solve fast internal tools. Don't solve lock-in, code ownership, or scale ceilings.
- **Headless ERP/CRM** (Medusa, ERPNext) - solve domain backend. Don't solve AI-native workflow or blank-page syndrome with agents.
- **Spec-driven dev** (OpenAPI, JSON Schema) - solve API contracts. Don't dictate app architecture.
- **AI-Engineering Foundation Framework** (Open Mercato) - architecture + specs + domain modules + AI-native defaults. The new category.

A SaaS CTO quoted in the a16z 2025 report: _“90% of code AI-generated, up from 10-15% with GitHub Copilot.”_ Trajectory is clear. The gap is also clear: who makes sure that code is consistent, secure, and architecturally sound at team scale?

## Five pain points I see in every CTO conversation

**1. 40% of team time on internal tools.** Reflex.dev measured it: 40% of engineering capacity goes to building and maintaining internal tools. Your best engineers, instead of pushing the product forward, are building yet another admin panel. Every new tool = new debt without an owner. I saw this at Divante - we shipped commerce platforms while customers asked us for the seventeenth dashboard.

**2. AI adoption without governance = chaos.** Every developer prompts differently. There's no way to manage quality at the team level. The Stack Overflow data - only 17% saying AI improved team collaboration - is the receipt for that.

**3. Vendor lock-in and rising SaaS costs.** Deloitte Tech Spending Outlook 2025: digital budget grew from 7.5% of revenue (2024) to 13.7% (2025). Every license is being questioned. Internal tools on Retool or Bubble look cheap on day one. They become a multi-year pricing trap.

**4. Scaling “AI-native” teams without infrastructure.** McKinsey, November 2025, 300 companies: high-performers in AI see 16-30% productivity gains and 31-45% quality improvements - _but only the top tier with AI-native workflows in place_. Most of the market has tools, not foundations.

**5. Build vs Buy vs Build-with-AI - no clear answer.** Buy → lock-in. Build → expensive maintenance. There's a third path nobody's selling: **build on a foundation that's 80% done, with full code ownership.** That's what we're shipping.

## What we did differently with Open Mercato

Eight differentiators. I'll keep them tight:

**1. Architecture-aware AI.** Agents know _where_ in the project to place code, not just _how_ to write it. That's the paradigm shift.

**2. Spec-first development.** Specs ship with the repo from day one. Output becomes reproducible. ADRs (Architecture Decision Records) log design decisions automatically - your future self thanks you.

**3. Open-Closed without forking.** Ships as npm packages. Custom deployments override any component, page, or module. Rich event system. Queues, cache - swappable via DI. You can build a 100% custom application using 80% of Open Mercato without touching the core. And still upgrade.

**4. The modern stack AI understands best.** Next.js / React / TypeScript. Largest training corpus for LLMs = the most reliable AI agents. This isn't religion - it's an empirical observation about what models perform best on.

**5. Enterprise-grade security by default.** State-of-the-art per-field AES-GCM encryption with individual keys. Tenant-scoped key rings. Full audit log on every data access. Undo/redo at the application level. Opens doors to HealthTech, FinTech, regulated industries - without fearing the audit.

**6. Enterprise design patterns AI is forced to follow.** AI loves shortcuts. The framework doesn't allow them - swappable strategies, SAGA, SOLID, sensitive data handling rules. Agents work inside guard-rails they can't break.

**7. Teachability.** The whole team enters AI-assisted dev, not just 1-2 seniors. The context, prompts, and guard-rails we use to build Open Mercato are the same ones we ship to you.

**8. AI-native from the foundations.** Data, workflows, and permissions are designed for AI agents from day one. AI is not bolted on - it's first-class.

## Why now

The question is no longer _“should we use AI?”_ It's:

**How do we build the foundation so AI works predictably and safely at team scale?**

Cursor and Copilot won the “AI in the editor” layer. The next layer - **AI at the project architecture level** - is wide open. That's where Open Mercato lives.

Nobody else on the market is saying: _“Teach your whole team AI-engineering on a ready-made foundation - instead of fighting blank-page syndrome in Cursor.”_

## So what do you actually do tomorrow?

If you're a CTO reading this - and your team has rolled out Cursor or Copilot but hit the wall I described - try this concrete thing:

Pull a recent PR that was AI-generated. Open it next to your three core architectural docs (if you have them). Count how many decisions in that PR were made by the AI _despite_ contradicting your architecture, simply because the AI didn't have the docs in context. That number is your foundation gap.

Then ask: _what would it cost to fix that gap once, vs. catching it in code review forever?_

That's the math behind why I'm building Open Mercato.

## Bottom line

Open Mercato is not another code generation tool. It's the **foundation on which AI generates code that makes sense**.

The category we're defining - **AI-Engineering Foundation Framework** - sits exactly where the market has a gap: between snippet-level AI assistants and locked-in low-code platforms.

It's the infrastructure for the next wave of applications built directly against real business problems. Full code ownership. AI-native from the foundations. Enterprise-grade security by default.

We're the foundation of a new era in enterprise software. If that sounds like what your team needs - [openmercato.com](/). Repo is open. Docs are open. Specs are open. Come build with us.
