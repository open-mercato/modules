---
title: Build a Next.js CRM that keeps client history through a handover
description: Build a client timeline, attach an original email and transfer the account. Download the runnable Next.js starter and try the same handover on Open Mercato.
date: '2026-11-26T00:00:00.000Z'
category: architecture
featured: false
thumbnail:
  src: /media/blog/6b08a7c2132093eead7cc632-6b08a5cc11568b3b2723775c-om-guide-handover-20261126.jpeg
  alt: ''
  decorative: true
draft: false
---

<figure><img src="/media/blog/6b08a7c2132093eead7cc632-6b08a5cc11568b3b2723775c-om-guide-handover-20261126.jpeg" alt="Two paper hands passing a blue client folder containing an envelope and a note" width="1560" height="878" /></figure>

Jules takes over a client on Monday. The draft agreement promises delivery within 48 hours. The question for the outgoing account owner is simple: “Why did we agree to that?” If the answer survives only in Mira’s inbox, transferring the client in a CRM has moved a name and left the work behind.

This is a small Next.js CRM you can run on your laptop. Attach the email that explains the delivery window, hand the client to Jules, then open the record as Jules and download the original. The sample company and email are fictional. The brief comes from Creativa Legal, whose lawyers wanted the next person handling a client to understand the decisions already made. Their CreativaOS client timeline brings correspondence, meetings and notes onto one record. [Read the CreativaOS case study](/case-studies/creativaos-law-firm-client-history).

## Run the handover

[Download the Next.js starter, test and sample email](https://cdn.prod.website-files.com/69a97e33d587824eef365d83/6b08a6b0664a553b2c385312_nextjs-crm-handover.zip). Unzip it, use Node.js 24.14 or later, and run the following commands in the extracted folder. We tested with Node.js 24.17. The standalone demo uses a local SQLite file, so you can try the whole handover before setting up Open Mercato.

```
cd nextjs-crm-handover
npm ci
npm test
npm run dev
```

1. Open `http://127.0.0.1:3000`. You are viewing North Quay Studio as Mira. Under **Attach an email**, select `fixtures/delivery-window.eml` and click **Attach email**. Try the same file twice. The timeline should still show one message.
2. Under **Hand over this client**, choose Jules and enter a note: “Keep the 48-hour window. Alex explains the dock schedule in the original email.” Click **Transfer ownership**.
3. Choose **Jules** in **Viewing as** and click **Switch**. Read Alex’s message. The receiving team books docks two days ahead. Click **Download original email** to recover the file Mira attached.

<figure><img src="/media/blog/6b08a7c2132093eead7cc644-6b08a5cdc628e43426f16d84-om-guide-timeline-20261126.jpeg" alt="Tested Next.js client record viewed as Jules, showing Mira’s handover note, the original email and the download link" /><figcaption>Jules is now the account owner. Mira is still credited with attaching the message, and Alex is still identified as its sender. This screenshot comes from the running example.</figcaption></figure>

## Give the email a home that survives a change of owner

The starter has two tables. A client has a stable ID and a current owner. Each timeline entry holds the client ID, the teammate who added it and the content. For email, it also holds the original bytes. The record can now answer three different questions: Who owns the client today? Who attached this message? Who actually wrote it?

In `lib/store.js`, attaching an email parses the sender, date, subject and plain-text body. A digest of the original bytes is unique per client, so an accidental second upload of the exact same file leaves one entry. Two different versions of a forwarded message can still have different bytes. If you ingest a live mailbox, choose how to identify repeat deliveries from that provider.

The owner change and its handover note commit in one SQLite transaction. The update also checks the current owner. If Mira submits an old form after ownership has already changed, that write fails and the transaction rolls back. Reading Jules’s timeline still begins with the client ID. The old emails never need to move.

```
UPDATE clients
SET owner = ?
WHERE id = ? AND owner = ?
```

`npm test` checks the duplicate upload, a stale handover, the incoming owner and the bytes returned for the original email. For a quick acceptance test with another person, give them just the client name. Ask why the delivery window exists and have them open the email that proves it.

## Run the same handover on Open Mercato

The download includes `integration/open-mercato.mjs`. We ran it against a local Open Mercato 0.10.1 instance with two users in the same organization and the Customers and Attachments modules enabled. It creates a fresh test company and exercises the following operations.

1. `POST /api/attachments` uploads a multipart form. Use `entityId=customers:customer_entity` for the record type, the company’s UUID as `recordId` and the original `.eml` as `file`. Save the returned `item.id`.
2. `POST /api/customers/activities` records the timeline entry. Here `entityId` means the company’s _UUID_. Set `activityType` to `email` and supply the subject, body, sent time and teammate who added it.
3. `PUT /api/customers/companies` takes the company ID and its new `ownerUserId`. Read the company back, list `/api/customers/activities?entityId=<company-id>` and download `/api/attachments/file/<attachment-id>`. Our test found the original activity and recovered a byte-for-byte match after the owner changed.

To run this part yourself, follow the README to select a disposable local instance, an organization-scoped credential and two test-user IDs. The script uses one authorized API caller. A production handover also needs a test signed in as the incoming teammate, with that person’s actual record permissions. Keep credentials on the server and use synthetic mail in this starter. [Explore the Customers API](https://github.com/open-mercato/open-mercato/tree/v0.10.1/packages/core/src/modules/customers/api) and [the Attachments API](https://github.com/open-mercato/open-mercato/tree/v0.10.1/packages/core/src/modules/attachments/api).

Once the handover works, pick a real decision your team struggles to explain six months later. That is the next thing worth putting on your client timeline.
