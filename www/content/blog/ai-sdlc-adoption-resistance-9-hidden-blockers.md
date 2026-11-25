---
webflowId: 6aab01d2e55a20ee97d746eb
title: "Nobody Is Against AI. That's Why It's Stuck: 9 Hidden Resistances in Enterprise AI SDLC Adoption"
description: Your developers already use AI every day. Your company got 8%. Nine anonymised resistances that stall AI SDLC and AI engineering adoption in large organisations, and the playbook that actually moved things.
date: '2026-09-16T00:00:00.000Z'
author: tomasz-karwatka
category: ai-engineering
featured: false
thumbnail:
  src: /media/blog/6aab02d6422d148d8d8b12cb-ai-sdlc-resistance-hero.png
  alt: ''
  decorative: true
draft: false
---

During a recent webinar on AI adoption in software teams, one attendee kept posting the same question. "How do I overcome my resistance?" Then: "Why would I do this, they will fire us all anyway." Ninety minutes later, his last message: "I still don't know how to overcome my resistance."

Nobody answered him. His question had no technical answer.

That guy is your company. Every big organisation I talk to has the same profile. Everyone agrees AI matters. Everyone has tried Claude Code, Codex or Cursor. Nobody is against it. And yet nothing moves.

This post is about why. Nine resistances, all of them anonymised, all of them real. Then a playbook that actually worked in a few large companies this year.

## The 8% problem

Let's start with the number that should keep every CTO awake.

Surveys from 2025 and 2026 put individual AI usage among developers at 90% and more. The DX study of 400+ companies shows 93% adoption. The same study shows the median throughput gain per team: 7.76% more pull requests.

Ninety-three percent of people use the tool. The company gets 8%.

This is not a new story. In 1990 the economist Paul David wrote "The Dynamo and the Computer". His point: factories replaced the steam engine with one giant electric motor and saw almost no gain. The belts and shafts that carried power across the hall stayed. They still broke. They still limited the layout.

It took about 40 years before factories put a small motor on every machine. Only then did productivity jump. The technology was ready decades earlier. The organisation was not.

Every PC on every desk in the 1990s looked the same. Computers everywhere, productivity nowhere. Until companies rebuilt their processes around them.

![](/media/blog/6aab030bbed381948e3320a5-ai-sdlc-resistance-fig1-belts.png)

AI in your SDLC today is the giant motor. Your process is the belts. You are pushing enormous power into developers. The belts to analysts, designers, QA and business owners have not changed. So the power goes nowhere.

Now the nine belts that break.

## Resistance 1: The CEO's FOMO lands one floor down

The most common opening line in my conversations with companies goes like this. "Our CEO came back from a conference. Now he keeps asking IT if we are missing something."

Sometimes it comes from investors. "Why does your software still cost this much? Everyone else is doing it with AI."

This is positive FOMO. It is a good driver. The problem starts one floor below. The board asks a fair question and has no idea what sits underneath it. The people who actually ship see the mess underneath and cannot explain it upward.

Pressure grows between two groups that both ask the right questions and speak different languages.

**What works:** convert the FOMO into a budget line. A board that says "spend more on tokens, don't optimise yet" beats any policy document.

## Resistance 2: "Come with a solution" - and the solution is two years of tech debt

"Don't bring me a problem, bring me a solution." Every manager says it. Now listen to what the honest solution sounds like.

"We have two years of tech debt. Our architecture is spaghetti. If we speed up one system we touch 60 others. We have no feature flags, so no fast rollbacks. We have no automated tests, so no fast verification."

None of these problems came with AI. They were there before. AI just poured gasoline on the fire. Now you must deliver faster and more, with the same missing foundations.

The person at the end of the chain sees this clearly. They rarely say it well. And the message lands on stony ground, because it sounds like an excuse.

Same story with ROI. Ask around any large Polish company and you will find one flagship project burned for years. Poor business case, no cost discipline, all before anyone said "GPT". The ROI problem predates AI. AI just forces you to finally fix it.

**What works:** three parties, three concessions. Investors accept a higher token burn per team early on. The board accepts that more software does not equal a better result. Engineers bring a sequence instead of a complaint: tests first, then flags, then speed.

