---
webflowId: 6a9fe17ed8aafb748025705e
title: 'The Pirate Ship: how to move a 400-person IT department without turning the tanker'
description: 'The board is with you and the wave is right. Now: how do you put AI into a real organisation with 400 people in IT? Carve out 10-20% as a pirate ship, keep legacy as the source of truth, and judge it by what is in production after one quarter.'
date: '2026-09-08T08:00:00.000Z'
updated: '2026-09-10T07:54:28.239Z'
author: tomasz-karwatka
category: ai-engineering
featured: false
thumbnail:
  src: /media/blog/6a9fe20bd24f60e68d70cc68-pirate-ship-hero.png
  alt: ''
  decorative: true
draft: false
---

Assume the hard part is done. The board is with you. AI is a priority, with a sponsor. You picked the right wave. Now the question: how do you put this into a real organisation with 400 people in IT?

I see two patterns. One produces deployments. The other produces meetings.

## Before the ship: three things you need

**A sponsor with an umbrella.** Change becomes a priority when it is named in the strategy and has an owner on the board. One CEO I know lost a big chunk of market years ago when a competitor used new technology to optimise pricing. His instruction to the team today: "We will never be second again." That kind of motivation opens an umbrella over the team. It protects them from committees and bureaucracy.

**The right leader.** The sponsor will not do the work. You need one person who understands the business, understands what AI can do and has the authority to decide without waiting for a committee. I have seen companies with full board support and budget go nowhere because nobody was put in charge. I have seen companies with no budget move fast because one person wanted it badly enough. If you do not have that person, finding them is your first AI project.

**Client zero.** Management that automated its own work has credibility. When I went back to running a company operationally in January, I took one marketing process from 8 hours to 1.5. I shared it with the team. Show it yourself before you require it from others.

## Pattern one: the Pirate Ship

The pirate ship has a long history in IT. It goes back at least to Steve Jobs and the Macintosh team. They wanted to be separate from the people building the Lisa. Separate building, pirate flag on the roof. "We work differently here."

The Pirate Ship is an acceptance of one fact: you will not turn a large IT department quickly. It is a tanker.

So you carve out a small team, 10-20% the size of the main IT. Volunteers from inside and outside. They report directly to the board sponsor.

You do not touch the old IT. It stays the source of truth. Your ERP, your SAP, your data live there. The pirates build new applications on top.

## I watched this pattern work for 15 years

For years I implemented e-commerce systems for the biggest retailers, first in Poland, then in Europe and globally.

Those big retailers did not want an online channel. Sales saw cannibalisation of their expensive stores in shopping malls. Logistics saw a nightmare: single parcels instead of pallets, and returns on top. IT saw another system to maintain, written in PHP, which at the time nobody took seriously.

Smart boards did one thing. They created a small, independent e-commerce unit on the side. Own marketing, own product management, own IT. Reporting straight to the board.

Its job: prove that online sales make sense. Usually the proof arrived when online crossed 5-10% of total revenue. Sometimes the unit was then dissolved. Its people and knowledge spread across the whole company. Nobody asked anymore whether e-commerce made sense.

That is the Pirate Ship logic. Show what works on a small example. Hold it until the proof is delivered. Only then is the innovation adopted by the company rather than destroyed by it.

## How you know it is working

After the first quarter of a Pirate Ship you see something in production. Deployments. Business units coming to you on their own, because they waited months for a change in the ERP and now it takes weeks.

After the first quarter of the traditional approach, "transform all of IT", you get a series of large meetings. An AI policy document, long, with a million comments and no consequences. Nothing in production.

One example. A very large company, 30,000 office employees, IT department of about 400. Inside it, a team of 20 who call themselves the rebels. Enterprise architecture meetings do not love them. A third of them are not professional developers. Working directly under the CEO, they ship in weeks what used to take months. Same company, same data, different structure.

## When the old system cannot be the source of truth

Sometimes the legacy is in such a state that it will collapse soon. It cannot stay the source of truth. Then look at the Strangler Fig pattern.

Martin Fowler described it in 2004, after the tree. The fig grows on the host tree and, years later, replaces it completely.

In practice: put a facade in front of the old system. All traffic goes through the facade, at first straight to the old system. Then, function by function, you redirect traffic to the new system. At some point nothing calls the old one. The facade is the new system.

No big bang. No single risky switch. The pattern is 20 years old and sits in AWS and Azure documentation. The Pirate Ship can build on top of legacy and use Strangler Fig to replace it piece by piece.

## Where do pirates come from

Recruit for agency, not for CVs.

At Open Mercato we run open hackathons. People from outside come and work with us for two and a half days. You see how someone really works.

At the first hackathon we had a designer, Oliwia Zielinska. She decided our interface was inconsistent. Instead of fixing it by hand, she wrote an agent. The agent scanned the whole system and found the inconsistencies, including 372 shades of red. Then she wrote a second agent that applied the audit.

On paper: a UX designer. In practice: someone who writes agents that keep our interface consistent, and enjoys it. Today Oliwia is part of the Open Mercato core team.

That is why a third of a Pirate Ship can be non-developers. It also builds the team's identity: "We do things here we technically have no paper for."

One more recruiting pattern: people with an entrepreneurial past. Maciek Gren and Patryk Lewczuk, both in our core team, ran their own companies before. Former founders act without asking for permission. They see a problem, pick a tool and solve it. Nobody has to define the problem for them.

## The company as a platform

Modern companies are becoming platforms for entrepreneurial people. The company gives clients, infrastructure, money and the umbrella. Those people bring agency. With that leverage they do far more than they could alone.

Think of your Pirate Ship this way. People do not come there to sit. They come to build something. That is who you are looking for.

## Monday morning

Three questions for your sponsor:

1. Who is the one person leading this? A name. A committee does not count.
2. Which 10-20% of IT, plus outsiders, form the ship?
3. What will be in production after one quarter?

If question one has no answer, that is your first project

_We recruit pirates at our_ [_open hackathons._](https://hackon.openmercato.com/) _The next one is in Wroclaw, 18-20 September 2026. Two and a half days, real problems, real agents_
