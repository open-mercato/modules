---
webflowId: 6a741f1b05d7481a0d918967
title: 'Cezar: how we got back control over our AI coding agents'
description: 'A deep dive into Cezar, our open source cockpit for AI coding agents: queue 30 tasks, set one limit, close the laptop. Architecture, Actions, autofix workflows and three ways to run it.'
date: '2026-08-06T06:00:00.000Z'
updated: '2026-09-10T07:54:28.239Z'
author: tomasz-karwatka
category: ai-engineering
featured: false
thumbnail:
  src: /media/blog/6a745028bd250eb2d2b9a43b-cezar-hero.png
  alt: ''
  decorative: true
draft: false
---

Here is the trap most teams fall into. You get good at agentic coding. You launch more sessions. And suddenly the agents run your day. You wait for sessions to finish. You get bounced between contexts. The session decides what you work on next, based on nothing smarter than which loop ended first.

Patryk from our core team says it openly: three parallel sessions and his own context window is full. Some people claim they juggle ten. Good for them. Most of us need fewer windows, more calm.

We build Open Mercato with agents at serious scale: a release every week or two, 300-500 pull requests merged per release. At that volume, babysitting terminals stops being an option. We needed a control tower.

Yesterday we open sourced [Cezar](https://github.com/open-mercato/cezar), and this post explains what it does, how it works under the hood, and the three ways you can run it today.

## What Cezar is

Cezar is a cockpit for AI coding agents working on GitHub issues. Every agent run - queued, running, paused, failed, finished - is visible on one screen, with controls.

The daily loop looks like this. You open Cezar. You queue tasks - 10, 20, 30 of them, across different repositories. You give Cezar one constraint: how many tasks may run in parallel, or how much RAM it can use. Give it 10 GB and it will juggle the queue to stay inside it. Then you leave. Real, focused work, in your favorite editor, on the thing only you can do.

Finished runs land in an inbox, like email. Unread items are marked, so you always know which results you have not looked at yet. You review them when you choose. This is the whole point: you decide what matters now, the agents fit around you.

Two small details do a lot of work here. First, when an agent pauses to ask a question, its run is suspended and the slot frees up - the next queued task starts immediately. Nothing idles. Second, Cezar runs on your existing coding subscriptions. It detects the tools you have installed - Claude Code, Codex, OpenCode - and delegates work to them. No separate API bills.

## Under the hood

Cezar is a TypeScript monorepo with four packages: `@cezar/core` (the engine), `cezar` (the CLI), `@cezar/gui` (a Next.js cockpit) and `@cezar/runner` (a self-hosted daemon). The data flow has three phases.

Phase one: fetch. Issues come in through CLI sync or GitHub webhooks. Phase two: digest. Each issue is compressed into a summary of roughly 80 tokens, with a category and keywords. This is a cost decision - analysis runs against compact digests, so triaging a large backlog stays cheap. Phase three: analyze. Actions and workflows run against the digests, and every step is recorded as events, which is what the cockpit visualizes in real time.

Actions are data-driven, so adding behavior means writing configuration and a playbook. Cezar ships with 15 of them, including `auto-triage`, `bug-detector`, `priority`, `duplicates`, `missing-info`, `security`, `good-first-issue`, `done-detector` and `stale`. On a repo like ours, with thousands of processed pull requests and a constant stream of issues, this layer alone saves hours every week. My favorite: `done-detector` finds issues that were silently fixed long ago and are still sitting open.

One design choice we insisted on: all triage results for an issue go into a single evolving comment. You will find no wall of bot spam under your issues.

## Autofix: from issue to draft PR

The flagship workflow is autofix. It is a chain of steps: `verify-in-repo` confirms the bug actually reproduces, `root-cause` finds why, `fix` implements the change, `review-loop` critiques it and loops until it passes. The output is a draft pull request. A human merges. That last sentence is policy, and it will stay policy.

This pairs directly with our [OM Skills](https://github.com/open-mercato/skills) repository. Skills are Markdown playbooks. Cezar ships built-in ones and also reads yours from `.ai/skills/` in your repo, where your versions override the defaults. Your team's know-how stays in your repository, versioned like code, and every agent run uses it.

## Guardrails: effect-scoped access

If you work with enterprise clients, this part matters most. Every Action declares which side effects it may perform on GitHub, from a fixed vocabulary: `label.add`, `label.remove`, `comment`, `close`, `assign`, `link-duplicate`, `set-priority`. Only declared effects execute. An agent that was allowed to label cannot suddenly close your issues, no matter what it hallucinates.

We built this because we sell into companies where a new tool means 30 meetings with IT and security. A declared, auditable list of what the agent can touch shortens that conversation a lot.

## Three ways to run it

First, solo CLI. Local JSON store, no database, no server. Clone, build, export your GitHub token, run. Good for trying it out on one repo tonight.

Second, self-hosted cockpit. A Next.js app backed by Supabase, on your own domain, behind your own password. This is how Piotr runs it, and it unlocks the best feature: Cezar keeps working when your laptop is closed. He queues tasks from his phone whenever he has ten spare minutes. He calls it addictive. I have witnessed this on a sailboat.

Third, the runner daemon. It connects to your cockpit, claims jobs and executes them on your own machine under your own subscriptions. Your code and your credentials stay on your infrastructure.

The multi-backend design is also our answer to a strategic question: model independence. Cezar normalizes agent events across backends, so switching from one provider to another is a config change. We optimize our whole harness to run well on cheaper models too. When the next price shock or model deprecation comes, we want a switch to flip instead of a migration to run.

## Where to start

The repo is at [github.com/open-mercato/cezar](https://github.com/open-mercato/cezar). MIT licensed. Pick the solo CLI mode, connect one repository and queue three real tasks from your backlog: one bug fix, one PR review, one triage pass. That is a one-evening experiment.

Then do the honest math. Count the hours you spent last week watching an agent work - waiting for a session, re-reading context, restarting something the laptop killed. That number is what a cockpit gives back. Ours went to building the product :)
