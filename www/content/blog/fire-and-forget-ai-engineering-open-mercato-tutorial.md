---
webflowId: 6a2f9217469e6c89d4a9cf5d
title: 'Fire-and-Forget AI Engineering: How an Agent Shipped a Production App on Open Mercato'
description: Piotr Karwatka's new tutorial shows autonomous AI agents going from idea to a production-ready app - GDPR audit logs, encryption, parallel branches and a coordinator sub-agent - with no babysitting. Here is the full breakdown of the workflow and why it points to where serious AI engineering is heading.
date: '2026-06-15T00:00:00.000Z'
updated: '2026-09-23T10:22:45.023Z'
author: piotr-karwatka
category: ai-engineering
featured: false
thumbnail:
  src: /media/blog/6a300d26cb55a010417dc3e2-zrzut-ekranu-2026-06-15-o-16.31.50.png
  alt: ''
  decorative: true
draft: false
---

"An AI agent just built a production landing page, with GDPR audit logs and encryption baked in. I wasn't even at my desk." That is not a demo gone lucky. That is the workflow.

No babysitting. No "ping-pong" prompting where you correct the model every 30 seconds. [Piotr Karwatka](https://www.linkedin.com/in/piotrkarwatka/) recorded a full tutorial showing how to go from idea to a production-ready app with [Open Mercato](https://github.com/open-mercato/open-mercato) - the AI-Engineering Foundation Framework for CRM and ERP. This post breaks down what is inside, and why it points to where serious AI engineering is heading.

## From "vibe coding" to fire-and-forget engineering

Most people experience AI coding as a conversation. You prompt, the model writes, you spot the bug, you correct it, you re-prompt. It works for snippets and breaks the moment the task touches real architecture - multi-tenancy, RBAC, event flow, encryption, audit logging. The context window fills with corrections, the agent loses the thread, and you are back to typing.

The tutorial demonstrates the opposite model. You hand the agent a goal. It creates a branch, writes the code, runs the tests, and opens a structured pull request on its own. You review the PR, not every keystroke. The reason this works on Open Mercato and not on a blank repo is that hundreds of architectural and domain decisions are already made - as conventions, specs and skills the agent reads before it writes a line. The agent is not inventing how RBAC or GDPR logging should work. It is following a foundation that already encodes it.

## 1. Fire-and-forget, not ping-pong

The first shift is operational. The agent runs the full loop autonomously: branch, implement, test, open a PR with a clear description of what changed and why. You are no longer the human in the inner loop correcting the model every few seconds. You move to the outer loop - reviewing a finished, testable unit of work.

This is the difference between AI as autocomplete and AI as a colleague who actually ships. The output in the tutorial is concrete: a live website that captures leads straight into the Open Mercato CRM, with GDPR audit logs and encryption included by default - not bolted on after a compliance review.

## 2. Multiple agents in parallel, without touching main

This is the part most people get wrong. Running one agent is easy. Running several at once usually means collisions - two agents editing the same files, stepping on each other, and corrupting your main branch.

The tutorial shows multiple agents working in parallel on isolated paths. Each operates on its own branch, so they never collide and never touch main directly. This is what turns AI engineering from a single-threaded novelty into something that scales like a real team. Parallelism is only useful if it is safe, and safety here comes from isolation by design, not from hoping the agents stay out of each other's way.

## 3. Two-phase spec refinement (Claude + Codex)

The most important idea in the tutorial happens before any code is written. Good autonomous output depends on a good spec, and the tutorial uses a two-phase approach to get one.

First, a spec-writing skill generates an architecture-compliant specification - a plan that already respects the framework's conventions instead of fighting them. Then comes a second, "philosophical" pass: a deliberate review that hunts for hidden gaps the first draft missed - routing, caching, edge cases - before a single line of code is committed. Pairing models here matters: **Claude** and **Codex** are used across the phases so the spec is both compliant and stress-tested.

This is spec-driven development taken seriously. The cost of a wrong assumption is highest at the start, so the workflow spends its scrutiny there. By the time the agent writes code, the hard thinking is already done.

## 4. Hours of autonomous runtime, managed by a coordinator

Agents in the tutorial run autonomously for hours. The obvious failure mode is context burnout: a single agent grinding through a long task eventually fills its context window with history and loses coherence.

The fix is structural. A **coordinator sub-agent** manages the execution agents - delegating work, holding the high-level plan, and keeping any individual agent's context from burning out. The coordinator owns the map; the workers own the tasks. This separation is what makes multi-hour, unsupervised runs possible without the quality collapse that usually follows long agent sessions.

## Why this matters for AI engineering

Strip away the demo and three principles remain, and they generalize well beyond this one tutorial:

- **Foundation beats prompting.** Autonomous agents are only as good as the decisions already encoded around them. A framework that ships with conventions, specs and skills lets an agent produce production-grade work because the architecture is not up for debate.
- **Specs are the leverage point.** Two-phase refinement - compliant draft, then adversarial review - front-loads the thinking and removes the biggest source of wasted agent runtime: building the wrong thing correctly.
- **Orchestration is the new skill.** Isolated branches and a coordinator sub-agent are the plumbing that turns one agent into a safe, parallel, long-running team. This is the engineering work that does not disappear when models get better - it is what lets you use better models at scale.

The headline detail is the one that is easy to skip past: GDPR audit logs and encryption were in the output by default. Compliance was not a phase. It was a property of the foundation the agent built on. For anyone shipping CRM or ERP software in regulated markets, that is the whole game.

## Watch the tutorial

![](/media/blog/6a300d4c8bbedb6a6b9581bd-zrzut-ekranu-2026-06-15-o-07.19.23.png)

Piotr's full walkthrough shows the entire flow end to end - spec, parallel agents, coordinator, and the lead-capturing site wired into the Open Mercato CRM. [Watch the tutorial on YouTube](https://www.youtube.com/watch?v=y-lxRrAzbYc), explore the [Open Mercato repository](https://github.com/open-mercato/open-mercato) on GitHub, or try the [live demo](https://openmercatocloud.com/demo).

One question worth sitting with: what is the longest you have ever let an AI agent run unsupervised? The answer is about to get a lot longer.
