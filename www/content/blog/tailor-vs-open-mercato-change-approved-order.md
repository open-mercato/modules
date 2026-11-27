---
title: Tailor vs Open Mercato when an approved sales order needs to change
description: We tested one shipping-address change in Open Mercato and Tailor’s public SDK. See the API calls, approval rule, saved results and code each team maintains.
date: '2026-11-26T00:00:00.000Z'
category: architecture
featured: false
thumbnail:
  src: /media/blog/6b08a7c2132093eead7cc635-6b08a5ccc44d213f87377619-om-guide-order-20261126.jpeg
  alt: ''
  decorative: true
draft: false
---

<figure><img src="/media/blog/6b08a7c2132093eead7cc635-6b08a5ccc44d213f87377619-om-guide-order-20261126.jpeg" alt="Paper sales order with an approval stamp and a revised delivery address clipped to it" width="1560" height="878" /></figure>

The order is approved. The customer calls shipping: “We’re using Dock B this week. Can you change the label?” It sounds like a one-field edit. But someone approved an order that said Dock A, and the warehouse may already have a copy.

We used that phone call to compare Tailor and Open Mercato. Our rule was deliberately narrow: a draft order can change its shipping address. Approval locks the address. An authorized operator can reopen the order, make the correction and approve it again. We checked the stored address after every attempt.

## What happened to the order

1. **Approved, Dock A.** We requested Dock B. Open Mercato returned HTTP 400. The Tailor resolver returned a GraphQL error. Both records still said Dock A.
2. **Reopened as draft.** We sent the same change again. Both saved Dock B. A fresh read returned Dock B.
3. **Approved again, Dock B.** We requested Dock C. Both rejected it and kept Dock B.

These results come from two different test environments. We ran Open Mercato 0.10.1 over HTTP against a local PostgreSQL instance. For Tailor, we ran SDK 2.48.0 in its Vitest runtime. A local GraphQL schema called our resolver, whose database queries ran against PGlite. The Tailor fixture changed the approval status directly between attempts. Hosted permissions and the commercial ERP Kit were outside that run. [Download the source and run both tests](https://cdn.prod.website-files.com/69a97e33d587824eef365d83/6b08a6af5228caaab63808ac_order-approval-lab.zip).

## Open Mercato puts this rule in sales settings

With the Sales module enabled, read `GET /api/sales/settings/order-editing` for the organization. The response includes the current rules and a status dictionary. The setting takes status _values_ such as `draft`. Changing the status on an individual order takes the dictionary entry’s _ID_. Our fixture had both `draft` and `approved`.

These are the two calls that matter. Run them against a disposable test organization, using an authorized token and the selected organization. The second request uses the order’s actual ID. The downloadable script saves and restores the organization’s settings.

```
PUT /api/sales/settings/order-editing
{ "orderAddressEditableStatuses": ["draft"] }

PUT /api/sales/orders
{
  "id": "<order-id>",
  "shippingAddressSnapshot": {
    "addressLine1": "Dock B",
    "city": "Portland",
    "countryCode": "US"
  }
}
```

On approval the second call failed. To reopen the fixture, we sent `PUT /api/sales/orders` with the order ID and `statusEntryId` set to the draft entry’s UUID. After the address change, we read `GET /api/sales/orders?id=<order-id>` and checked the shipping address snapshot. We then selected the approved status and repeated the negative test.

For this policy, the customer owns a configuration choice and a regression test. The Sales module supplies the address guard. Its scope matters: customer fields have their own setting, and changing the order’s line items is a separate question. In a real implementation, name the person allowed to reopen an order and the point at which a new address has to reach the carrier. [Read the order update command](https://github.com/open-mercato/open-mercato/blob/v0.10.1/packages/core/src/modules/sales/commands/documents.ts).

## Tailor gives the application a place to express the rule

For the public SDK route, we defined a mutation called `changeShippingAddress`. Its inputs are an order ID and an address. The important line below is the second `where`. The database checks the status as part of the write, so a draft check performed earlier in the request cannot become stale before this update.

```
const updated = await getDB("orders")
  .updateTable("SalesOrder")
  .set({ shipTo: address })
  .where("id", "=", input.orderId)
  .where("status", "=", "draft")
  .returning("shipTo")
  .executeTakeFirst();

if (!updated) throw new Error("This order is missing or closed for address edits.");
```

Our local GraphQL client sent this operation with the fixture’s UUID and `Dock B`. It checks the GraphQL `errors` array on a rejected write and reads the saved row separately. An HTTP status alone would miss the point of this test.

```
mutation Edit($input: ChangeShippingAddressInput!) {
  changeShippingAddress(input: $input) { address }
}
```

In this version, the application owns the resolver, the definition of an editable state and the tests. It also has to give the appropriate roles access and apply the same policy to every route that can change the address. Tailor publishes the resolver and local testing APIs used here. [Tailor resolver documentation](https://docs.tailor.tech/sdk/services/resolver) and [SDK testing guide](https://docs.tailor.tech/sdk/testing).

## Which implementation would you want to maintain?

Open Mercato’s setting fits a team whose rule is “addresses can change in these order statuses.” A team that needs exceptions by carrier, warehouse or value should take its hardest exception into the demo. The Tailor resolver gives a developer a direct place to put that decision. Someone on the team must own its behavior as the policy changes.

There is a second Tailor option worth asking about. Its contract-only ERP Kit includes sales and shared approval functions and generates TypeScript in the customer’s repository. Ask Tailor to run the Dock B exercise with those modules and show the configuration or code it requires. Our public-SDK result cannot establish how much work the kit would save. [See what Tailor includes in ERP Kit](https://docs.tailor.tech/erp-kit/).

One final question is worth asking either vendor: “The label was printed ten minutes ago. Who learns that the dock changed?” Our test ends at the saved order. The answer to that last question determines whether the truck goes to the right door.
