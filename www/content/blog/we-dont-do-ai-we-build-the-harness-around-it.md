---
webflowId: 6a22ec16e5389f9f77a842ed
title: We Don't Do AI. We Build the Harness Around It.
description: You don't have to build AI to win the AI wave - you have to build the harness around it. The business case for AI engineering, told through Open Mercato.
date: '2026-06-05T00:00:00.000Z'
updated: '2026-06-10T18:05:56.541Z'
author: tomasz-karwatka
category: ai-engineering
featured: false
thumbnail:
  src: /media/blog/6a22fb5ae803a5cb36b22dbb-zrzut-ekranu-2026-06-5-o-18.37.26.png
  alt: ''
  decorative: true
draft: false
---

_The business case for AI engineering, told through the company we built by accident._

There is a strange gap in the AI conversation right now. On one side, the timeline is full of founders claiming their agency runs a hundred enterprise clients with zero employees, or that “AI builds the company by itself.” On the other side, real engineering teams are shipping software maybe three to four times faster than a year ago - a genuine, enormous shift, but not the science fiction being sold.

Most of the value in this moment lives in that gap. Not in the hype, and not in denial of the hype, but in the unglamorous work of turning a raw technology into something a serious business can actually run on. This is the story of how we walked into that gap without planning to, what we learned about where AI money is really made, and a thesis we now believe applies to almost every industry: **you don’t have to build AI to win the AI wave. You have to build the harness around it.**

## 1. What actually makes money in a technology shift

Start with a definition, because “AI” has come to mean everything and therefore nothing. A real tornado - the kind that creates fortunes - is a technology shift that makes possible things that were not possible before.

The pattern repeats every time. First, the nerds show up. They use the new thing because it is interesting, not because it pays. Then comes a wide, brutal gap. For the technology to reach the early majority, where money is actually made, the nerds have to prove the thing has a business reason to exist. Most technologies die in that gap. Virtual reality dies there on schedule, every few years. A new headset ships, everyone straps it on for three months, discovers it solves no real problem, and nobody puts it into production. No tornado.

AI is one of the technologies that crossed the gap. It has reached the old electricity moment: for a while now, anything you plug into electricity is better, and today anything you plug into AI is better. That is the test it passed.

But here is the part most people get wrong, and it is the most useful idea in this whole essay. When electricity first arrived, factories were powered by one enormous steam engine out front, driving belts and shafts that carried that single source of power up through the floors to every machine. When the electric motor showed up, the first instinct was simply: _this is a better steam engine._ So they ripped out the steam engine and dropped in one giant electric motor, driving the exact same belts. It took roughly thirty years before someone realized the real move: forget the belts entirely, give every single machine its own small motor. Different factory. Different economics. Different everything.

We adopt every technology the same way at first. We just swap the old engine for the new one. We did a task by hand, now we do the same task with AI. The actual question - the one worth your strategic attention - is: how many things can you now do _differently_, or do at all, because AI exists? Every industry will have to learn that for itself. And in every industry, that learning is a tornado of its own.

## 2. The harness thesis

Now the part that surprises people when we say it out loud: **we don’t really do AI.** We don’t touch it. We have Claude, we have Codex, the models exist and they are excellent. We build the harness around them. We invent the framework that tells those agents how to write code without blowing up the company that depends on it.

We are not an AI company. We are the people who steer your AI so it doesn’t launch your business into space.

It sounds modest. It is in fact the whole game, and here is how we found it.

A year and a half ago my brother Piotr - my co-founder - started playing with AI coding as pure R\&D. The early days were rough. You’d ask for a change, it would say “sure, just turn the red to green,” and the entire thing would fall over and stop working. Fun, but not serious. Nobody sane writes the kind of software we set out to test. So we asked ourselves the obvious provocation: what would _prove_ you can build a large system with AI? What is the biggest, hardest system we can imagine?

An ERP. Nobody writes ERPs by hand anymore - you buy SAP and move on. And telling detail: the last genuinely successful open ERP, Odoo, is twenty-five years old. In a quarter of a century, nothing large and new has taken its place, because these systems are simply too big. So Piotr’s question became precise: with AI, maybe you don’t need fifty developers to build one. Maybe fifteen. Maybe fewer.

The models kept improving. Piotr kept building guardrails around the code - not random rules, but hard-won engineering decisions. You structure the repository differently. It has to be one large mono-repo so the AI doesn’t lose itself, but it has to be laid out carefully so the agent’s context window doesn’t choke on what’s where. A hundred small nuances about how to make the AI _not_ break things. Then, last autumn, a class of models arrived that could genuinely handle it.

The project started pulling in strangers from the internet - programmers who had been quietly asking themselves the same question Piotr was: can you really build a serious, long-lived system with AI? It turns out you can. Today **Open Mercato has more than a hundred core contributors, and not a single line of its code is written by a human.** If a person hand-writes code in there, that’s the bug. It isn’t supposed to be written by hand.

## 3. From an R\&D toy to a real market

We never went looking for customers. They came to us.

