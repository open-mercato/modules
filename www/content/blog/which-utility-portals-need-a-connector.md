---
webflowId: 6b054b20c3c1efb5dbe20d07
title: Which utility portals are worth building a connector for?
description: Deepki kept its busiest utility feeds in-house and handed roughly 300 others to a browser-agent provider. Its test starts with the cost of getting one usable bill.
date: '2026-11-24T08:30:00.000Z'
category: architecture
featured: false
thumbnail:
  src: /media/blog/6b054dc603b2871defdb170f-6b054d8b448f20a7895f02e8-om-deepki-cover.webp
  alt: Deepki case-study cover artwork from Deck, with the white Deepki logo on teal.
draft: false
---

Deepki processes about six million invoices a year across its sustainability platform. It still decided that roughly 300 utility data sources were someone else’s job. Its engineers kept the busy feeds. For the utilities that supplied fewer bills, Deepki hired Deck to retrieve them from the providers’ websites. What made a portal worth maintaining was how often its bills arrived and what it cost to keep them coming. [Deck’s case study with Deepki](https://www.deck.co/customers/deepki)

## Time the trip from credentials to the first bill

Take a property manager adding a building to a portfolio. Someone with access connects the building’s utility account. In Deck’s documented workflow, a browser agent signs in, opens the billing section and retrieves the original PDF. The receiving application gets fields such as the account, amount due and due date. A person can now check a disputed amount against the same statement the utility issued. [Deck’s bill retrieval walkthrough](https://deck.co/use-cases/bill-fetch)

<figure><img src="/media/blog/6b054dc603b2871defdb1736-6b054d8ba99cb2be422e80b4-om-deepki-bill-ingestion.png" alt="Deepki’s Invoice PDF drop dialog offers AI reading when the operator cannot find the utility provider." width="1020" /><figcaption>When a provider is missing, Deepki gives the operator another way to enter the bill: upload the PDF, then review the fields extracted by AI. <a href="https://www.deepki.com/data-management/">Screenshot from Deepki</a>.</figcaption></figure>

Deepki had built its own scrapers. Every new utility meant engineering time up front and another site to revisit when the portal changed. Its team compared the days needed to build each connector, recurring maintenance, annual document volume and cost per document. In a proof of concept it timed the interval from receiving credentials to getting the first data. Deck reports that difficult, lower-volume sources went live in days where they had taken months. That figure measures onboarding. Deepki’s six million annual invoices cover its whole platform. [Deepki’s evaluation and results](https://www.deck.co/customers/deepki)

On November 23, Deck announced that engineers can start tasks and inspect a failed run’s screenshots and browser logs from its command-line tool or a connected coding assistant. Access follows the signed-in user’s Deck role. That gives an engineer evaluating the next portal a practical test: run it with an authorized account, then see what evidence the on-call engineer would get if the fetch stopped working. [Deck’s November 23 release notes](https://www.deck.co/changelog)

## Make both routes hand over the same bill

For a team building this workflow on Open Mercato, the useful piece is Data Sync. It tracks import runs and their outcomes. A provider adapter supplies the mapping and the code that reads the external source. That gives the team one place to check whether the import ran, whichever route collected the bill. [Data Sync module](https://modules.openmercato.com/built-in/data_sync) · [Provider adapter interface](https://github.com/open-mercato/open-mercato/blob/main/packages/core/src/modules/data_sync/lib/adapter.ts)

Suppose one utility sends a file directly and a second delivers its statements through a browser service. You could build an adapter for each and have both produce the fields your operations team needs: utility account, billing period, amount, currency and a reference to the original statement. Your team owns the adapters and the rule that maps a utility account to a building. It also decides what happens when a utility reissues last month’s bill. Give the reviewer both versions and a way to mark which one supersedes the other. A successful download alone cannot make that decision.

A shared import format makes it cheaper to switch retrieval providers. It also makes it easy to discard a field that only one utility supplies. If two meters share a billing account, losing the meter identifier can leave operations with the right total and no way to allocate it. Ask the person who reconciles the bill which identifiers must survive before you settle on the mapping.

## Price one portal before approving the next connector

At the next planning meeting, pick one utility from the integration backlog. Count last year’s bills. Estimate a year of connector work, including time spent repairing it, and divide that cost by the number of statements operations could reconcile. Price the browser route on the same basis, including human review. Then try a corrected bill through both. If a route delivers two plausible totals and nobody can identify the current one, count the time it takes to settle that question. That is part of what the connector costs.
