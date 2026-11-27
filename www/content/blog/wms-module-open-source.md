---
webflowId: 6a79ada3770c6282bd3e4ff3
title: A full WMS module just landed in Open Mercato
description: 'A complete Warehouse Management System module is now part of Open Mercato open source, contributed by Filanovum: multi-warehouse locations, lots with FEFO, cycle counts and a full movement ledger.'
date: '2026-08-10T09:00:00.000Z'
updated: '2026-09-10T07:54:28.239Z'
author: tomasz-karwatka
category: product-updates
featured: false
thumbnail:
  src: /media/blog/6a79c4f9b5cd07a60d2c40e2-wms-module-hero.png
  alt: ''
  decorative: true
draft: false
---

Where exactly is that pallet? Which bin, which lot, when does it expire? Most systems answer with a single number in a spreadsheet. From today, Open Mercato answers at bin level - with an audit trail behind every change.

We just merged a complete Warehouse Management System module into Open Mercato open source. The module was built and contributed by Filanovum, one of the agencies building on the framework. This is exactly how we want Open Mercato to grow: a strong core, plus real modules from partners who ship for real clients - available to everyone under the open-source license.

Here is what Phase 1 gives you.

## One dashboard for the whole network

![](/media/blog/6a7a0fb329229beeb8a0ca59-dashboard.png)

Supervisors land on an operational dashboard. Low stock against reorder points, lots approaching expiry, today's movements - across all warehouses at once. Quick actions for receive, adjust and cycle count sit right on the page. No hunting through menus to do the three things you do fifty times a day.

## Warehouses, zones and locations - down to the bin

You can model any topology. Multiple warehouses, with one marked as default for sales reservation. Zones group the floor: Receiving, Pick Face, Bulk Storage, Shipping - used for routing and priority. Locations are the addressable bins, in an aisle - rack - bin hierarchy, plus docks and staging.

Quantity lives at location level. Click into a bin and you see what's stored there. That's the view operators actually use on the floor.

## Inventory behavior defined per product

![](/media/blog/6a7a0fcf568d0de6ae2efb14-inventory.png)

Each product gets an inventory profile: unit of measure, FIFO or FEFO rotation, lot and expiry tracking, reorder and safety-stock thresholds. In our demo dataset, sneakers run FIFO. Matcha runs FEFO, because it's perishable. The thresholds feed the dashboard low-stock KPIs automatically.

## Daily operations without exporting to Excel

The inventory console is the daily workbench: on-hand, reserved and available - by SKU and location. From there:

- **Move** relocates stock between bins in the same warehouse, for example from bulk into pick face. Quantities update immediately and the transfer lands in the ledger.
- **Adjust** handles corrections: damaged goods, found stock, opening balances. Signed delta plus a mandatory reason code. No anonymous changes.
- **Cycle count** is a three-step wizard: pick a location and SKU, enter the physical count, review the variance, post. One operator can reconcile in minutes, without a heavy approval workflow.

![](/media/blog/6a7a0fcf568d0de6ae2efb14-inventory.png)

## Lots, expiry and FEFO as first-class citizens

For food, cosmetics and pharma, lot tracking is built in, with FEFO enforced by the product profile. Each lot shows quantity, locations, status and related movements. Lots can go on hold or into quarantine. The dashboard's expiry watch gives supervisors one place to see what's aging out before it becomes write-off.

## A ledger you can show your auditor

Every receive, adjust, move and cycle count lands in the movement ledger: who, when, from, to, quantity, reason. That's the audit backbone.

Reservations sit on top. Available quantity equals on-hand minus reserved and allocated - so sales and warehouse never sell the same unit twice.

## CSV import for go-live

Migrating from another system or loading a large catalog? Bulk-load or reconcile stock from CSV: validate first, then apply. Nobody should click through thousands of rows by hand.

## Why this contribution matters

Open Mercato is an AI-supportive CRM / ERP foundation framework. The philosophy is simple: 80% is ready, you build only your edge. A WMS is a big piece of that 80% - and Filanovum built it, used it, and gave it back to the community. That's the model: 100+ contributors, 25 partner agencies, and modules that come from real projects instead of roadmap slides.

Thank you, team Filanovum. This is a serious piece of engineering, and it's now free for everyone.

<lite-video id="mBAtuxs4oto" title="WMS OpenMercato walkthrough"></lite-video>

## What's next

Phase 1 is the foundation: multi-warehouse topology, location-level stock, lots with FEFO, operator tools and the full movement ledger.

Next up: sales reservation flows and inbound receiving tied to purchase orders.

Interested in exploring Open Mercato WMS? Please email Marcin <m.kadziolka@gmail.com>

Building modules on Open Mercato and want them featured? Talk to us - the framework is designed for exactly this.