Big companies - CTOs, CEOs at banks, insurers, large e-commerce operators - were all hearing the same drumbeat: you have to code with AI. But how, exactly, do you “vibe code” when you are a bank? What happens when the AI quietly pulls in some random library and blows your platform apart? Who cares that you shipped three times faster if there’s nothing left to ship next week?

So they asked us a sharper question: how do you run a project with a hundred contributors and AI, and _not_ have it detonate? The answer was baked into the architecture. The AI can only build from our own repository. It can’t reach out and grab arbitrary dependencies. It builds with curated Lego bricks, not freestyle. The moment we said that out loud, the enterprise reaction was the same every time: _okay, that actually makes sense._

That was the signal. There was a real, urgent need inside large companies to build their own business apps with AI coding - but inside an environment that hands the AI safe building blocks instead of a blank canvas.

So we changed exactly one thing: the narrative. We stopped saying “this is an ERP” and started saying “this is an **AI-native framework for building software**.” Because it turned out most of these clients are not insane - they have zero interest in rewriting an ERP that already works. Why rewrite something that runs? What they have instead is a backlog of a hundred other ideas they’ve never had the team or the time to build. That backlog is the market.

Notice what happened. A pure R\&D experiment taught us who our customers were, because they walked in and explained their own problem to us. We didn’t pitch. We listened, and we renamed the thing to match what they already wanted.

## 4. The magnetic core: how a foundation framework spins off its own tornadoes

Here is the model we now think is genuinely repeatable, and the most exciting part of the story.

Picture Open Mercato as a kind of dense, magnetic planet. It holds the 80% core that almost every operations-heavy business needs - ERP, logistics, e-commerce, the unglamorous, hard, reusable foundation - maintained and hardened by a focused team and a hundred contributors. Companies that need that backbone attach to it for the security, scalability and speed, then build their missing 20% on top.

Take a real one: a freight and ocean-logistics company. Their core business is moving containers - knowing which box goes where, and never, ever getting it wrong. They attach to the core, build the software they were missing faster and more cleanly than they ever could alone, and end up with a product that genuinely fits their operation.

Then the magic happens. Because they built something excellent on a solid foundation, they become a top provider in their niche. And other freight companies - smaller magnetic specks - now want to attach to _them_. They want that company to help build and deploy the same kind of system. Suddenly the freight operator is staring at a business they never imagined: a software arm with a better margin than their core trade. They either spin up a services line as a new revenue stream, or - in the sharpest version - they pivot, and start building software for the rest of their industry on top of Open Mercato, because it’s the better business.

That is real disruption, and it is not hypothetical. We have two cases exactly like it. One company built its solution and is now starting to work for very large logistics players. The other is a supplement factory that built Open Mercato into a traceability system - where did the powder in this batch actually come from, and is it really vitamin C and not something else - found it so valuable that they’re now going to package and sell that software. Their core business is great. But a new branch, a new limb, a new opportunity just grew out of it.

This is the operator’s edge in the AI wave, and it belongs to people like you. You take the AI know-how - how it actually works - carry it into a specific, often boring industry you already understand, and tell those companies: you can tear out the belts now, because we can put a small motor on every machine. There will be a tornado like this in nearly every industry. If you’re in one, you can almost certainly find yours.

## 5. Making money without a leash: open source and the third path

Open Mercato is open source, MIT licensed - the most permissive license there is - with over a hundred contributors who have each shipped a change into the core. We love open source. We think of it as a little bit of the old, good internet. We may not yet be the loudest marketers in the world, but we can build a genuinely strong product, and a strong product defends itself. People come from all over the world simply because they like it.

There’s a durability point buried in here that customers underrate. When you build on software from a VC-funded company, you’re usually building on eighteen months of runway. If they don’t raise the next round, they close - and your software closes with them. People cheer when a vendor raises $300M. That cheer means: you’ve got about eighteen months. Raise again or shut down. With MIT and a hundred contributors who actually know each other, nobody can switch the lights off. No lock-in. That’s not a soft benefit; it’s a risk calculation enterprises are starting to make.

So how does the money work? Historically, open source paid in one of two ways. You sold services - the way Callstack, the team behind React Native, sold consulting to companies adopting it. Or you sold an enterprise license - new features that big companies want enough to pay for.

AI opens a third path, and we’re testing it now. Call it **homologation**. The pitch to a large enterprise is honest: you’re going to generate this code automatically, and nobody is going to read every line of it. As a big company, that should make you nervous. So we’ll be the ones who read it. Like a car that has to be certified roadworthy before it’s allowed out - someone has to guarantee the wheels won’t come off - we certify that what comes out of your AI pipeline is fit for production. Safety, performance, GDPR, all the corporate non-negotiables. You pay us for that guarantee. Enterprises hear it and say, “honestly, that’s quite good.” So do the agencies that implement on top of the framework, because otherwise they’re the ones who signed the contract that makes every defect their problem.

Will it work? We don’t know yet. The first battle in open source - do people want to build with this? - we’re winning. The second battle - does it make money? - we’re still cleaning our rifles for. But the deeper point stands: because AI shifts the paradigm of how software gets made, it also opens room to innovate on the _business model_, not just the product.