## Resistance 3: The quarterly planning ritual

Large companies plan two quarters ahead. Often it is a formal requirement. The business case, the headcount, the milestones, all locked in.

Now development becomes ultra-fast. What happens to a plan built for the old speed? It becomes fiction. Teams cannot plan in the old process because they have not digested the new one.

A head of AI at a large financial company put it plainly. Teams first need to understand what the new SDLC looks like. Only then can they plan it. Planning first, learning second, is the wrong order.

**What works:** one team runs the new cycle for a quarter without the planning ritual. Their actual velocity becomes the input for everyone else's next plan.

## Resistance 4: Nobody owns it full time

Here is the first real blocker, and it comes before all the technical ones. There is no single person dedicated to AI adoption. Full time. Not 20%, not "in addition to".

My co-founder and I joke that we became a lead generator for HR agencies. Our conversations with companies end the same way. "The project won't move because we don't have that one person."

What does that person need? Three mandates along the whole value chain:

- **Business initiatives.** They sit with business owners and redesign a piece of the business. With a team that can draw the new process, not just talk about it.
- **Development.** They influence, or run, the teams that build.
- **Platform.** Tools, budgets, tokens, model choice, guardrails.

You can split this across three people. Then every decision costs a meeting. A fragile initiative inside a big organisation dies from meetings. One head, one mandate, decisions in one place.

A head of AI at a large regulated company described the pattern. The first six months feel like fighting windmills. The organisation understands intellectually that the technology works. It still does not accept it. That is a people problem, and it needs a person.

The biggest risk is not a wrong decision. It is inactivity. Boards mostly get this. What kills organisations is rarely the mistakes of big initiatives. It is the absence of any initiative.

## Resistance 5: The transmission belt between business and developers

Here is the frustration I hear most often from developers. "Again it's about us. Again we have to be faster."

The developers are the last link in the chain. Above them sit analysts, designers, product owners, QA and business owners. The idea starts at the top. If there is no drive at the top, nothing at the bottom unblocks.

A CTO of an AI-native company described a strange double life. Inside his own project, everyone lives in Claude Code or Codex. It feels normal. Then he talks to peers in other companies. Same stories everywhere. Developers use AI. Business analysts say "great, let the devs play with their AI".

That is the belt. You can push so much power into developers that it blows them up. For the company as a whole, the effect is zero. Twice the pull requests, and the analyst still reads every one of them at the same speed. Throughput up, delivery unchanged.

**What works:** retool the whole team, coders included. How to do UX with AI. How to turn business research into epics and tickets. How to plan a sprint. How to test. How to review without becoming the bottleneck. This is a different method from the first step to the last.

The most interesting work is outside development. It sits where business analysis meets UX meets QA.

## Resistance 6: "I can't even install it"

A CTO in a large public-sector organisation told a friend of mine: "Nice talk. I can't install Claude. I can't send anything outside. Open-source models? Not allowed, they're Chinese."

Basic blockers, so big he cannot take the first step. And this is not rare. During the webinar the chat filled with the same message. "I'm in a company where nothing is allowed."

**What works:** don't turn the tanker. Carve out a pirate ship. The concept goes back to the original Macintosh team. Jobs put a small team in a separate building. They hung a pirate flag from the window. They were not the old Apple.

In practice: 10-20% of the team, a board sponsor, an umbrella against internal policies, a safe sandbox. Existing systems stay the source of truth. Pirates build on top.

The test after three months is brutal and simple. A 50-page document and a meeting with 30 people? You are on a tanker. A POC, or something in production? You are on a pirate ship.

I know this pattern from e-commerce. Fifteen years ago big retailers were terrified of online sales. "We ship pallets, now we'll ship parcels? People can send them back?" Their IT said Magento on PHP was not a real programming language. Product photos did not exist, or showed headless mannequins.

Smart boards created a tiny e-commerce department with full authority. New product descriptions? They wrote them. New photos? They shot them. No belts back to the old departments. That department later became 10% of total sales, then more.

