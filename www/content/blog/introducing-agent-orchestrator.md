---
webflowId: 6a3b7feaa0aaedcf4d52a959
title: Introducing Agent Orchestrator - the new AI agent module in Open Mercato Enterprise
description: 'Everyone has an AI agent demo. Almost nobody has an agent you can safely let into a real business. Agent Orchestrator - a new Open Mercato Enterprise module - changes that: flexible runtimes, native workflow integration, two-layer audit and built-in evals.'
date: '2026-06-24T08:00:00.000Z'
updated: '2026-06-25T09:22:22.332Z'
author: tomasz-karwatka
category: product-updates
featured: true
thumbnail:
  src: /media/blog/6a3b802999dc1940f9c6e6b3-zrzut-ekranu-2026-06-24-o-08.33.03.png
  alt: ''
  decorative: true
draft: false
---

Everyone has an AI agent demo. Almost nobody has an agent you can safely let into a real business - real data, real processes, real customer money.

That gap is the whole problem. A demo runs in a sandbox. Production runs on your permissions, your audit trail, and your liability. Today we close that gap.

Meet the **Agent Orchestrator** - a native agent orchestration layer inside Open Mercato. It ships out of the box with Open Mercato Enterprise.

## Run your agent where you already run

We did not build another walled garden. Pick the runtime that fits your stack:

- **OpenCode**, hosted directly inside an Open Mercato Docker container.
- **In-process agents** on the Vercel AI SDK, for lightweight scenarios.
- **Major cloud runtimes** - Azure AI Foundry, Google, Amazon and others - through a connector built on the Agent-to-Agent (A2A) protocol.

![](/media/blog/6a3b80bd581b3065f5d89901-zrzut-ekranu-2026-06-24-o-08.33.17.png)

Your agent, your environment. We adapt to it, not the other way around. Wherever your agents live, Open Mercato works with them.

## An agent becomes a function in your workflow

This is where it gets useful. The Agent Orchestrator plugs natively into Open Mercato Workflows through a new node: **Invoke Agent**.

Invoke Agent treats an agent like any other function. You pass it a well-defined context from the workflow, it does the work, the workflow waits for the response. No glue code, no separate integration project.

![](/media/blog/6a3b80da387c46c48d7e9a27-zrzut-ekranu-2026-06-24-o-08.33.28.png)

## Two controls make this production-grade

**Confidence thresholds.** Set the bar. Above 80% confidence, the agent decides on its own and the workflow moves forward. Below it, the decision escalates to a person. You decide exactly how much autonomy you hand over.

**Human-in-the-loop steps.** When an agent's output needs sign-off - an approval, a review, any human gate - the workflow stops and routes it to the right person. The agent proposes, the human disposes.

All of it runs on top of the Open Mercato MCP Server. The same tools you already expose today are discoverable and callable by agents. No new tooling to wire up.

![](/media/blog/6a3b8152a16203f3d44197db-agenr-orchestrator-open-mercato-approval.png)

## Trust, because you can see everything

Most agent platforms ask you to take their word for it. We log instead.

Every action an agent takes inside Open Mercato is audited exactly like a human action. A data change made by an agent is traced the same way a data change made by a person is traced. Nothing happens off the record.

The trail is two-layered:

- If the agent acts autonomously, you get a clean agent-level record.
- If a person triggered the agent - say, a one-time action - we capture both the agent and the person who set it in motion.

![](/media/blog/6a3b816e43274b956c15c86b-agenr-orchestrator-open-mercato-workflow.png)

You always know what the agent did, and who put it to work. For regulated industries and enterprise buyers, this is not a nice-to-have. It is the price of entry.

## Stop guessing whether your agent is any good

You do not ship code without tests. So stop shipping agents without evals.

The Agent Orchestrator adds **Agent Evals** directly inside Open Mercato. Define evaluation scenarios, benchmark your agents against them, and watch how behavior holds up over real-world cases - all in the same environment where the agents actually run.

Around that sits real observability. Which model an agent used. What it cost in tokens. How it performed over time. Admins and AgentOps teams get rich statistics to tune behavior instead of crossing fingers. Agent creation and management live inside Open Mercato too, so the whole loop - build, run, trace, measure, evaluate - happens on one platform.

## How is this different from n8n?

Fair question - people ask it first.

In n8n, an agent is just another node that calls an API. It fires a request and hopes for the best. It sits outside your data, your permissions, and your audit.

In Open Mercato, an agent is a supervised participant in the process. It operates inside your data, inside your permission model, inside your audit trail. It is governed, not bolted on.

That is the difference between automating a step and trusting an actor.

## One layer, not three features

Runtimes, workflow integration, audit, evals - it is tempting to read these as four separate things. They are not.

It is one coherent layer. Create agents. Run them as functions or as workflow steps. Trace every move. Understand the results. Benchmark them against real scenarios. One platform, start to finish.

![](/media/blog/6a3b818b34936a05e87403bc-agenr-orchestrator-open-mercato.png)

AI agents have spent two years doing impressive demos. The Agent Orchestrator is about the boring, hard part nobody screenshots - getting them safely into production work.

The Agent Orchestrator is part of [**Open Mercato Enterprise**](/enterprise-level-support) today.

Want to put an agent to work inside your processes - with the audit trail and evals to back it? Talk to us.
