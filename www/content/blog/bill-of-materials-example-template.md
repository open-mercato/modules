---
title: What is a bill of materials? An editable BOM example
description: Build a bill of materials for a gift box. Change the batch size, component quantities, and costs, then download your BOM as a CSV.
date: '2026-11-26T00:00:00.000Z'
category: tools-templates
featured: false
thumbnail:
  src: /media/blog/6b08ba1d1e8c6a2ea3545c67-6b08b99fb23a3251c1a58a40-om-guide-bom.jpeg
  alt: ''
  decorative: true
draft: false
---

A bill of materials (BOM) lists the parts and quantities needed to make one finished item. If one gift box contains two coffee pouches, a carton, a card, and a seal, a run of 100 boxes needs 200 pouches and 100 of everything else. Change the batch size below to see the quantities and cost, or replace the components with your own.

<om-embed name="blog-bill-of-materials-example-template-1"></om-embed>

## Read one BOM from top to bottom

The finished item is the parent. Each component beneath it has a name or part number, a quantity per parent, and a unit of measure. At $2.40 per pouch, the two pouches contribute $4.80. Add $0.85 for the carton, $0.20 for the card, and $0.15 for the seal. That is $6 of material per box and $600 for 100 boxes.

Now change the batch to 250. The product still costs $6 in materials per box. The required pouches increase to 500 and the batch materials cost becomes $1,500. If cartons arrive in packs of 100, purchasing may order 300 cartons. The recipe still consumes 250. Keep purchase packs and component consumption separate so the remaining 50 cartons stay visible as stock.

## When one level is enough and when it breaks down

A single-level BOM works for the gift box because you buy the pouches ready to pack. If you roast and pack the coffee yourself, each pouch needs beans, a bag, and a label of its own. A multi-level BOM lets you expand that subassembly while keeping the outer gift-box recipe readable.

Material cost is only one input to a selling price. The worksheet excludes labour, scrap, freight, overhead, and tax. For a production run, record the expected loss separately and compare the actual issue of materials against the plan. A recipe that calls for 500 pouches cannot tell you why 508 left the storeroom.

## How to keep a BOM useful after the first batch

Give the finished item and its components stable identifiers. Record which revision was used for a particular run. If a buyer swaps in a larger carton next month, the team still needs to know which carton was used in yesterday's shipment. Before reordering, compare the batch requirements with available stock and confirmed inbound deliveries.

<figure><img src="/media/case-studies/6af2d0b14c918da2c831c296-6af2d0178940a4595efed73a-tracecore-3-gradient-clean.jpeg" alt="TraceCore recipe module view" /><figcaption>The recipe view in TraceCore connects finished goods to their component materials.</figcaption></figure>

TraceCore connects recipes, production tasks, material consumption, and supplier lots on Open Mercato. It shows what an editable BOM becomes once the question changes from “What will this batch need?” to “What actually went into it?” [See TraceCore's production workflow.](/case-studies/tracecore)
