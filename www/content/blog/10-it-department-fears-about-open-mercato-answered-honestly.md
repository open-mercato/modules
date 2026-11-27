---
webflowId: 6a19ab4af6a9526e60e36211
title: '"Show Me a 5-Year Customer": 10 IT Department Fears About Open Mercato - Answered Honestly'
description: Every enterprise IT team asks us the same 10 questions on the first call. Bus factor, vendor lock-in, AI-generated code, upgrade paths, scale, stability. Here are the honest answers - including the times we tell buyers we're the wrong choice.
date: '2026-05-29T09:00:00.000Z'
updated: '2026-06-10T18:05:56.541Z'
author: tomasz-karwatka
category: ai-engineering-foundation-framework
featured: false
thumbnail:
  src: /media/blog/6a19ad1d2af7527cb529a78b-zrzut-ekranu-2026-05-29-o-17.10.20.png
  alt: ''
  decorative: true
draft: false
---

_Every enterprise IT team we talk to asks the same questions. Not because they read the same Gartner report - because the same fears keep showing up when a buyer evaluates an AI-native framework against a 20-year-old "stable" platform. Here's what they actually ask, and the answers we give without the sales spin._

We've now had close to a hundred enterprise conversations about Open Mercato - pharma e-commerce doing 10k orders/day, insurers, breweries, freight tech, manufacturers. The CEO is usually leaning forward. The IT director is leaning back, arms crossed, with a list of concerns the size of a Comarch implementation backlog.

And honestly? Their concerns are **completely valid**. Open Mercato is 5 months old as a company. We have one paying enterprise client live in production, a dozen in mid-pipeline, and our entire engineering philosophy ("almost nobody writes the code by hand") sounds, to a traditional IT director, like the opening scene of a horror movie.

So instead of arguing them out of their fears, we wrote them down. Here are the ten that come up in **every single call** - and the honest answers we give, including the times we tell the buyer that we might be the wrong choice for them.

## 1. "What happens if two people leave your team?"

This is the bus-factor question, and it's the first one we get from every IT director who has lived through a vendor collapse.

The honest answer: our salaried core team is four people. Not forty. But that's not the full picture. We have seven core contributors who work on the project most of their time, and a rotating pool of 15-17 active contributors at any given release. Over a hundred people have shipped code into the repo. **It's MIT-licensed and open source** - if every single person on our payroll quit tomorrow, the codebase doesn't disappear. Your fork doesn't stop working. Your deployment doesn't go offline.

That's a structurally different risk profile than "the vendor went bankrupt and the binaries stopped talking to the license server." Compare it to your current ERP and ask which one you'd rather be locked into.

## 2. "Show me a customer who's been live for 5 years."

We can't. We've existed for 5 months.

If 5-year references are a hard requirement, we're the wrong vendor and we'll tell you that on the first call.

The framing we ask buyers to consider: **there is no "AI-native enterprise framework" that has 5-year customers.** That class of software didn't exist 5 years ago. If you want 5-year stability, you want Magento. If you want to be the team that ran the AI playbook 18 months before your competition figured out how to staff for it, you want something that's 5 months old. Pick your tradeoff consciously.

## 3. "How can you verify code that nobody writes by hand?"

This one is the real philosophical break. Traditional IT assumes that the safety of a codebase comes from a human having typed every character. AI-engineering assumes the safety comes from **what you check, not how it was typed**.

What that means in practice:

- No pull request merges without a human review from our core team - typically two or three passes.
- A triage skill that flags which changes need manual QA and which can be auto-validated.
- Heavy integration test coverage on anything that touches the core.
- Architectural and security decisions are always reviewed manually, never auto-merged.

The honest analogy we give buyers: if you're a CTO with 30 mid-level developers, you don't read every line they ship either. You check architecture, you check security, you check the things that can touch the core. AI engineering compresses that same problem - fewer people, more output - and the verification discipline has to scale with it.

## 4. "How do we upgrade the core without breaking our customizations?"

This is the question that has killed a thousand Magento upgrades, and it's the one we designed against from day one.

Open Mercato has an explicit boundary between what we maintain (the core) and what you extend (modules, custom apps, your business logic). The AI harness shipped with the framework knows that boundary - so when you generate custom features, the AI references the core's data formats, command patterns, and events instead of forking them. **In 99% of cases, your customizations don't touch core files at all.**