## 6. The new shape of a team

The shift in how software is built is matched by a shift in who builds it. Two- and three-person teams, working with AI, are astonishingly effective. A pair can carry an entire large project to production.

The clearest moment came at a hackathon. A woman named Oliwia, a designer - not a programmer - started clicking through Open Mercato and said, bluntly, “this is hideous, and the fact that you all can’t see that is the problem.” Now, if you’d built a system with five hundred thousand lines of code and it was genuinely ugly, that used to be a catastrophe. Today? She wrote an agent that crawled the entire codebase and reported back: you have 370 different shades of red being used as “red,” because every developer just picked whatever red they liked, and half of you are colorblind anyway. Then she wrote a second agent to unify all of it.

Sit with what that means for how you build a product. You can now build the thing while explicitly not caring about design. Build, build, build - does it work? Do people want it? Yes? Good. _Now_ make it beautiful, by turning thirty agents loose on it in parallel for two weeks, instead of by hand. That is a real change in the order of operations, and it’s only possible because the teams are tiny and the agents do the grinding.

We’re not the only ones who found this. ElevenLabs runs on a similar shape: someone has an idea, they get to pick at most two teammates, and they have six months to reach one million euro. Hit it and it’s wonderful. Miss it and the team closes. Five hundred people, organized into three-person teams. We tried to do a version of this years ago at Divante, splitting the company into forty-person “startups” like Spotify’s tribes, because back then software was simply hard to make. Three-person teams are a different animal: no communication overhead, no management drag. You sit down and you build. And everyone is forced into every role the work requires, which is how people actually grow.

## 7. Who captures the value - and the honest part about the hype

There’s a quote making the rounds that’s worth taking seriously: _if your product only helps someone work faster, you’re still in the land of software budgets; if your product actually does the work, you start competing for labor dollars._ The logic behind it: the budget for software might be 5, the budget for labor is 500. If you want to build something genuinely enormous, you have to reach into that labor budget, not the software one.

The ambition is real and the math is seductive. But this is exactly where you have to be careful, because the gap between what people _say_ is possible and what is _actually_ possible right now is enormous - and in Europe, where nobody lies quite this shamelessly, it’s easy to feel inadequate looking at it. The “I run a 100-million-dollar agency with no employees, it all runs itself” claims are, overwhelmingly, theater. Nobody checks them. They go viral precisely because they fit the narrative everyone wants to believe.

We know, because we live on both sides of it. We automated an enormous amount of our own marketing work - genuinely, from roughly eight hours down to about ninety minutes for the same output, using tools like Claude and Perplexity. That’s a real, dramatic gain. But the second you write the version that says “I fired twenty marketers and now it all runs itself,” it goes viral, founders message you to amplify it, because it feeds the machine. The honest version - “I compressed a workflow and it’s great” - doesn’t trend. Meanwhile a lot of the corporate “we’re cutting 20% thanks to AI” announcements turn out to be PR for the stock market, with the work quietly moved to cheaper outsourcing.

So hold both truths at once. The room for sensible automation is vast, and you should be aggressive about it. Software really is three to four times faster to build today. But it is not a hundred times faster, and it does not build itself. Maybe one day. Not today. Don’t let the bullshit either seduce you or depress you.

And there’s a quieter, more hopeful thread underneath all of this. My wife spent seven years as a head chef, then moved into marketing with no technical background at all. One day she mentioned she’d “optimized the rollup on some campaigns” by connecting a couple of systems together. I, with my computer-science degree and my assembly-language education, started interrogating her - you connected the APIs? you wrote the scripts? how? - because in my mind that’s two weeks of reading docs and deploying to a server, the kind of task I’d avoid from a mile away. She just looked at me and said: I told Claude what I wanted, it gave me something, I pasted it where it said to, and it worked.

That was the brutal lesson. _She_ out-built _me_, precisely because she didn’t know it was supposed to be hard. My expertise was the handicap. This is extraordinary news for the next generation - the twenty-somethings who will be to AI what my generation was to the internet. The real challenge won’t be the tools. It’ll be whether companies can rewire their procedures - their security gates, their approval chains - to let that kind of person actually work. Drop her into a typical enterprise process and she never gets to do the thing that made her valuable.

## The takeaway

You don’t need to invent a model to win this. You need to be the layer of judgment between a powerful, careless tool and a business that can’t afford carelessness.

Find an industry you understand. Bring the AI know-how into it. Build the harness - the curated blocks, the guardrails, the certification - that lets ordinary teams build extraordinary things without blowing themselves up. Keep the team small. Own the code. Stay honest about what’s real.

We started by trying to prove you could build the world’s most boring, impossible system with AI. We ended up with a thesis about how value gets created in every industry the technology touches. The tornado isn’t AI itself anymore. The tornado is what each industry does with it - and the harness is how you ride it.

[**_Open Mercato_** _is an open-source, AI-native foundation framework_](https://github.com/open-mercato/open-mercato) _for CRM/ERP. MIT licensed, 1,200+ GitHub stars, 100+ core contributors. Build on a stable 80% core and let AI safely build the rest._
