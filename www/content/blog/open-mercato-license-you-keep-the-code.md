---
webflowId: 6a99b1feb41b11746830bb47
title: 'The Open Mercato license: you keep the code, we have to earn the renewal'
description: Self-hosted, per project, unlimited seats. Stop paying and the last version stays yours. How the Open Mercato Enterprise license works and why it does not hold you hostage.
date: '2026-09-03T00:00:00.000Z'
updated: '2026-09-23T10:00:41.938Z'
author: tomasz-karwatka
category: ai-engineering-foundation-framework
featured: false
thumbnail:
  src: /media/blog/6a99b22fedef6b0a2f2f307a-zrzut-ekranu-2026-09-3-o-19.45.09.png
  alt: ''
  decorative: true
draft: false
---

Last week I sat on a call with a CEO who asked me one question: "Why would I pay you a license for five years, when I could hire people and build it myself?"

Good question. It comes up in almost every enterprise conversation. So here is the full answer, the same one I gave him.

## The problem with SaaS is the exit, not the entry

Everybody is tired of the big SaaS vendors. You buy a few seats, then the upsells start. Two years later your company uses 5% of the features and pays for 100%. And you cannot leave, because the moment you stop paying, they cut the login. Your data sits on their cloud. Your workflows sit on their cloud. That's it.

You pay for usage, but in practice you pay a ransom, because they hold your data.

And it gets worse at enterprise scale. One of our customers got a letter from their ERP vendor. New version. Two years to migrate. The old one gets switched off. He has to pay for a full implementation again, because the new version is a different product.

The barrier to exit is always bigger than the barrier to entry. Every CTO knows this. Most vendors build their business model on it.

## How Open Mercato is different: it runs on your servers

Open Mercato is a framework, not a hosted product. Your team builds on it, and the result runs on infrastructure you choose. Under a desk in your office, at a hosting provider, in any public cloud. Your call.

This changes the whole power balance

- **Your data is physically yours.** We cannot cut you off. Even if we wanted to, we do not have the access.
- **Your code is physically yours.** Everything your team builds on the framework lives in your repository.
- **The internet can go down and we can disappear** from the face of the earth. What you deployed keeps running.

We cannot hold you hostage. That is the design, not a side effect.

## What the Enterprise license actually gives you

The core of Open Mercato is open source. Today 27 partner agencies and 130+ contributors work on it. You can take it and build with it for free. Zero strings.

The Enterprise Subscription adds two things on top.

**First, four proprietary modules** that most companies need before their security team signs off on production:

- **MFA & Security Enforcement** - mandatory multi-factor authentication, with protected re-authentication for sensitive actions.
- **SSO & Directory Sync** - single sign-on via your corporate identity provider, with automated user provisioning from your directory.
- **Record Locking** - protection against concurrent edit conflicts, with presence indicators for shared records.
- **Agent Orchestrator** - governed execution of AI agents inside your workflows. Agents run as workflow steps, low-confidence cases route to a human, and every agent action is audited like a user action.

**Second, services** that scale with your tier: security patches and upgrade packages, architecture audit before deployment, monthly security and performance reviews, production approval (homologation), priority support, and a Customer Success Manager until go-live.

## The pricing model: per project, unlimited seats

Three rules:

1. **Per project, never per seat.** One license covers one Open Mercato project. Add 50 users or 5,000. Add servers. The bill does not move.
2. **Tier follows your annual revenue.** Basic below €25M, Medium up to €250M, Enterprise above. A small company pays a small license. A large one pays for a large scope of service.
3. **Every engagement starts with a Starter Pack** at €1,200 a month. You get a sandbox for your team and coding agents, plus an onboarding session. It runs until your Proof of Concept starts.

Annual billing gives you a 10% discount. Startups under €5M in revenue can ask for a startup discount.

## What happens when you stop paying

This is the part I want to be very precise about, because this is where other vendors hide the trap.

**You keep the last version. All of it.** Including the four enterprise modules. Your production system keeps working. We write it into the license explicitly: after the license expires, you may continue using the software in its last deployed version.

What you lose is the stream: no new updates, no security patches, no new features, no support. That is the whole penalty.

One asterisk, to be fair. Cancellation takes a three-month notice. So when you decide to leave, the license ends three months later. No surprises.

Why does this matter? Because I have seen the alternative. A large Polish retailer, a billion-dollar business, ran the enterprise edition of a well-known e-commerce platform. They decided it was a waste of money and wanted to stop paying. The vendor told them: you bought it, you use it, we do not care. The company seriously considered ripping out every line of enterprise code from their platform. Weeks of work, just to leave.

That cannot happen with Open Mercato. The last version is yours. Full stop.

## "So I buy it for six months and cancel"

The CEO said exactly that. "I take it for half a year, I get the backbone, I cancel and develop it myself."

Yes. You can do that.

And that is my problem, not yours. I have to prove every month that the license is worth renewing. If I cannot, you leave. That is a risk we took on purpose, and it is the opposite of how SaaS works today.

We compete with our own open source. You already have a free version of the core. So the Enterprise license only survives if we keep shipping value ahead of the market: new modules, security updates, the AI SDLC practices we teach your team, upgrade paths for breaking changes.

He put it well, from experience: the operational barrier is bigger than the contractual one. Once you have €100k of your own code on the framework, maintaining security, upgrades and compatibility on your own is more than one FTE. That is real. But it is your choice, made on your terms, with your code in your repo. Nobody flips a switch on you.

## What to do with this

If you are evaluating Open Mercato for an enterprise project:

1. [Read the license.](https://github.com/open-mercato/open-mercato/blob/main/packages/enterprise/TERMS.md) It is four pages, written straight. It lives in the public repo.
2. [Play with the open-source version with your own team](https://openmercatocloud.com/demo). No license needed.
3. When you want to work with us, start with the Starter Pack and run a short hackathon on a real problem. In a few days you see whether the value is there.

And if you are already using Open Mercato and want us to review your project, architecture or security setup, our consulting is available. Write to info@openmercato.com

What is the exit cost of the enterprise software you run today? If you have never calculated it, that number is probably the most important one in your IT budget.
