---
webflowId: 6aaaec92907b79e394dce3ec
title: 'Comp AI CRM vs Open Mercato: a great agent, a very small notebook'
description: 'Comp AI shipped an "agentic-first" CRM: the agent works, the CRM is where it keeps its notes. I read the whole repo. It is good. Here is what it gets right, where it stops, and when you need a foundation instead.'
date: '2026-09-17T08:00:00.000Z'
updated: '2026-09-23T10:22:45.023Z'
author: tomasz-karwatka
category: ai-engineering-foundation-framework
featured: false
thumbnail:
  src: /media/blog/6aab02276559e25fcf36b9f4-compai-crm-vs-open-mercato-cover.png
  alt: ''
  decorative: true
draft: false
---

Comp AI shipped an open-source CRM and called it "agentic-first". The repo got a lot of attention on GitHub, and deservedly.

So I read it. README, SECURITY.md, the Prisma schema, the agent docs. All of it.

Short version: it is a good piece of engineering. And it is built for a very specific company. Probably not yours.

## What Comp AI CRM gets right

Comp AI is a compliance company. Their main product is a Vanta and Drata alternative. The CRM is a side project, and you can feel the focus in it.

The README states the idea in one line: "the agent is not a feature of the CRM; the CRM is where the agent keeps its notes." The agent has its own work queue, schedule and research budget. You close the browser, it keeps working. It reads your mailbox, identifies people, enriches companies, books rechecks.

Three design decisions I genuinely like:

- **No confidence scores.** Tools report what they observed, like a signature block or a GitHub identity. A ledger prices the evidence. Strong evidence updates the record, weak evidence becomes a suggestion a human reviews. Their words: "a confidently wrong fact about a customer is worse than a blank field." Steal this idea.
- **Sandbox with deny-all egress.** The agent gets bash, grep and glob, but no network and no database credentials. Exfiltration is blocked by design, not by prompt.
- **Budgeted sessions.** Every research pass has a token budget. Running out of budget is a normal end state, not an error.

Four environment variables and you are running. For a founder on Google Workspace with 200 leads, this is a great tool. I mean it.

## Now read SECURITY.md

This is where most people stop reading and I did not. Their own words, from the security policy:

> "Sign-in is the entire authorisation model. ALLOWED_SIGN_IN decides who gets in; after that, every signed-in person can read and write every record. There are no roles, no per-record permissions and no organizations - deliberately."

And one more:

> "If you need someone to see only part of the pipeline, this is the wrong tool today."

I respect that honesty. Most vendors hide it in a pricing page. Comp AI puts it in the repo. But it defines exactly who this is for.

Here is what the schema tells you:

- **Three business entities.** Contact, Company, Deal, plus an Activity timeline. That is the whole domain.
- **One hardcoded pipeline.** DealStage is an enum with 8 stages, from DEMO_BOOKED to CLOSED_WON. Want a second pipeline for partnerships? You edit the enum and redeploy.
- **No custom fields.** There are JSON columns for agent evidence and briefs. There is no way for an admin to add "contract renewal date" without a migration.
- **Single tenant, single org.** No organizations table, by design. One deployment equals one company with one set of eyes.
- **Mailbox access is a condition of entry.** Google sign-in, and the agent reads message bodies and signature blocks. You are the data controller for that.
- **Three deployments plus Postgres.** A Next.js app, a NestJS API and an agent runtime on Vercel's Eve. Blob storage, sandbox and model gateway are Vercel too.

None of this is a bug. The authors chose it. And a permissions check that always returns true is worse than no permissions check. They say so, and they are right.

But every enterprise conversation we have starts with the opposite question. Who is allowed to see what?

## Two different questions

Comp AI CRM answers: "how does a small sales team stop typing data into a CRM?" It answers that very well.

Open Mercato answers a different question. How does a company build the systems it runs on, with agents, and keep control in year two?

Here is the difference on one page.

![](/media/blog/6aab024d7dc3dd579c493f25-compai-crm-vs-open-mercato-table.png)

## Agents: same fear, two answers

Both projects agree on one thing. Do not let a model write to the database unchecked.

Comp AI solves it narrowly and elegantly. Evidence in, human review for anything weak, an immutable event log. It works because the agent does one job: research people and companies.

We had to solve it wider. Open Mercato agents do not only enrich contacts. They generate offers, handle claims, move orders, touch invoices. So the guardrails sit in the framework, not in one agent:

- **Tool allowlists per module and per permission.** An agent in the CRM module cannot call an orders tool it was not granted.
- **Staged mutations.** The agent proposes a change, a human approves it, then it lands. Same for AI-generated code in our own SDLC.
- **Agent Orchestrator.** Agents run as steps inside a workflow. Low-confidence cases route to a human. Every agent action is audited exactly like a user action.
- **Undo.** When a human or an agent gets it wrong, roughly 99% of writes can be reversed.

Comp AI built a very good agent and gave it a notebook. We built the building and made sure the agents inside it have badges.

One honest note. Their "no confidence scores from the model" rule is stricter than our evidence handling today. I would like to see a contributor bring that into Open Mercato. The repo is open. Pull requests welcome.

## When Comp AI CRM is the right pick

Let me be as direct as their SECURITY.md.

Take Comp AI CRM if: you have one sales team, one pipeline, everybody on Google Workspace. Nobody in the company needs to be shielded from any deal or any email. No regulated data. You want research automation running tomorrow, not next quarter. You are fine living on Vercel.

That describes a lot of startups under 30 people. For them it is a better choice than a framework. A framework is work.

## When you need a foundation

You need Open Mercato when the CRM is not the product. It is one of five to ten applications your company will run on the same data.

When three departments each need their own entities and fields. When an auditor will ask who changed what and when. When the sales pipeline in Poland must not be visible to the team in Argentina. When the system has to live five-plus years and survive a core upgrade. When your infra team says "our servers, our keys".

One example. Air\&Ocean Logistics built a logistics ERP on Open Mercato in six weeks. Zero license fees on the open-source core. Not a CRM with an agent, an ERP. That is not a job for an opinionated CRM app, however good its agent is.

## One exercise for next week

Count the people in your company who should not see every deal and every customer email.

If the number is zero, install Comp AI CRM this weekend. It is four environment variables away.

If the number is not zero, you need permissions on day one, not in year two. Then the question is not "which CRM", but "which foundation". Open Mercato is MIT-licensed. Clone it, point your coding agent at it, build one process end to end.

And if you build a Comp-style research agent as an Open Mercato module, send the PR. I will review it myself.

**Start with 80% done:** [openmercato.com](/) · [openmercatocloud.com/demo](https://openmercatocloud.com/demo)
