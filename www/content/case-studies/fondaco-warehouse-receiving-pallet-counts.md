---
title: How Fondaco catches a short delivery before it reaches inventory
heading: Fondaco catches short deliveries at the pallet
description: A delivery note tells the office what to expect. A scan tells it what arrived. Fondaco puts both numbers on the same goods receipt, with a barcode that leads back to the pallet.
thumbnail:
  src: /media/case-studies/6b08ba954c4662bd5519d7cb-6b08b9fb62955729fd013496-fondaco-warehouse-label-printing.webp
  alt: ''
  decorative: true
deliveredBy: commerce-weavers
overview:
  client: Fondaco warehouse receiving project
  industry: Warehousing and logistics
  timeline: The team built and demonstrated the panel at HackOn Wrocław, 18-20 September 2026.
  stack: |-
    - Open Mercato warehouse management, inventory and notifications
    - Phone camera for barcode scanning
    - Niimbot B1 Bluetooth label printer
stats:
  - title: 2 rolls short
    description: The difference the receiver sees on the sample delivery below
  - title: Bluetooth labels
    description: The receiver prints a barcode for the pallet at the receiving dock
  - title: One receipt
    description: The warehouse floor and the office review the same count
screenshots: []
categories:
  - erp
  - track-trace
featuredOnAgencies: false
draft: false
---

## The delivery note says twelve. The pallet holds ten.

Two rolls of stretch film are missing. At the loading bay, the receiver can still look inside the carton. By the time somebody in the office types up a paper count, the pallet may already be on a rack. Which number should sales be able to promise a customer?

Fondaco takes the count where the discrepancy is easiest to settle. The receiver opens the delivery on a phone, creates a pallet and scans a product barcode. A quantity field with large plus and minus buttons works with gloves. The count belongs to that product on that pallet from the first tap.

<figure><img src="/media/case-studies/6b08ba964c4662bd5519d7ee-6b08b9fb6127ca30b1d92b6b-fondaco-scan-and-count.webp" alt="Fondaco’s mobile screens show ten rolls scanned onto pallet PAL-0001 and a receiving summary with twelve expected, ten counted and two missing." /><figcaption>Two screens from Fondaco running locally with a sample delivery. The receiver counted ten rolls on PAL-0001. The summary compares them with the twelve on the delivery note. <a href="https://cdn.prod.website-files.com/69a97e33d587824eef365d84/6b08ba964c4662bd5519d7ee_6b08b9fb6127ca30b1d92b6b_fondaco-scan-and-count.webp">View full size</a>.</figcaption></figure>

## A label that travels with the count

Creating a pallet sends its barcode to a portable label printer. The sticker can go straight onto the load. If the printer is out of reach, the pallet already has its ID. The receiver can carry on counting and print the same label again when the printer is back.

That little detail matters the next time someone asks where the ten rolls are. The office opens the goods receipt, expands the stretch-film line and sees the pallet that supplied the count. Lines that match stay out of the way by default, so the short delivery is easy to find.

<figure><img src="/media/case-studies/6b08ba964c4662bd5519d7f1-6b08b9fb82c60291208ef03e-fondaco-receiving-summary.webp" alt="The office receiving summary shows the stretch film two rolls short. Expanding the product reveals the ten rolls counted on pallet PAL-0001." /><figcaption>The office view of the same sample receipt. Expanding “Short 2” reveals the ten rolls on PAL-0001. <a href="https://cdn.prod.website-files.com/69a97e33d587824eef365d84/6b08ba964c4662bd5519d7f1_6b08b9fb82c60291208ef03e_fondaco-receiving-summary.webp">View full size</a>.</figcaption></figure>

## What goes into available stock

After the pallets are closed, the receiver selects a destination and confirms the delivery. Fondaco uses the counted pallet lines to post stock in Open Mercato. In this example, the warehouse receives ten rolls. The original expectation of twelve stays on the receipt for anyone following up with the supplier.

Mateusz Zalewski and Jakub Tobiasz of [Commerce Weavers](https://commerceweavers.com/) built Fondaco with Marcin Sulich and Piotr Cierlik. The team printed a label live in Wrocław and took third place in the Solve Your Real Problem track. Commerce Weavers identified a pilot in Marcin’s warehouse as the next step. [Read the team’s account](https://commerceweavers.com/blog/wroclaw-open-mercato-hackathon-2026) or [explore Fondaco on GitHub](https://github.com/Zales0123/Fondaco).
