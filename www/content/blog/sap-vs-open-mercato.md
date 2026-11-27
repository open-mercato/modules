---
webflowId: 6a58efb0f2557406c02710bf
title: 'SAP vs Open Mercato: Keep the Core, Stop Paying SAP Prices for Everything Around It'
description: Nobody we talk to wants to rip out SAP - and they should not. The battle card, the real customer pain points, and a four-step path to build new processes beside SAP in weeks, not change requests.
date: '2026-07-16T09:00:00.000Z'
updated: '2026-07-17T13:15:56.195Z'
author: tomasz-karwatka
category: ai-engineering-foundation-framework
featured: false
thumbnail:
  src: /media/blog/6a58f0240806727306dda972-sap-vs-open-mercato-cover.png
  alt: ''
  decorative: true
draft: false
---

"You want me to pay 100% of the license price - for an upgrade?"

That's a real quote. The owner of a pharma manufacturer, told me this a few weeks ago. His company has run SAP ECC since 2010. SAP is sunsetting ECC and pushing him to S/4HANA. The deadline kept moving: first 2025, then 2027, now 2030. And the integrator quoted more for the re-implementation than the original rollout cost - fifteen years ago, when nobody in the company even knew SAP.

His conclusion was brutal: "The biggest players will renew without thinking. Fine, we'll pay the ransom - nobody gets fired for it."

I hear a version of this story almost every week now. From pharma, construction, insurance, FMCG. So let me write down what we actually tell these companies. Including the part most vendors won't say out loud: you probably shouldn't rip out SAP.

## What SAP does well - honestly

SAP is a system of record. Finance, inventory, production, compliance-grade bookkeeping. It's complete, it's battle-tested, and auditors trust it. That category safety is real.

Here's the thing: none of the enterprises we talk to want to remove it. A digital leader at a global beverage company told us they run 40 different SAP instances in Asia alone - one per acquired brewery. Consolidate them? "We're never going to hit that. We treat it as potential, not a problem."

That's the mature position. SAP stays. The question is different.

## Where the pain actually is

The pain is never the core ledger. The pain is everything around it:

- **Every change is a project.** New workflow? Change request, consultants, six months - or "can't be done at all". A construction group we work with stopped even asking. They build point tools in PowerApps and Excel instead.
- **The upgrade treadmill.** ECC to S/4HANA is priced like a brand-new implementation. You pay full price to stand still.
- **Per-seat economics.** Licensing that punishes growth. Adding users to a process costs money even when the process adds no value.
- **AI as a bolt-on.** The pharma owner asked his SAP rep directly: "You upgrade me for a fee every year - where's the AI?" The answer: "We're working on it." And here's the deeper problem, spotted by the beverage company's team: SAP will ship agents - but **everyone will get the same agents**. Your differentiation can't come from a feature every competitor buys in the same box.
- **The Excel shadow system.** The first question their finance team asks about any tool: "does it export to Excel?" That's where the real processes live - unaudited, unowned, one person who "knows the file".

So the real competition in these deals is never SAP itself. It's the status quo: keep paying, keep waiting, keep running the company on spreadsheets bolted to an ERP.

## The battle card

This is the card our partners use in real deals. When you hear: **"Nobody ever got fired for buying SAP**

![](/media/blog/6a58f13d9f983b2575b58a79-sap-vs-open-mercato-battle-card.png)

![](/media/blog/6a58f0c1349eb693dbc8bc55-zrzut-ekranu-2026-07-16-o-16.54.40.png)

> The winning line: "Keep SAP as the system of record. Just stop paying SAP prices - and SAP timelines - for every new process around it."

## The third way: build beside SAP, not instead of it

There are two default answers to ERP pain, and both are wrong.

Rip-and-replace? A board member of a manufacturing group told us about their plan to roll SAP out across every subsidiary: "I don't think that has ever worked anywhere." He's right. Big-bang ERP migrations are where careers go to die.

