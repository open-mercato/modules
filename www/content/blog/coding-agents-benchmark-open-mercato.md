---
webflowId: 6a6c722b44618d3ca5cef37d
title: We benchmarked coding agents on Open Mercato. The hardest failure looked perfect.
description: Three open-weight models built real Open Mercato features. The first benchmark run showed where agents are already reliable, and where convention-perfect code still breaks at runtime.
date: '2026-08-01T09:00:00.000Z'
updated: '2026-09-10T07:54:28.239Z'
author: mateusz-staniaszek
category: ai-engineering
featured: false
thumbnail:
  src: /media/blog/6a6c80cf9c9ddd35f05e6c42-6a6c80b2c2b8cc144feabfd1-coding-agents-benchmark-cover.png
  alt: The hardest failure looked perfect - Open Mercato coding-agent benchmark cover
draft: false
---

**TL;DR:** We gave three open-weight models six repository-level feature tasks on Open Mercato 0.6.6. Of 17 artifacts that reached the verifier, 12 passed every functional, baseline, and convention gate. If every wall-clock timeout counts as a process failure, the result is 9 of 18. The simpler CRUD and declarative-extension tasks passed in 10 of 11 scored cells. A relational projects module passed in only 2 of 6, and its agent-guided variant failed for all three models. Twice, the code looked structurally perfect but returned an HTTP 500 at runtime. This is a one-attempt-per-cell instrument preview, not a model leaderboard. What it gives us is a map of where the platform and its guidance need work. The benchmark is open source, and we warmly encourage contributions of new tasks and models (see the last section for how).

There is a particularly dangerous kind of generated code: code that looks right.

It uses the expected factories. The entities sit in the right place. The access-control names follow the convention. The migration exists. The backoffice pages use the platform components. A static review gives it full marks.

Then the first real request returns `500 Internal Server Error`.

Two models hit this independently in our first benchmark run, on the same task. Both produced convention-perfect versions of the same complex feature, and both broke at the same API endpoint. A leaderboard would have flattened that into a rank. What we found instead was a specific seam in the platform, the kind every coding agent that follows will hit unless we close it. Finding those seams is exactly what we built the benchmark to do.

## We wanted a benchmark for building _on_ the platform

Generic coding benchmarks tell us whether a model can repair a bug or solve an isolated programming problem. They do not tell us whether an agent can add a real Open Mercato module while preserving tenant boundaries, using the CRUD route factory, naming ACL features correctly, expressing filters through the platform API, and building the backoffice with the expected components.

For maintainers, “it works” is only half the review. The other half is “it belongs here.”

So the Open Mercato benchmark grades both, and it does so under real autonomy. Each run is a single shot. The agent is dropped into a freshly scaffolded standalone application with one written feature request and no human on the other end: no clarifying questions answered, no follow-up hints, no reviewer nudging it toward the right file. It reads the spec, it builds, and whatever it leaves in the workspace is what we grade, against three gates:

1. **Functional tests:** Does the feature work through the running application’s HTTP and server-rendered surfaces?
2. **Baseline checks:** Does the application still build, generate code, and preserve existing behavior?
3. **Convention rubric:** Did the implementation use Open Mercato’s factories, entity patterns, ACLs, migrations, filters, and UI building blocks? A score of at least 0.85 is required.

The final rule is deliberately strict:

```
passed = all functional tests pass
      AND all baseline checks pass
      AND convention score >= 0.85
```

A feature that behaves correctly but forks the platform’s architecture fails. So does an idiomatic implementation that does not work at runtime.

The benchmark is also built as a longitudinal instrument, not a one-off. Two questions matter to us more than any single ranking. First: when we ship a new Open Mercato version, do the same agents become more reliable at extending it? Second: as we widen the field to more models, including newer and frontier ones, do they clear the same tasks faster, cheaper, and with less coaxing? **A platform is getting easier to build on when the answer to both keeps trending toward yes.**

## The first run: three feature families, two environments, three models

Version one uses a small task ladder:

| Code     | Task      | What the agent had to build                                             | Budget |
| -------- | --------- | ----------------------------------------------------------------------- | ------ |
| FEAT-001 | Bookmarks | A greenfield CRUD module with RBAC, validation, and a migration         | 30 min |
| FEAT-002 | Loyalty   | A declarative custom-field extension on customer people                 | 30 min |
| FEAT-003 | Projects  | Two related entities, filtering, cascade soft-delete, and backoffice UI | 40 min |
| FEAT-004 | Followups | _Parked._ A persistent subscriber, a queue, and idempotency             | 40 min |
| FEAT-005 | Helpdesk  | _Parked._ A larger vertical slice combining several mechanisms          | 60 min |

The first three ran in v1. Followups and helpdesk are specified but parked, waiting for contributors to finish their environments and verifiers.

Each active feature has two variants. The base variant contains the normal standalone scaffold. The `-agentic` variant adds the Open Mercato skills and agent guidance shipped with the platform. The feature request itself stays the same. Three active features across two environments gives the six task variants the models were graded on. The charts below label tasks by these codes, with `-agentic` marking the guided twin, so `FEAT-003-agentic` is the guided run of the projects task.

