---
webflowId: 6a95e45e9e33b8a0ea978cda
title: 'Agentic Coding at Scale: How We Built a 1M-Line ERP Where No Human Wrote a Single Line'
description: 'Not one line of Open Mercato was written by a human. The process behind a million-line ERP: one monorepo, AGENTS.md as a task router, specs before code, and the open-sourced Skills and Cezar tooling.'
date: '2026-08-31T09:00:00.000Z'
updated: '2026-11-23T22:53:31.443Z'
author: piotr-karwatka
category: ai-engineering
featured: false
thumbnail:
  src: /media/blog/6a95e45b9e33b8a0ea978c9a-6a95e336e3f53e3828e3cf15-acs-slide-01.png
  alt: Title slide - Agentic coding at scale
draft: false
---

_This article is based on the masterclass I gave for the [Alphalist](https://alphalist.com) CTO community on July 22, 2026. Slides and links at the bottom._

<figure><img src="/media/blog/6a95e45b9e33b8a0ea978c9a-6a95e336e3f53e3828e3cf15-acs-slide-01.png" alt="Title slide - Agentic coding at scale" /><figcaption>Title slide - Agentic coding at scale</figcaption></figure>

Last September I started [Open Mercato](https://github.com/open-mercato) - an MIT-licensed framework for building business apps (CRM, SaaS, B2B), designed around one idea: **start with 80% done** and compose the remaining 20% with Codex, Claude, and a small team.

Ten months later, the numbers look like this:

<figure><img src="/media/blog/6a95e45d9e33b8a0ea978cb0-6a95e337b4ee8c9bb96b4407-acs-slide-02.png" alt="Open Mercato by the numbers, July 2026" /><figcaption>Open Mercato by the numbers, as of the July masterclass</figcaption></figure>

- **1,700+ merged pull requests**
- **800K+ lines of code**
- **4,730 tests** (unit + Playwright)
- **100+ contributors**, with roughly 20 people working on it daily

Those were the numbers on the day of the talk. The codebase has since passed **1,000,000 lines** and **130+ contributors**.

And the part that raises eyebrows: **not one line was written by a human.** The architecture, the specs, the process - all human. The code - all AI.

This post is not "the best way" of doing agentic engineering. It's what actually worked (and didn't) for us at this scale.

## Vibe coding vs. agentic engineering

Everyone senses the difference, but to level the playing field: vibe coding produces _disposable_ software. You one-shot a tool, a demo, a game - and it works, but you can't really develop it further. Agentic engineering means you have a full process around the AI - specs, quality gates, reviews, tests - so you can stack features on top of each other for months without the application eventually blowing up.

One side effect nobody warns you about: **2 hours of agentic coding feels like 8 hours of normal work.** The iteration loop is high-dopamine and honestly a bit unhealthy - the flow state of hand-writing code is gone. And developers become product people. Our team profile changed completely compared to my consulting-business days: small teams of 2-3, strong communicators, generalists who design business features and delegate the implementation.

## What works for us

### 1. One monorepo. Full LLM context.

Everything lives in one tree - every module, every package. Every agent reads the same repo; there is no stitched-together multi-repo setup and no elaborate RAG pipeline. It's simply not worth the effort when the model can search one tree.

<figure><img src="/media/blog/6a95e45e9e33b8a0ea978cca-6a95e337fb7b3a5403824059-acs-repo-packages.png" alt="The Open Mercato monorepo - packages view on GitHub" /><figcaption>The Open Mercato monorepo - packages view on GitHub</figcaption></figure>

Module boundaries survive even with 100+ contributors. We tried loose API docs as a substitute for context - complexity without context always lost.

### 2. AGENTS.md as a task router, not a mega-prompt

Our root `AGENTS.md` started as a coding-standards document and grew until it stopped working. There's a practical ceiling - around 100-200 instructions per file - beyond which follow-rates visibly drop (there are even papers on this).

The fix: the root file became a **router table** - _task → guide path_. Each folder carries its own `AGENTS.md` with local imports, patterns, and constraints. Guidance lives next to the code it governs, and the LLM only pulls in the file relevant to the task at hand. A router beats a mega-prompt, and it saves a lot of context.

<figure><img src="/media/blog/6a95e45d9e33b8a0ea978cb7-6a95e3373dad5c3f91cf14f5-acs-slide-07.png" alt="AGENTS.md task router" /><figcaption>AGENTS.md task router</figcaption></figure>

### 3. Specs first, code after

Working with an LLM is like working with a developer who has a **one-day memory**. Every session it forgets everything. A spec is what carries that memory from one day to the next.

Every non-trivial change starts as a `SPEC-XXX.md` in `/.ai/specs` - drafted by the LLM via our `om-spec-writing` skill, reviewed and approved by humans, numbered, dated, and release-tagged. We run each spec through a model (or two different models) at least twice to find the gaps before any code gets written.

<figure><img src="/media/blog/6a95e45e9e33b8a0ea978cd3-6a95e3372aeb54c8f178f788-acs-specs-folder.png" alt="The .ai/specs folder in the repo" /><figcaption>The .ai/specs folder in the repo</figcaption></figure>

Two observations: Claude writes noticeably better specs than Codex (for us), and **one-shot rewrites beat iterative fixes - when the spec is right.** A good spec is the new IDE.

### 4. Skills: the autonomous SDLC

This was the game-changer. We built ~25 granular, composable skills - plan, implement, review, QA-gate, merge - each encoding one repeatable workflow with the right context. The ones prefixed `auto` are fire-and-forget: you write the spec interactively, then run `om-auto-create-pr` and come back hours later to a finished, tested pull request.

<figure><img src="/media/blog/6a95e45d9e33b8a0ea978cad-6a95e3382aeb54c8f178f7ea-acs-slide-09.png" alt="Skills the agents actually reach for" /><figcaption>Skills the agents actually reach for</figcaption></figure>

The skills also encode our SDLC - how PRs are labeled and commented, when screenshots get posted as evidence, which issues get claimed. Everything repeatable.

**We open-sourced the whole set** two weeks before the webinar: [github.com/open-mercato/skills](https://github.com/open-mercato/skills). It's technology-agnostic (we're TypeScript/Next.js/Postgres, but it works the same for .NET), skills.sh-compatible, and MIT-licensed:

```
npx skills add open-mercato/skills --skill '*'
# then, once per repository:
/om-setup-agent-pipeline
```

The setup skill adapts everything to _your_ issue tracker, source control, and toolchain.

<figure><img src="/media/blog/6a95e45d9e33b8a0ea978cba-6a95e338489f261dea270c3f-acs-skills-repo-real.png" alt="The open-sourced skills repo" /><figcaption>The open-sourced skills repo</figcaption></figure>

### 5. Worktrees + ephemeral environments

Open Mercato is a business app - it needs Postgres, Redis, and workers just to boot. Autonomous agents only became truly useful once each one could get its **own** disposable copy of the world:

- one git worktree per agent - no branch-switching dance
- testcontainers spins up Postgres, Redis, and workers per run
- each agent runs its own integration tests against its own database
- when it's done, everything is wiped

<figure><img src="/media/blog/6a95e45d9e33b8a0ea978ca7-6a95e338302a50fa122e5165-acs-slide-10.png" alt="Five agents, five branches, five Postgres instances" /><figcaption>Five agents, five branches, five Postgres instances</figcaption></figure>

Agents never share state, so we run five (or more) in parallel without chaos. PRs that were verified this way get a `screenshots` label with UI evidence attached - for fixes and smaller changes, you often don't need to open the code at all.

### 6. Tests keep the AI honest

We use GitHub CI as the harness: ~4,000 unit tests and 1,400+ Playwright integration tests (it's grown past 2,000 since the slides were made), run on a 15-way parallel ephemeral-integration matrix.

<figure><img src="/media/blog/6a95e45e9e33b8a0ea978ccd-6a95e3383dad5c3f91cf1600-acs-actions-matrix.png" alt="CI run with the ephemeral-integration matrix" /><figcaption>CI run with the ephemeral-integration matrix</figcaption></figure>

Every autonomous skill is required to ship tests with the code. People object: "but if the LLM writes the tests, do they even make sense?" My answer: **the statistic protects you.** At 60%+ integration coverage, when the suite goes red, something real is happening - and agents refactor fearlessly when it's green. I once ran a proof-of-concept rewriting the whole API to .NET with the integration suite as the only acceptance criterion. "Run the tests until they're green." It took a few days. It finished with working code.

### 7. UI mockups as specs

We didn't start with mockups, and it showed - the LLM would build something _working_ but totally different from what I had in mind. Even an ASCII wireframe inside the spec aligns the vision. Recently we've upgraded to full HTML mockups that comply with our design system - more tokens, but iterating on something that looks almost like the real app is far easier and saves a lot of QA time.

<figure><img src="/media/blog/6a95e45d9e33b8a0ea978cbd-6a95e3392aeb54c8f178f879-acs-slide-13.png" alt="From ASCII wireframes to design-system-compliant HTML mockups" /><figcaption>From ASCII wireframes to design-system-compliant HTML mockups</figcaption></figure>

### 8. Split the spec, loop the agents

For big features we use a looping pattern (our skills with the `-loop` postfix): split the spec into 20-30 atomic tasks, run each in a subagent, require green unit tests per task, and **every 5-6 tasks run a checkpoint** - Playwright QA in a real browser if the UI was touched, plus the full CI gate.

It's slower than one-shot coding, but the result almost always works. The best part: the agent narrates itself. Commits are the log, screenshots are the proof - you can follow the whole run from the PR timeline without ever opening a session.

<figure><img src="/media/blog/6a95e45e9e33b8a0ea978cd0-6a95e339fb7b3a5403824191-acs-pr-commits.png" alt="One PR, 147 commits, days of agent work - pull/396" /><figcaption>One PR, 147 commits, days of agent work - pull/396</figcaption></figure>

That PR - a full cockpit UI redesign - started with a long spec written with Fable, was implemented by Opus, ran for about three days, and still fit in my Max subscription.

### 9. Lessons learned, forever

Every time a human review catches something the AI missed, the lesson goes back into `AGENTS.md`. Next run, it's caught automatically. **The codebase learns - the same bug doesn't ship twice.** The discipline of having the skills record these lessons automatically is what makes it stick.

## Cezar: orchestrating the swarm

Once you're running 20-40 agent tasks at once, tabs-and-terminals stops scaling. After an hour you simply don't know what's going on anymore.

So we built (and open-sourced, MIT) **Cezar** - [a parallel coding-agent orchestrator](/blog-posts/cezar-cockpit-for-ai-coding-agents): [github.com/open-mercato/cezar](https://github.com/open-mercato/cezar).

```
cd your-repo
npx cezar-cli
```

<figure><img src="/media/blog/6a95e45d9e33b8a0ea978cc4-6a95e3392aeb54c8f178f8d4-acs-slide-17.png" alt="Cezar - the parallel coding-agent orchestrator" /><figcaption>Cezar - the parallel coding-agent orchestrator</figcaption></figure>

A task queue for every agent - one branch, one worktree each. Skills, schedules, memory, and webhooks built in. It runs Claude Code, Codex, or any coding agent behind one CLI, and it extracts issue and PR numbers from the sessions, so when you're checking on 40 code reviews you can see what's done without opening a single session. I run it on a €50 Hetzner VPS with 32 GB of RAM, and it works well from a phone - which is how ideas get captured mid-walk via a quick `prepare issue` task.

## Humans didn't disappear - they moved up the stack

The role of UX and manual QA _grew_. We started with a fully AI-designed admin panel and it got messy. Then Oliwia, our UX designer, joined - and her first move was writing scripts to extract and validate our design system (what a time to be alive: the designer starts by coding). Our `om-ds-guardian` skill now keeps code and Figma tokens in sync automatically and catches design-system drift.

Taste, empathy, and business fit are still human. The chores around them are AI. QAs manually test the weird business paths no model can imagine - and author the deep integration scenarios the agents then automate. These people are the bridge between the AI and the users; I can't imagine shipping without them.

## The model council

Frontier models draft; a **six-model review council checks the work** - open-weight models included:

<figure><img src="/media/blog/6a95e45d9e33b8a0ea978cc0-6a95e33a489f261dea270cc1-acs-slide-19.png" alt="Claude, Codex - and the open-weight council" /><figcaption>Claude, Codex - and the open-weight council</figcaption></figure>

Claude Fable 5 for specs, docs, and long sessions; GPT-5.6 for patient CI loops; DeepSeek, Kimi, GLM, and MiMo as additional reviewers. Different priors mean fewer blind spots - our spec-review council (6 models, 2 rounds) surfaced 40 findings on a single spec. The gap between open models and frontier fell to roughly 5% in a year; they've earned their seat. One practical note: use the models' own CLIs rather than an API router, or prompt caching stops working.

## Tips from the trenches

- **"Fix it until CI is green."** Our most-used prompt, many times a day. Give the agent `gh` and let it keep trying.
- **Fix root causes, not symptoms.** One integration-test-and-root-cause pass per PR, minimum. Not the flake - the root.
- **Push unit coverage toward 100% with LLMs.** Scan the V8 coverage report, ask the model to cover the gaps, repeat.
- **At least one unit test per PR. Always.** Tons of tests are the refactor safety net.
- **Measure coverage, not authorship.** High coverage equals confidence, regardless of who (or what) wrote the tests.
- **Have QAs author deep integration scenarios.** The skill runs the tests; it can't imagine business edge cases.

## What we haven't figured out yet

<figure><img src="/media/blog/6a95e45d9e33b8a0ea978caa-6a95e33a7a0decaefe627c06-acs-slide-21.png" alt="Open challenges" /><figcaption>Open challenges</figcaption></figure>

- **Reviews at scale.** ~90% of PRs are reviewed automatically (labels flag the ones needing human security/architecture review), but a 1,500-file branch is too big for humans _and_ too big for one context window. `/ultrareview` helps - not fully.
- **Token economics.** Parallel agents burn tokens fast; cost-vs-quality is still guesswork. Delegating simple tasks to cheaper models doesn't work well yet - I think the real answer is mixing open-weight with frontier models, but no big vendor has an incentive to support that.
- **"Done" is fuzzy.** Green tests ≠ done. Coverage ≠ done. The bar differs per task type and we don't have a crisp definition yet.

If you've cracked any of these - please talk to me.

## Try it yourself

Everything shown is released and MIT-licensed:

<figure><img src="/media/blog/6a95e45d9e33b8a0ea978cb4-6a95e33a1ab172af0eda8e10-acs-slide-23.png" alt="Everything we showed - released" /><figcaption>Everything we showed - released</figcaption></figure>

- **Open Mercato** - the AI-supportive ERP/CRM framework itself: [github.com/open-mercato](https://github.com/open-mercato)
- **Skills** - the full agent PR pipeline for any repo and 22+ coding agents: [github.com/open-mercato/skills](https://github.com/open-mercato/skills)
- **Cezar** - the parallel coding-agent orchestrator: [github.com/open-mercato/cezar](https://github.com/open-mercato/cezar)
- **Sandboxes** - cloud dev environments with Codex, Claude Code, and VS Code in the browser, ready in 30 seconds: [sandboxes.openmercato.com](https://sandboxes.openmercato.com) (waitlist open; invites around early September)

Use them, break them, PR them - we read every pull request.

Questions, ideas, war stories: **piotr@openmercato.com** · [LinkedIn](https://linkedin.com/in/piotrkarwatka) · [openmercato.com](/)

_Thanks to Nolusindiso Hleko and the Alphalist team for hosting the masterclass._
