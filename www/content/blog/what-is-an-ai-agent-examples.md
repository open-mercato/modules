---
title: What is an AI agent? Two decisions you can follow
description: Follow a tutoring decision and a sales-stage recommendation to see how an AI agent uses tools, what it can change, and where a person steps in.
date: '2026-11-26T00:00:00.000Z'
category: ai-engineering
featured: false
thumbnail:
  src: /media/case-studies/6af2d0b14c918da2c831c279-6af2d009d2be3d8ec699ccd8-edube-ai-tutor-3-gradient-clean.jpeg
  alt: ''
  decorative: true
draft: false
---

An AI agent is software that uses a model to choose a next step, take an allowed action, and use the result to decide what to do next. A good way to recognize one is to change a fact midway through the job. Does it inspect the new evidence and choose a different action?

## One student, two possible next questions

Imagine a student learning fractions. The tutor asks which is larger, one half or one third. “One half, because the pieces are larger” offers a different teaching opportunity from “one third, because three is bigger than two.” In the second case, asking the student to divide two equal shapes can reveal the misunderstanding. In the first, the tutor can move to a harder comparison.

Those lines are an illustrative lesson. In EduBe, a real tutoring platform built on Open Mercato, a tutor works over chat or voice, asks diagnostic questions and uses a knowledge tree to guide the lesson. The product keeps track of progress per topic. That state gives the next question context beyond the last sentence the student typed. [See EduBe's tutoring and mastery checks.](/case-studies/edube-ai-tutor)

<figure><img src="/media/case-studies/6af2d0b14c918da2c831c279-6af2d009d2be3d8ec699ccd8-edube-ai-tutor-3-gradient-clean.jpeg" alt="The tutor uses diagnostic questions to guide the student toward the answer" /><figcaption>EduBe asks a diagnostic question before choosing the next part of a lesson.</figcaption></figure>

## One stalled deal, two very different reasons

Two deals have sat in the same stage for 30 days. One buyer confirmed a pilot and is waiting for a start date. The other canceled the pilot and asked to revisit next quarter. A timer can reliably find both records. To propose the next sales stage, someone needs to interpret what happened.

The documented deal-health example in Open Mercato Enterprise reads deal context and returns a proposed stage, a rationale, and a confidence score. The proposal is useful even before anyone accepts it. A seller can inspect which activity the agent used and spot a newer conversation it missed. A confidence score by itself supplies no missing evidence.

In the example workflow, the approval policy can send the proposal to a person. That person can approve, edit, or reject it. A later step applies an accepted change. In Playground, a team can inspect the proposal and its trace while the deal stays at its current stage. [Follow the Agent Orchestrator example.](https://docs.openmercato.com/)

## How to decide whether your process needs an agent

Write down one decision in the job. Give two people the same inputs. If they can settle it with a fixed comparison, implement the rule and test its boundaries. A 12% discount against a 10% limit fits that pattern. If they read several pieces of evidence and can explain why one matters more, an agent may be able to propose that judgment.

Before handing it a live action, test three records: one obvious case, one ambiguous case, and one with the decisive fact missing. Keep the proposed action, the evidence used, and the human verdict. A useful answer on the third record may be a request for more information. [Try the discount workflow to compare a rule-driven decision.](/blog-posts/workflow-automation-discount-approval)
