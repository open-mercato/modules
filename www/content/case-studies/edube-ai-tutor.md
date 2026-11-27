---
webflowId: 6abb98f9b0351c01f1ea7e0f
title: 'EduBe: an AI tutor built around understanding'
heading: 'EduBe: an AI tutor built around understanding'
description: A convincing answer is not the same as learning. Full Stack House built EduBe around a student’s understanding, connecting chat, voice and adaptive exercises to a persistent knowledge map on Open Mercato.
thumbnail:
  src: /media/case-studies/6af1fadaee6670759c32ef3e-6af1faba78d03f466bc65cbc-edube-cover.jpeg
  alt: EduBe AI tutor displayed on a laptop against a purple and lime studio background
deliveredBy: full-stack-house
overview:
  client: EduBe
  industry: EdTech · AI
  timeline: 2026, live with students and in active development
  type: Consumer learning platform (AI tutor)
  stack: |-
    - Open Mercato backend: modules, admin, background jobs
    - Next.js, TypeScript, MikroORM + PostgreSQL with pgvector, Meilisearch
    - OpenAI Realtime for voice tutoring, with tool-driven lesson state: progress, mastery checks, illustrations
    - LLM-generated diagnostics, tests, flashcards and fill-the-gap exercises, graded automatically
    - Per-student AI usage metering on the `telemetry` module, now in Open Mercato core
stats:
  - title: ~30 subjects
    description: Mapped into a knowledge tree, with proficiency tracked per topic
  - title: Chat + voice
    description: One tutor on two channels, both used by students today
  - title: 1 core module upstream
    description: Telemetry and observability contributed back to Open Mercato (OpenTelemetry, any OTLP backend, off by default)
screenshots: []
categories:
  - software-house
  - edtech
featuredOnAgencies: false
draft: false
---

## The answer is only the beginning

An AI can explain a school topic in seconds. The harder question comes afterwards: did the student understand it, or did the explanation simply sound convincing?

That distinction sits at the centre of EduBe, a learning platform for Polish teenagers preparing for the matura, the national school-leaving exam. The product needs to do more than keep a conversation going. It needs to discover gaps, check understanding and decide what the student should work on next.

Full Stack House built the tutoring engine, backend and student application on Open Mercato. EduBe is already used by students and remains in active development. Its central design choice is to connect every lesson to a model of what the learner knows.

<figure><img src="/media/case-studies/6af2d0b14c918da2c831c279-6af2d009d2be3d8ec699ccd8-edube-ai-tutor-3-gradient-clean.jpeg" alt="The tutor uses diagnostic questions to guide the student toward the answer" /><figcaption>EduBe’s tutoring conversation. Questions and explanations are part of the same lesson.</figcaption></figure>

## A tutor that asks the next question

EduBe follows a Feynman-style approach: explain an idea in plain language, ask the student to work with it, then use the response to choose the next step. A fluent answer from the tutor is not treated as proof that learning has happened.

The conversation can move from an explanation to a diagnostic question, and from that answer to another explanation or exercise. When a concept needs a visual, the tutor can draw a diagram inside the lesson. The aim is to make the student's reasoning visible enough for the product to respond to it.

This turns the chat interface into one part of a learning workflow. The engineering challenge is keeping the lesson, the checks and the student's progress connected as that workflow changes direction.

## Give every conversation a place in the curriculum

Behind the tutor is a knowledge tree covering about 30 subjects. Each subject is divided into small topics, called atoms, with proficiency tracked for each student at that level.

That structure gives an individual question context. The product can associate a response with a specific topic rather than leave it buried in a chat transcript. A student's learning path can then reflect what the assessment revealed.

For the team, the knowledge tree is also a concrete domain to build around: topics, relationships, assessments and progress have to persist beyond a single conversation. It is the connection between those records and the tutor that makes the product more than a prompt wrapped in a chat window.

<figure><img src="/media/case-studies/6af2d0b14c918da2c831c26d-6af2d00c25bad80337bd291c-edube-ai-tutor-4-gradient-clean.jpeg" alt="A knowledge tree turns the curriculum into a structured, adaptive lesson plan" /><figcaption>The knowledge tree breaks subjects into smaller topics and gives lessons a persistent structure.</figcaption></figure>

## Make the check part of the lesson

EduBe generates diagnostics, tests, flashcards and fill-the-gap exercises with an LLM. Answers are graded automatically and feed back into the learning path. Spaced-repetition flashcards add a way to revisit material over time.

The important loop is explanation, response, assessment and adjustment. Generating a question is useful only if the result reaches the part of the system deciding what comes next. EduBe keeps those learning activities connected to the same student and topic model.

<figure><img src="/media/case-studies/6af2d0b14c918da2c831c288-6af2d00d8f2eeccf9ee13165-edube-ai-tutor-6-gradient-clean.jpeg" alt="Quick mastery checks are embedded directly into each lesson" /><figcaption>A mastery check inside EduBe. Assessment results feed back into the student’s learning path.</figcaption></figure>

## Let students speak, without losing the lesson

The same tutor is available through chat and real-time voice, with OpenAI Realtime supporting the spoken experience. Students can work through an idea by talking as well as typing.

A voice interface adds its own operational questions. The team needs to understand what happened during a session, where it stalled and how much AI usage it generated. The lesson still needs progress, mastery checks and supporting illustrations, whichever channel the student chooses.

<figure><img src="/media/case-studies/6af2d0b14c918da2c831c27c-6af2d00ecccbe0e5d3ae7b3c-edube-ai-tutor-7-gradient-clean.jpeg" alt="Real-time voice mode lets students work through a topic out loud" /><figcaption>Real-time voice is another way into the tutoring workflow, alongside text chat.</figcaption></figure>

## Build the learning system on an existing foundation

Open Mercato supplied authentication, module APIs, the admin panel, background jobs, migrations and the data layer. Full Stack House built the tutoring sessions, knowledge tree and assessments as application modules on top.

Those are education concepts, with their own relationships and behaviour. The team could model them directly without changing the core to host the product. Engineering effort could go into the decisions that shape the learning experience: what to ask, what a response means and what the tutor should do next.

## A product need became a shared capability

Running an AI tutor also made observability a product requirement. Full Stack House built a telemetry module to inspect sessions and meter AI usage, then contributed the capability back to Open Mercato.

The OpenTelemetry-based module supports OTLP backends and is off by default. Its design includes redaction at the provider boundary. The contribution was [merged into Open Mercato in August 2026](https://github.com/open-mercato/open-mercato/pull/4475), making the underlying capability available to other applications.

EduBe shows where a reusable foundation creates room for specialised work. The framework handles the common application structure; the team builds the learning model, the tutoring loop and the operational visibility its product needs. [Read Full Stack House’s account of the build.](https://www.fullstack.house/results/edube)
