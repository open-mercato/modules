---
webflowId: 69e9de20473d9c59de166db8
title: What Large Enterprises Actually Ask About AI-Assisted Engineering
description: 'Notes from the room: what CTOs at telcos, banks, and industrial companies really ask about AI-assisted engineering. Control, architecture, upgrades, teams, timelines. The questions the Twitter demos never cover.'
date: '2026-04-23T00:00:00.000Z'
updated: '2026-04-29T09:46:49.646Z'
author: tomasz-karwatka
category: ai-engineering
featured: false
thumbnail:
  src: /media/blog/69e9e0776a4e8d4313fd18e6-zrzut-ekranu-2026-04-23-o-11.03.42.png
  alt: ''
  decorative: true
draft: false
---

Every week I spend a few hours in meeting rooms with CTOs and heads of engineering at large enterprises - telcos, banks, wholesalers, industrial companies. They all want to talk about AI-assisted engineering, and they all ask roughly the same questions.

None of those questions are the ones you see on LinkedIn.

Nobody in those rooms asks “will AI replace our developers?” Nobody asks “which model is best?” Nobody is impressed by a demo that builds a todo app from a prompt.

What they ask is different. And if you want to understand why AI-assisted engineering adoption inside Fortune 2000-scale organizations looks nothing like the Twitter version, it’s worth laying out what those questions actually are.

This post is a consolidation of one recent conversation with a large European company about their system modernization. The names are masked, the questions are real.

## The Setup: Legacy, Not Greenfield

The conversation didn’t start with AI. It started with a 20-year-old system, licensing costs they can no longer justify, and an order management stack that’s too expensive to extend and too fragile to replace.

That’s the actual starting point for enterprise AI engineering. **It is not a greenfield project.** It is a modernization project where the business case is pre-existing - reducing licensing fees, unlocking new product configurations, escaping a vendor - and AI-assisted engineering is a means to make the modernization tractable, not the reason it’s happening.

This reframes everything. A demo where AI builds something in 30 seconds is irrelevant. What matters is: can AI help us rebuild a 15-year-old ordering stack in six months instead of three years, without breaking the business in the process?

The honest answer is: yes, but only if you structure the work a specific way.

## Question One: How Do We Keep Control?

The very first real question from the CTO was not about speed. It was about control. Specifically: how do we keep commit description standards? How do we maintain branching and access control? How do we onboard a new coding agent six months from now and have it follow our conventions? How do we avoid “YOLO coding” - agents producing code with no backlog, no tasks, no structure?

This is the part the hype economy skips. Inside a regulated enterprise, **AI doesn’t get to bypass software development process - it has to fit inside it.** The audit trail, the code review, the traceability from requirement to commit to deploy - those aren’t overhead. They are the product. A telco cannot ship a provisioning change without being able to answer, three years later, who approved it and why.

The practical implication is that an AI-assisted workflow in enterprise looks closer to this: structured specification first - requirements get filtered and translated into a standard business format before any code is written. Spec-driven development - each feature starts from a spec with scope, data model, API design; the agent works against it, not against a free-form prompt. Pull requests with comments - agents open PRs, humans review, the same gate as before. Automated tests in the pipeline - unit, integration, API, UI contracts, all in CI. And a dedicated human tester - finding logical inconsistencies that neither the agent nor the test suite surfaces.

The speed gain is real - three to ten times faster is a reasonable bracket in practice - but it comes from compressing the coding step inside an unchanged process, not from deleting the process.

## Question Two: Who Owns the Architecture?

The best line from that meeting: **“The code writes itself. The architecture does not.”**

This lands hard with senior engineering leaders because it matches what they already know. The hard part of a large system was never typing. It was deciding where boundaries go, what is deterministic vs. configurable, what the data model looks like, where the extension points live, and what happens when the business rule changes for the third time this year.

AI models are very good at filling in code within a well-defined architecture. They are less good at inventing the architecture itself, especially one that has to survive ten years of changing regulations, product bundles, and acquisitions.

The enterprise conclusion is: **architecture is the real IP, and it should not be outsourced to an agent.** A human architect defines the skeleton - modules, schemas, extension patterns, what stays core and what stays custom. The agents fill it in.

This is also where the “monolith vs. microservices” question reappears with a new twist. For AI-assisted development, a well-organized monolith is often easier than microservices, because the agent’s context window covers more of the system. Microservices fragment the context. That doesn’t mean monoliths win everywhere - but for AI engineering, the trade-off has flipped compared to five years ago.

## Question Three: How Do Upgrades Work?

The third question, asked almost immediately after the architecture one, was about upgrades.

Any enterprise that has lived through an SAP upgrade, an Oracle migration, or a Salesforce version jump treats upgrade risk as existential. They want to know: if we let AI write 80% of our code, what happens when the underlying platform ships breaking changes in 18 months?

The answer that held up in the conversation rests on one pattern: **open for extension, closed for modification.** Custom code sits on the extension surface - new entities, new workflows, new endpoints, configured as extensions of the core. The core itself is never modified. This way, upgrades of the core remain drop-in, and custom code keeps working unless the extension contract itself changes.

This pattern is not new. It is how Magento, Shopify, and every serious extensible platform has worked for a decade. The new element is that AI agents are now one of the main authors of the extension code. So the platform has to make the extension contract very clear, very discoverable, and very hard to accidentally violate - because the agent will follow the path of least resistance, and you want that path to be the correct one.

