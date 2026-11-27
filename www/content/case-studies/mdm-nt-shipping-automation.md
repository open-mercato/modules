---
webflowId: 6af1c35e3835442cc4728aff
title: 'MDM NT: shipping automation alongside an existing ERP'
heading: How MDM NT automated shipping with Open Mercato
description: A 500-person manufacturer connected packing, batch label generation and carrier tracking with Open Mercato, while its existing ERP kept running the business.
thumbnail:
  src: /media/case-studies/6af1d75b999082f56d4ca85f-img-4335-min-1200x800.jpeg
  alt: Pallet racks and forklifts inside an MDM NT warehouse
heroVideo: YBV5pNGCCpw
overview:
  client: MDM NT
  industry: Manufacturing
  type: Shipping automation + ERP integration
  stack: |-
    - Open Mercato
    - Existing ERP integration
    - Carrier label and tracking APIs
    - Background jobs for label generation and tracking
    - Print agent with plant and workstation routing
stats:
  - title: 500 employees
    description: Company size at the time of the interview
  - title: Batch shipping
    description: Multiple labels queued together and routed to the right printers
  - title: Every 10 minutes
    description: Carrier tracking updates available inside the existing ERP
screenshots: []
categories:
  - erp
  - enterprise
  - track-trace
featuredOnAgencies: false
draft: false
---

## The story so far

At MDM NT, a manufacturing company with 500 employees and five plants, everyday shipping work had become a practical reason to rethink the company's software. Staff prepared shipping labels manually, packing details arrived on handwritten notes, and customer service depended on logistics colleagues to find out where orders were.

Marcin Sulich, who led the initiative internally, was already exploring a longer-term move to Open Mercato. His starting point was a specific operational problem: connect the carriers, automate shipping paperwork and make shipment information available to the people who needed it.

The existing ERP would continue running the business while Open Mercato took on the new workflow. That gave the team a way to demonstrate value on real orders before attempting a broader migration.

## What drove the shift

According to Marcin, the existing system was slow and prone to getting stuck. Requests for improvements brought high quotes and waits measured in months, with no certainty that the result would match the team's needs.

Carrier changes made the problem more urgent. Three of the company's carriers had announced changes to their systems or integration methods. Continuing to prepare labels manually would leave logistics staff doing repetitive work while the business still needed reliable shipping records.

Marcin and the head of warehousing and intralogistics mapped the process and split it into manageable pieces. Carrier integration came first because it could remove a visible daily problem and give colleagues something concrete to judge.

## Connecting the data before changing the workflow

The foundation was a connection between the existing ERP and Open Mercato. Production orders, customer orders and shipments flowed between the systems automatically. Employees could work with familiar business records while the team introduced new functionality around them.

The first shipping workflow started with a button in the existing system. Clicking it triggered a background job in Open Mercato, which sent the shipment details to the appropriate carrier and requested a label. A second job routed that label to the configured printer and workstation for the relevant plant. Shipping information also appeared back in the ERP.

For logistics staff, the change was immediately tangible: press the button, receive the paperwork at the right printer and find the corresponding data in the system. They could use the new capability within their existing workflow.

## From handwritten notes to batch shipping

The next improvement began with feedback from the person preparing the labels. Warehouse staff still brought handwritten packing notes, which had to be deciphered and entered into the system. Automating label generation had exposed another avoidable handoff.

The team built a packing panel. Packers scanned the dispatch document and their individual code, then recorded how the shipment had been packed. Those records appeared in an Open Mercato workspace the team called the packing office.

The shipping operator could see the completed packing records, select a carrier and queue the labels for generation. Multiple shipments could be selected together; background jobs processed them carrier by carrier and sent the documents to the printers while the operator moved on to other work.

Packing events were recorded with timestamps, giving the team a shared record of what had happened and when. Information that previously travelled on pieces of paper became part of the shipping workflow.

## Shipment status where customer service already works

Creating the label was only part of the job. Customer service also needed to know what had been sent, to whom and what was happening to it.

The team connected the carriers' tracking APIs and built a shipment view inside the existing ERP. A background job checked the carriers every 10 minutes, sent status updates to Open Mercato and made them available in the interface customer service already used.

Staff could search recent dispatches by shipment number, order number or customer. Colour-coded statuses made it easier to distinguish packed, in-transit and delivered shipments, with detailed carrier statuses available underneath.

> “I want to see it where I work.”

\- Marcin Sulich, MDM NT, describing the requirement for shipment visibility; translated from Polish.

## What changed for the team

The implementation connected packing, label generation, printing and tracking into one flow alongside the existing ERP. Logistics staff gained batch label processing and direct access to packing data. Customer service gained shipment visibility without having to call logistics for every update.

Marcin reported positive feedback from both teams. Warehouse colleagues welcomed the change, and the customer service manager responded enthusiastically after receiving access to the shipment view. In follow-up conversations, staff told him that it had removed a substantial amount of work.

The result was a working operational improvement that colleagues could experience through their own orders and shipments. The team established a practical pattern for extending the business system: connect the data, improve a bounded process, learn from the people using it and build the next step.

## The next step

At the time of the interview, the company's ambition was to move fully to Open Mercato by January 2028. That remained a future goal, with more complex modules still ahead.

For a manufacturing business, Marcin highlighted the importance of connecting operational activity to costing and finance. Shipping was the first concrete step: a workflow already in use, and a foundation for the wider transformation the team wanted to pursue.
