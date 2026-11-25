---
webflowId: 6a22e56dcb6023c1b252e4fb
title: "AI-Engineering for Large-Scale Commerce: Why Cheap Code Won't Save Your Store"
description: The cost of writing code is collapsing toward zero - but for large-scale ecommerce and retail, what still decides success is engineering, not vibe coding. Piotr Karwatka on the difference, a one-day case study, and a practical adoption playbook.
date: '2026-06-05T08:00:00.000Z'
updated: '2026-06-10T18:05:56.541Z'
author: piotr-karwatka
category: ai-engineering
featured: false
thumbnail:
  src: /media/blog/6a22e5dd55c9aaa94386c5a0-zrzut-ekranu-2026-06-5-o-17.05.53.png
  alt: ''
  decorative: true
draft: false
---

## The wave you cannot afford to miss

Two or three years ago, if you posted a job ad for a software developer, maybe three people applied. Post the same ad today, as the same company, and fifty people show up. Something fundamental has shifted in how software gets built, and the change is moving faster than most retail and ecommerce leaders realize. There is a wave forming, and the uncomfortable truth is simple: if you do not get on it now, it will break over you.

That wave is AI-assisted engineering - the practice of building real, production-grade business software with AI doing the heavy lifting on code, while engineers stay firmly in control of architecture, security, and business logic. It is not the same thing as the "vibe coding" everyone is talking about, and confusing the two is one of the most expensive mistakes a large-scale ecommerce operation can make right now.

This article is for the people who own, lead, and operate ecommerce and retail businesses at scale. The goal is to give you a clear mental model of what AI is actually changing in the way commerce software is built, what it is not changing, and how to capture the upside without inheriting the downside.

## What actually changed: the cost of code is collapsing toward zero

For most of the last two decades, writing code was the expensive, slow, irreversible part of any commerce project. The old metaphor holds up well: writing code used to be like carving in stone. Once it was carved, changing it was hard, slow, and error-prone. Every change introduced new bugs, every bug had to be found and removed, and testing was a major line item in its own right. In a typical ecommerce implementation, writing code consumed somewhere between 60% and 70% of the budget - sometimes more. The rest went to architecture, marketing, user experience, the design of the customer journey, and the optimization of that journey.

AI flips the table on that single largest cost. A refactor or a new feature that an engineer would previously have spent two days on can now be produced in roughly ten minutes. That is not marketing hyperbole; it is a measured, day-to-day reality on modern projects. The marginal cost of generating code is trending hard toward zero.

It is worth being precise about timing, because the capability is recent. AI could write code two years ago, but it could not have built a serious, modular CRM/ERP foundation back then. The models were not good enough. The tectonic shift happened around the middle of last year, when a genuine step-change in quality arrived. On current frontier models - in practice, the strongest offerings from OpenAI and Anthropic's Claude are both excellent for this - hallucinations during disciplined code work have largely stopped being the blocker they once were. You assign a well-specified task and the system does what you asked, rather than inventing things.

## What did not change: the parts that still decide success

Here is the part that gets lost in the hype. The economics of writing code have been turned upside down, but the structure of the work around it has not.

Companies that want to sell online still do not always want to build and maintain software themselves. They want to rely on someone who knows how to do it - an internal team or an agency - to get it done. That responsibility does not disappear because code got cheap. If anything, the value migrates to the people who can decide _what_ to build and _how_ to build it safely.

The deeper truth is that writing code is the part AI accelerates most, but writing code was never the whole job. Architecture, security, integration design, the customer experience, and the encoding of real business logic remain human-led. The naive expectation - "I'll type a prompt and get a finished application" - produces one of two outcomes. Some people are disappointed: the result looks unserious and cannot be used in production. Others are briefly delighted: they built a slick little tool over a weekend, it worked, and then a week later something broke and nobody could explain why. Neither extreme is optimal. There is a disciplined middle path that extracts the maximum from AI while staying safe, and that path runs through software engineering, not around it.

## Vibe coding vs AI-assisted engineering: one sentence that matters

The definitions floating around are fluid, and everyone uses them slightly differently, but the distinction can be captured in a single line: **vibe-coded applications are disposable applications.**