We've shipped one upgrade so far that required user code migration (a MikroORM v7 breaking change), and we handled it with a migration skill that automatically rewrote the affected user code. Not perfect - but a categorically different upgrade experience than "schedule a 6-month replatforming project."

## 5. "Are your migrations reversible?"

Every database migration is generated with both up and down operations. You can roll back schema changes the normal way.

The less obvious answer: **data writes themselves are reversible too.** Open Mercato implements a command pattern across the framework where ~99% of write operations have an explicit undo. Save a customer, save an order, save a price update - there's an audit trail and a rollback path. For internal operations and audit-heavy workflows, that's a big deal. For anything that crosses an external system (payment gateway, third-party stock sync), obviously the external side won't unwind itself, and we say so plainly.

## 6. "Can it talk to our existing message bus, ERP, and WMS?"

Yes. The queue subsystem is driver-based - BullMQ on Redis by default, with in-memory and JSON drivers built in, and pluggable adapters for RabbitMQ or anything else you need. Webhooks and REST are generic. The integration layer was designed for the exact scenario every enterprise actually faces: **"we have a working data bus that absolutely cannot be replaced."** Good. Don't replace it. Plug Open Mercato in beside it.

One Polish pharmacy e-commerce we recently spoke with has a custom Redis-based data bus that talks to their Comarch ERP and their legacy WMS. The right architecture for them isn't "rip out the bus" - it's "Open Mercato becomes a participant on the bus, handles CRM/pricing/PIM, and the ERP becomes a thin accounting engine." That pattern works because the integration surface is open.

## 7. "What's the actual production scale?"

Today: production deployments handling thousands of orders per day, with FreightTech in the maritime logistics range and several mid-market e-commerce operators live or in pilot.

If your "yes" depends on us showing you a deployed customer at 10x your scale with five years of uptime, we don't have that and we won't pretend. If your "yes" depends on us showing you a framework whose architecture is intentionally designed for the scale you're heading toward - that we can do, on a call, with the code open in front of you.

## 8. "What stops us from getting locked in?"

Nothing. The MIT license is real. You can fork the repo today, deploy it yourself, never speak to us again, and your business will keep running. We know some companies will do exactly that, and we're fine with it.

What you'd be giving up is the enterprise subscription, which is where the commercial relationship lives: monthly audits of your custom code against our architectural and security standards, performance reviews before major deploys, early access to enterprise features, and direct support from the core team. **You pay for the safety net around your AI-generated code**, not for the right to run the framework. The framework you already have.

## 9. "Are you stable enough for us to bet on?"

This is the question underneath all the others, and it's the one we answer most directly.

If "stable" means "five years of production data, twenty Fortune 500 references, a sales engineering team of 200" - no. We're not stable in that sense. We will not be in that sense for another two years minimum. If that's the safety floor you need, we are explicitly the wrong vendor for you and we'll say so on the first call. Some of our best conversations have ended with us recommending the buyer choose Medusa or stay on their current stack for now.

If "stable" means "the architecture won't collapse when you scale, the upgrade path is real, the licensing is irrevocable, the team is structurally bigger than the 3-person product teams at companies like ElevenLabs that you already trust" - yes. We're stable in that sense. **And we're early enough that the customers who come in now will help shape what enterprise AI-engineering frameworks look like for the next decade.**

## 10. What we tell buyers at the end of every call

The IT director is right to be skeptical. The CEO is right to want a snowball-forming bet on AI engineering. Our job isn't to flatten that tension - it's to make sure both sides have **honest information** about which risk they're choosing.

The risk of going with Open Mercato is the risk of betting on a framework that's 5 months old, run by a team that writes very little code by hand, with no five-year customers and a product philosophy that's deliberately different from the platforms IT teams trained on. That risk is real and we don't try to talk anyone out of seeing it clearly.

The risk of _not_ going with Open Mercato - 0or something like it - is sitting on the same platform that took your competitors three years to fall behind on, watching AI-engineering become table stakes, and trying to retrofit it into a stack that was architected before any of this existed. **That risk is also real.** It just doesn't show up in a Gartner Magic Quadrant.

If you're an IT director with a version of this list - [come talk to us](/). Bring the hard questions. We answer them the same way every time, and the answer to "convince me this isn't a risk" will always be "it is, here's exactly which risk, and here's how we manage it." If that's the kind of conversation you want to have, we're ready when you are.
