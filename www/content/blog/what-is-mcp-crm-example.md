---
title: What is MCP? Follow one question from an AI to a CRM
description: See how the Model Context Protocol connects an AI client to CRM tools. Follow a read-only example from tool discovery to a deal record.
date: '2026-11-26T00:00:00.000Z'
category: ai-engineering
featured: false
thumbnail:
  src: /media/blog/6b08ba324c4662bd5519b568-6b08b99ff8bde4ed6b7c329a-om-guide-mcp.jpeg
  alt: ''
  decorative: true
draft: false
---

MCP stands for **Model Context Protocol**. It gives an AI application a common way to discover tools on a server and ask that server to run one. If you ask which deals belong to a customer, the answer can come from your CRM records, including a deal created five minutes ago.

<om-embed name="blog-what-is-mcp-crm-example-1"></om-embed>

## Who does what in an MCP request?

The **host** is the application where you ask the question. Its **client** speaks MCP to the CRM's **server**. The server advertises tools and their input schemas and can run a permitted tool against business data. The model helps the host choose a tool and form the request. Your application still owns the records, their meaning, and access to them. [Read the protocol's architecture overview.](https://modelcontextprotocol.io/docs/learn/architecture)

## Try the two calls with a test company

1. Connect an MCP client or Inspector to a test Open Mercato installation using the setup guide below. Use a test identity with access to read companies and deals. Inspect `tools/list` to see the names and inputs exposed for that identity.
2. Find the company with `customers.list_companies`. In our demo the arguments were `{"q": "Harborview Analytics", "limit": 5}`. In your installation, use a company you know. If two records match, compare their domains or other identifying details.
3. Copy its ID and call `customers.get_company` with `{"companyId": "YOUR-COMPANY-UUID", "includeRelated": true}`. Replace the placeholder with the actual UUID. Inspect `related.deals` and keep the statuses you count as active. The related-record collection is capped at 100. For an account that reaches that limit, check a complete paginated report before stating an account-wide total.

Why make two calls? Searching deal titles for “Harborview” misses “Midwest Outfitters Expansion.” The company record preserves the link between the two names. In our demo it also had a won deal, “Blue Harbor Grocers Pilot Program.” Including it would give a misleading answer to a question about active work.

## What an empty result tells you

Choose Copperleaf and then “Only the literal ‘open’ status.” The company exists. One linked deal is in progress and one is lost, so zero have the exact status you selected. Switch to “Open and in progress” and one deal qualifies. The words a sales manager uses can cover more than one stored status. A client that shows the filter makes that difference visible.

In Open Mercato, the MCP server exposes tools to external clients. The in-app agent framework can use tools to make decisions as part of a workflow. A CRM lookup needs only the read side. [Connect and inspect the Open Mercato MCP server.](https://docs.openmercato.com/framework/ai-assistant/mcp)