Vibe coding is wonderful for what it is - rapid prototyping. It is the fastest way ever invented to check whether a concept has a chance of working. You sketch an idea, the AI produces something runnable, and you learn whether the direction is worth pursuing. Do it, enjoy it, prototype freely.

But a vibe-coded app is shallow by construction. It will often run. What it lacks is the layered business logic that the person prompting it knows in their head but never communicated to the AI. The result is software with no real depth: no proper handling of edge cases, no enforced business rules, no security model worth the name. That is fine for a throwaway prototype and dangerous for anything that touches real orders, real inventory, or real customer data.

AI-assisted engineering is the opposite philosophy. The code is written by AI, but the system is not _designed_ by AI. It is designed by engineers, in a deliberately safe way, so that the foundation is solid and customization comes second. Open Mercato itself is built this way: there is not a single line of code written by hand, yet the system is engineered, reviewed, and structured by people. That combination - AI-generated code on top of human-designed architecture - is what makes it safe to move fast.

## What lives under the hood of large-scale commerce

To understand where AI-engineering creates the most value, you have to look at the back end - the part customers never see. The storefront is familiar to everyone: browse, add to cart, check out, pay. Underneath sits a stack that grows in complexity as the business grows.

A small merchant can start with a SaaS platform like Shopify and have almost everything in one panel: order handling, the product catalog, the essentials. Even then, invoicing is usually slightly off to the side, handled by an accounting system. As the company grows, that accounting tool becomes a full ERP that adds warehouse management and more. Piece by piece, the architecture turns into a large construction that ties many different systems together, and the real challenge becomes making them work in concert. This is the heart of what the industry now calls unified commerce.

The problem most large retailers hit is that their core systems are rigid and expensive to change. Changes to an ERP can cost more than an entire ecommerce implementation of much larger scope. So instead of making changes where they naturally belong, teams bolt them on wherever it is cheapest. A concrete recent example: Poland's national e-invoicing system, KSeF. Invoicing logic obviously belongs in the ERP - the system that books transactions and settles accounts. But because building it there was so expensive, there are real ecommerce deployments where KSeF handling was bolted onto Magento instead. This pattern repeats everywhere. On platforms like Sylius, Magento, and Shopware, teams build astonishingly complicated logic, not because the storefront is the right place for it, but because building it in the right place was impossible or prohibitively hard.

This is exactly the gap AI-engineering closes. The missing puzzle pieces above the SaaS layer - the connection to your warehouse database, your customer database, your B2B sales processes, your customer service operations - used to demand enormous custom budgets and, for complex B2B scenarios, multiple years of work. A custom ERP in 2016 meant a team of twenty to thirty people for two or three years before you had something usable, and far longer to make it good. That math is what kept these projects off the table. The math has changed.

## Case study: reversing a broken process in a single day

Consider a real workshop with a company that sells medical and para-medical supplies - gloves, needles, hospital consumables. Like most firms, they started with off-the-shelf building blocks: a ready CRM, an ERP, and an ecommerce implementation built on Magento that began simple and was eventually customized into a genuinely strong platform.

What started to hurt was back-end process inefficiency, and one example captures it perfectly. They keep about 60% of their assortment in their own warehouse. The remaining 40% - slower-rotating products they do not want to pay to store - is ordered from suppliers only when a customer places an order. There was no system for this. The ERP did not really support it, so they invented a clever workaround using an internal ticketing system, and it ran entirely on manual labor.

The flow looked like this. A customer orders. Order handling receives it, checks the ERP, sees the product is not in stock. Someone emails a supplier to ask the price, places the order, and the customer waits. The goods are already on their way - but the customer was never told, because the message got lost somewhere. Maybe they got it, maybe they did not. So the customer, who needed the item on time, buys it on a marketplace instead. Then the original order arrives and they refuse delivery, because they already bought it elsewhere. The losses from this single broken process were substantial.

Here is what AI-engineering changed. After a roughly six-hour workshop to genuinely understand the problem, an implementation partner - building on the Open Mercato framework, with the foundation supplying about 80% of the needed components - solved it in **one day**. They walked into the follow-up meeting with the customer not with an estimate, but with a finished solution, already built, with a price attached.

