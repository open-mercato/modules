---
webflowId: 6b04adf5604da25608b884e5
title: What happens when 400 sales reps can build their own tools?
description: Ramp gave its sales team access to build on its CRM. Jetfuel and Doorstead took different routes to the same question. Which tools should the people doing the work own?
date: '2026-11-23T16:00:00.000Z'
category: ai-engineering
featured: false
thumbnail:
  src: /media/blog/6b04adfb472abca9f4dc3af6-6b04ad494414db5fb8f6bd38-shared-foundation.jpeg
  alt: Three different brick-built tools share the same foundation.
draft: false
---

A sales rep wants to know which accounts to call on Monday. She already knows what makes an account worth a call. The trouble is that part of the answer lives in the CRM and part lives in the outreach tool. She could ask engineering for a dashboard. By the time someone picks up the ticket, she will have made the calls.

At Ramp, a rep with an idea like that can build a tool and try it on her own accounts. The interesting part is what happens when a few hundred colleagues get the same chance. How does engineering decide which of their experiments deserves a place in the software everyone uses?

![Three different modular tools on one shared baseplate.](/media/blog/6b04adfb472abca9f4dc3af6-6b04ad494414db5fb8f6bd38-shared-foundation.jpeg)

## Ramp asks why a rep needed the data

Keyan Sarrafzadeh, who works on Ramp's growth platform, described how the company opened up tool building to roughly 400 sales reps. His team built a server it calls Growth MCP. MCP stands for Model Context Protocol. It gives an AI client a common way to ask another system for data or request an action. Ramp's server decides which CRM and outreach operations the rep has permission to use. [Watch Sarrafzadeh's walkthrough.](https://www.youtube.com/watch?v=LfrzaAr69d4)

That leaves the rep free to decide what the tool should do with those operations. It also gives the growth team an unusually good record of what people need. Each time an agent calls a tool, it has to record why. The team groups those explanations and looks for requests that keep coming up. If several reps build their own version of the same thing, the team has a candidate for the core sales app. It can inspect how people already use it before committing to maintain it.

![A connector brick lines up with a matching socket on a shared base.](/media/blog/6b04adfb472abca9f4dc3afb-6b04ad491f6b27eff468b412-growth-connector.jpeg)

## A creator reports missing installs. Who can fix the support screen?

At Jetfuel, creators earned money promoting apps. When a creator said installs were missing, a support rep had to check the numbers in one place and go somewhere else to act. Even a small change to the tools could mean buying more contractor hours.

JJ Maxwell, Jetfuel's co-founder and chief revenue officer, had an engineering background. He built the support team a Retool dashboard where a rep could inspect hourly installs and message the creator from the same screen. Then he built a campaign management prototype. He told Retool the first version of that second tool took him half an hour. This was in 2021. Teams were already finding ways to build their own software years before sales reps could describe an app to a coding agent. [Read Maxwell's account.](https://retool.com/blog/jetfuel-customer-story)

## Doorstead gave product operations a way to build whole apps

At Doorstead, getting a rental ready can involve a maintenance request, a contractor quote and a decision about which repairs to approve. The people chasing those answers know exactly where a job got stuck. Doorstead had used Airtable to prototype internal tools. As its property portfolio grew, CTO Philip Lee chose Retool, and the product operations team started building entire apps itself. Engineering had fewer internal requests to handle as a result. [Read Lee's account.](https://retool.com/blog/how-doorstead-doubled-developer-velocity-with-retool)

These examples suggest a more useful question than whether everyone can code. Can the person who spotted a problem try a fix? At Jetfuel that person happened to be an executive who could write software. At Doorstead it was a team with a low-code editor. At Ramp a rep can use an AI client. Each business still has to decide what those builders can read and what they can change.

![Three stages of a modular prototype, ending in an arch on a shared baseplate.](/media/blog/6b04adfb472abca9f4dc3afe-6b04ad49c31efb0f2fce9ab9-team-prototypes.jpeg)

## Start with the spreadsheet someone already maintains

If you want to try decentralized tooling, ask a sales rep to show you the spreadsheet they opened before their last call. Pick one question it answers. Give the rep read access to the records they already use, and let them build a view for next Monday. Sit with them while they use it. A list they quietly reorder by hand tells you more about the next change than a feature request will.

Agree on who owns the first write action. A rep can decide how to sort overdue quotes. Finance should still decide who can approve a discount. In an Open Mercato app, those are two separate jobs. The team can change its [quote view](/case-studies/arvo-configurator) while the approval rule stays in the shared application. Once a second team relies on that rule, give it a named owner and a test. That is the point where somebody else's Monday starts to depend on it.
