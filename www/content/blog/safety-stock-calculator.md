---
title: Safety stock calculator with reorder point
description: Calculate a stock buffer and reorder point from daily demand and supplier lead time. See exactly how the estimate changes when deliveries run late.
date: '2026-11-26T00:00:00.000Z'
category: tools-templates
featured: false
thumbnail:
  src: /media/blog/6b08ba2de4cc7bcb3729e78f-6b08b9a06127ca30b1d9166e-om-guide-safety.jpeg
  alt: ''
  decorative: true
draft: false
---

Safety stock is the extra inventory you keep for a late delivery or a spike in demand. The reorder point is the stock position at which you place the next order. If you usually sell 20 units a day and replenishment takes five days, 100 units cover an ordinary wait. With the peak assumptions below, the buffer is another 140 units. You reorder at 240.

<om-embed name="blog-safety-stock-calculator-1"></om-embed>

## Where the two numbers come from

This calculator uses the maximum-minus-average method. **Safety stock = maximum daily demand × maximum lead time − average daily demand × average lead time.** The default example is (30 × 8) − (20 × 5), or 140 units. The reorder point adds expected lead-time demand back to the buffer. Here that is 100 + 140 = 240 units.

Try a ten-day maximum delivery time. The expected wait is still five days. The worst-case requirement rises from 240 to 300 units, so the buffer rises by 60 units. The calculator rounds the buffer up to a whole unit, then rounds the reorder point up if needed.

## Choose inputs that describe the same business

Use units per day and lead time in the same kind of day. If you use working days for demand, count working days from placing the order to the stock becoming available to pick. When a delivery sits in inspection for two days, those two days matter.

Review the period behind your maximum. One launch promotion may have produced the biggest sales day of the year. A port closure may have produced the longest delay. This method assumes both can happen together and that peak demand lasts for the entire delay. It can tie up more cash than you intend. For a target such as a 95% cycle service level, use a model based on the distribution of lead-time demand and backtest it against actual stockouts.

## When should you place the next order?

Suppose you have 180 units on hand, 100 confirmed inbound, and 20 backordered. Your inventory position is 260 units. With a reorder point of 240, the trigger has not yet fired. With no inbound order, the position would be 160. Minimum order quantities, case packs, shelf life, and available cash determine how much you actually buy.

In Open Mercato, the product's inventory profile holds reorder and safety-stock thresholds. The warehouse console shows stock by SKU and location. Before entering a number, check which quantity your particular alert uses and whether it accounts for incoming orders. [See the Open Mercato warehouse module.](/blog-posts/wms-module-open-source)
