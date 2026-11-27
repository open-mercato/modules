---
webflowId: 6a29324cde333b649a11eed1
title: 'Open Mercato for agencies: the new questions after 27 partners'
description: 'The basics are answered elsewhere. With 27 partner agencies on board, a different set of questions comes back: where the advantage sits, what homologation buys you in a client conversation, and how you actually become a partner.'
date: '2026-06-12T00:00:00.000Z'
updated: '2026-06-13T14:31:11.476Z'
author: maciej-gren
category: architecture
featured: false
thumbnail:
  src: /media/blog/6a29324bde333b649a11eeca-6a29320d671bad3d59288138-agency-faq-27-partners-cover.png
  alt: 'Open Mercato for agencies: new questions after 27 partners'
draft: false
---

A while back we collected the questions agencies ask us most often and answered them plainly in [a separate post](/blog-posts/9-questions-software-agencies-open-mercato-honest-answers). Since then the program has grown to 27 partner agencies. Most of the questions repeat, and the basics still live there: what sits under MIT, where the enterprise license boundary runs, what you actually get as a partner.

Working with those 27 taught us most of what's below. And as we form the next batch, agencies weighing whether to join keep raising a different set of questions, ones that weren't in that original batch. They tend to surface once an agency seriously starts working out whether to build an advantage on this, rather than just checking what we are.

## Where is the advantage for my agency?

It comes from building IP instead of selling hours. Open Mercato lets you deliver the same value that used to take far more time, and it leaves you with whatever you build: either IP scoped to a single client project, or something more reusable that sits behind a series of deployments. We've written up [how this plays out on fixed-scope projects](/blog-posts/software-houses-fixed-scope-erp-faster) separately.

It also changes the agency model: from a firm selling billable hours to one selling premium services built on its own IP and knowledge.

## What matters more: senior TypeScript/Next engineers, or domain knowledge?

Both routes work, and we see two axes of specialization.

The first is the heavily technical agency, focused on agentic and AI competence. It doesn't need deep expertise in any single industry; it's simply very good at building software with agents.

The second is the agency that's an expert in a narrow business vertical. It might not be the strongest technically, but it knows everything about, say, logistics. We've seen it work: an agency that bought into Open Mercato early, building its advantage in a single vertical and growing its own community around the topic, until the expertise simply leaks out of it.

These routes aren't mutually exclusive and can overlap. But let's be direct: right now domain experience is a bit easier to sell. Companies sit on a lot of existing software they want to migrate off because it's too rigid; the software forced its logic onto the business rather than the other way round. That problem is clear and satisfying to solve, as long as the company understands it's adopting fresh technology. Open Mercato isn't a ten-year-old stack with millions of installs. Early clients are knowingly taking on some risk.

## What is homologation, and why do I want it in a client conversation?

One of the biggest fears around AI is that the code came out of agents, and larger companies need the assurance that someone external, not necessarily the agency, has checked that it won't fall over in production and won't leave technical debt behind.

Homologation is our stamp that a given build is safe. For you it's a weapon in the conversation: instead of claiming your agency is an expert in everything, you tell the client they get the full stack, namely what's in the core plus a second institution (Open Mercato) putting that stamp on it. We're working on the license model so it's available more widely and not only to the largest firms; it used to start high, and for a company below a few hundred million in revenue it could be a showstopper.

## Localization and per-market modules (DE/PL/US): is that in scope?

Yes, and this is where your domain knowledge earns its keep. Take an accounting module: the German, Polish, and US markets will most likely be separate modules. The fundamentals are shared, but the fork happens fast.

As a core team we don't intend to take ownership of the fact that a regulation changed in some country and the payroll-and-accounting module has to be rewritten by tomorrow. That would be too much weight to carry, and we deliberately position ourselves as a framework. If an agency knows the domain, writes the specification, builds tests for it (so it isn't slop but genuinely covered cases) and generates the rest, it delivers the extension to the client faster and cheaper than if that client waited half a year for a closed ERP to add the feature at a high price. Within the bounds of what the regulations require, of course.

## Two agencies build the same module: who arbitrates?

It depends where. With official modules there's a lot of freedom. Several similar ones can exist, a bit like plugins in the WordPress store: there are many, and the best one has the most stars. We don't manage that tightly, because those modules fall into the 20% zone.

In the core there's strong arbitration. The specification goes into the right folder first, and we keep track of which agency owns a given module so there's no needless clash. If an agency carves out an excellent module and it makes sense, we can even pull it into the core as the default.

## How do you actually become a partner?

Through what we call the vetting step, before we sign anything at all. We also describe the partner path on the [agencies page](/agencies). It comes down to two things.

First, a business conversation. I want to understand whether you have the internal drive to genuinely build an advantage on Open Mercato, because you see a problem in the market that you've solved before in other ways and this way is simply better. That's the healthiest reason. Agencies that treat the partnership as a source of leads rather than as technology that gives them an edge usually don't reach the level where they can deliver that value.

Second, proof of competence. At least two experienced developers who can contribute, and a built ready-app: a working application that you stand up with the `create mercato app` command, develop with our agentic toolkit, and push as code into a repo. That's our entry gate, because once it's done we know the agency has been through the whole process of building an application on Open Mercato and has the competence inside, not just on paper.

The best opening for a conversation with us sounds roughly like this: "we have two devs who are sold on OM, we have a ready-app idea from a market we know, and we already have a draft specification." I'll happily challenge that specification with you. The implementation you do yourselves; we don't hold your hand, because that too is part of checking whether you can onboard yourselves onto technology that changes fast.

If one of these questions was your question, and [you've already ticked off the basics](/blog-posts/9-questions-software-agencies-open-mercato-honest-answers), [get in touch](/contact). We'll talk about your market and your first ready-app. We're taking applications through the end of August, and the next batch starts in September.
