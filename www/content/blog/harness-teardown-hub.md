---
webflowId: 6a302bccc0f81d5fd86919b8
title: "A teardown of Claude Code, Codex, Gemini, opencode and Open Mercato: where they converge, and the one layer they don't"
description: "We read every coding agent's harness we could find, Claude Code, Codex, Gemini, opencode, and the leaked Fable 5 prompt, and kept noticing the same gap: they all fence the filesystem, none fence your data. None of them even knows what a tenant is. Here is what we found, and how we built the part that does."
date: '2026-06-15T00:00:00.000Z'
author: maciej-gren
category: ai-engineering
featured: false
thumbnail:
  src: /media/blog/6a302bccc0f81d5fd869195e-6a3029e12772121de8aa7eb8-harness-teardown-hub-cover.png
  alt: 'How we compare harnesses: one ruler, four marks the field shares and two it leaves off (a domain-data fence and a contracted verdict).'
draft: true
---

We build an AI-native ERP, so we spend a lot of time reading other people's harnesses: the prompt-and-tooling layer wrapped around a coding agent. Claude Code, Codex, Gemini's CLI, opencode. When Fable 5's system prompt leaked last week, we read that too, same as everyone.

Read enough of them and you start to notice something you can't unsee.

They have all converged. The same four jobs turn up in every serious harness: curate what the model sees, give it tools it can actually use, make it verify its own work, keep it on a think-then-act loop. The people who build these things say so themselves, and we quote a few of them below. It is good engineering, and it is quietly becoming table stakes.

The part we kept turning over is what none of them do. Every one of these harnesses fences the filesystem: the agent may touch these files and not those. None of them fences your data. Not one knows what a tenant is, or which column holds someone's personal information, because none was built against your database. They were built against everyone's filesystem.

We noticed that gap while building the part of our own system that does fence the data, so we are hardly neutral. Read us as an interested party and check the sources yourself. But the gap is real whether or not you ever touch our product, and we think it is worth seeing.

## What they all converge on

Read what the people who build these harnesses say a harness is for, and the same short list comes back, in their own words.

The first job is context engineering. Anthropic's teams call it exactly that and define it as finding "the smallest possible set of high-signal tokens that maximize the likelihood of some desired outcome." Philipp Schmid at Google DeepMind names the failure mode: "agent failures aren't only model failures; they are context failures." Karpathy's version is that the context window is the model's working memory, the RAM you have to budget. So every serious harness curates what the model sees: a memory file read each session, compaction when the window fills, just-in-time loading instead of front-loading everything, a sub-agent handed a clean context. Read-before-write sits underneath it: Factory's Droid is told never to guess at code it has not opened, and Codex's `apply_patch` refuses to run unless the lines on disk still match.

The second is tool ergonomics. Anthropic calls it the agent-computer interface and says to spend as much design effort on it as on a human-facing one: tools the agent can read, errors that tell it what to fix, results that carry signal instead of raw identifiers. Schmid puts it plainly: the agent only ever sees a tool's schema and docstring, so the description has to carry the context and the typing has to be, in his word, "idiot-proof."

The third is verification, and Boris Cherny, who leads Claude Code, ranks it first: "probably the most important thing to get great results... give Claude a way to verify its work," because with that loop "it will 2-3x the quality of the final result." Lint, typecheck, test and build, run by the harness instead of by a human hoping the diff is fine. Factory is the strictest we saw, refusing to open a real pull request until the build is green; Devin keeps retrying a failing CI and escalates after the third try.

The fourth is a stepwise loop with a plan-then-act gate. Cline ships explicit PLAN and ACT modes, Devin separates diagnosis from execution, Codex has an `update_plan` tool.