## Resistance 7: "What's in it for me?"

This is the deepest one. Put yourself in the shoes of a business leader. Some AI person shows up and says: "From tomorrow we do more with less."

Here is what that leader hears. I lose resources. I lose rank in the organisation. I get targets I cannot hit. The AI guy will take credit for the success and I stay with the problem.

Then add the accountability cycle. Sales functions are judged monthly. Back office quarterly. Nobody plays a two-year game inside a one-quarter scorecard.

The asymmetry is huge. You know what the technology can do. They do not. They understand intellectually. They cannot afford to believe.

**What works:** the AI leader talks with business leaders until they become the AI leaders. Then the AI leader shuts up and lets them do it their way.

A head of AI in a large company told a story about exactly such a sceptic. This person was far from a fan. After a few months they came back with their own idea. It was more ambitious than the original one.

The idea: people always optimise for the resources they have. Give a new automated system to the same team of X people and nothing changes. The same people use it and finish a bit earlier. So instead: take the new system and give it to new users. Put it beside the old process. Stub the last step so nothing hits production. Run two parallel realities and compare.

That came from the sceptic. Because the sceptic had the domain knowledge nobody else had.

## Resistance 8: Starting on the wrong wave

Choosing what AI should do decides more than how you do it. There are three waves.

**Wave one: coding.** AI generates code. You see whether it is good. Evaluation is easy, feedback is fast. This is why most companies start here.

**Wave two: back office.** Documents, applications, contracts, claims. High volume, nobody enjoys it, everybody has it. You can split the process into a few agents, check every step, make it auditable. This is where the real payoff sits.

**Wave three: customer facing.** Chatbots, offer generation, anything a customer touches. Every company I know that started here got burned instantly.

In 2024 a Canadian tribunal ordered an airline to honour a refund policy its chatbot invented. The airline argued the bot was a separate entity. The tribunal disagreed. Surprise: the thing on your website counts.

Wave three has infinite input variance and no control. Start there and your first AI story becomes a legal story.

## Resistance 9: "We tried it and it didn't work"

The most common question in the webinar chat. How do I convince a team after a failed first attempt with Claude Code?

Ask why it failed. In my experience two things go wrong.

**First, no context.** People fire a single prompt at a large, distributed system. The agent knows nothing about that system. It returns something incomplete, and the team concludes "AI doesn't work". Building context is a craft in itself. Markdown files in the right places. Instructions loaded dynamically per task. A harness around the agent.

**Second, no sense of scale.** One agent session, roughly a million tokens, equals about one developer-day. That is it. Now look at the prompt: "Build me a Netflix clone."

You will get something that looks like Netflix in an hour. The agents are trained to finish with a nice result. It will be a hollow shell. No developer builds Netflix in a day, and neither does an agent.

Break it down instead. Write a spec. Run it through the model with a fresh context ten times. On the tenth run it still finds something to improve. Then plan, then a granular backlog, then the agents execute task by task.

The failed attempt was usually a fly swatter aimed at a tank. Software is one of the most complex things humans build. Treat it that way.

One more thing the industry now agrees on. Harness and context matter more than the model. A person who can build and maintain a harness for one specific application is gold. Every CTO I know wants more of them.

![](/media/blog/6aab0356c27284e2e050841d-ai-sdlc-resistance-fig2-map.png)

## Two objections that always come last

**"What if OpenAI or Anthropic raise the prices?"** Fair. The subscriptions are subsidised. But look at real numbers. A CTO of a large German company wrote that spending $5-10k a month on tokens is fine. The equivalent developer capacity costs two to three times more.

And you can spend far less. Write the spec with the most expensive model. Run the four-day coding session with a cheap one. Some cheap models cost 10-20x less than the frontier ones. Open-source models fill in the rest.

Models are approaching an asymptote for coding. At some point better does not matter. Even then nothing works by itself. You still need the harness.

**"We won't introduce AI at the cost of quality."** Correct. Do not lower standards. Raise them. Code from an agent goes through the same quality gate as code from a human. Same SonarQube, same review, same tests.

