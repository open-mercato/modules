---
webflowId: 6a0c222576686f65569ef4b3
title: 'AI Engineering at Enterprise Scale: 8 Lessons From Our First Conversations With Fortune-500 Buyers'
description: What we've learned from sitting across the table from a regulated incumbent and a global manufacturer - and why most enterprise AI programs miss the actual unlock. Eight operational lessons, no PowerPoint.
date: '2026-05-19T09:00:00.000Z'
updated: '2026-06-10T18:05:56.541Z'
author: tomasz-karwatka
category: ai-engineering
featured: false
thumbnail:
  src: /media/blog/6a0c247e23f5cb540a18e204-zrzut-ekranu-2026-05-19-o-10.50.43.png
  alt: ''
  decorative: true
draft: false
---

_What we've learned from sitting across the table from a regulated incumbent and a global manufacturer - and why most enterprise AI programs miss the actual unlock._

Over the last quarter we've had roughly a 20 conversations with enterprise teams about AI engineering. Two of them, recently, stuck with me - different industries, different governance models, completely different starting points. And yet both rooms kept converging on the same set of operational decisions.

This post isn't an "AI strategy" piece. It's an attempt to write down what those decisions actually look like when a real team is in the middle of making them. Everything below is anonymized. The numbers and anecdotes are not.

The headline observation: **enterprises aren't failing at AI because of the models. They're failing because of how they wire orchestration around their legacy systems.**

## 1. Stop bolting AI onto your 18-year-old workflow engine

The most common anti-pattern we see - and we saw both flavors of it last month  is this

1. Take a step out of the legacy workflow engine.
2. Replace that single step with an agent.
3. Return the result back to the legacy engine, which then runs the next 999 steps.

One client described this exact pattern unsparingly: a back-office function with **1,000+ people running a process inside a workflow engine built 18 years ago**. They had automated several individual steps with agents. The savings? **Roughly two FTEs per step.** Out of a thousand-person operation.

The math doesn't work. It can't work. The leverage isn't in any single step. The leverage is in collapsing the workflow itself.

Their conclusion - and ours - is the same: don't refactor the legacy system. Stand up a **lightweight orchestration layer beside it**. Let the legacy system become a system of record. Let the new orchestration drive the actual work, with agents underneath.

This sounds obvious when you write it down. It is the opposite of how most enterprise IT roadmaps are currently structured.

## 2. Agents have goals, not playbooks

Workflow thinking sounds like this: _"Here are 1,000 steps. Do them in this order. Branch here on condition X. Loop here on condition Y."_

Agent thinking sounds like this: _"Here is the goal. Here are the tools. Here are the constraints. Here is the data. Figure it out."_

Both clients we spoke to had independently arrived at the same architectural decision: replace deterministic, deeply-branched workflows with a small number of **coarse-grained agents**, each owning a phase of the work.

In one case (a claims-style back-office process), the team decomposed an 18-year-old workflow engine into roughly four agents:

- **Gather evidence** - pull documents, normalize structure
- **Enrich and validate** - check sufficiency against policy
- **Decide** - recommend an outcome
- **Execute** - register the decision, trigger downstream actions like customer contact or payout

Each agent has a goal, a toolbelt, and guardrails. None of them have a 1,000-step playbook. The orchestration layer above them handles deterministic plumbing - quality gates, audit trails, validation of agent recommendations before execution.

This is the architectural shift. Once you make it, "process analysis" stops being a flowcharting exercise and starts being a briefing exercise.

## 3. The hardest part of agent engineering isn't the code

A senior engineering leader from one of these conversations said it plainly:

> "The biggest challenge is preparing good content for the agents - what the goal is, how we split it into phases, what constraints we have at each phase, what tools, what data."

That's it. That's the work.

We've started shipping a short specification template to clients before any code is written. Goal. Scope. Inputs. Tools. Guardrails. Data sources. Success criteria. Edge cases. Failure modes.

One client made a counter-intuitive observation: their process analysts - extremely senior people, deeply experienced - actually had to _unlearn_ SOP-writing reflexes. SOPs describe sequence. Agent briefs describe intent. The two require different muscles.

If you're building an internal team for this, hire (or develop) people who can write a one-page brief that an LLM can act on. That skill is rarer than you'd think, and far more valuable than knowing which framework to pick.

## 4. Velocity is the real moat - and the bottleneck has moved

Here's an anecdote from the other client we spoke with - a global manufacturer with roughly 30,000 white-collar employees.

Their **VP of Internal Audit**, a non-engineer, built a working internal tool over a couple of weekends. He used a vibe-coding platform plus an enterprise coding assistant, iterated with his own audit team for a week or two, and then walked the result over to the central engineering group with a one-line request: _"Make this production-ready."_

The central team then spent roughly **two months** porting the prototype off a developer-friendly database onto the corporate cloud SQL stack, hardening SSO, dragging it through Enterprise Architecture, security, compliance, and observability reviews.

Two months. For something a non-engineer prototyped in a weekend.

The lesson isn't "ship vibe-coded tools to production." A different client gave us a horror story about exactly that: a business stakeholder built a warehouse-management replacement on a low-code AI platform, started loading real inventory in, and on Tuesday opened with: _"My database disappeared. I don't know where it is."_

The lesson is subtler. **Business idea → working prototype is now days. The bottleneck moved.** It moved to hardening, security, compliance, data plumbing, observability, and integration. That's where engineering investment now belongs.

