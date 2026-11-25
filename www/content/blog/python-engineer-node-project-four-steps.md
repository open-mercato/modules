---
webflowId: 6a0ad82f696cfe508549dfe6
title: How a Python engineer contributed to a Node project. In four steps.
description: I'm a Python/AWS engineer. I picked up an open-source TypeScript project (Open Mercato) and shipped contributions in four steps without learning Node first. Start where you're strong, expand quickly, and learn the basics last. Here's the playbook.
date: '2026-05-18T10:00:00.000Z'
updated: '2026-06-10T18:05:56.541Z'
author: mateusz-staniaszek
category: ai-engineering
featured: false
thumbnail:
  src: /media/blog/6a0ad9374763583705f35905-zrzut-ekranu-2026-05-18-o-11.17.22.png
  alt: ''
  decorative: true
draft: false
---

**TL;DR.** I'm a Python/AWS engineer. Six months ago I picked up an open-source TypeScript / Next.js / MikroORM project I couldn't read (Open Mercato) and decided to contribute. I didn't go away and learn Node first. I contributed in four steps, each a small distance from the last. First, pure DevOps. Then a small, bounded TypeScript task (OCR). Then a hybrid that needed both DevOps and Node (enterprise SSO). Then a real product built in Node end-to-end: DevCloud, a PaaS I built for a hackathon. I still don't speak Node fluently. If you want to contribute to a project outside your stack, this is the lesson: don't wait until you've learned the language. Start where you're already strong, expand quickly, and learn the basics last. If you want a project to try this on, Open Mercato is wide open.

Six months ago I cloned a repo for the first time. It was full of TypeScript, Next.js App Router, yarn workspaces, MikroORM, Awilix dependency injection. I read the README. I read it again. I had no idea what I was doing.

Python and AWS. I had built things people relied on. And here I was, sitting in front of `yarn install` like it was the first time I'd ever opened a terminal.

The project is called Open Mercato. It's an AI-supportive foundation framework for building CRMs, ERPs, and commerce backends: modular, multi-tenant, spec-first. Hundreds of architectural decisions already made so AI agents can build features without reinventing them. Nobody asked me to be there. I'd seen the project, liked what it was trying to do, and decided I'd contribute. So I cloned the repo and got to work.

Or tried to.

I didn't, really. Not at first.

There were four steps. Each one a small distance from the last. By the end of the four, I'd shipped things into the codebase, in a language I still don't really speak. This is the story of those four steps.

The reason I'm writing it down is that I think a lot of engineers want to contribute to projects outside their stack and don't, because they imagine the first step is _go learn the new language_. It's not. The first step is much smaller than that. And once you take it, the second step is smaller than you'd guess, too. With AI in the loop, the first step can be building, not learning. You pick up the language on the way.

## Step one: I started where I was already strong

I started with the parts I already knew how to do. One of the first things I shipped was the docker-compose for the project. The kind of boring infrastructure work that every project needs, that everybody puts off, and that I had experience with from other contexts. I was useful in the first week. Not "useful at the thing the project is famous for." Useful at _something the project needed_.

This is the move I want more people to make, so let me say it plainly: you don't have to learn the new language to be useful in a project written in it. There is almost always work at the edges that maps to skills you already have. DevOps. Build configuration. Documentation. Security review. These are skills, not language-specific tricks.

What this gave me, beyond shipped work, was familiarity with the repo layout. By the time I was ready to look at application code, I'd already navigated the monorepo dozens of times. I knew where things lived. I knew the conventions. The DevOps work had been doing onboarding for me without my noticing.

## Step two: I picked the smallest application task I could find

A few weeks in, I felt ready to look at actual application code. Not because I'd "learned TypeScript" (I hadn't, really) but because I'd been around the codebase enough that it didn't feel like a wall anymore. I could read it.

I picked OCR. It was a feature that needed to be added, the scope was bounded, and the algorithm-level work felt familiar. I'd done image processing in Python before, and the shape of the problem doesn't change because the language does. There was no architecture to invent. I just had to write TypeScript that did the thing.

This is where the onboarding skill enters the story. I wanted to actually understand what I was building, not just sign off on what Claude Code produced. Reading idiomatic application code in a language you're not fluent in is a different problem from reading a Dockerfile.

So I built a Claude skill that knew me. Not a generic onboarding doc. A skill that knew I was fluent in Python and senior in AWS. And when I asked it about something in Open Mercato, it didn't explain it from scratch. It explained it by translation. _This is like that thing you already know, except…_ MikroORM is closer to SQLAlchemy 2.x than to Django ORM: Unit of Work + Identity Map, not Active Record. The skill knew which analogy to reach for because it knew what I already knew.

Within a week of building it, OCR was shipping. The same docs that had been a wall became a translation problem, and the translator was already in my editor. I want to flag the lesson here because it's general, not specific to me: **good onboarding is personalized onboarding, and AI makes that cheap.** A skill that knows your stack can translate an unfamiliar codebase into your idioms on demand. Not once in a docs page, but every time you ask. The same codebase can teach a Python engineer and a Go engineer differently.

