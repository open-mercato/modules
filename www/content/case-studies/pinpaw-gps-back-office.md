---
webflowId: 6af1f4baf082cf6045ffdf77
title: 'PinPaw: one back office for a connected GPS product'
heading: How PinPaw connected orders, GPS devices and app operations with Open Mercato
description: A two-developer team built a back office around its GPS product, connecting BaseLinker orders, device commands, SIM cards and customer communication in one workspace.
thumbnail:
  src: /media/case-studies/6af1fadaee6670759c32ef4a-6af1faba2310d25a0e7acec4-pinpaw-cover.jpeg
  alt: PinPaw tracker on a mossy rock, with an extended forest background
overview:
  client: PinPaw
  industry: Pet technology / IoT
  timeline: Initial panel in one evening; ongoing iteration
  type: Custom operations back office
  stack: |-
    - Open Mercato
    - Claude Code
    - Base.com / BaseLinker
    - PinPaw API and application database
    - Java GPS engine
    - SIM provider API and Expo notifications
stats:
  - title: ~90%
    description: Of the demonstrated panel built in one evening, by the team’s estimate
  - title: 2 developers
    description: Running and extending the product themselves
  - title: 1 workspace
    description: For orders, devices, SIM cards and app operations
screenshots: []
categories:
  - track-trace
featuredOnAgencies: false
draft: false
---

## A small team behind a connected product

PinPaw combines a GPS tracker for pets with its own mobile application and the infrastructure that processes location and telemetry data. Behind the customer experience is a practical operational challenge: connecting each order to a physical device, keeping its SIM card working, diagnosing hardware issues and communicating with users.

The two developers running the product wanted a back office they could keep adapting themselves. They built it on Open Mercato, bringing order fulfilment, device administration and app operations into one workspace.

<figure><img src="/media/case-studies/6af1f4c6293986c10a0931a8-d-2.webp" alt="Green PinPaw GPS tracker on a moss-covered rock in a forest" /><figcaption>PinPaw product visual, provided on pinpaw.pl.</figcaption></figure>

## The challenge: a back office tied to the mobile API

PinPaw already had a custom admin panel. Its close connection to the API used by the mobile app meant that back-office changes required deploying that API. The team wanted to separate internal operations from the customer-facing application and make the admin panel easier to evolve.

There was also work spread across tools. Orders lived in Base.com, also known as BaseLinker. Device information lived in PinPaw's database. GPS commands ran through a separate engine. Shipping involved a label printer. Replacing every system at once was neither necessary nor practical.

## The approach: connect the systems that already work

Open Mercato became the operational workspace around those existing services. It uses its own database while also connecting directly to PinPaw's application database. Back-office logic, such as managing premium access, can run in Open Mercato without going through the mobile API.

The team's integration map connects the back office to the PinPaw API, both databases, the GPS engine, BaseLinker and the label printer. Individual workflows use the connection they need, rather than forcing every operation through a single service.

<figure><img src="/media/case-studies/6af2d0b14c918da2c831c27f-6af2d0065e5b67103134869f-architecture-gradient-clean.jpeg" alt="PinPaw back office connected to two databases, PinPaw API, GPS engine, BaseLinker and a label printer" /><figcaption>Integration overview recreated from the diagram shared by the PinPaw team.</figcaption></figure>

## From order to assigned device and shipping label

Orders arrive in Open Mercato from BaseLinker. The person preparing a shipment assigns the specific tracker to the order, and that assignment is reflected back in BaseLinker through two-way communication. This preserves the link between the purchase and the physical device.

Shipping labels can be downloaded or printed from the same workspace. The team also described automatic label printing at the fulfilment location. Assigning the actual device remains a manual step: the operator matches the tracker being packed to the order.

<figure><img src="/media/case-studies/6af2d0b14c918da2c831c2a2-6af2d0087efaf61368e71034-dashboard-gradient-clean.jpeg" alt="Recreated PinPaw dashboard with sample orders and blocked devices; all identifiers masked" /><figcaption>Recreated interface with fictional customer data. Order and device identifiers are masked.</figcaption></figure>

## Diagnose trackers without leaving the back office

A custom Open Mercato module communicates with PinPaw's separate GPS engine, a Java service that talks to the devices. From the back office, the team can send commands, inspect responses, check firmware and restore device settings when troubleshooting a customer issue.

The panel grows as new operational needs appear. When a firmware issue affected a tracking mode, the team added a conditional command workflow: check the reported firmware version, then run the relevant command only for affected devices.

Command templates let the team manage the device-specific instructions behind actions in the mobile app. Different tracker models can use different commands while the operational interface stays in one place.

<figure><img src="/media/case-studies/6af2d0b14c918da2c831c2c8-6af2d006f171b4f0c71cfe15-command-templates-gradient-clean.jpeg" alt="Recreated command-template table for GPS tracker models" /><figcaption>Recreated command-template view. Templates contain placeholders, not credentials.</figcaption></figure>

## SIM cards, users and app content in the same workspace

An integration with the SIM provider's API lets the team check card status and data usage. The back office also provides visibility into SIM and device mismatches. The automated detection and warning job described in the interview runs in PinPaw's existing system.

Other modules cover user accounts and premium access, API tokens, training-program content, changelogs and notifications. Email, in-app messages and Expo push notifications can be managed from the back office. During a mobile network outage, the team used the notification workflow to inform users about potential service problems.

<figure><img src="/media/case-studies/6af2d0b14c918da2c831c273-6af2d0158949ac4cedeed621-sim-cards-gradient-clean.jpeg" alt="Recreated SIM-card table with blurred phone numbers, ICCIDs and IMEIs" /><figcaption>Recreated interface with illustrative status data. All SIM and device identifiers are replaced and masked.</figcaption></figure>

## A working foundation in one evening, then continuous iteration

Piotr estimates that around 90% of the panel demonstrated in the interview was built in one evening using Claude Code, with further capabilities added afterward. This is the team's account of its own implementation, not a benchmark or a promise about other projects.

Open Mercato's existing modules and AI-oriented development setup gave the team a foundation to extend. Notes and files could use existing modules; the product-specific workflows were built around PinPaw's own integrations.

> “Our panel is alive. If we need something, we build it as we go.”

_Piotr, PinPaw team. Translated from the Polish interview._

The result is a back office the team can change as the business changes. Fulfilment, device troubleshooting, connectivity and app administration share a workspace, while the underlying services continue doing their jobs.

## What's next: bringing support into the workspace

At the time of the interview, support tickets still ran in FreeScout, alongside PinPaw's separate AI-assisted support workflow. That system classifies requests and prepares draft replies for human review. It was not yet part of Open Mercato.

The team plans to bring the support interface into the back office and connect the existing support agent to it. The direction is consistent with the rest of the implementation: extend the workspace around a real operational need, without rebuilding every working service.

_Based on the customer interview recorded on 6 October 2026. Interface visuals have been recreated from supplied screenshots with fictional data and masked identifiers. Product visual: [PinPaw](https://pinpaw.pl/)._