That is the process being completely reversed. Instead of an open-ended project where the budget creeps, the client does not know what they will pay, and the agency sweats over whether a fixed bid will lose money, the client received a **fixed-price** quote - full cost control - plus the ability to keep changing things, because AI lets the team apply changes very quickly. Everyone in the old model suffered. AI can change that, but only when it is applied with discipline.

## The specification problem: why depth is human work

If code is nearly free to generate, where does the real effort go? Increasingly, into specification. The biggest lesson from building a serious system this way is counterintuitive: the early assumption that AI would make everything ten times faster does not hold uniformly. Pure code generation may be ten times faster or more. But getting something production-ready and safe requires several additional things, and the most important is a multi-level specification of what you actually want to build.

This is where most people stop too early. They describe the goal in purely business terms - "I want an app where the customer logs in, clicks, and something happens" - and the AI builds that app. It will even run. But it will be shallow, missing the business logic that the person who wrote the prompt knows perfectly well but never transferred to the model. Depth comes from articulating the rules, the edge cases, the integration contracts, and the failure modes. That articulation is engineering work, and it is where experienced teams now earn their keep.

## A practical adoption playbook for retail and ecommerce leaders

If you run a large-scale commerce operation, the takeaways translate into a concrete approach.

First, separate prototyping from production in your own mind and in your contracts. Use vibe coding to validate ideas cheaply and quickly, and never let a vibe-coded prototype graduate to production without being re-engineered. The fact that it runs is not evidence that it is safe.

Second, insist on engineering discipline around the AI. Ask your partners how they handle architecture, security review, testing, and specification - not just how fast they can generate code. Speed without that discipline is how you end up with a security hole that wipes your database. The horror stories are real.

Third, start from a foundation rather than a blank page. The reason the medical-supplies problem was solved in a day is that 80% of the components already existed and were already engineered for safety. Building business software is now about supplying your missing 20% on top of a solid base, not carving the whole thing from stone.

Fourth, use the new economics to renegotiate risk. Fixed-price, fast-iteration delivery is now realistic for work that used to be open-ended time-and-materials. That is a better deal for the buyer and, done right, a sustainable one for the builder.

Fifth, treat direct-to-consumer as newly accessible. The cost of entering your own ecommerce - long a barrier that pushed brands toward marketplaces and distributor networks - is falling. The direct relationship with the customer, the access to first-party data, and the ability to build customer lifetime value used to be out of reach for many manufacturers. AI-engineering is bringing it within reach.

## What this means for agencies and software houses

The model that built and implemented these systems is under pressure, and pretending otherwise helps no one. Agencies historically priced work on developer time - time-and-materials, or fixed bids derived from "this many days of this team." When the cost of writing code trends toward zero, that pricing logic breaks.

But the structural responsibilities do not change. Clients still need someone to own architecture, integration, security, and the translation of business needs into working systems. The opportunity for agencies is to move up the value chain: from selling hours of typing to selling outcomes, foundations, and the engineering judgment that keeps AI-generated code safe. The partners who internalize this - and who build on solid foundations rather than reinventing them - will be the ones riding the wave instead of being buried by it.

## The bottom line

AI has not made software engineering obsolete. It has made the cheap part nearly free and thrown the expensive judgment into sharper relief. For large-scale ecommerce and retail, that means the long-impossible back-end projects - custom B2B flows, real ERP extensions, process automation that bridges your warehouse, your customers, and your suppliers - are suddenly on the table, deliverable in days rather than years, at fixed prices rather than open budgets.

The dividing line between disaster and advantage is the difference between vibe coding and AI-assisted engineering. One produces disposable apps. The other produces foundations you can build a business on. Start from 80% done, supply your own 20%, and keep engineers in control of the parts that still decide whether the whole thing holds together.

_Based on Piotr Karwatka's conversation with Ewa Wysocka on the o e-commerce podcast._ [_Open Mercato is open source. The harness, the skills, and the CLI are all in the repo - go and play with them._](https://github.com/open-mercato/open-mercato)