Do nothing? That has a price too - it's just unspoken. Every month, the Excel shadow system grows, and the gap between what the business needs and what the ERP does gets wider.

The third way is a gradual, reversible path. The head of digitalization at a 60-year-old construction group described it better than any of our slides: "Two parallel worlds. The old one keeps ticking - I'm terrified of touching it. I build new processes beside it. The old world fades; only what we build remains."

Here's how it works in practice, in four steps.

### Step 1 - Connect read-only. Touch nothing.

Integrate your sources - SAP, legacy systems, the Excels - read-only. No business process changes. You get one unified view of data that today lives in silos. The construction group discovered two of their divisions were negotiating with the same subcontractor without knowing it. That insight alone justified the step.

### Step 2 - One process, non-core, fixed price

Pick a process that is painful, visible and NOT core finance or production. Supplier qualification. A B2B ordering portal. Contract-vs-invoice analysis. The pharma owner called this approach "clinical trials in IT" - see if it passes phase one in lab conditions before you bet the company.

This is deliberately small: a paid discovery workshop, then a working proof of concept in weeks. Success criteria written down before anyone writes code. If it fails, you've lost weeks, not years.

### Step 3 - Write back, add agents - under supervision

Once the new layer earns trust, it starts writing back to SAP through governed integrations and takes over workflow steps with AI agents. Not free-running agents - agents as workflow steps, with confidence thresholds, human sign-off and a full audit trail.

One pattern our clients love: shadow mode. Route 10% of cases through the agent silently, compare its output against your human operators, and only then let it act. That's how you pass a SOX audit with AI in the loop - the beverage company's procurement team found contract leakage worth tens of millions this way, with a dashboard built in four days.

### Step 4 - The edges fade, the core stays

Over quarters, the custom pre-systems, the PowerApps, the heroic Excels get replaced by processes you own. SAP shrinks to what it's genuinely good at: the ledger, the system of record. You stop asking it to be your innovation platform - and stop paying it like one.

No big bang. Every step reversible. Every step delivers value on its own.

![](/media/blog/6a58f11dd19c5fdf6436464e-sap-vs-open-mercato-gradual-adoption.png)

## "But will AI-built software pass our audit?"

This is the first question every serious IT department asks, and it deserves a serious answer.

There's a whole category of tools now where you describe an app and get a demo by Friday. We watched one company almost go live on a system like that - until the database disappeared. Luckily before launch. That's vibe coding, and it has no place near an ERP.

Open Mercato is the opposite bet: AI engineering. The AI writes code inside a harness - specs first, deterministic module patterns, review gates, another AI adversarially checking the output, human testers after that. Field-level encryption, RBAC, audit logs on every operation are part of the foundation, not an afterthought. The Enterprise subscription adds homologation: an independent gate before go-live, ongoing security and performance reviews of everything your team and your AI produce.

And when the license expires? The software keeps running in its last version. You lose updates and support - never your system, never your data. After what these companies have been through with ERP vendors, we put that in writing.

## When staying pure SAP is the right call

Fair is fair. Don't build beside SAP if:

- Your pain is IN the core - broken financial processes won't be fixed by a layer next to them
- You have no ambition to differentiate through process - if standard is fine, run standard
- You can't name a single process owner willing to spend a few weeks on a POC
- Your organization treats every new system as a ten-year commitment that needs two years of committee review - fix that first

If none of these apply, the math changes fast.

## What to do next week

One concrete exercise. Take a sheet of paper and write down the three processes your teams run in Excel or email BECAUSE the ERP can't do them, or because the change request was quoted at six months. For each one: how many people touch it, what an error costs, what a month of delay costs.

That list is your roadmap. Pick the smallest one and run the clinical trial.

The foundation is open source (MIT) - 1,200+ GitHub stars, 100+ contributors, 25+ certified implementation agencies. Your SAP isn't going anywhere. The processes around it finally can.

_Tomasz Karwatka - co-founder of Divante, Vue Storefront/Alokai, Catch The Tornado. Building and investing in enterprise software since 2004._
