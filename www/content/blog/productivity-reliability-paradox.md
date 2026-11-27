---
webflowId: 6a3241154828d200acb79bfe
title: 'The Productivity-Reliability Paradox: Why Your Team Ships 2x the PRs and Delivers the Same'
description: "A new paper (arXiv:2605.01160) names the problem every CTO already feels: AI coding tools double individual output while degrading system-level delivery. The fix isn't a better model - it's specification discipline. Here's how it maps onto Spec-Driven Development at Open Mercato."
date: '2026-06-17T00:00:00.000Z'
author: tomasz-karwatka
category: ai-engineering
featured: false
thumbnail:
  src: /media/blog/6a32417f3c46c101120bee4c-zrzut-ekranu-2026-06-17-o-08.40.03.png
  alt: ''
  decorative: true
draft: false
---

A new academic paper just gave a name to the problem every CTO deploying AI coding tools already feels in their gut. It is called the **Productivity-Reliability Paradox**.

Here are the numbers (arXiv:2605.01160, May 2026, 67 sources reviewed):

- 98% more pull requests merged
- 91% longer review times
- Flat delivery metrics
- Developers perceive themselves as faster - even when objective measurements show a 19% slowdown for experienced engineers on real tasks

Read that again. Your team ships twice the PRs. Your reviewers drown. Your delivery velocity does not move.

## What the paper actually says

The paper calls it **PRP - the Productivity-Reliability Paradox**: AI coding assistants simultaneously improve individual output metrics AND degrade system-level dependability. The contradiction is not noise in the data. Controlled studies report 20-56% productivity gains on well-scoped tasks, the most rigorous RCT documents a 19% slowdown for experienced developers, and telemetry across 10,000+ developers shows the PR explosion with flat delivery.

This is not a model problem. The paper's conclusion is blunt:

> "Specification discipline, not model capability, is the binding constraint on AI-assisted software dependability."

Not better prompts. Not GPT-5. Not a faster Cursor tab-complete. **Specifications.**

## The proposed fix: Specification Governance Model (SGM)

The paper proposes the **Specification Governance Model (SGM)**, grounded in Transaction Cost Economics. The core idea: deterministic specifications serve as governance contracts between non-deterministic AI generators and the deterministic requirements of production systems.

In plain English: if you do not tell the AI WHERE things go and HOW they should be structured, you get code that works in isolation and breaks everything else.

The paper evaluates two instantiations of this model:

- **GitHub's Spec Kit**
- **The TDAD (Test-Driven AI Agent Definition) pipeline** - reporting 86-100% mutation scores

Both share the same principle: **specs first, generation second.**

## Why this hit home: Spec-Driven Development at Open Mercato

At Open Mercato, we have been building exactly this way since day one. We call it **Spec-Driven Development (SDD)** - every module, every entity, every event contract starts with a specification that ships inside the repo.

When an AI agent (Cursor, Claude Code, Codex) generates code, it reads the spec and knows:

- Where the code belongs architecturally
- What boundaries to respect
- Which patterns to follow
- What would break if ignored

Without the spec? Same model, same prompt - code that compiles, passes local tests, and breaks 3 other modules in production. We have seen this reduce "AI-generated code that needs senior review" by roughly 60%.

The paper validates what we learned through building: the bottleneck is not generation. It is governance. The three moderating variables the paper identifies - task abstraction level, codebase maturity, developer experience - are exactly the dimensions where specifications make the biggest difference. A junior developer with a well-written spec produces architecture-aware code. A senior developer without one produces AI-generated spaghetti, faster.

## The code review bottleneck (the part that matters most)

The most important insight from the paper for me is the **code review bottleneck**. AI tools dramatically increase the volume of code submitted for review. But review capacity is fixed - it depends on senior engineers who are already stretched thin.

The result: either reviews become superficial (quality drops) or review queues grow (velocity drops).

Specification-driven governance attacks this from the supply side. By constraining what AI generates through specs, the volume of "wrong but plausible" code decreases. Reviews get faster because the code is architecturally predictable.

This is why we designed Open Mercato as an **AI-Engineering Foundation Framework** - not another code generator, but the foundation on which code generators produce reliable output.

## Three takeaways for engineering leaders

1. **Name the problem.** If your team merged twice the PRs last quarter but shipped the same number of features, you are experiencing PRP. It is real. It is documented. It is not your team's fault.
2. **Invest in specifications, not just tools.** Every dollar you spend on Cursor/Copilot seats without investing in architectural specs is amplifying the paradox. The paper is clear: specification discipline is the binding constraint.
3. **Rethink "AI productivity" metrics.** PRs merged, lines generated, suggestion acceptance rate - these are vanity metrics in an AI-assisted world. Measure delivery velocity, change failure rate, and time-to-review instead.

The era of "just let AI write code faster" is ending. The era of specification-driven AI engineering is beginning. The academic world just caught up to what builders already know.

---

**Source:** Sabry E. Farrag, _The Productivity-Reliability Paradox: Specification-Driven Governance for AI-Augmented Software Development_, arXiv:2605.01160 (submitted May 1, 2026). [arxiv.org/abs/2605.01160](https://arxiv.org/abs/2605.01160)
