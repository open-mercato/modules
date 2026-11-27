---
title: How Anter System turns a warehouse barrier plan into a distributor quote
heading: Anter System turns a barrier plan into a distributor quote
description: How many posts and anchors go into 42 metres of warehouse barrier? Anter System’s configurator counts the parts on the drawing and carries those quantities into the distributor’s offer.
thumbnail:
  src: /media/case-studies/6b08bd18664a553b2c3b7020-6b08bcf4b342a76c8892b6e6-anter-system-barrier-plan-quote-usd.webp
  alt: ''
  decorative: true
deliveredBy: they-dev
overview:
  client: Anter System
  industry: Industrial safety and manufacturing
  timeline: The team demonstrated catalogue ordering in September 2026. The configurator and offer workflow followed in the project repository.
  stack: |-
    - Open Mercato product catalogue, pricing and sales orders
    - Distributor portal with contract pricing
    - Calibrated floor plans, parts calculation and quote review
stats:
  - title: 42 metres
    description: Length of the barrier run in Anter’s worked example
  - title: 23 modules
    description: Standard 1.8 m sections that fit the example run
  - title: 0.6 m to review
    description: Length still visible to the designer after fitting those modules
screenshots: []
categories:
  - erp
  - crm
featuredOnAgencies: false
draft: false
---

## A line on a drawing is a list of parts

A distributor marking out a pedestrian aisle can draw the barrier in a single line. Somebody still has to turn that line into an order. How many standard sections fit? How many posts hold them? What happens to the last half metre?

[Anter System](https://antersystem.com/) manufactures flexible barriers for warehouses and production plants. Its team already had a drawing tool, but pricing lived outside it. A distributor’s email could start with a perfectly good plan and still leave a salesperson looking up products, applying contract terms and checking the quantities a second time.

## Follow a 42-metre run

In Anter’s Open Mercato configurator, the distributor uploads a floor plan and sets its scale using a known distance. They pick a barrier from the catalogue and trace its route. The product carries its module length and fittings, so the drawing supplies the quantities for the bill of materials.

Take the team’s 42-metre example. With 1.8-metre modules, 23 sections cover 41.4 metres. The configurator adds 24 posts and 96 anchors. It also shows the remaining 0.6 metres. A designer can see what still needs attention before anyone prices the run.

<figure><img src="/media/case-studies/6b08ba964c4662bd5519d7f5-6b08b9fc1969eb7b674642bb-anter-system-floor-plan-configurator.webp" alt="Anter’s configurator shows a barrier run on a sample packing-hall plan and a bill for 23 barrier modules, 24 support posts and 96 floor anchors." /><figcaption>The project’s configurator running locally on a sample packing-hall plan. The parts list shows both the fitted length and the 0.6-metre remainder. <a href="https://cdn.prod.website-files.com/69a97e33d587824eef365d84/6b08ba964c4662bd5519d7f5_6b08b9fc1969eb7b674642bb_anter-system-floor-plan-configurator.webp">View full size</a>.</figcaption></figure>

## The distributor can ask for a price on that drawing

A partner with agreed prices can move a fully priced configuration into the cart. A partner who needs a quote sends the revision to Anter for technical review and valuation. The resulting offer identifies the project and revision, lists the parts and gives the distributor a delivery choice. Accepting it places the order with those same quantities.

<figure><img src="/media/case-studies/6b08ba964c4662bd5519d7f8-6b08b9fe75a8121ef38dd802-anter-system-distributor-offer.webp" alt="An example distributor offer shows the same modules, posts and anchors with quantities, sample prices, a delivery choice and the option to accept and place the order." /><figcaption>The distributor’s offer screen for the same example. Quantities follow the drawing. Prices are illustrative. <a href="https://cdn.prod.website-files.com/69a97e33d587824eef365d84/6b08ba964c4662bd5519d7f8_6b08b9fe75a8121ef38dd802_anter-system-distributor-offer.webp">View full size</a>.</figcaption></figure>

Anter’s Jakub Zygadło and Tomasz Baryła worked with Wojciech Soczyński of [THEY.dev](https://www.they.dev/) and developer Wojciech Piaskowski. At HackOn Wrocław they demonstrated catalogue ordering at the distributor’s contract price. Their [September presentation](https://docs.google.com/presentation/d/1-usB85tSqB0HAM3j-Bu5nQJndL5hEkAUaXdqqug6wXU/edit?usp=sharing) laid out the configurator. The subsequent [project code](https://github.com/AnterSystem/open-mercato/tree/hackathon/apps/mercato/src/modules/anter_configurator) includes the drawing canvas, parts calculation, technical review and offer acceptance.
