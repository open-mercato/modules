---
webflowId: 6a29be300999fde778314845
title: Let AI write the code. Don't hand it the keys to production.
description: A team vibe-coded a warehouse over a weekend. By Tuesday the database had vanished. What actually keeps generated code safe is the frame it works inside, and whether that frame holds when 100+ PRs hit it in 48 hours.
date: '2026-06-14T00:00:00.000Z'
updated: '2026-06-17T22:19:00.825Z'
author: maciej-gren
category: ai-engineering
featured: false
thumbnail:
  src: /media/blog/6a2a3599356e053ef4225cad-6a2a357e8a6a2403b7daf185-ai-code-needs-a-harness-cover-v3.png
  alt: Generated code streams into the harness; a pre-merge gate passes conforming code and stops the rest
draft: false
---

One team vibe-coded a warehouse system over a weekend. Friday there was nothing; by Sunday evening a working app: receiving, picking, stock levels, reports. The rollout was set for Monday. On Tuesday the database was gone. It didn't crash, it didn't slow down. It vanished. The generated code had a path that dropped the schema on a particular input, and nobody caught it, because nobody read the few thousand lines the model wrote in 40 hours.

The AI wasn't stupid here. The model wrote code that compiled, passed its own tests, and did exactly what it was asked in the happy path. One thing was missing: nobody had defined what the code was not allowed to do.

## What AI actually produces when nothing constrains it

Put a model to writing code with no frame around it and you get four recurring classes of problem.

First, random dependencies. The model pulls in libraries it saw in its training data. Some have been abandoned for three years, some carry known CVEs, and sometimes the package name doesn't exist at all and someone has since registered it with malware inside (slopsquatting). Your package.json grows with things nobody consciously chose.

Second, security bugs that look innocent. String concatenation in a SQL query instead of parameterization. A secret hardcoded so it "works for now." An endpoint with no authorization, because the prompt never mentioned it. The model optimizes for "does it work," not for "can someone exploit this."

Third, GDPR breaches. Personal data logged in plain text to a file, copied to a third service while debugging, kept with no retention policy. The model doesn't know where the data boundary runs in your company, because nobody showed it.

Fourth, throwaway code. Every new module solves the same problem a different way. Validation done three different ways, error handling reinvented each time, naming conventions that shift from module to module. A month in you have something no human can maintain, because there is no single pattern in it.

Banning this doesn't solve it. The model that wrote the warehouse over a weekend saved real weeks of work. What solves it is the frame the model works inside.

## The harness: a frame the model can't step out of

We call it the harness, the layer around the model that makes it reliable rather than just fast. It has several parts: orchestration, memory, context, verification. The three that keep generated code from going rogue are these.

The first layer is architecture designed by people, where AI writes the code but cannot get out of the structure. The model doesn't decide how modules are organized, how data access works, how authorization runs, or where the personal-data boundary sits. Those are hard limits in the framework itself. The generator gets a fenced playground, not an open field. It can write business logic fast and in volume, while the data layer, permissions, and encryption sit out of its reach, built in lower down. How the security and encryption layer looks in practice we covered separately, in [the piece on the engineering foundation under AI](/blog-posts/ai-engineering-foundation-framework).

The second layer is guidance strict enough that even a hallucinating model can't break the software. These are enforced conventions, not README advice: one way to validate, one error-handling pattern, a controlled set of dependencies rather than whatever the model reaches for, data-access patterns that route every write through the permission layer. If the model generates something off-pattern, the typecheck, a guard, or a test catches it before it lands. The hallucination is caught mechanically, before any human review.

The third layer is pre-production verification plus an SLA. For production-grade delivery, code passes homologation before it ships: tests, a security check, a personal-data compliance check. What passes is covered by an SLA. This is the step that was missing in the warehouse story. There the code went from a laptop straight to production, with no gate to ask what that fragment does to the database on a bad input. The fuller version of this philosophy we laid out in [the piece on how we don't do AI, we build the frame around it](/blog-posts/we-dont-do-ai-we-build-the-harness-around-it).

## Does it hold under load

The skeptical question here: nice theory, but does the frame hold when you push a lot of generated code through it at once.

We tested it directly. A hackathon, over 70 people, AI generating code in parallel for 48 hours. In that window over 100 merged pull requests landed in the system, and it didn't fall apart. It held for one reason: every one of those PRs had to pass through the same frame, the conventions, the architecture boundaries, the gate before merge. Where the model tried something off-pattern, the gate stopped it before a human even saw it.

That is the difference between a weekend that ended with the database gone and 48 hours that ended with over 100 changes merged and everything still standing. In both cases AI wrote the code. Once in a vacuum, once inside a frame that knew in advance what it wasn't allowed to do.

If the board is pushing AI in delivery and you remember how "vibe" code can behave in production, those two signals can be reconciled. It comes down to the frame around the generator. If you want to walk through what that frame looks like for you, [let's talk](/contact).
