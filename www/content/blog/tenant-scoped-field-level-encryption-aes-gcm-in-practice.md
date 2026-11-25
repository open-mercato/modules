---
webflowId: 69d000f864a3d281ed9855ab
title: Tenant-scoped field-level encryption (AES-GCM) in practice
description: How to use AGENTS.MD, Overlay, and Playwright to ship production-ready features without hallucinations.
date: '2026-04-04T00:00:00.000Z'
author: patryk-lewczuk
category: product-updates
featured: false
thumbnail:
  src: /media/blog/69cee6dc0b2bb62bee7f8784-placeholder-2.jpg
  alt: ''
  decorative: true
draft: true
---

## How to build your first module with AI agents and Open Mercato

Most developers using AI to write code hit the same wall: the first few prompts look great, but after 10 minutes the agent starts hallucinating folder structures, inventing imports, and breaking things it shouldn't touch.The problem isn't the AI. It's the lack of context and guardrails.Here's how Open Mercato solves this - and how to build your first module without any of that chaos.

## Why AI struggles with standard codebases

When you paste a task into Cursor or Claude without context, the agent makes assumptions. It doesn't know your folder structure, your naming conventions, or how your services are wired together. So it invents them.In a standard project, this means:

- generated code that doesn't match your existing patterns,
- imports that don't exist,
- logic scattered across files with no architectural consistency.

Open Mercato is built to eliminate this problem.

## The two things that make AI work reliably in Open Mercato

### AGENTS.MD

Every module in Open Mercato ships with an AGENTS.MD file - a machine-readable specification that tells your AI:

- the coding conventions for this module,
- the extensibility contract (what can be overridden and how),
- the patterns it should follow (Command Pattern, DI, Overlay).

Before you start any task, point your agent to this file. In Cursor, that's as simple as @agents.md. This single step eliminates most hallucinations.

### The Overlay System

Open Mercato uses an Open-Closed architecture: the core modules live in src/modules and are never modified. Your custom logic lives in src/apps.

This means your AI can't accidentally break the core - even if it tries. The Overlay is your safety net.

## Building a module: step by step

Let's say you need a simple Notifications module that triggers when a CRM deal is created.

### Step 1 - Initialize

```

```

After yarn mercato init you have a running environment with RBAC, sample data, and local databases. This is your baseline.

### Step 2 - Feed AGENTS.MD to your agent

Open Cursor, reference @agents.md, and ask:

"Based on the Open Mercato architecture, how should I structure a Notifications module that listens to the deal.created event?"

Let the AI explain the pattern before writing a single line of code. This is the Specification Loop - catch design gaps before generation starts.

### Step 3 - Generate with Overlay

Once the pattern is clear, ask the agent to generate the module in the correct layer:

"Generate the Notifications module in src/apps. Subscribe to the deal.created event. Follow the Command Pattern and DI conventions from AGENTS.MD."

The agent now has context, constraints, and a clear target directory. The output will fit your architecture.

### Step 4 - Verify with Playwright

Ask the AI to generate an E2E test:

"Write a Playwright test that verifies the Notifications module triggers correctly when a deal is created in the CRM."

Run it. If it passes, you're done. If it doesn't, you have a failing test - not a production bug.

## What you actually built

In under an hour, using AI to do most of the heavy lifting, you built a module that:

- follows the Open-Closed Principle (core untouched),
- is wired via Dependency Injection (replaceable, testable),
- communicates via events (loosely coupled),
- is verified by a Playwright test.

This is what AI-Assisted Engineering looks like when the foundation is designed for it.

## The honest note

This workflow requires you to understand the basics: what Dependency Injection is, why the Overlay matters, and how the Command Pattern works. If you're new to these concepts, start with the Architecture page before running prompts.

AI is fast. But the quality of what it generates depends on the quality of the structure it's working within.

Open Mercato provides that structure.
