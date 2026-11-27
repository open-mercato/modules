---
webflowId: 6a73a7afd143ca957b83239d
title: OM Skills and Cezar are now open source. Sandboxes are next.
description: At the AI Tech Leaders launch event in Wroclaw, Poland we open sourced OM Skills and Cezar - the tooling behind our 1,000,000-line, AI-built ERP - and gave a first look at Sandboxes.
date: '2026-08-05T20:00:00.000Z'
updated: '2026-11-23T22:53:31.443Z'
author: tomasz-karwatka
category: product-updates
featured: true
thumbnail:
  src: /media/blog/6a73a88b6a2c00d5be4b8924-premiere.jpg
  alt: ''
  decorative: true
draft: false
---

**2658 people signed up for the livestream within hours of the announcement.** So we knew the topic hit a nerve. Today, on stage at the AI Tech Leaders launch event in Wroclaw, Poland we released two open source tools and previewed a third. All three come straight from how we build Open Mercato.

![](/media/blog/6a73a88b6a2c00d5be4b8924-premiere.jpg)

Quick recap for new readers. Open Mercato is an open source framework for enterprise applications. It has passed 1,000,000 lines of code, with 130+ contributors. We ship a release every week or two. Each release merges 300-500 pull requests. Engineers design, review and decide. AI writes the code, guarded by 2,500+ integration tests and thousands of unit tests.

To make that work at this scale, we had to build a whole factory around the agents. Today we open sourced two big pieces of it.

## OM Skills: an AI engineering playbook for whole teams

Repository: [github.com/open-mercato/skills](https://github.com/open-mercato/skills)

OM Skills is the PR pipeline we run in production, extracted into 23 reusable skills. They are stack-agnostic. We verified them on TypeScript, and teams can run them on Java, .NET or anything else with a Git repo.

There are two families. Interactive skills, like `om-spec-writing`, help you turn an idea into a solid specification with use cases and data structures. Autonomous skills take it from there. `om-auto-create-pr` turns a spec into a reviewed pull request, tests included. `om-auto-review-pr` reviews incoming PRs. `om-auto-fix-issue` picks a GitHub issue and fixes it end to end. `om-auto-qa` generates test scenarios from the spec and clicks through your app in a browser. And `om-auto-continue-pr` resumes a run after a crash, from a handoff file the agent keeps updating.

The difference from other skill collections: these are built for teams. Developers, QA engineers, release managers and their agents work on one repository without stepping on each other. The pipeline understands who is doing what.

Works with Claude Code, Cursor, Codex and 19+ other coding agents.

One more thing we care about: cost. We test the whole harness against cheaper models too, the way games were once optimized for the slowest CPU. If a skill runs well on a budget model, it runs everywhere. Your token bill will notice.

## Cezar: a cockpit for your coding agents

Repository: [github.com/open-mercato/cezar](https://github.com/open-mercato/cezar)

Here is the honest origin story. The agents started ruling us. You launch three sessions and your own context runs out. You wait for runs to finish, get bounced between terminals, and forget what you delegated two days ago.

Cezar flips that. It is a cockpit for AI coding agents working on GitHub issues. You queue tasks - 10, 20, 30 of them. You set one limit: how many run in parallel, or how much RAM they can use. Then you close the tab and go do focused work. Finished runs land in an inbox, like email. You review them when you choose.

Details that matter:

- Runs locally with one command, or on your own server behind a password. Server mode keeps working when your laptop is closed.
- Delegates work to Claude Code, Codex and OpenCode - on your existing subscriptions, with no extra API bills.
- When an agent pauses to ask a question, its slot frees up and the next queued task starts automatically.
- Works surprisingly well from a phone. I queue tasks from mine whenever I have ten spare minutes.

MIT licensed, like everything we ship.

## Sandboxes: one more thing

We saved one announcement for the end. In many large companies, running a coding agent means 30 meetings with IT and a security review. By the time you get approval, the momentum is gone.

Sandboxes remove that wall. It is [a full development environment in the browser](/blog-posts/open-mercato-sandboxes-ga): a virtual machine with Cezar, a terminal agent, all OM Skills and a running Open Mercato instance. Ready in about 30 seconds. You share it with your team by link. Your code lives in your own GitHub repository, public or private, so there is no lock-in.

Today's demo was the first public showing. Closed beta invites go out to the [waitlist](https://sandboxes.openmercato.com/) shortly. Production deploys with multiple environments, staging and production, are planned within 2-3 months.

## What's next

The knowledge behind all of this becomes a course. AI Tech Leaders is a 5-week cohort program starting October 12. Our team will build a full application from scratch in front of you: specs, mockups, autonomous pipelines, production deploys. It is aimed at whole teams - developers, QA, UX designers, analysts and product people.

But you do not need a course to start. Both repos are live now:

- [github.com/open-mercato/skills](https://github.com/open-mercato/skills)
- [github.com/open-mercato/cezar](https://github.com/open-mercato/cezar)

Install the skills on your own project, any stack. Queue your first three tasks in Cezar. And if it saves you an afternoon, leave a star on GitHub. Both repos are one day old :)