Then remember quality has more than one dimension. All tests green, requirements still wrong, and you hit the wall faster than before. The protection against slop is visibility and budgeting. Someone always watches the budget. Give them the visibility.

## The playbook that worked

Enough diagnosis. Here is what actually moved things in a few large companies this year.

### 1. Run the 10% shadow experiment

Stop the philosophical debate about whether AI "can" do the job. Take a high-volume back-office process. Split off 10% of the work. Nothing goes to production.

Run that 10% in two parallel streams. Humans, as always. Four agents, processing the same items. After a week, or a month, depending on volume, compare.

Where do they match? Where do they diverge? Is there a pattern, a subset you can automate today? Which models solved it, cheap or expensive?

![](/media/blog/6aab037cba63fc98b7c19f35-ai-sdlc-resistance-fig3-shadow.png)

Now IT and the board talk about data. And remember: if you do not run this experiment, your competitor will.

### 2. Take an ambitious goal, bite off a small piece

The classic trap: "It's only a pilot." So you pick a marginal corner of the business. Even when it works, it proves nothing to the board.

Better: take a big piece of the business. Tear off a small chunk to prove it. Now the story is about the big case from day one.

Set one measurable goal, and set it together with the business side. They will learn to set goals differently, because the speed surprises them.

### 3. Land and expand

Can people from the tanker board the pirate ship? Yes. Here is how it worked in one large company.

Start the ship with pure pirates. Give it huge visibility. Everyone should see how a problem gets solved the new way. Attention breeds curiosity.

Then peel off one or two people from the ship. Drop them into the next project, together with the business analysts and a legacy team. The two pirates drive the discussion, draft the architecture, lay down the first version. First features ship in two to four weeks, even for complex applications.

The legacy team sits in every business decision from day one. They soak it up. And the sceptics surprise you, because they hold the domain knowledge.

### 4. Bring proof, then talk to the majority

Adoption theory has been the same since Rogers in 1962. Tell people something new is great and at most 16% will try it. Tell them nothing and you get 2.5%.

The pirate ship exists to produce proof. Proof means: "We took it and built something that earns money." In e-commerce the proof was share of total sales. Ten percent online equals two physical stores. Suddenly it is not a novelty.

With proof you go to the early and late majority, 68% of the company. And you say three things. Someone from your department sailed on the ship and came back alive. You can make mistakes, nobody gets fired for them. You get time for this, not after hours.

That is when the majority converts. Without proof there is no conversation.

### 5. Don't cut the people

The first reflex when AI raises OPEX: cut headcount. It makes no sense. Those people hold the domain knowledge. The agents become their tools.

What changes is the shape of the roles. A backend developer tries frontend because it is suddenly possible. A DevOps engineer researches a three-day problem in an hour and has time to look around. Roles blur. People move toward what fits their character.

Business analysts, QA, researchers, UI designers are the professions of the future. Someone has to turn "build me Netflix" into what that actually means. That is human work, and it is the hard part.

## Legacy: what would you tell a junior on day one?

Last question from the chat, and a good one. "I have a legacy system. How do I build context and a harness?"

The agent is not a junior. It can code anything. It knows nothing about your system. So the question becomes: what would you tell a junior on their first day?

If documentation does not exist, spend a few dozen AI runs on discovery. Reverse-engineer the docs from the code. An agent does this with a patience no human has.

Then record a conversation with the person who knows the system. Transcribe it. That transcript becomes the entry point of your discovery phase.

Do this before you point any agent at the codebase. Otherwise you get the fly swatter and the tank again.

## The question for you

Go back to the webinar attendee. "I still don't know how to overcome my resistance."

Here is what I would tell him now. Nobody overcomes resistance with arguments. They overcome it with a small experiment, a visible result and permission to fail.

So: which 10% of your back-office work will you split off next month? Who is the one person, full time, holding the mandate? And what would your board see after three months, a document or a deployment?

_The AI SDLC skills we use with agents, from discovery to QA, are open source. Find them in the_ [_Open Mercato Skills_](https://github.com/open-mercato/skills) _repository. Want a second opinion on your own pirate ship? Write to info@openmercato.com._