We ran every variant once with Kimi K3, GLM 5.2, and DeepSeek V4 Pro: six variants × three models = 18 model trials. Each trial was driven by the open-source OpenCode harness and orchestrated by [Harbor](https://github.com/harbor-framework/harbor), the eval runner the whole benchmark is built on. We also ran a hidden canonical solution for every task variant in the same job, giving us six oracle controls, for 24 trials in total.

All three models are open-weight, so the underlying families are independently inspectable and self-hostable. This run, however, used hosted inference through OpenRouter. The slugs pin the named model versions rather than a `latest` alias, but they do not pin a weights revision, a quantization, or a serving provider. Treat the run as rerunnable under the same named configuration, not as bit-for-bit reproducible.

The oracles passed 6 of 6. Every task therefore had at least one demonstrated valid solution under the exact environment, task digest, and verifier revision used for the model runs.

Without that control, a failed trial could always be blamed on an impossible task or a broken grader. Because the oracles passed, the failures instead tell us something real about the path from prompt to working Open Mercato code.

<figure><img src="/media/blog/6a6c722a44618d3ca5cef2ea-6a6c717644618d3ca5ce9648-evals-v1-pass-matrix.svg" alt="Pass matrix for three models across six Open Mercato benchmark task variants" /><figcaption>The complete v1 model × task matrix. A clock marks a trial that reached its wall-clock budget.</figcaption></figure>

## The simple work was mostly reliable. The relational module was the wall.

Across the 17 trials that produced verifier verdicts, 12 terminal artifacts passed all three gates. One GLM trial timed out before the verifier could score it. Under the stricter process view, counting every timeout as a failure, 9 of the 18 trials completed within budget and passed.

The aggregate number is less interesting than its shape.

Bookmarks and loyalty, the CRUD and declarative-extension families, passed in **10 of 11 scored cells**. Projects, which combined related entities, filtering, deletion behavior, API routes, and backoffice UI, passed in only **2 of 6**.

The agent-guided projects variant went **0 for 3**.

Kimi reached its 40-minute limit with an incomplete implementation that did not build. GLM and DeepSeek got much closer. Both created real migrations, factory routes, and DataTable/CrudForm pages. Both earned a perfect `1.000` convention score.

And both returned a 500 on:

```
POST /api/projects/projects
```

The doubled path segment is not a typo: the first `projects` is the module, the second is the entity collection inside it.

They passed the same three checks and failed the same four CRUD, cascade, and validation checks. Independent models had converged on the same plausible, idiomatic, broken implementation pattern.

> The most useful failure was the one that looked finished.

Somewhere between the feature request, the shipped guidance, and the platform’s create path lies a pattern that compiles, reads as idiomatic, and throws on the first write. Two independent models walked straight into it. Naming the exact line is the first item on the queue below: re-run that cell with server logs captured, then decide which layer owns the fix. We are publishing the signal now rather than holding it until the patch lands.

Whatever that line turns out to be, the failure has already earned its place in the report. A convention grader reads the code; only a live request runs it.

<figure><img src="/media/blog/6a6c722a44618d3ca5cef2ed-6a6c717778ad19640c056647-evals-v1-how-close.svg" alt="Functional and convention scores for failed Open Mercato benchmark trials" /><figcaption>Failed trials were not equally wrong. Some missed platform conventions; others were convention-perfect but functionally broken.</figcaption></figure>

## “Works” and “built the Open Mercato way” are separate signals

The run also gave us the opposite failure.

GLM’s base projects implementation passed all seven functional tests. The feature worked. But its convention score was `0.727`, below the `0.85` gate. It hand-wrote route handlers instead of re-exporting the platform’s route factory, skipped `buildFilters` for task filtering, and used non-canonical ACL feature IDs.

DeepSeek’s agent-guided bookmarks implementation did the reverse. It earned a perfect convention score, but generated entity code imported `uuid` without declaring the dependency. The application never booted, so it passed zero functional tests.

One implementation worked but did not fit the platform. The other fit the platform on paper but did not work. A single score would blur those failures together. Keeping the gates separate tells us whether to improve runtime ergonomics, documentation and discoverability, or the verifier itself.

<figure><img src="/media/blog/6a6c722a44618d3ca5cef315-6a6c717704075f9a96cef44f-evals-v1-rubric-heatmap.svg" alt="Heatmap of convention-rubric criteria across Open Mercato benchmark trials" /><figcaption>The convention rubric shows which platform patterns each implementation used. A perfect structural score still did not guarantee working runtime behavior.</figcaption></figure>

## Agent guidance improved conformity, but not outcomes

We expected the `-agentic` variants to help. In this run, they did not improve the pass rate.

Base variants passed 7 of 8 scored cells. Agent-guided variants passed 5 of 9. At the same time, the guided implementations were generally more convention-conformant: all but one scored agentic cell received a perfect rubric score.

The tension there is the interesting part. Guidance can steer an agent toward the intended architecture without guaranteeing that the resulting code survives a real request. On the projects task, two guided implementations looked better to a structural grader and behaved worse at runtime than their base counterparts.

But this is still one attempt per cell. It is not evidence that guidance makes models worse. A pass or failure can flip on the next run, and base/agentic twins are correlated rather than six independent feature specifications. The result gives us a hypothesis to investigate, not a causal estimate.

<figure><img src="/media/blog/6a6c722a44618d3ca5cef2f5-6a6c7177d225a72479c26eed-evals-v1-base-vs-agentic.svg" alt="Base versus agent-guided functional completion in the Open Mercato benchmark" /><figcaption>In this snapshot, agent-guided variants were more convention-conformant but did not produce more passing artifacts.</figcaption></figure>

## Timeouts need two honest numbers

Six agents reached their wall-clock limit. Five still left code that the verifier could score, and three of those timed-out artifacts - all Kimi’s - passed every gate. They were finished implementations whose agent process simply did not exit in time.

So there are two legitimate views of success, and we report both:

- **Terminal-artifact success:** 12 of 17 scored artifacts passed. Was the code left in the workspace good?
- **Completed-within-budget success:** 9 of 18 trials passed without an agent timeout. Did the whole process finish reliably?

A working artifact from a process that never exits is real evidence, but it is not a clean autonomous success, and a benchmark for autonomous development has to care about both.

Cost is one more reason not to collapse the run into a single ranking. The 18 model trials burned $25.76 in inference. Among scored trials, average cost ran from $0.15 for DeepSeek through $1.01 for GLM to $3.07 for Kimi, a roughly 20× spread. The ordering does not line up neatly with quality, either. Kimi solved the most tasks of any model, 5 of 6, but four of its six trials ran out the clock getting there and it was the most expensive per scored trial. DeepSeek never timed out once and cost about a twentieth as much, yet shipped two rubric-perfect implementations that failed at runtime. At one sample per cell, all of that is a fact about this job, not a stable price-performance verdict.

## What changes because of this result

The benchmark has already given us a concrete queue of work.

First, we will diagnose the shared projects runtime 500 and determine whether the friction lives in the guidance, the task, or Open Mercato itself. We will add an interactive browser test for the projects backoffice so runtime behavior is covered beyond route rendering.

Then we will run at least three attempts per cell and report uncertainty before comparing models or estimating the effect of agent guidance. We also want oracle and negative-control validation enforced in CI for every published task digest, plus immutable model and provider revisions where hosts expose them.

Finally, we will expand the matrix: more independent Open Mercato mechanisms, frontier models as a separate quality-and-cost reference, and the same frozen protocol repeated across platform releases.

The frozen protocol is what makes the rest worth doing. Fix the projects seam, ship the next release, rerun the same tasks, and the benchmark tells us whether the fix actually made agents more reliable, or just moved the failure somewhere else.

## Add a task and make the benchmark harder

Three feature families are a start, not coverage. We want tasks for widgets, search, internationalization, subscribers, background work, reporting, imports, and larger vertical slices. The parked followups and helpdesk tasks also need contributors to bring them into the active matrix.

Each benchmark task is a small, reviewable package:

```
evals/tasks/app-OME-FEAT-0XX/
├── instruction.md        # the feature request shown to the agent
├── task.toml             # Harbor configuration and time budget
├── environment/          # the standalone app and services
├── tests/                # hidden behavior tests and convention rubric
└── solution/solve.sh     # the hidden oracle proving a solution exists
```

A good contribution adds a done-state feature request without leaking the tests, verifies behavior through HTTP or a browser, checks conventions without requiring one exact file layout, and includes an oracle that passes the complete verifier.

> **Contribute:** This benchmark is open, and we would genuinely love your help building it out. Every task you add, especially one that exercises a mechanism we have not covered yet, sharpens the instrument for everyone building on Open Mercato. If you hit a rough edge worth encoding, or you just want to see how your model of choice handles a real feature, we would love a pull request at [github.com/open-mercato/open-mercato-evals](https://github.com/open-mercato/open-mercato-evals).

The [full benchmark report](https://github.com/open-mercato/open-mercato-evals/blob/main/evals/reports/benchmark-v1.md) contains the per-cell scores, costs, limitations, evidence manifests, and reproduction commands. The [contributor guide](https://github.com/open-mercato/open-mercato-evals/blob/main/evals/AGENTS.md) explains how to add and validate a task.

No model won the first run, and that is fine. It handed us a repeatable way to watch where agents fall off Open Mercato’s paved path, and a single convention-perfect 500 to chase down before the next release ships.

**Method.** Single job `2026-07-18__16-46-17`, run 18 July 2026: 24 trials, 6 oracle and 18 model, one attempt per cell. Open Mercato `0.6.6` · Harbor `0.18.0` · OpenCode `1.17.8` · `moonshotai/kimi-k3`, `z-ai/glm-5.2`, `deepseek/deepseek-v4-pro` via OpenRouter. Every cell shares the same task digests, environment build, and verifier revision. Per-cell scores, costs, the full limitations list, and the evidence manifests are in the [benchmark report](https://github.com/open-mercato/open-mercato-evals/blob/main/evals/reports/benchmark-v1.md).
