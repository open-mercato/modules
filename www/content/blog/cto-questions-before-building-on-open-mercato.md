---
webflowId: 6a6c60141dbb15bd11701d59
title: Eleven Questions CTOs Ask Before They Build on Open Mercato
description: 'The questions that come up in almost every technical due diligence call: versioning, traceability, upgrades, contributor QA, token costs, scale and the business model behind an MIT license. With the answers we give in the room, including the ones where the honest reply is that we have not done it yet.'
date: '2026-07-31T09:00:00.000Z'
updated: '2026-11-23T22:53:31.443Z'
author: tomasz-karwatka
category: ai-engineering
featured: false
thumbnail:
  src: /media/blog/6a6c63cb08d0ccd61a88c4d0-cto-questions-hero.png
  alt: ''
  decorative: true
draft: false
---

These questions repeat in almost every technical due diligence we run, so here are the answers we give in the room, including the parts where the honest answer is “we have not done that yet.”

## 1. “You are on a 0.x version. How do I build on something that changes under me?”

Fair. Our version numbering is conservative on purpose - what we call a minor release ships what most vendors would call a major one.

The mitigation is a written module compatibility specification. It lists, at a low level, what is allowed to change in the core and what is frozen, because breaking those contracts would break every module downstream. Coding agents get that spec in code review and in every implementation task, with hard rules against violating it.

When we do have to break something, three mechanisms cover you: upgrade notes for the small stuff, an automatic upgrade skill that rewrites your code (we shipped one for an ORM migration, and it did the job), and the enterprise subscription, where we perform the upgrade of your application ourselves. Upgrades are the part of platform ownership that everyone underestimates, so we took it onto our side of the table.

## 2. “Who guarantees that what gets merged is what you designed?”

This is the traceability question, and it is the sharpest one on the list. Vision lives in someone's head, a contributor implements it, and six months later nobody can tell whether the result matches the intent.

Our answer is spec-driven development with enforcement. Every feature has a specification in the repo. Features without a spec do not get implemented - an automatic triage skill reviews every pull request and raises an alert the moment a change arrives without one. Bug fixes are exempt, everything else is not.

Each large module has a named owner. The CRM, for example, is developed by a three-person team: a product and UX designer, an engineer with deep CRM background, and QA. When someone proposes lengthening a description field on deals, the UX owner reviews the interaction and someone checks what that field does to SQL performance. That is a slow process. It is also the reason the product still feels like one product.

## 3. “You have 130 open pull requests and over a hundred contributors. Is that a bazaar?”

The open PR count rarely drops below 130, and that number is a feature of the review policy. Every pull request goes through code review, manual QA and a test pass. Mass merging is impossible by design.

The rule that keeps quality up: we generally do not accept new features from outside contributors, including partners. Bug fixes, yes, and people fix impressive things. New functionality goes through the core team, either built by us or built by a partner against a specification we wrote and verified. We learned this the hard way early on - a generous pull request with a new feature, terrible usability, and no fit with the rest of the system.

Look at pull requests rather than commits when you audit our activity, by the way. We squash on merge, so a 390-commit branch lands as one line of history.

## 4. “Can we extend it without touching your core?”

That is the entire architectural bet, and it comes from years of watching customized platforms become unupgradeable.

What you get out of the box: custom fields with data projections into query tables so filtering stays fast, entity renaming so the CRM speaks your domain language rather than ours, a screen extension framework for adding or removing tabs and sections in existing views, and an API extension layer.

The API part is worth a sentence. Existing endpoints can be extended through what we call enrichers. You fetch a customer through the same single REST call, and additional fields arrive from another system - usage data, contract state, whatever your business runs on. It behaves like federation in GraphQL, with caching on top. Your custom module hooks into ours, and the core files stay untouched.

## 5. “How bad are upgrades in practice?”

The best evidence we have is a logistics software house building a commercial SaaS for maritime freight on top of Open Mercato. Containers, customs handling, heavy operational domain logic. They started on version 0.3 early this year, they run in production, and they have tracked our releases continuously since. No forks, no frozen version, no replatforming project.

