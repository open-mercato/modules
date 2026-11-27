---
webflowId: 6af74f7322fd8b75b76ad499
title: 'Arvo Configurator: from product choices to a validated quote'
heading: 'Arvo Configurator: from product choices to a validated quote'
description: A machine in 3D. Rules that explain what fits. A quote that preserves every choice. thegoodcode built an end-to-end configuration and quoting demo on Open Mercato.
thumbnail:
  src: /media/case-studies/6af750bae31c5c40ac8b2fd4-6af750a6bc9f5b7bc0bd132e-arvo-cover-machine.jpeg
  alt: Close-up illustration based on the Arvo Configurator demo's blue 3D telescopic handler, on a lime and lavender gradient
heroVideo: 2OzOEnM0Gqo
deliveredBy: the-good-code
overview:
  client: Arvo Configurator (demo)
  industry: Construction & agricultural machinery
  timeline: 2026 hackathon project and demo
  type: Configuration & quoting
  stack: |-
    - Open Mercato customer records and sales workflow
    - Custom configuration and validation rules
    - Interactive 3D product visualisation
    - Calculated specification, bill of materials and pricing
    - Immutable configuration snapshots and customer documents
stats:
  - title: Live 3D
    description: Machine, specification, parts and price stay connected
  - title: Built-in rules
    description: Dependencies and review warnings explained as you configure
  - title: One snapshot
    description: The configured machine preserved in the quote
screenshots: []
categories:
  - erp
  - software-house
featuredOnAgencies: true
draft: false
---

## The machine looks right. Can it actually be quoted?

A heavier frame. Bigger tyres. More lift height. The largest attachment. On screen, each choice looks like one more option. Together, they can change whether a machine is a sensible configuration to put in front of a customer.

In the Arvo Configurator walkthrough, that tension becomes visible. The salesperson selects the largest attachment and the system pushes back: the calculated load exceeds an engineering review threshold. The combination needs manufacturer confirmation. Switching to a mid-size attachment clears the warning, and the matching tine length is selected automatically.

That is the heart of this project. thegoodcode connected product configuration to the sales process in Open Mercato, so the model, its rules, the parts and the price move together. Arvo Configurator demonstrates the team's Open Mercato Configuration & Quoting module through an Arvo TH-720 telescopic handler.

_This case study follows a working demonstration developed from the team's hackathon project. It describes the workflow shown in the video, rather than a production customer deployment._

<figure><img src="/media/case-studies/6af74f9efc70cf53b1eaefe4-6af74ec5ce319b953e4f14ba-arvo-configurator.jpeg" alt="Arvo Configurator demo with product options, a live 3D telescopic handler, validation and bill of materials" /><figcaption>Actual frame from thegoodcode's walkthrough: options, the 3D machine and commercial details in one workspace.</figcaption></figure>

## Start with the customer, then build the machine

The workflow begins in the sales quotes list. A salesperson creates a new sales document, selects quote as its type and searches the customer list. Selecting the customer fills in their email automatically. The resulting quote already contains the customer's details.

From there, the Configure product tab opens the next stage. There are no configured products on the quote yet, so the salesperson adds one and launches the configurator. Configuration starts inside an existing customer and sales context.

The initial machine is already evaluated against a standard starting configuration. Options sit on the left, the interactive three-dimensional model occupies the centre, and validation, specification, bill of materials and price appear on the right. The salesperson can rotate the machine while making choices and immediately see the consequences.

## Make the rules part of the conversation

As the configuration develops, the salesperson changes the frame, tyres, hydraulic stabilisers and lift height. The attachment warning brings the engineering constraint into the same workspace where the commercial decision is being made.

The system also handles dependencies. When person detection is enabled, it automatically adds the required rear camera and explains the reason: the feature needs visibility around the back of the machine. The salesperson sees both the change and its justification.

Choosing a compatible attachment sets its matching tine length. Adding a serrated edge or extra hydraulics updates the bill of materials and price alongside the model. These are business rules with visible consequences: a selection can change another option, add a component or require further review.

<figure><img src="/media/case-studies/6af74f9efc70cf53b1eaefe1-6af74ec50767ab36c9cfe579-arvo-rules.jpeg" alt="Person detection and the required rear camera shown in the Arvo Configurator demo" /><figcaption>Enabling person detection adds the rear camera automatically, with an explanation beside the option.</figcaption></figure>

## One configuration, several views of the same decision

A product configurator has to do more than draw an attractive machine. The customer needs to understand what they are buying. The salesperson needs to know what it costs. The component list needs to reflect the choices that produced that price.

The walkthrough keeps those views together. Working lights are raised to their brightest setting, boom suspension is enabled, and the finish changes from standard green to a custom RAL blue. The model updates immediately while the specification, bill of materials and price remain in sync.

By the time the salesperson reviews the final price, the configured machine already has its selected options and calculated details attached. There is no separate step in this demonstrated flow where someone has to reconstruct the machine from a visual preview.

<figure><img src="/media/case-studies/6af74f9cfc70cf53b1eaefda-6af74ec5c7551038ef4f6282-arvo-cover.jpeg" alt="Blue Arvo telescopic handler configured with custom RAL finish and synchronized bill of materials" /><figcaption>The configured RAL blue machine, captured directly from the video. Prices and specifications are demo data.</figcaption></figure>

## Freeze what was selected. Share that exact machine.

Adding the machine to the quote creates a configuration snapshot: an immutable record of the selections, specification, validation result and bill of materials. The quote now points to a specific configuration, preserving what the salesperson actually added.

The salesperson then generates a sharing link that the customer can open without creating an account or logging in. It is a direct handoff of the configured machine.

The customer document provides a read-only view of the same configuration. The model remains interactive, so the machine can be rotated and inspected. Below it, the customer can review the selected options, calculated specification and full priced bill of materials. A print or save-as-PDF action makes the document usable outside the application too.

<figure><img src="/media/case-studies/6af74f9efc70cf53b1eaefe7-6af74ec5c7551038ef4f62ad-arvo-customer-document.jpeg" alt="Read-only Arvo customer document with an interactive blue machine model and print or save as PDF action" /><figcaption>The customer document presents the frozen configuration with an interactive model and a printable record.</figcaption></figure>

## Build the specialised layer on an existing foundation

thegoodcode built the machine-specific configuration logic on Open Mercato's customer records and sales workflow. According to the team's project description, the platform supplied the back office, authentication, multi-tenancy, catalogue, quotes and orders. Their custom work covered the configuration model, rules, pricing, specification, bill of materials and visualisation.

That division of work is the value of starting with a business application foundation. The team could concentrate on questions specific to a configurable machine: which options belong together, when a combination needs review, how a selection changes the parts and price, and what must be preserved when it becomes a quote.

## From a product choice to a customer-ready document

The result is a connected demonstration of a complete sales journey: select the customer, configure the machine, evaluate the choices, add the result to a quote and share the exact configuration with the customer.

The most revealing moment is still the one where the configurator pushes back. It makes a constraint visible before the salesperson finishes the quote. From there, each correction carries through to the model, specification, parts and price, and finally into the document the customer receives.

Built and demonstrated by Jan Zaremski and Kamil Nohotko from [thegoodcode](/certified-partners/the-good-code). Watch the full walkthrough above, or explore the team's [project description](https://www.thegoodcode.io/work/open-mercato-configuration-quoting).

_Images are actual frames extracted from the supplied video, presented on Open Mercato's gradient background. The machine, pricing and configuration data shown belong to the demonstration._