Open Mercato does all four, and we are not claiming to do them better. Our context layer loads on demand instead of front-loading: two meta-tools query the spec when needed rather than registering hundreds of endpoint tools, a tiered manifest ships about fifteen of thirty-six skills by default, and an [`AGENTS.md`](https://github.com/open-mercato/open-mercato/blob/main/AGENTS.md) plus a lessons file act as re-read memory. Our tools are typed schemas that resolve raw IDs to human labels. Our build-time agent has to pass build, lint and test before it is done. Four for four, and none of it is a moat.

Here is what stopped us once we saw it written down. The people who build these harnesses keep saying the harness barely matters. Boris calls Claude Code "the thinnest possible wrapper over the model" and says "all the secret sauce, it's all in the model." Behind that is the bitter lesson, Rich Sutton's argument that general methods win over hand-tuned tricks as compute grows, required reading on the Claude Code team: the clever trick that buys you ten or twenty percent gets absorbed by the next model. So these four jobs are the floor, and they are also a depreciating asset.

But the lesson has an edge it does not cross. It eats the clever scaffolding, because a stronger model just does that itself. It does not eat a correctness constraint. A better model will not hand you tenant isolation, and you would not want it deciding tenant isolation by guesswork anyway. So the durable part of a harness is not the clever part. It is the part wired to your data, the part the next model has no reason to absorb. That is the part we went looking for, and could not find in any of them.

## The fence none of them have

Every harness fences the filesystem, and they do it well. Codex gives you a sandbox where filesystem and approval are separate dials. Gemini ships a profile that excludes your `.env` and `.git`. Factory scans a diff for secrets before it leaves. opencode runs a permission rule engine that denies `.env` by default. Boris Cherny is honest that even this is "best effort," with a small chance the agent reads a file you did not want it to, and that it is the sandbox, not the prompt, that actually holds the line.

All of it is a fence around files. None of it is a fence around the data model. The agent may touch these rows, for this tenant, never that encrypted column: none of these harnesses can express that, because none of them knows what a tenant is. They were built against everyone's filesystem, not against your database.

It is worth being precise about what such a fence would and would not stop. Karpathy, listing what a language model will do to you, includes prompt injection and that it "might leak your data." A data-model fence does not close that one: an agent talked into misbehaving, already authenticated as the right tenant, can still leak that tenant's own rows. What the fence closes is the other leak, the over-broad query that hands back the wrong tenant's rows in the first place. A human-confirm step on every write covers the rest. Two different leaks, one fence, and it is honest to say which it catches.

<figure><img src="/media/blog/6a3093802ad2abef07c37f4d-6a30931ca5f39fab0403ae82-harness-teardown-two-leaks-one-fence-v3.png" alt="Two leaks, one fence: an over-broad query is stopped at the tenant line by the data-model fence, a prompt-injection exfiltration passes because it is already inside the fence, and every write short-circuits to a human-confirmed pending action." /><figcaption>Two leaks, one fence. The data-model fence stops the over-broad query at the tenant line, but not an injected agent already inside it. That is what the human-confirm write gate is for.</figcaption></figure>

The leaked Fable 5 prompt is the same story from the other side. It is an elaborate document, and every careful rule in it governs what a consumer assistant may say: copyright, child-safety, how to use a connector. Search it for a tenant or a row or a column and there is nothing, because a chat assistant has no database behind it. It fences speech, because speech is all it has to fence. The harnesses that do touch your database fence files instead. Either way, the data is left to you.

## What it looks like side by side

We read each harness at its source and laid them on the same six rows. The first four are the shared floor. The last two are the axis we have been describing: a fence bound to your data model, and a contracted pre-production verdict. We kept Open Mercato off any row another tool fills better, and where one is sharper than the rest we say so in the text rather than in the cells.

| Capability                                                          | Codex CLI                             | Gemini CLI                                                                  | Claude Code                                                         | opencode                                                                                                    | Open Mercato                                                 |
| ------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Context engineering (curate / just-in-time-load the window)         | yes (`AGENTS.md` + compaction)        | yes (`GEMINI.md` context)                                                   | yes (compaction, memory, subagents)                                 | yes (`AGENTS.md` + auto-compaction)                                                                         | yes: just-in-time spec query, tiered skills, re-read memory  |
| Tool ergonomics / agent-computer interface                          | yes (typed tool schemas)              | yes (typed tool schemas)                                                    | yes (typed tool schemas)                                            | yes (typed schemas → JSON Schema)                                                                           | yes: typed self-documenting schemas, IDs resolved to labels  |
| Mechanical verification (test / lint / build)                       | yes                                   | yes                                                                         | yes                                                                 | yes, no hard gate (LSP diagnostics; tests via shell)                                                        | yes (build-time gate; runtime = human-confirm + recheck)     |
| Stepwise loop + plan/act gate                                       | yes (`update_plan`, act-biased)       | yes                                                                         | yes                                                                 | yes (Plan / Build modes + todo)                                                                             | yes                                                          |
| Domain-data architecture fence (bound to YOUR data model)           | generic filesystem sandbox + approval | closest generic analog: seatbelt + `.env`/`.git` exclusion + path allowlist | generic filesystem + permission fence ("best effort", per its lead) | rule-based permission fence (`allow`/`ask`/`deny`, `.env` denied, external-dir allowlist); filesystem-level | domain-bound, code-enforced, fail-closed (runtime AI path)   |
| Pre-production acceptance verdict _(service, not a code primitive)_ | generic CI                            | generic CI                                                                  | generic CI                                                          | generic CI                                                                                                  | contracted homologation verdict, delivered as a paid service |

scroll →

So you can check the cells: Codex CLI, Gemini CLI, and opencode are open source, and the behavior above is read straight from their repos (`codex-rs/core/`, `packages/core/src/prompts/snippets.ts`, and `anomalyco/opencode`). Claude's model behavior comes from Anthropic's official published system prompts; the Claude Code agent layer, like Cline, Cursor, Devin, and Factory, is closed, so those cells are community-extracted (CL4R1T4S, snapshot June 2026) and read as such, not as quotation.

Versions read June 2026: Codex CLI 0.139.0 (model server-selected, GPT-5.3-Codex / GPT-5.5 era), Gemini CLI 0.46.0 (Gemini 3 Pro and Flash, auto-routed), Claude Code 2.1.177 (default Opus 4.8), opencode 1.17.7 (bring-your-own model), and Open Mercato at `open-mercato/open-mercato@main`. Fable 5, the week's model hook, shipped June 9 and was suspended June 12.

## How we built our own data fence

This is the part you can open in the public MIT repo rather than take on our word.

The query engine ([`packages/shared/src/lib/query/engine.ts`](https://github.com/open-mercato/open-mercato/blob/main/packages/shared/src/lib/query/engine.ts)) requires a tenant on every query and auto-appends the organization and tenant scope to the SQL `WHERE` on every read and every join. The opt-out is a single explicit option, `omitAutomaticTenantOrgScope`, so an unscoped query is a deliberate, greppable act. The CRUD factory ([`packages/shared/src/lib/crud/factory.ts`](https://github.com/open-mercato/open-mercato/blob/main/packages/shared/src/lib/crud/factory.ts)) fail-closes to an empty set when no scope resolves, returning zero rows rather than the whole table. The AI write gate ([`packages/ai-assistant/src/modules/ai_assistant/lib/prepare-mutation.ts`](https://github.com/open-mercato/open-mercato/blob/main/packages/ai-assistant/src/modules/ai_assistant/lib/prepare-mutation.ts)) never runs a tool handler directly; it short-circuits every write into a pending action a human has to confirm, then re-checks the record at confirmation so the diff is re-proven rather than assumed.

We will tell you where it is thin, because you would find it anyway. A developer writing new module code can still bypass the auto-scope by reaching for a raw entity manager; the [`AGENTS.md`](https://github.com/open-mercato/open-mercato/blob/main/AGENTS.md) points them at the scoped helpers and the tests pin the behavior, but at that edge it is convention, not a wall. Single-record loads check ownership after the load rather than in the query. So the honest claim is narrow: code-enforced and fail-closed for the runtime agent, secure-by-default and audited for the code the agent writes.

## The part you can't grep

There is a second half to this that is not code, and we want to be straight that it is a different kind of thing. Open Mercato's homologation is a paid pre-production verdict, GO, CONDITIONAL, or NOT-FOR-PRODUCTION, scored across five dimensions including how well a build conforms to its own data model. The closest thing the field has is Factory's green-build-before-PR, with Devin's CI escalation behind it, and both stop at the pull request. Ours is a license and a verdict, not a warranty, and it is the one claim in this whole post you cannot settle by opening a file. The fence you can read in source. The verdict you are paying a person for. We would rather say that plainly than blur the two.

## See for yourself

There will be another frontier release next month and another leaked prompt, and the first four rows will look about the same. The last two are the ones we are watching. Nobody else is on them yet, which is a head start rather than a moat: a competitor could add tenant-awareness and a conformance verdict in a release or two. They have not.

So do not take any of this on our word. The auto-scope and fail-closed query path are public in the MIT repo at [github.com/open-mercato/open-mercato](https://github.com/open-mercato/open-mercato); the write gate is [prepare-mutation.ts in the ai-assistant module](https://github.com/open-mercato/open-mercato/blob/main/packages/ai-assistant/src/modules/ai_assistant/lib/prepare-mutation.ts). If you want the longer version of how this holds up against a flood of generated code, that is the [companion piece on building the harness around AI](/blog-posts/we-dont-do-ai-we-build-the-harness-around-it); if you want the version your board will ask about, start with [why AI rollouts die in the IT department](/blog-posts/why-ai-rollouts-die-in-the-it-department).