Companies that recognize the shift are seeing **3-10x velocity improvements** on enterprise builds. Companies that don't are about to get an explosion of Shadow IT they can neither audit nor maintain.

This is also where we've focused our own product roadmap. The fun part - building features - has been democratized. The hard part - keeping it safe at scale - has not.

## 5. CEO sponsorship beats committee-driven transformation

Both clients had a remarkably similar org chart for their AI work, even though their cultures could not be more different.

In both cases, there's a small team - **roughly 20 people** in one case, slightly larger in the other - that reports up through a non-CIO chain, directly to a C-level executive who has explicitly granted air cover.

In one of these conversations, the executive's first lesson from a previous job was quoted to us: he had been at the helm when a competitor went first on a machine-learning pricing system. The competitor captured the market position, and the client never recovered the gap. His instruction to the team is now blunt: **"We will never be second again."**

The skunkworks model isn't new. What's new is the leverage: with modern AI engineering tooling, a 20-person team can out-deliver a 400-person traditional IT department on specific verticals - not because they're better engineers, but because their permission structure is different.

A few practical takeaways from how the more successful of these teams operates:

- **Direct reporting line.** The team's leader is in the same room as the executive sponsor multiple times a week - sometimes literally desk-to-desk.
- **Returning customers.** Business units come back voluntarily because outcomes are measurable and fast. When a finance VP says "I want this in three weeks, not nine months," that team is the only path.
- **Backlog as moat.** One of these teams has a **two-year backlog**, declines more work than it accepts, and is the bottleneck not because they're slow but because nobody else can do what they do.
- **Top-down strategic tie**

AI is named explicitly in the company's multi-year strategy. The team isn't asking for budget; the budget is asking for the team.

## 6. Modular agents beat monolithic assistants

Both clients had - at different times - tried to build the canonical "Virtual VA" or "all-purpose copilot." Both reported the same outcome: too broad, too much hallucination, too little reliability.

The decomposition pattern that emerged in both cases looked like this

- A general-purpose assistant is a poor abstraction.
- A specialized agent - _the interviewer_, _the data enricher_, _the policy validator_ - is more reliable, easier to test, and easier to constrain.
- Specialized agents **compose**. The interviewer agent built for one workflow becomes a building block for three others, because it does one thing well and exposes a clean interface.

This is exactly how good engineers have always built services. Single responsibility. Clean inputs and outputs. Composable. The only difference is that the "service" is now an LLM-driven agent with its own tools and prompt scaffolding.

The mental model we've been recommending: stop designing **products** for the business. Start designing **building blocks**. Then assemble products from blocks. The block library becomes your company's compounding asset.

## 7. ERPs become systems of record. The value moves to your agents.

The sharpest strategic insight from these conversations came from a senior engineering leader, paraphrased:

> "Big ERP vendors are already building agents. In a year or two everyone will have the same vendor agents. The distinguisher will be the agents _we_ build - the ones with our company's DNA, our VP's vision, our specific product knowledge. ERP becomes the system of record. The value moves above it."

This is the re-platforming question hiding inside every enterprise AI program.

Every major SaaS vendor - the ERPs, CRMs, HRIS, ITSMs - is racing to ship "their" agents on top of their own data model. Those agents will be perfectly adequate at the generic case.

What they cannot do is encode your specific edge-case handling, your tacit institutional knowledge, your VP's strategic priorities, your customer-segment exceptions. That's the layer that will increasingly determine which large enterprise wins its market and which one just buys the same software as everyone else.

This is the bet behind everything we're doing at Open Mercato: provide the engineering framework, the agent SDK, the orchestration primitives - and let teams ship their own DNA on top, fast and safely.

## 8. Value-based pricing is coming - for consulting and for tooling

One of these clients told us, almost in passing, that they had restructured a major consulting engagement. The model used to be time-and-materials with PowerPoint deliverables. The new contract pays the consulting firm **a percentage of the delivered, measured benefits** - single-digit, but uncapped.

That isn't a procurement quirk. It's the leading edge of how enterprise buyers are going to evaluate every AI vendor and every system integrator within 24 months.

The era of "we shipped a beautiful POC, here's our invoice" is ending. If you can't get to production, you don't get paid.

We've made the same shift internally. Our enterprise subscription scales with adoption. A customer running one process pays a fraction of a customer running twenty. That's not generosity - it's incentive alignment. It also forces us to invest where we should be investing: in audits, security reviews, observability, hardening, deployment support - not in slide decks.

If you're an enterprise buyer evaluating AI tooling, this is a useful filter: **how does the vendor get paid if your project doesn't make it to production?** The answer tells you everything.

## What ties this together

None of these conversations were strategy sessions. They were operating decisions: which process to attack first, which legacy system to bypass, which team to staff, how to brief an agent, how to structure a vendor contract.

The framing that keeps coming back: **AI engineering at enterprise scale is a re-platforming problem disguised as an automation problem.**

The teams winning right now share three traits

- **C-level air cover** that protects velocity from committee gravity.
- **Modular system design** - agents, not assistants; building blocks, not products.
- **Obsessive attention to time-to-production** - because the prototype is no longer the hard part.

If you're inside a large enterprise running early AI pilots, the question is not "which model do we use." The question is: **how do we build the orchestration layer that lets us replace thousand-step workflows with goal-directed agents - without setting our compliance team on fire?**

That's the problem Open Mercato exists to solve. If your team is on this journey, we'd like to compare notes.
