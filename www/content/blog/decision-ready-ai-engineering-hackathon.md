---
webflowId: 6aada7256d2ae44f333e3958
title: 'Decision-Ready Beats Production-Ready: How to Get Business Value Out of an AI Engineering Hackathon'
description: 95% of hackathon projects are dead within five months. The weekend is not where you lose them. Friday is. A four-question filter for decision-ready AI projects, plus where Sandboxes come in.
date: '2026-09-18T00:00:00.000Z'
updated: '2026-11-23T22:53:31.443Z'
author: tomasz-karwatka
category: ai-engineering
featured: false
thumbnail:
  src: /media/blog/6aada8ac239b7798ba1476a5-decision-ready-hackathon-hero.png
  alt: ''
  decorative: true
draft: false
---

When I saw how many business people signed up for the Open Mercato hackathon, I got nervous. The developers would be fine. I worried about the CEOs and heads of operations. They took a weekend off to sit with engineers. Would this be a waste of their time?

So I did what I always do before a talk. I checked the research.

There is a 2020 study by Alexander Nolte and colleagues (ACM CSCW 2020). They tracked 592 projects from 73 hackathons on Devpost. About 35% of projects saw a single commit after the event. After five months, roughly 5% were still alive.

Five percent. Everything else went to the bin.

The number is the least interesting part of that paper. Look at where survival gets decided. Continuation had almost nothing to do with how hard teams worked over the weekend. Intensive short-term activity was actually a negative signal. What mattered was what teams brought in on day one. The right skills for the problem. A real intention to put the thing in front of users.

In other words, a hackathon is won or lost on Friday. This post is my Friday talk, written down. It applies to a hackathon. It applies just as well to a two-week AI sprint with a client. Or to any Proof of Concept you are about to sell.

## The hackathons I used to run answered the wrong question

At Divante, and later around Vue Storefront, we ran plenty of hackathons. The default format was simple. Pick a technology, see if we can make it do something. Code all weekend. On Sunday, watch it work. Clap. Go home.

That is fine as education. It answers one question: can this be built?

It never answers the question a business owner cares about: should this be built? Does it move revenue? Does it cut a cost anyone can point at? Who in the company would even own it?

Two years ago, that gap was acceptable. Building anything took so long that "can we" was a real constraint. With AI engineering tools it mostly is not. A small team with Claude Code and Open Mercato can build an end-to-end flow in a weekend. Which means "can we" stopped being the interesting question. "Should we" is.

## Stop aiming for production-ready. Aim for decision-ready.

Here is the first trap. A team sits down on Friday and thinks: we will ship a finished app this weekend. Whole company on it by Monday.

That almost never happens. And chasing it makes you lose the thing that is actually within reach.

What is within reach: something a business owner can look at on Monday and make a decision about. Not production-ready. **Decision-ready.**

Decision-ready means I can walk into an office on Monday and show it. "This is what it does. This is what it saves. Do we keep going?" The person on the other side can say yes or no with real information in front of them. That is the entire deliverable of a good weekend.

Once you frame it this way, the weekend changes. You stop polishing screens. You start collecting the four things a decision needs.

## The four-question filter

Before you commit to an idea, run it through four questions. I gave this list to the teams on Friday. Use it with your own team, or with a client before a POC.

![](/media/blog/6aada8cc5649963a5851d3cc-decision-ready-hackathon-fig1-filter.png)

**1. Is it a complete process, end to end?**

Something goes in. Something finished comes out. A piece of a process does not count. Neither does a library, or "an agent for the e-commerce department". A library is nice, but nobody's revenue grows because of a library. Business people cannot evaluate a fragment. They can evaluate a flow that starts with a customer email and ends with a confirmed order.

**2. Can you put a dollar figure on it, even a rough one?**

What cost goes down, or what revenue goes up? You will not have exact numbers on a hackathon. That is fine. What you need is the order of magnitude. I have seen projects that "save time" and cost more than the work they replaced. Add up tokens, servers and the engineers' hours before you celebrate. If five people spend their days on a dumb, repetitive task, you can estimate what that costs per month. Then you check that your tokens and your team are cheaper. Usually they are, by a wide margin. But check.

**3. Do you have an owner on the business side, with a name?**

The classic hackathon answer is "the purchasing department" or "the e-commerce team". A department is not an owner. You need one person who wants this, would use it on Tuesday, and would fight for the budget. You may not be able to reach them over the weekend. Have them in your head anyway. On this hackathon we had enough business people in the room to play that role. Use them.

**4. Do you have access to the data, tomorrow?**

"We will integrate later" does not count. Real data, or a realistic sample, by Saturday morning. This is where most projects actually die. The prototype works on invented data. On Monday someone asks to connect the real system. It turns out that takes months. The project is over. If you cannot get the data, you are building a technical feasibility study. Say so, and pick a smaller problem where you can.

**How to score it.** Four yeses: build it, no discussion. Three yeses: look hard at the missing one and ask whether a weekend can fix it. Fewer: you can still build it, but call it what it is, a technical experiment. If you want a business outcome, there is still time on Friday to pick a different idea.

## One machine-to-machine flow, with a human at the end

Question one deserves an example, because "end to end" is where most teams go abstract.

Bad version: "we are building an AI agent for the sales department". Nobody knows what that means, including the sales department.