Generic docs onboard nobody.

OCR shipped. Not a glamorous feature. But it was my first piece of pure TypeScript in the codebase, and it worked, and the review came back with mostly small things. That's a win. Step two done.

A quick aside before step three: nobody appointed me to any of this. You don't need permission. You don't need a title. You don't need an offer letter. Find a project you like, look at what it actually needs, and start.

## Step three: I picked something that needed both worlds

After OCR I went looking for something that bridged DevOps and TypeScript. I picked enterprise single sign-on for Open Mercato, a real customer feature that needed two halves.

The DevOps half (standing up an identity provider, configuring it correctly, getting the certificates right) was my world. Familiar. I worked through it against Entra ID, Google Workspace, and Zitadel, one IdP at a time. And the application half (implementing OIDC in the codebase, then SCIM directory sync, then JIT user provisioning) was the unfamiliar world, but it was now slightly less unfamiliar than it had been a month earlier.

The thing I want to point out is that I picked this task on purpose. I went looking for work where my strengths would carry me through the parts that scared me. Half the task was in territory where I could _lead_. The other half was in territory where I had to _learn_. That ratio is the sweet spot. Enough learning to actually grow, and enough leading that you don't drown.

SSO shipped. It was the first time I'd done real Node application work, and the work was non-trivial. Enterprise identity flows have edges and corner cases and security implications. But it shipped, it was correct, and it was reviewed without anyone wincing. The bridge between the two worlds turned out to be a much better place to learn than either world by itself.

## Step four: I picked the big one

By the time I started on DevCloud, I'd shipped across all three earlier modes (DevOps, OCR, SSO) and had finally sat down to learn the basics of the language, with the codebase as a map of what to read. Node wasn't scary anymore. It wasn't comfortable, and I still wouldn't claim fluency, but it had stopped being the thing I was afraid of.

DevCloud is a PaaS. Basically a Heroku for Open Mercato instances. Click a button, get a fresh environment in a couple of minutes. The use case is AI-driven code generation: people want a clean, isolated OM instance to point an agent at, mess up, throw away, repeat. I built it for a hackathon. It took me a month.

And here's the part that still feels weird to say out loud: **I built a PaaS in Node, and I don't really know Node.**

I built it using Jesse Vincent's Obra Superpowers. It's a workflow, open source, on GitHub. The idea is that before your coding agent writes any code, it pushes back. _What are you actually trying to do? Who is this for? What's the smallest version that's useful?_ It teases out a spec. Then a plan. Only then does it write code, and when it does, it does it test-first.

Jesse claims, in the README, that with this workflow Claude can work autonomously for a couple of hours at a stretch without deviating from the plan. That's not marketing. I've lived it. I've written a spec at the start of an evening, signed off on a plan, hit go, and come back hours later to code that mostly worked. Not slop. Code that passed tests I'd helped specify, sometimes after another round of revision. In a language I don't really speak.

DevCloud came together partly because of Obra Superpowers. And partly because I spent months earlier doing smaller things in this codebase. Not because I learned the language. Because I expanded outward from where I was already strong, in pieces.

## The thing I want you to take from this

The moral I'd like you to leave with is short, and it's the one piece of advice I'd give anyone who's been wanting to contribute to something outside their stack: **start with small things, expand quickly, and learn the basics last.**

All three matter. _Start with small things._ Don't try to ship a feature in week one. Find the edges, the DevOps work, the docs, the things that map cleanly to what you already do. Be useful immediately, in a way that doesn't require you to first become someone else.

Then _expand quickly_. Don't park there. Pick a small task one step further than you're comfortable with, and ship it. Then one further. Then a hybrid. Then the big one. The trap isn't starting too small. That's smart. The trap is staying small. The progression is what gets you to the place where the language isn't the bottleneck anymore.

Then _learn the basics_. After you've built a mental model of the project, not before. By then you know which parts of the language actually matter for the work in front of you, and which are folklore. This won't make you a senior engineer in it. A senior engineer still has leverage you won't (they know the runtime, the ecosystem, the gotchas) and any serious project will still want one. What AI changes is the starting point: you can start contributing before you're that person, and learn on the way.

Six months is what it took me, end to end, from "I had no idea what I was doing" to building a real product in a language I don't speak. Most of those months were not spent learning Node. They were spent contributing, in stages, and letting the contribution itself teach me what I needed to know, in the order I needed to know it.

If you've been waiting to contribute to something outside your stack: the time to start is now, and the first step is much smaller than you think. Open Mercato is a good place to do it. There's still plenty of room to start small and expand quickly, across infrastructure, application code, and product features.

_If you've been doing something similar at the edges of your stack, I'd like to hear about it. The "I built X in a language I don't speak" club is a real club, and I keep learning things from comparing notes._
