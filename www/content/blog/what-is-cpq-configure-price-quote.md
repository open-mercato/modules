---
title: What is CPQ? Configure a machine and see its quote
description: Try configure, price, quote on a sample machine. Change an option, see the price and approval rule, then compare with the Arvo configurator demo.
date: '2026-11-26T00:00:00.000Z'
category: architecture
featured: false
thumbnail:
  src: /media/case-studies/6af74f9efc70cf53b1eaefe4-6af74ec5ce319b953e4f14ba-arvo-configurator.jpeg
  alt: ''
  decorative: true
draft: false
---

CPQ stands for **configure, price, quote**. A seller picks a version of a product, the system checks which options can go together and calculates the price, and the customer receives a quote for that exact configuration. The interesting part is what happens when a choice changes something else.

<om-embed name="blog-what-is-cpq-configure-price-quote-1"></om-embed>

## Try the change a spreadsheet tends to miss

1. Start with the $40,000 machine. Select person detection. It needs a rear camera, so the price rises by $1,200. Both items appear on the saved quote.
2. Choose the mid-size attachment and save a quote. With standard finish and person detection, the total is $43,200.
3. Change to the largest attachment. You can see its price, but this combination needs manufacturer review. The quote you already saved still describes the earlier machine.

The prices above are examples for this page. The two dependencies come from thegoodcode's Arvo demonstration. There, the salesperson sees the configured machine in 3D and can inspect the reason for the review. This reduced example makes the commercial decision visible with just three choices.

<figure><img src="/media/case-studies/6af74f9efc70cf53b1eaefe1-6af74ec50767ab36c9cfe579-arvo-rules.jpeg" alt="Person detection and the required rear camera shown in the Arvo Configurator demo" /><figcaption>Arvo adds the required rear camera when the salesperson selects person detection. Frame from thegoodcode’s configurator demonstration.</figcaption></figure>

## What a buyer should find on the quote

A total alone leaves room for disagreement. The buyer needs the product, the selected options, the required components, and the price that applied when the seller issued the quote. A shop building the machine also needs the corresponding parts list. If a seller reopens the configurator next week, an old customer link should still describe the machine the customer saw.

In the Arvo demo, adding the machine to the quote captures the selections, specifications, validation, and bill of materials. A customer can open a read-only link and inspect the same model. That is a good vendor test. Save a quote, change one component in the working configuration, then reopen the original customer document and compare both versions. [See Arvo's configuration and quote on Open Mercato.](/case-studies/arvo-configurator)

## When does CPQ earn its keep?

If the configuration changes what the factory must make, list the required components and their quantities alongside the commercial options. [Try an editable bill of materials.](/blog-posts/bill-of-materials-example-template)

If every item has one SKU, one price, and no dependencies, a price list and an ordinary quote may be enough. CPQ becomes valuable when invalid combinations reach customers, engineers repeatedly correct the same omissions, or sales and production interpret the same quote differently. Start with the last quote your team had to fix. The missing rule in that quote is a better first requirement than a list of features.
