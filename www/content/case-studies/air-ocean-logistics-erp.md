---
webflowId: 6a2b04a3011ec6dfa928b9c1
title: Air & Ocean Logistics ERP - built in 6 weeks
heading: Air & Ocean Logistics ERP - built in 6 weeks
description: A fully owned logistics platform covering CRM, cost control, and live vessel tracking. No license fees, no lock-in.
thumbnail:
  src: /media/case-studies/6a2b160c10b9c251decd7477-senior-care-operations.avif
  alt: ''
  decorative: true
deliveredBy: freighttech
overview:
  client: Amazon
  industry: Air & Ocean Logistics
  timeline: 6 weeks
  type: Custom ERP
  stack: |-
    - Open Mercato
    - Next.js
    - TypeScript
    - PostgreSQL
stats:
  - title: 6 weeks
    description: From kickoff to production
  - title: €0
    description: In ongoing license fees
  - title: 1 platform
    description: Replaced 3 separate tools
screenshots: []
categories:
  - erp
  - multi-tenancy
  - track-trace
featuredOnAgencies: false
order: 1
draft: true
---

## The challenge

FreightTech.org coordinated air and ocean shipments across multiple carriers - but their operations were held together with spreadsheets, email threads, and a legacy TMS they couldn't modify or extend. Every quote request kicked off a manual back-and-forth: someone pulled rates from three different carrier portals, assembled them in a spreadsheet, and emailed a PDF to the client. No tracking, no version history, no single source of truth.

Cost control was just as fragile. Estimated freight costs lived in one spreadsheet, actual invoices came in separately, and reconciling the two happened - when it happened at all - at the end of the month. Margin visibility was essentially zero until the job was closed.

The compliance requirements made everything harder. With regulated enterprise clients coming into the pipeline, the team needed demonstrable per-tenant data isolation, field-level encryption, and a full audit trail. None of that existed. Building it from scratch while also shipping the core product wasn't realistic - the team had three developers and a hard six-week deadline before a key client went live.

## The solution

The team cloned Open Mercato and had a working local environment before the end of day one. That alone changed the dynamic - instead of spending the first two weeks setting up auth, multi-tenancy, RBAC, and a database schema, they skipped straight to logistics-specific logic.

Weeks 1-2 shipped a functional CRM with automated quote handling. Incoming price requests, previously managed over email, were now parsed and attached to the correct company record automatically. Sales reps had a single pipeline view across all active quotes, with status tracking and follow-up reminders built in.

Weeks 3-4 were cost control. A new module tracked estimated vs. actual freight costs at the shipment level - pulling in carrier invoices, comparing them against the quoted rates, and surfacing margin alerts when the gap exceeded a configurable threshold. For the first time, the operations team had real-time visibility into job profitability without waiting for month-end reconciliation.

The final two weeks went to the integration layer. Live Track & Trace was connected to major shipping lines and AIS vessel positioning data, with status updates surfaced directly in the shipment record. Operators no longer needed to log into three separate carrier portals to answer the question "where is this container right now?"

Security landed without custom code. Open Mercato's built-in encrypted vault handled per-tenant field-level AES-GCM encryption - meaning DBAs couldn't read client PII even with direct database access. The audit trail, required for regulated environments, came out of the framework by default.

## The result

FreightTech.org went live in exactly six weeks. What had been a fragmented stack of spreadsheets, a legacy TMS, and a pile of email threads was replaced by a single platform covering the full operational cycle - from first contact and automated quoting, through shipment execution and real-time cost tracking, to live vessel positioning data in the same interface.

The compliance requirements that had been blocking enterprise deals were met before launch. Per-tenant encryption, full audit trail, and RBAC were production-ready on day one - not bolted on afterward.

Perhaps most importantly: they own the codebase. No per-seat SaaS pricing, no vendor negotiations, no risk of a feature disappearing in a roadmap update. The platform runs on their infrastructure, the team can extend it freely, and the Open Mercato core can be updated independently of their custom logic.
