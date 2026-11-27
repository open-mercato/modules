---
webflowId: 6b04bcad4eef352cbb4a73b0
title: How OPAK KREFT keeps the exact packaging document its customer received
heading: The box changed. The customer’s datasheet stayed on record.
description: OPAK KREFT used to assemble packaging documents from spreadsheets, supplier files and a separate design program. Flowbiz built a document generator on Open Mercato alongside the manufacturer’s existing ERP.
thumbnail:
  src: /media/case-studies/6b04bd0f27b47149dc5d05ba-6b04bceb31735d86a26543fd-ppwr-cover.jpeg
  alt: Illustrative corrugated packaging workbench with a carton and a caliper
deliveredByUrl: https://flowbiz.pl/en
overview:
  client: OPAK KREFT
  industry: Corrugated packaging
  type: Packaging documentation and archive
  stack: |-
    - Open Mercato
    - Material and FEFCO construction dictionaries
    - SVG blank drawings and Chromium PDF rendering
stats:
  - title: ~3,000
    description: Items in the manufacturer’s system
  - title: 3 modules
    description: Materials, constructions and document generation
  - title: 1 frozen PDF
    description: Stored with its checksum for each issued version
screenshots: []
categories:
  - erp
featuredOnAgencies: false
draft: false
---

## The owner did the paperwork on Sundays

OPAK KREFT makes corrugated packaging to order near Gdańsk. To prepare a customer datasheet, someone had to reconcile board compositions in a spreadsheet, material parameters in supplier price lists and a blank drawing in a separate program. The owner knew how the pieces fitted together. The office needed a way to issue the same document during the working week.

Flowbiz kept invoicing in the existing ERP and built three modules on Open Mercato: a material database, a dictionary of packaging constructions and a document generator. The office could start with one customer and one machine while the factory kept taking orders.

## Choose the board and the construction

In the editor, the operator selects a material index and a construction. Board properties fill in beside a live preview. The customer needs the internal dimensions to check whether the goods fit. Logistics needs the external dimensions to plan the shipment. Both come from the same geometry, which also produces the blank drawing and its area.

<figure><img src="/media/case-studies/6b04bd1027b47149dc5d05c8-6b04bcec0083a902566712b7-ppwr-edytor-karty.jpeg" alt="The datasheet editor and its live document preview. Product illustration by Flowbiz." /><figcaption>The datasheet editor and its live document preview. Product illustration by Flowbiz.</figcaption></figure>

The manufacturer has around 3,000 items in its system. Many share a construction and board grade. For a given customer, the office can group those datasheets under one declaration. Its number appears beside the relevant line on the sales document, giving the customer a reference when a delivery arrives.

## What happens when the supplier changes the board?

Suppose a customer asks for the datasheet that shipped in March. If the supplier has since changed the board weight, rerunning the generator would produce a different document. At issue time the system therefore saves the rendered PDF and its checksum. A correction gets a new number. The office can still retrieve exactly what the customer received.

<figure><img src="/media/case-studies/6b04bd1027b47149dc5d05ce-6b04bcec3f621f0a81fe464c-ppwr-rejestr-dokumentow.jpeg" alt="The register of issued documents and their checksums. Product illustration by Flowbiz." /><figcaption>The register of issued documents and their checksums. Product illustration by Flowbiz.</figcaption></figure>

Flowbiz tested that behaviour by changing a material's grammage and checking the issued file. Its bytes stayed the same. The generator also distinguishes supplier-backed values from manufacturer assumptions. A missing value stays blank or gets flagged for confirmation. An adopted default gets a footnote.

The manufacturer remains responsible for its declarations. What changed for the office is the work it can show: which material and construction it used, which values still needed confirmation, and which PDF it sent.

[Read Mateusz Kozłowski’s implementation account at Flowbiz.](https://flowbiz.pl/en/case-study/ppwr-opak-kreft)