A second-order question follows: **who guarantees the upgrade?** In practice, the only honest answer is: whoever certifies the code. Code that was written against the extension contract, reviewed, and certified can be upgraded safely. Code that wasn’t - including code the customer wrote themselves, or code an uncertified third party wrote - cannot be guaranteed. This is how a certification / homologation model can become a real commercial offering on top of otherwise open code.

## Question Four: What About Our Team?

No large enterprise wants to fully outsource an AI-assisted modernization. Not because they don’t trust the vendor, but because they want to end the project with a team that can run the system.

The concrete ask in the meeting was: **mixed team for four to six weeks, then scale if the model works.** A handful of external developers who know the AI-assisted workflow, paired with internal developers who know the business, building together. The internal team learns the workflow by doing it. The external team learns the business by doing it. Neither side is a passenger.

This is a better model than the two tempting alternatives. A fully outsourced AI team is fast at first, but the client ends up with a system they cannot evolve, and a vendor they cannot leave. A fully internal AI adoption is slow, uneven, and prone to a year of “we’re still figuring it out” with no shipped outcomes.

The mixed model also answers one of the quieter concerns in the room: **what do we do with our existing developers?** The answer is: they stay, they reskill inside a working project, and their domain knowledge becomes more valuable rather than less. Senior engineers with twenty years in a telco’s provisioning flow are not the people AI replaces - they are the people whose knowledge finally gets leveraged properly, because the bottleneck on using it stops being their typing speed.

## Question Five: How Configurable Should This Be?

A recurring dead end in enterprise software for twenty years has been the fantasy of the fully clickable product. Every big project has a moment where the business says “we want to configure everything from the UI, without developers.” Every big project then discovers, two years later, that a system with a thousand configuration screens is harder to change than a system with a thousand lines of code.

With AI-assisted engineering, this dynamic shifts. If a business rule change takes half a day of AI-assisted coding instead of three weeks of developer work, the economic case for a complex configuration UI weakens. The business doesn’t need to avoid developers - it just needs developers to be fast enough that changes feel configurable.

This is a live debate, not a solved one. But the emerging view is: **IT should retain control of the catalog, the schema, and the workflow engine.** The business configures pricing, availability rules, segment logic - the things they actually change weekly. Everything else stays as code, because code is now cheap to change.

## Question Six: Does the Programming Language Matter?

One small observation from the conversation worth flagging: at least one supplier in this space switched from Java to Kotlin because Kotlin produces fewer AI-generated errors and is easier for agents to manipulate.

This is a mild signal of something bigger. **The dominant selection criterion for backend language is starting to include “how well do AI agents write and modify it.”** Static typing helps (the compiler catches agent hallucinations). Verbosity hurts (more tokens, more context, more surface area). Clear module boundaries help. Magic and metaprogramming hurt.

TypeScript does well on all four axes. Kotlin does well. Go does well. Classical enterprise Java does less well - not because it’s bad, but because it’s wordy and the AI has to spend attention on boilerplate instead of logic. PHP and Ruby are mixed, depending on the codebase.

This isn’t a reason to rewrite anything today. It is a reason to weight the criterion when choosing a stack for a new system that will be AI-authored for its entire life.

## Realistic Timelines

The last real question, always, is the timeline.

For the kind of BSS/OSS modernization we were discussing - provisioning, orders, subscriptions, partner portal, technician mobile app - a realistic timeline is **four to six months for a production-ready first release, with a four-week proof-of-value phase at the front.**

That four-week phase is the critical gate. It is where the mixed team ships a real end-to-end flow - not a demo - against the real system, with real data, in the real process. If it works, both sides scale up. If it doesn’t, the damage is four weeks of work, not a multi-year program.

This pattern - small paid pilot, fast judgement, then scale - is how enterprise AI engineering adoption actually happens in 2026. The companies doing this well are not the ones with the flashiest demos. They are the ones who can land a working flow inside a regulated environment in a month and then keep going without drama.

## What This Means in Practice

If you are on the buy side - a CTO, a head of engineering, a BSS/OSS owner - the questions to ask any vendor pitching AI-assisted engineering are not about model choice. They are: how do you keep our commit, branching, and access standards intact? Who owns the architecture, and is it documented in a form an agent can read? How do upgrades work, and what exactly do you certify? Can we run a mixed team for four to six weeks before committing? What is your extension contract, and how do you prevent agents from violating it? How do you handle the human tester role? If they don’t have one, they are not serious.

If you are on the build side - a platform, a consultancy, an internal tools team - the takeaway is that **AI-assisted engineering adoption is an organizational change project more than a tooling project.** The tools are commodity. The workflow, the spec discipline, the extension contract, the certification model, and the mixed-team collaboration pattern are the real work.

At Open Mercato we have been building the platform side of this in the open - monolithic Next.js/TypeScript ERP core, well-defined extension points, `AGENTS.md` modules, spec-driven development, and a certification model on top of MIT-licensed code. The repo is on GitHub. The modernization conversations it enables are the reason it exists.

The enterprise version of AI-assisted engineering is less exciting than the demos and more valuable than the demos. It ships working systems in months instead of years. That is the whole story.
