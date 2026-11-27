---
webflowId: 6b054f6b0b3a7e43bed86da8
title: A CEO built a store in a weekend. Would you open it on Monday?
description: A nontechnical CEO can build a storefront. What would let the team keep that work, put it in front of customers, and change it again next week?
date: '2026-11-24T00:00:00.000Z'
category: ai-engineering
featured: false
thumbnail:
  src: /media/blog/6b054f816bbecd7059a8f733-6b054efe780ae3c534179925-weekend-store-cover.jpeg
  alt: A drawing of a storefront becomes a paper shop with a blue awning. A pair of brass keys rests beside the door.
draft: false
---

A nontechnical CEO built an ecommerce store in a weekend. That really happened. If you were the engineering lead on Monday morning, what would you ask to see before inviting the first customer?

We hear a lot at Open Mercato about “development democratization” and “decentralized tooling.” Everyone should be able to ship. Our reservation is what sometimes happens to the person who did the building. They get the checkout to behave exactly as they intended, hand it over, and hear, “Great, now we know what to build.” They’ve made a very elaborate Figma file. The most important decision about the tool was made after they left the room.

Take one small part of that storefront: the _My account_ page. The person who runs the business can tell you which fields a shopper should be able to edit and which changes warrant a call to support. Give them room to get that right. But why should they also have to know how the database decides whose email address to send to the browser?

## What the researchers found on 7,403 websites

Crissy Field identified 159,041 Lovable projects in a public web archive. Of those, 34,545 used Supabase. The researchers narrowed their study to 24,664 sites that returned database records to a visitor who hadn’t signed in. Public product catalogs can do that by design. On closer inspection, 7,403 of those sites had readable records containing email addresses. Some could have been public contacts or test data. The sample cannot tell us how often Lovable apps in general expose private data. [Crissy Field’s findings and limitations](https://www.crissyfield.de/research/lovable-en/)

One finding matters more to a shop owner than the percentage. Across several event organizers and restaurants, the researchers could read sales records that included contact details and ticket codes without logging in. Imagine the acceptance test for a ticket shop: buy a ticket, receive the confirmation, show the code at the door. Every step could pass while someone else could still read the ticket. Lovable now documents a basic security scan at publish time and an admin setting to block publication on critical findings. The shop still has to say who is entitled to see each ticket. [Research report](https://www.crissyfield.de/research/lovable-en/) · [Lovable’s current publishing controls](https://lovable.dev/security)

## Give the builder one less decision to get wrong

Lauren Tan gave a practical example in her AI Engineer talk this November. Her team builds an Electron desktop application. A developer working on the interface could accidentally import code meant to run in the app’s main process. They gave each side its own directory and added a check that rejects a dependency across the boundary. A new contributor can make a useful change without first learning the history of that particular mistake. [Lauren Tan’s talk and examples](https://ai.engineer/code/2026/talks/lauren-tan)

<figure><img src="/media/blog/6b054f826bbecd7059a8f737-lauren-tan-3835.jpeg" alt="Lauren Tan’s slide puts codebase design and static analysis above written instructions and human review." /><figcaption>Tan puts codebase design and automated checks at the widest end of her trust pyramid. <a href="https://ai.engineer/code/2026/talks/lauren-tan">Slide from AI Engineer CODE 2026</a>.</figcaption></figure>

Here’s what that idea looks like on our account page. Open Mercato already has a customer-profile handler. When a shopper opens their profile, the server takes the customer’s identity and tenant from their authenticated session. A signed-out request gets no profile. When the shopper saves a change, the handler checks their account-management permission before applying the update. The person building the form can change its layout and wording without having to tell the server whose profile to load. [Open Mercato’s customer-profile implementation](https://github.com/open-mercato/open-mercato/blob/main/packages/core/src/modules/customer_accounts/api/portal/profile.ts)

That boundary also shows where the work still is. Say the CEO wants a purchasing manager to edit colleagues’ details. That’s a sensible request for a wholesale store, and it changes who may act for whom. The team needs to decide who appoints the manager, which colleagues they may edit, and what happens when the manager leaves. Putting a new button on the existing form is the easy part. An engineer has a specific policy to implement, and the CEO can keep the storefront they built around it.

This is where we’re taking Open Mercato. We want someone who knows the business to be able to keep changing the application after the engineers have helped open it. We’re working on making that easier for nontechnical builders and hope to show what we mean in about a month. Our [earlier piece on Ramp](/blog-posts/when-sales-reps-build-their-own-tools) looks at the next question, when several people inside one company start building this way.

## What to ask for on Monday

Give the builder two fictional customers, each with a different email address. Ask them to change the name field on the account page. Then have them show you what a signed-out visitor, the first customer and the second customer can each see and change. Ask the engineer who will maintain the store to point to the check that will still enforce those answers after next weekend’s edit. If both people can do their part on the same codebase, keep the code. That’s a weekend you don’t have to buy twice.
