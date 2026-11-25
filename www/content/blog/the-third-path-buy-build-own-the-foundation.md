---
webflowId: 6a58effeb9ccdfdbe61b90e9
title: "The Third Path: You Don't Have to Buy. You Don't Have to Build From Scratch."
description: 'What 50+ customer conversations taught us: buying means the golden chain of lock-in, building from scratch means the weekend-demo trap. The third path - build on an open foundation you own.'
date: '2026-07-16T09:00:00.000Z'
updated: '2026-11-23T22:53:31.443Z'
author: tomasz-karwatka
category: ai-engineering-foundation-framework
featured: false
thumbnail:
  src: /media/blog/6a58fa408899de9118981ab4-third-path-cover.png
  alt: ''
  decorative: true
draft: false
---

"Buy or build?" is the wrong question.

Over the past six months we analyzed 50+ transcripts of our own sales conversations - CTOs, owners, heads of operations across 17 companies. Insurance groups, manufacturers, scale-ups, software integrators. Different industries, same pattern.

Every one of them was stuck between two bad options. And when a third one appeared on the table, the reaction repeated almost word for word. An insurtech CTO: "We're looking for that third path." A scale-up founder: "This is what we've been looking for."

This article is that third path, explained. Not as a pitch - as a summary of what dozens of buyers taught us about why the classic two options keep failing.

## Path one: buy - and wear the golden chain

Buying a CRM or ERP sounds safe. A vendor, an SLA, a roadmap, someone to blame. Here is what buyers actually told us.

A services company pays six figures a year for a popular CRM. The internal verdict: "it works 3 out of 10." A manufacturing group described its stack as "an IT Frankenstein" - ERP, spreadsheets, and email holding post-sales together. Another owner called his recurring license fees "a ransom."

The deeper problem is structural. Off-the-shelf software covers standard processes. Your edge lives in the non-standard ones. So you customize - and every customization pulls you deeper into vendor lock-in. One customer called it the golden chain: comfortable at first, expensive to break, and it only gets tighter.

The bill grows too. Deloitte's Tech Spending Outlook 2025 shows digital budgets jumping from 7.5% of revenue in 2024 to 13.7% in 2025. Per-seat pricing scales with your headcount, not with the value you get.

## Path two: build - and hit the weekend-demo trap

Then AI coding happened, and everyone's math changed. The most dangerous competitor we meet today is not Salesforce or SAP. It's the client's own team with an AI coding agent.

And honestly? They are right to be tempted. One buyer put it well: "some teams now do in a weekend what used to take others months."

![](/media/blog/6a58fa9669ace8cc45406cb0-third-path-inline-weekend-demo.png)

But a weekend demo is not a production system. Buyers know this - it is their biggest fear. One CTO told us: "success is not launching an MVP - it's running a stable platform." Nobody is afraid of building anymore. Everybody is afraid of year two.

The data backs the fear. Stack Overflow's 2025 Developer Survey (49,000 respondents): 84% of developers use AI tools, yet 46% don't trust the output - and 66% spend more time debugging "almost-correct" AI code.

Building from scratch also means paying the infrastructure tax: months of auth, RBAC, audit logs, multi-tenancy, encryption - before the first feature that actually makes you money. AI writes that code faster now. It does not decide the architecture, the security model, or who maintains all of it in 2028.

## The third path: own the foundation

Here is the option most companies don't know exists. Don't buy the application. Don't build from zero. Build on an open foundation you own.

That is exactly what [Open Mercato](https://github.com/open-mercato/open-mercato) is. Concretely:

- **Open source, MIT license.** The code is yours. If we disappeared tomorrow, your system wouldn't. 100+ contributors and 1,250+ GitHub stars say we won't.
- **Ready domain modules** - the CRM/ERP basics - so you skip the infrastructure tax and start at the business logic.
- **Enterprise patterns baked in** - RBAC per feature, per-field encryption, audit logs, undo and rollback. AI agents work inside guard-rails they can't break.
- **An AI-engineering harness** - specs, conventions, and skills that make agents put code where it belongs. The same harness we use to build Open Mercato itself, at 200+ merged PRs a week.
- **No rip-and-replace.** Your ERP stays the system of record. You build the process layer beside it. If an experiment fails, the failure is cheap.

The result: your team - or your partner agency - builds exactly the system your processes need. Build-from-scratch flexibility, without build-from-scratch cost and year-two risk.

![](/media/blog/6a58fa6f9a375b825dbe155e-third-path-inline-three-paths.png)

## "So is it really 80% done?" - the honest answer

Our tagline says "Start with 80% done." Customers pushed back on it. They were right to. So here is fair warning before you clone the repo.

If your process sits close to standard CRM/ERP territory, 80% is real. If you are building something deeply custom, the foundation might cover 40%. The honest number varies per project - and any gap analysis will find it.

Here is what we learned: honesty wins. We told one fintech owner, mid-deal, "for your scope this is closer to 40% done." He stayed. He ran a paid workshop with a partner and moved forward. Because even at 40%, the math beats both alternatives - the hardest, least differentiating part (infrastructure, security, admin) is exactly the part nobody wants to build. And 100% of the result is yours.

The better metric is not percent-done. It's time to first production process: weeks, not quarters. That is the claim we are comfortable defending in any gap analysis.

## Who should take the third path - and who shouldn't

It is not for everyone.

**Take it if:** you have engineers in-house or a partner agency; your processes are your edge; you operate under regulation and need code ownership; or you rolled out Copilot/Cursor and see it is not enough.

**Skip it if:** you are under ~20 people with vanilla processes - buy the SaaS, it's fine. Or if you never want to touch code - the third path assumes you own what you build.

One software integrator shows the model working end to end. He watched our repo for eight months before ever talking to us. He ran his own analysis - competing open-source options "covered barely twenty-some percent" of the system he needed. Then he bought [the Enterprise license](/blog-posts/open-mercato-license-you-keep-the-code), because it made his own offer easier to sell to his client. No pitch. The foundation sold itself.

## Do this before your next buy-or-build meeting

Take your most painful process - the one running on spreadsheets and email. Ask three questions:

1. What does a year of status quo cost? Count it. The numbers are usually already on the table.
2. Can any off-the-shelf tool run this process without customization that locks you in?
3. If your team built it on a ready foundation, what would stand in production in six weeks?

Then run the smallest possible experiment: one process, one pilot group, one repo.

Start with the foundation. Own everything you build on it.