Good version: some of our customers ignore our e-commerce and keep sending orders by email or PDF. So we build a thing that reads those emails. It matches the lines against our product catalog and prepares an order. A human looks at it, clicks Accept, and it lands in the e-commerce system.

That is one flow. Machine to machine, from inbox to order. Small. Boring. Complete.

Notice the human at the end. I would stay far away from building anything fully autonomous right now. The reason is sales, plain and simple. Try pitching a CEO: "the PDFs come in and everything just happens by itself". The first question will be "are you sure it works?" and your honest answer will be "mostly". That is a very hard sell.

The version where a person saves four hours a day and clicks Accept fifty times sells itself. Same technology, different framing, completely different conversation.

## The more boring, the better

Here is a counterintuitive rule from watching Open Mercato projects for the last year. The best ones are the ones that sound dull when you describe them.

Piles of back-office paper that someone has to move from one pile to another. Contracts to check against an SLA. Invoices to classify. Large volumes of something that looks roughly the same every time and requires work nobody wants to do.

That is the perfect target today. Repetitive, high volume, easy to measure. You inject a bit of AI into the flow and a lot of work disappears. The volume is high and the shape is known, so you can judge the output within days.

A boring project does not lose a hackathon. In my experience it usually wins the next budget conversation.

## Do not replace the ERP. Strangle it.

Some ideas I hear at hackathons and in sales calls sound like this. "We have an old ERP, it costs us a fortune, let's replace it with Open Mercato."

We use this idea to filter clients. If someone has a boxed ERP that has been running for 20 years, one plan always fails. "I will show up with a piece of open source, rip everything out and put the new thing in." The old ERP wins on tenure alone. Everyone knows where its bodies are buried. Nobody knows that about your new system.

If you want to modernize an ERP, you commit on day one to doing it in pieces. Martin Fowler described the pattern in 2004 and called it the Strangler Fig. Put a facade in front of the old system. Route everything through the facade to the old system, unchanged. Then pick one function at a time and route it to the new path. No big-bang cutover, no weekend where the whole company holds its breath.

A hackathon is a great place to test one tiny piece of that. One function goes around the old system. The old system stays the source of truth for everything else. It also changes the conversation with the client. You are not selling "we will throw out your ERP". You are selling "we will take one painful process off its back, and you keep everything else".

## Run it as a shadow experiment

The last pattern works best with our partners and our clients. It is also the simplest.

Say you want to use AI to describe incoming documents, or classify invoices, or draft replies. The natural next step is a long philosophical debate. Will the AI describe them correctly? What about edge cases? What about hallucinations?

Skip the debate. Take a slice of real work and run it through your agents in bypass. Nothing goes to production. The old process keeps running as before, in parallel. Your agents' output goes into a separate pile. After a week or two, you put the two piles side by side and compare.

Now you have data instead of opinions. This is why we built the [Agent Orchestrator](/agent-orchestrator) into Open Mercato. You watch the agents work and see what they produced. Nothing reaches production until you are convinced.

It also changes the framing with the people whose work is being touched. "We are replacing you with AI" is a conversation that goes nowhere. "We are running an experiment next to your process, and you judge the output" is one people join.

## Monday morning

Take whatever you are about to build this weekend or in your next client POC. Write four lines on a whiteboard:

1. Start and end of the process, in one sentence.
2. Cost or revenue, order of magnitude, in dollars per month.
3. Owner's name.
4. Where the data comes from, and by when.

If any line is blank on Friday evening, that is your Friday work. The code can wait.

## Where Sandboxes come in

Everything above assumes something that used to be hard. Business people and engineers working on the same thing, in the same environment, at the same time. We wanted that to be easy in Open Mercato. That is why we built [**Sandboxes**](https://openmercatocloud.com/demo).

![](/media/blog/6aada92084522610234dc069-zrzut-ekranu-2026-09-18-o-23.11.40.png)

A Sandbox is a ready environment with Open Mercato and the full AI engineering toolset already inside. Think of it as a VPS that is ready in seconds instead of an afternoon. Postgres, Redis, Claude Code and Codex are preconfigured. You pick a template. Open Mercato with CRM only, a complete instance with all modules, or a plain React or Next.js app. Partner modules like WMS and e-commerce are on the way.

Then you describe what you want, the way a business owner would. On stage I used my own example. A CRM that tracks every promise we made to a client over email. I want to see those promises next to the client's name. A CEO who cannot code can prototype that in an afternoon.

The difference from a Lovable-style tool is what happens next. What you built runs on Open Mercato architecture, with the modules and conventions your team already knows. Your team can take it over, open the built-in editor, read the diff, and keep building. You can share a preview link, public or behind a password. Show it on a sales call or to the board. You can export the whole thing to GitHub.

Dominik, who built Sandboxes, onboarded the entire hackathon through one. The registration app, the QR codes, the invitations. He built it in a Sandbox a few days before the event. We decided late to launch Sandboxes here instead of at a later course.

Every hackathon participant got a Sandbox with the first month free and $25 of credit. You can also plug in your own Anthropic or OpenAI subscription and let the agents run all night. CLI and SSH access are next on the roadmap. Your agent on a laptop will spin up new sandboxes by itself.

Not at the hackathon and want to try this with your team? Write to info@openmercato.com. Bring one boring process, one owner with a name, and a sample of real data. The four questions do the rest.
