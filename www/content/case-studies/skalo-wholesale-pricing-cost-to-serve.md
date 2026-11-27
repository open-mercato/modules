---
title: How Skalo found 248 wholesale invoices priced below cost
heading: How Skalo Pricing Desk finds the true cost of a wholesale order
description: A wholesaler’s ERP flagged one loss-making invoice out of 6,364. Skalo found 248 after including the cost of serving each order. The distributor’s sales reps now use Pricing Desk to see how much room they have before they quote.
thumbnail:
  src: /media/case-studies/6b08b3b3874e9246335aba49-6b08b36beb12147846348c0d-skalo-before-after-usd.webp
  alt: ''
  decorative: true
overview:
  client: B2B wholesale distributor
  industry: Wholesale distribution
  timeline: Built in September 2026. Used by the distributor’s sales team for customer quotes.
  stack: |-
    - Open Mercato pricing engine and distributor workspace
    - Product catalogue, customer records, quotes and sales orders
    - Basket pricing, margin rules and historical invoice comparisons
stats:
  - title: 6,364 invoices
    description: Historical wholesale invoices reviewed using data from the distributor’s ERP
  - title: 1 → 248
    description: The ERP flagged one invoice below cost. Including service costs brought the count to 248.
  - title: 11.6%
    description: Order lines with room for a lower price at the same profit in a separate 150-order sample
screenshots: []
categories:
  - erp
featuredOnAgencies: false
draft: false
---

## What do two bottles cost to sell?

Two bottles of dishwashing liquid fit in the corner of a carton. Order them on their own and someone still takes the order, picks the bottles, packs them, issues the paperwork and gets them to the customer. Add them to a delivery with eleven other product lines and much of that work is already paid for.

Skalo priced both baskets using a wholesale distributor’s data. On their own, the two bottles cost the distributor **$8.29** to sell. In a 12-line order, the cost allocated to the same pair was **$6.15**. Sharing the order costs across twelve product lines cut the cost for the pair by **nearly 26%** before the rep offered a discount.

<figure><img src="/media/case-studies/6b08b3b4874e9246335aba5e-6b08b36c4ed5685ab88a51cc-skalo-basket-comparison-usd.webp" alt="Cost allocated to two bottles of dishwashing liquid in Skalo’s comparison. The pair costs $8.29 on its own and $6.15 as part of a 12-line wholesale order." /><figcaption>Skalo calculated PLN 33.84 for the pair alone and PLN 25.13 in the larger order. The dollar amounts use the <a href="https://api.nbp.pl/api/exchangerates/rates/a/usd/2026-11-26/?format=json">National Bank of Poland’s exchange rate for 26 November 2026</a> of PLN 4.0835 per US dollar.</figcaption></figure>

## The invoice report had one red flag

The distributor’s ERP already knew what it paid its suppliers and what it charged its customers. Using those two figures, it flagged one loss-making invoice in a set of **6,364**. Time spent taking orders, warehouse work and the cost of getting goods to the customer sat elsewhere in the business.

Skalo included those costs and ran the numbers again. Now **248 invoices** fell below cost, or 3.9% of the set. The smallest orders stood out. In the team’s analysis, four out of five invoices below PLN 100 failed to cover their costs. Almost every invoice above PLN 1,200 covered its costs.

<figure><img src="/media/case-studies/6b089d96f429bbf5fc7a9854-6b089c6f5214eee1001d1a4e-skalo-invoice-margin-analysis.webp" alt="Of 6,364 historical wholesale invoices, the ERP flagged one below cost. Including service costs brought the count to 248." /><figcaption>Skalo applied both calculations to the same historical invoices. The extra costs changed the picture most sharply on small orders.</figcaption></figure>

## What a rep can offer when the buyer asks for a discount

The distributor’s sales team now uses Skalo Pricing Desk on Open Mercato when preparing customer quotes. A rep selects the products and quantities, then sees what the whole order costs to serve. The desk includes picking, packaging, warehouse occupancy and the delivery stop. It also shows when the proposed price falls below the distributor’s margin floor.

<figure><img src="/media/case-studies/6b08a3241e8c6a2ea34f213d-6b08a2df42aad97b1e7b547b-skalo-margin-calculator-screenshot.webp" alt="Skalo’s Margin calculator shows three products, net profit, margin, full cost and the option to save the basket as a quote in Open Mercato." /><figcaption>Skalo’s Margin calculator, running locally on a sample order. The rep can see the profit on the basket and how far each unit price can come down before saving the quote. <a href="https://cdn.prod.website-files.com/69a97e33d587824eef365d84/6b08a3241e8c6a2ea34f213d_6b08a2df42aad97b1e7b547b_skalo-margin-calculator-screenshot.webp">Open the calculator screenshot at full size</a>.</figcaption></figure>

For the two-bottle order, the rep can try adding the pair to a larger delivery and compare the result. For another customer, switching from a phone order to a lower-cost ordering channel might create more room. The desk shows the effect on the buyer’s price and on the distributor’s profit in złoty. The rep chooses which option to offer. The agreed basket can become a sales quote or an order in Open Mercato with its product lines already filled in.

<figure><img src="/media/case-studies/6b08a3241e8c6a2ea34f213a-6b08a2df874e9246335931a0-skalo-price-advisor-screenshot.webp" alt="Two pricing suggestions in Skalo. The first lowers the unit price from PLN 80.18 to PLN 70.79 and raises whole-order profit from PLN 335.84 to PLN 466.15." /><figcaption>In this sample order, increasing one line from six bottles to twelve takes PLN 9.39 off the buyer’s unit price and raises the distributor’s profit on the whole order by PLN 130.31. <a href="https://cdn.prod.website-files.com/69a97e33d587824eef365d84/6b08a3241e8c6a2ea34f213a_6b08a2df874e9246335931a0_skalo-price-advisor-screenshot.webp">Open the pricing suggestions at full size</a>.</figcaption></figure>

## A better price for the buyer can still be a good sale

Skalo tested that proposition on a separate sample of 150 historical orders. Its analysis found that **11.6% of the order lines** could have been quoted at a lower price while preserving the same profit in złoty. Those lines represent room the team found in past orders. The comparison keeps the original invoice prices intact.

The calculation stays with the quote. Pricing Desk saves the inputs and the rates it used, so a colleague can reopen the calculation after delivery rates change and explain why the original price made sense. When the next buyer calls about two bottles, the rep has a practical question to ask before giving up any margin. Can they go on the next regular delivery?

[Skalo](https://www.skalo.pl/) built the pricing engine and distributor workspace for Open Mercato. [Explore the project on GitHub](https://github.com/KonradLitwinowicz/skaloHack).
