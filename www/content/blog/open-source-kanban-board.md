---
title: Open source Kanban board
description: Add cards, rename columns, and drag work between stages. Take your board into an Open Mercato sandbox when you’re ready.
date: '2026-11-26T00:00:00.000Z'
category: tools-templates
featured: false
thumbnail:
  src: /media/blog/6b08ba284a2d3bd8a546b83f-6b08b80761bb3b58d8644693-open-mercato-kanban-board-0-10-1.webp
  alt: ''
  decorative: true
draft: false
---

<om-embed name="blog-open-source-kanban-board-1"></om-embed>

## Inside Open Mercato’s sales Kanban board

The board above lets you sketch a workflow in this tab. In Open Mercato’s CRM, each column is a stage in a sales pipeline and each card is a deal. Moving the card updates the deal record for the team. Here is the sales board in version 0.10.1, running with fictional demo data.

<figure><img src="/media/blog/6b08ba284a2d3bd8a546b83f-6b08b80761bb3b58d8644693-open-mercato-kanban-board-0-10-1.webp" alt="Open Mercato 0.10.1 sales Kanban board showing Opportunity, Marketing Qualified Lead, Sales Qualified Lead and Offering with demo deal cards" /><figcaption>The actual Open Mercato sales pipeline with six fictional deals in the selected pipeline. Capture from version 0.10.1.</figcaption></figure>

[Open the full-size screenshot.](https://cdn.prod.website-files.com/69a97e33d587824eef365d84/6b08ba284a2d3bd8a546b83f_6b08b80761bb3b58d8644693_open-mercato-kanban-board-0-10-1.webp)

## What you can read from a card

Look at **Midwest Outfitters Expansion** in the Opportunity column. The card shows a value of $210,000, a probability of 35%, and a linked company. The lane header shows one deal and $210k. That number is the face value of the deal. Multiplying by the displayed probability would give $73,500, which is a different forecast.

The next lane, Marketing Qualified Lead, is empty. Sales Qualified Lead contains the $145,000 Wanderstay deal. A manager can see the gap and open the underlying cards before deciding whether the team has a sourcing problem or simply uses these stages differently.

## How to use the board in Open Mercato

1. In the back office, open **Customers → Deals → Sales Pipeline** and select **Kanban**. The screenshot uses the Default Pipeline. If your installation has several, select the one you want to review.
2. Use **Quick deal** in a lane to start a card there, or choose **New deal**. Pick a title other people will recognize and link the customer so the next owner can find the relationship.
3. Drag a card when the buyer has actually reached the next stage. Open the deal to record the call, decision, or next commitment that justifies the move.
4. Filter by owner, company, or close date for a focused review. Switch to **List** when you need to compare several records as rows.

## When this board is a good fit

Use it when the item moving across columns is a sales opportunity and the team needs its customer, value, and activity history. A delivery team that wants sprint planning, issue dependencies, or software release tracking should evaluate those requirements separately. This screenshot shows the CRM sales pipeline.

The Open Mercato core is MIT-licensed. You can inspect the implementation and run the starter locally. [Browse the source](https://github.com/open-mercato/open-mercato), [run your first Open Mercato app](https://docs.openmercato.com/), or [read the deals workspace guide](https://docs.openmercato.com/user-guide/customers/deals).