They are also a contributor, which is the model we like most: a customer who ships fixes back into the foundation they depend on.

## 6. “It is MIT licensed. Where is your business model, and where is the catch?”

The catch is that we want to be paid for [AI engineering support](/enterprise-level-support) rather than for access to the code.

Here is what we see in every enterprise we walk into. The board came back from a conference and wants agents everywhere by Q3. The engineering floor is under pressure to deliver AI-generated code at a pace nobody has governance for, and if something breaks in production it lands on IT. The gap between those two floors is where our commercial value sits.

So the enterprise subscription is structured as support: code review of what your team and your agents generate, audits of your harness, performance and security review before major deploys, upgrades of your application to current releases, and priority in the core roadmap when you hit a real limit. On top of that come the proprietary enterprise modules - MFA and SSO, record locking, and [the Agent Orchestrator](/blog-posts/introducing-agent-orchestrator) for running and governing agents inside your own application. Pricing is per project and never per seat, with tiers based on company revenue.

The framework stays yours under MIT either way. If the subscription lapses, nothing switches off and no ransom applies.

## 7. “What happens to us if you lose interest and go build rockets?”

The code is MIT licensed, so the worst case leaves you with a working system, a fork, and a market of certified partner agencies who already know the codebase. That is a materially better plan B than a bankrupt SaaS vendor whose license server stops answering.

Beyond that: we just increased the share capital of the company with a million dollars of our own cash, key engineers are becoming shareholders, and both founders have publicly committed to this being the product they run for years. Our largest exposure here is reputational. We have built companies that outgrew us before, and this one is being built to run without us on purpose.

## 8. “Does it scale?”

We load tested at a million customer records, and the largest production deployment today is the freight SaaS mentioned above, running real volume every day. We do not have a reference at ten million customers, and we say so on the call rather than after the contract.

What we do commit to: scalability problems found by a subscription customer get priority in the core, because the whole positioning depends on the platform holding up under enterprise load.

## 9. “Have you measured technical debt with an independent tool?”

We have run security analysis extensively, with scanners and with deep LLM-based audits in paranoid mode, which produced a hundred to a hundred fifty issues in a pass, none of them critical, all triaged.

Technical debt measurement is a fair ask and a reasonable condition for a large deployment. If your team wants that report before a go-decision, we will run it and share the raw output.

## 10. “If agents have to read your source code, our AI bill explodes.”

This is the most modern question on the list and my favourite one. At around thirty dollars per million tokens for frontier coding models, letting agents read a large codebase to complete a small task is a budget problem, and subscription plans hide that cost only until you scale.

An agent reading our source code to add a tab to the CRM means our harness failed. So we rebuilt it. The instruction set is now assembled dynamically from small chunks - adding a field is one chunk, adding an integration is another - and stays under 65 KB of context for a typical task. In roughly 70 to 80 percent of tasks the agent writes correct code without opening the core source at all, because the contracts, patterns and conventions are in the harness.

The side effect matters more than the cost saving. Cheaper models start producing usable Open Mercato code, which changes the economics of who can build on the platform. The harness ships with the framework, including our internal skills for data design, backend patterns and UI work.

## 11. “We have our own design system. Do we have to use your UI?”

No. The API layer is fully accessible, so replacing the admin UI or building your own front end against Open Mercato is a supported path.

We usually suggest the opposite order for the first meeting with your product and design people: keep the platform untouched, restyle a demo with your design system, and show it next to whatever incumbent you are being compared against.

## What we say at the end of every one of these calls

Our job in a due diligence call is to make the risk legible rather than to argue anyone out of it. You are betting on a young platform, an AI-first engineering method, and a small core team. In exchange you own the code, you get a foundation your agents can build on safely, and you can ship a production process in weeks instead of quarters.

Bring the hard version of these questions to your next call with us. The answers do not change when the room gets uncomfortable.

**Already building on Open Mercato and want a second opinion on your architecture or your AI harness?**

Our team runs consulting reviews for existing users - write to info@openmercato.com.
