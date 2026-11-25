---
webflowId: 6a19ad681ed83a1f015c929f
title: 7 Questions Software Agencies Keep Asking About Open Mercato
description: 'We have 25 agency partners. They are not shy. Here are the nine concerns they raise in almost every call - and our honest answers, including the ones that hurt to write. MIT vs. Enterprise: pricing, lock-in, framework complexity, and more.'
date: '2026-05-29T10:00:00.000Z'
updated: '2026-06-10T18:05:56.541Z'
author: tomasz-karwatka
category: architecture
featured: false
thumbnail:
  src: /media/blog/6a19b33951d287b8847b1619-zrzut-ekranu-2026-05-29-o-17.39.25.png
  alt: ''
  decorative: true
draft: false
---

_We have 25 agency partners. They are not shy. Here are the seven concerns they raise in almost every call - and our honest answers, including the ones that hurt to write._

Open Mercato has been around for a year. In that year we've onboarded 25 agency partners., Every single one of them has, at some point, raised the same set of concerns.

This post is the consolidated version. No marketing gloss. No "trusted partner ecosystem" filler. The actual fears, the actual reasons they're rational, and what we're doing about each of them.

If you're an agency considering Open Mercato - read this before you call us. It will save us both an hour.

## 1. "What's free today will be Enterprise tomorrow."

This is the single biggest fear, and the most rational one. We earned it.

Here is what's true and what isn't:

- **The MIT-licensed core stays MIT.** Forever. Anything on GitHub today under MIT cannot be retroactively re-licensed. We have no plan and no mechanism to do so.
- **The Enterprise/Standard line will be public.** We are publishing a feature matrix and a roadmap so partners can see what is moving, where, and why - before it ships.
- **Surprise moves are not accepted.** Anything that affects a partner's active pipeline will be flagged before merge, not after.

The Red Hat comparison one partner gave us still stings - and it's accurate. Trust takes years of consistent behavior, not promises. We're at the start of that build, not the end of it.

## 2. "Where exactly is the line between Standard and Enterprise?"

For most of 2025 the honest answer was: we were figuring it out as we went.

The rule going forward:

- **Standard** ships everything an agency needs to deliver a real CRM/ERP project to a mid-market client. Auth, RBAC, multi-tenancy, audit, encrypted vault, search, caching, the domain modules, the overlay system. Nothing in Standard requires our involvement.
- **Enterprise** covers what enterprise procurement specifically asks for: advanced concurrency primitives, SSO, advanced workflow controls, certain integrations, SLA-backed support, security reviews. These are the things big buyers expect to pay for.

If a feature exists in Standard today, our default is it stays there. If something must move, we'll say so publicly with at least one release of notice and a clear reason.

## 3. "Why be a paid partner when I can just take MIT and run?"

You can. The MIT license means any agency on earth can fork Open Mercato, build on it, and never speak to us. That is, in fact, part of the design - we want Open Mercato to be the industry-standard foundation for CRM/ERP work, full stop.

What partners get that non-partners don't:

- **Inbound leads.** When buyers come to us directly, we route them to certified partners.
- **Certification.** Visible signal to buyers that your team has actually shipped on the platform.
- **Co-marketing.** Module attribution in release notes. Case studies. Joint webinars. Visibility on our channels.
- **Roadmap influence.** The Core Team Discord channel where actual product decisions happen. Recently-active contributors get invited.
- **Module ownership.** Build something useful and it ships with your name on it. Patryk Lewczuk, one of our most active contributors, has been credited explicitly in releases. Buyers find him through that work.

And the hard part: **we don't want partners who won't commit to selling licenses.** If your model is "take the MIT core and run," that's fine - use it, ship great work, we wish you well. But that isn't a partnership. A partnership means we both make money from the same client engagement, and we both invest accordingly.

## 4. "The framework is huge. Can my developers - and their AI tools - actually handle it?"

Yes. And the bigger AGENTS.md is, the better it works.

