---
webflowId: 6aa17c440e840d0134af8d5d
title: 'Covo: one travel wallet, every balance accounted for'
heading: 'Covo: one travel wallet, every balance accounted for'
description: One balance for mobile data in 190+ countries sounds simple. Covo’s team built the ledger, eSIM lifecycle and operator workspace needed to keep that promise, on an Open Mercato foundation.
thumbnail:
  src: /media/case-studies/6aa17c420e840d0134af8cf4-6aa17b707e24478aefae5d70-covo-esim-wallet-card.png
  alt: Covo eSIM card showing the remaining wallet balance, ready to install
deliveredBy: full-stack-house
overview:
  client: Covo
  industry: Fintech · Travel / eSIM
  timeline: '2026'
  type: Consumer app + operator back office
  stack: |-
    - Open Mercato (wallet, billing, eSIM lifecycle, operator back office)
    - Next.js, TypeScript, MikroORM + PostgreSQL, Redis, Meilisearch
    - React Native apps (iOS + Android) over the Open Mercato API
    - Stripe (per-country VAT, Apple Pay / Google Pay), carrier provisioning API
    - Push via APNs + FCM: the `devices` / `push_notifications` modules now in Open Mercato core
stats:
  - title: 190+ countries
    description: Local-rate mobile data from one wallet balance
  - title: iOS + Android
    description: Both apps live in the stores, one Open Mercato backend behind them
  - title: 2 core modules
    description: Device registry and push notifications contributed upstream to Open Mercato
screenshots: []
categories:
  - software-house
  - fintech
featuredOnAgencies: false
draft: false
---

## A simple promise with a long memory

Top up once. Use mobile data abroad. Keep the balance for the next trip.

That is the experience Covo offers international travellers: one wallet for local-rate mobile data in more than 190 countries, with a balance that does not expire. Behind that simple promise is money that has to remain explainable after a trip is over, after a refund and after a carrier sends the same usage callback again.

Full Stack House delivered Covo’s backend, operator back office and the API behind its iOS and Android applications on Open Mercato. Both mobile apps are live. The build connects the experience a traveller sees to the records and controls the operating team needs behind it.

<figure><img src="/media/case-studies/6af2d0b14c918da2c831c276-6af2d0077efaf61368e70f1b-covo-travel-esim-wallet-1-gradient-clean.jpeg" alt="Covo app screens: wallet, home with eSIM card and savings, and family members" /><figcaption>Covo brings the traveller’s balance, eSIM and family controls into one mobile experience.</figcaption></figure>

## The balance had to be a record, not just a number

A wallet balance is easy to display. Explaining how it got there is the harder requirement.

Covo uses an append-only ledger denominated in EUR cents, while showing travellers their balance in their own currency. Changes are recorded as events instead of simply overwriting the latest total. Top-ups, data consumption and refunds belong to a history that can be reconciled.

The carrier integration is driven by webhooks and designed to be idempotent. If the same callback is retried, the system recognises that it has already been handled rather than treating it as another charge. That detail matters directly to the product promise: a traveller should not need to understand a carrier’s retry behaviour to trust the balance on screen.

<figure><img src="/media/case-studies/6af2d0b14c918da2c831c285-6af2d008e6c1556584ee8dbf-covo-travel-esim-wallet-6-gradient-clean.jpeg" alt="The apps and the back office over one Open Mercato backend, with the append-only ledger at the centre and Stripe, the carrier, edge DNS and push outside the boundary" /><figcaption>Covo’s backend architecture places the wallet ledger alongside payments, eSIM operations and the back office.</figcaption></figure>

## Keep the complicated parts behind a familiar action

For the traveller, adding money can be a quick Apple Pay or Google Pay action through Stripe. Behind it, the system handles payment records, refunds and VAT according to the country of top-up.

The eSIM lifecycle introduces another set of events: provisioning a connection, receiving usage information and keeping the wallet in step as data is consumed abroad. Low-balance push notifications bring the relevant information back to the user.

These are separate services, but they participate in one customer experience. Covo’s custom modules connect the money and connectivity workflows, while the mobile apps present the result as a wallet people can use without navigating the underlying systems.

## One family balance still needs individual boundaries

Sharing a wallet changes the design problem. A parent needs a useful overview of the family pool while keeping control over how individual members use it.

Covo supports a shared balance with per-member caps. Parents can also enable network-level content filtering for a child’s eSIM. Those controls sit alongside the balance and top-up experience, so family management is part of the product rather than a separate operator task.

<figure><img src="/media/case-studies/6af2d0b14c918da2c831c290-6af2d007f171b4f0c71cfea0-covo-travel-esim-wallet-4-gradient-clean.jpeg" alt="Covo home, wallet and family controls shown together" /><figcaption>Home, wallet and family screens. The shared pool is paired with individual controls and child eSIM safety settings.</figcaption></figure>

## The product includes the people running it

A consumer app still needs an operational workspace. Someone has to review a wallet, handle a refund, maintain country pricing or understand which promotion a customer used.

Covo extends Open Mercato’s admin with modules for consumers and wallets, invoices and refunds, pricing, bonus tiers, invite codes and targeted push notifications with deep links. Support, finance and growth can work from the same console.

This is where the customer-facing promise becomes manageable day to day. The app lets someone buy and use connectivity; the back office gives the team access to the records and actions behind that experience.

<figure><img src="/media/case-studies/6af2d0b14c918da2c831c293-6af2d008a69eb6564dff5508-covo-travel-esim-wallet-5-gradient-clean.jpeg" alt="Covo's team console on Open Mercato's admin. Figures and menu labels are masked" /><figcaption>The operator workspace brings wallet, billing and growth operations together. Existing masking is retained in the product visual.</figcaption></figure>

## Spend engineering effort on the wallet and eSIM lifecycle

Open Mercato supplied authentication, tenancy, audit logging, the admin interface, module APIs, search and background jobs. Full Stack House used that foundation to build Covo’s financial and connectivity logic as application modules.

The distinction is practical. A wallet ledger still requires deliberate design, and an eSIM integration still needs its own lifecycle rules. Starting with an existing application foundation lets those product-specific decisions receive the attention they need.

## Mobile push became part of the foundation

The project also produced reusable infrastructure. Full Stack House contributed the `devices` and `push_notifications` modules to Open Mercato, including a device registry, delivery log, retries, user preferences and adapters for FCM, APNs and Expo.

The contribution was [merged in August 2026](https://github.com/open-mercato/open-mercato/pull/5366). Covo gained the mobile capability its product needed, and other teams gained a foundation for their own notification workflows.

The result is a live consumer product and an operator system built around the same durable records. The interface makes travel connectivity feel simple; the ledger and operational workflows make that simplicity supportable. [Explore Full Stack House’s account of the architecture.](https://www.fullstack.house/results/covo)
