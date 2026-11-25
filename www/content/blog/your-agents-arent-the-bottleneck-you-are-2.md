---
webflowId: 6ad5ca49369770e5b7b3c4e0
title: Your Agents Aren't the Bottleneck. You Are.
description: Nobody who evaluates our agent orchestrator asks how many agents it runs. They ask how many hours they have to sit next to it.
date: '2026-10-19T00:00:00.000Z'
updated: '2026-11-09T14:16:09.039Z'
author: patryk-lewczuk
featured: false
thumbnail:
  src: /media/blog/6ad5c89d976c216bae76df6f-cezar-attention-hero.png
  alt: ''
  decorative: true
draft: false
---

Nobody who evaluates our agent orchestrator asks how many agents it runs. They ask how many hours they have to sit next to it.

That question rewired how we build [Cezar](https://cezar.run/). Here is what we learned.

## The 5% that ate 80%

In September we ran a hackathon with 21 teams and real business problems. One team put it best on stage. 80% of their app came from ready modules. 15% was customization. 5% was orchestration. That 5% ate 80% of their time.

Orchestration meant a human reading logs, answering agent questions, merging branches. The agents were fast. The person between them was slow.

Every single demo had a human approval gate. Nobody asked the teams to add it. That tells you where the technology is today. Agents do the volume, people make the calls.

## The numbers are worse than you think

**BCG, 1,488 workers.** Productivity grows up to three AI tools at once, then drops. People above that report 39% more major errors. Intent to quit goes from 25% to 34%.

**Microsoft Research, ParallelPilot.** Developers mostly keep three agent sessions open. 11 of 16 admit they miss status changes. The signals they miss most: questions and errors. Exactly when the agent sits idle. Summaries plus "needs attention" flags raised throughput by 63%.

**Faros AI, 10,000+ developers.** High AI adoption meant 98% more pull requests and 91% longer review time. DORA metrics stayed flat. More code, slower review, same delivery.

**Carnegie Mellon, Geng and Neubig.** Agents in isolated worktrees with tests scored 63%. Agents sharing one directory scored 56%, below a single agent. Eight parallel agents did worse than four.

**Amdahl's law.** If review is half the cycle, infinite agents give you 2x at best.

The slowest component is the human. The tool that wins saves human time. The tool that spawns more agents makes it worse.

## Six things that save human time

We scored 11 tools on six criteria. One point for a full feature, half for a partial one.

1. WIP limit and queue. You set how many agents run. The rest wait.
2. "Needs you" signal. You see which agent waits for your decision.
3. Automations. Tasks start at night, on a new PR, on a new issue.
4. Session digest. Four lines instead of a log.
5. Checks before review. Tests run first. The agent fixes failures itself.
6. Human merges. Nothing lands on main without you.

![](/media/blog/6ad5ca2bc677397c9b46953e-cezar-attention-fig1-scores.png)

Full disclosure: we wrote the criteria and Cezar was built for them. On a plain feature count Codex and Copilot win. Treat this as our thesis, not a neutral ranking.

## What Cezar still lacks

We keep the gap list public.

- Ordering the decision queue by risk and urgency. Today it is first come, first served.
- A "waiting for 40 minutes" counter.
- A fixed digest format: done, proof, what I need from you.
- Task dependencies and warnings when two tasks touch the same files. No tool has that.
- Written rules for when the agent acts alone and when it asks.

## Measure attention, not agents

Four numbers we want on every dashboard:

1. Human minutes per accepted task.
2. How long an agent waits for a decision.
3. Interruptions per task.
4. Share of tasks accepted without rework.

If your tool cannot show these, you cannot tell whether it helps. You only know it burns tokens.

## The pitch we use now

We stopped selling the number of agents. The agent comes back with one decision a minute, and proof that the rest works.

[`Cezar is open source`:](https://github.com/open-mercato/cezar) Runs Claude Code, Codex and OpenCode in parallel, within the RAM you give it.

How many minutes of your attention did your last accepted agent task cost? If you don't know, measure that first.