One partner asked us recently why our AGENTS.md is so long compared to other open-source projects. Short answer: because we want the LLM to write code that fits our architecture the first time, not the third time.

The proof points:

- **1,700+ pull requests merged in six months.** Largest release after a hackathon: 300+ PRs in a single release.
- **Zero production incidents** in those six months. With the harness, the skills, the integration tests, and Code Review by the Core Team - autonomous agents write code that ships safely.
- **Codex 5.2 and Claude Opus 4.8 stay inside the framework.** We rarely see them invent patterns that contradict our conventions. UI is the noisier surface - that's a specification problem, not a model problem.

One contributor - a senior Python/AWS engineer who'd never touched Node - shipped meaningful contributions in four steps without learning the stack first. That's not a fluke. That's what a well-specified architecture buys you.

## 5. "Where's the business-facing material so I can actually sell this?"

Honest answer: still light. Our 2026 priority order has been:

1. Developer mindshare. We want every modern engineering team to recognize Open Mercato the way they recognize Next.js or Strapi.
2. AI-assisted engineering education. The new program with Brave Education ships shortly. Sandboxes, skills, the full harness - for engineering leaders rolling AI across teams.
3. Business-buyer material. CIO decks, ROI calculators, vertical case studies. Q3 priority.

What does exist for buyer conversations today: the FreightTech.org case (full logistics ERP in six weeks), the comparison piece against Twenty, the architecture page, and the early customer logos (Comerito, BGW Pharma, Auroria, Rimthan). We'll keep pushing on this - and we'll send drafts to partners before publication so you can shape what we publish.

## 6. "Modules feel rigid. What happens when my client needs something specific?"

This is the wrong fear, but it's a common one, so it's worth addressing.

Open Mercato has an **Overlay System**. You extend, replace, or override behavior in your own layer - without forking core. When the core updates, your overlays survive. No merge conflicts. No abandoned downstream branches.

The generic modules - CRM, OMS, WMS, HRM, workflow, forms - are deliberately built as _building blocks_, not finished products. The CRM has deals, contacts, companies, activities, comments. It is not the best CRM in the world. It is a CRM foundation you can shape into the best CRM for your specific client. Same logic for everything else.

If you find yourself fighting the framework instead of using it, tell us. That's a bug in our design, not a feature.

## 7. "Trust takes time. How do we know you'll still be here in three years?"

Fair. The only thing that answers this question is consistent behavior over years.

What we can show you today:

- **1,250+ GitHub stars, 100+ contributors, 25 agency partners, first paid customers in production.** Not unicorn scale. Real scale.
- **Self-funded.** No VCs setting our pricing. No quarter-end pressure to convert MIT users. Our license sales fund the roadmap directly.
- **Open in public.** Roadmap, Discord, weekly status calls. If we change direction, you see it as it happens.
- **Founders with track record.** Divante built and exited. Catch The Tornado has invested in 30+ software companies. We have built and supported open-source businesses before and intend to do it again here.

None of this guarantees anything. It just means the bet has reasonable odds.

## What we're committing to

Three things, in plain language, that the agency partners pushed us toward and that we owe them:

1. **Published Standard/Enterprise feature matrix and roadmap.** Partners see what's moving before it moves.
2. **Tiered licensing with a real partner deal desk.** No more "all-or-nothing" pricing for mid-market deals.
3. **No surprise re-categorizations.** Anything that affects a partner's active pipeline gets flagged before merge, not after.

The agencies we work with have been brutally honest with us. That feedback has changed our roadmap, our pricing, our communication, and at least one architectural decision. If you're considering becoming a partner - or considering walking away from being one - tell us what's actually on your mind. We can take it.

The agency program details are at [openmercato.com/agencies](/agencies). The repo is at [github.com/open-mercato/open-mercato](https://github.com/open-mercato/open-mercato). The Discord invite goes in the README - and the Core Team channel is one good module away from being open to your team.
