---
webflowId: 6a9fd10217aa9464101ec875
title: KSeF Connector on Open Mercato
heading: 'KSeF on Open Mercato: From e-Invoice Import to Purchase Invoice Approval'
description: GoNextStage KSeF Connector helps accounting teams process e-invoices from KSeF, manage approvals, reduce manual follow-ups, and avoid invoice duplicates in one workflow.
thumbnail:
  src: /media/case-studies/6a9fd10217aa9464101ec83a-6a9fd0c8a5a148372995ffa4-gns-ksef-chart.png
  alt: Diagram of the KSeF Connector invoice flow on Open Mercato
deliveredBy: gonextstage
overview:
  industry: Finance / Accounting (cross-industry)
  timeline: 4 weeks
  type: Integration
  stack: |-
    - Open Mercato (Next.js, TypeScript, PostgreSQL)
    - Open Mercato workflow engine + data sync scheduler
    - KSeF API
stats:
  - title: 4 weeks
    description: From kickoff to a working connector
  - title: 6 stages
    description: Complete invoice approval path
  - title: 0 duplicates
    description: Safe, repeatable KSeF imports
screenshots:
  - src: /media/case-studies/6a9fd10217aa9464101ec82b-6a9fd0c8f53cef2b23f7ae31-gns-ksef-konektor-1.jpeg
    alt: KSeF Connector invoice list view
  - src: /media/case-studies/6a9fd10217aa9464101ec836-6a9fd0c8a1a1ac7a792d49d0-gns-ksef-konektor-3.jpeg
    alt: KSeF Connector invoice approval workflow view
categories:
  - erp
  - enterprise
  - multi-tenancy
featuredOnAgencies: false
draft: true
---

For accounting teams in Poland, KSeF (the national e-invoicing system) changes how invoices enter the organization, how they are reviewed, and how quickly they can move through approval and posting. The real challenge for enterprises is to turn every incoming invoice into a clear, compliant business process. KSeF Connector, built by GoNextStage on Open Mercato, helps accounting and finance teams work with e-invoices in a way that feels practical, structured, and secure.

## The business challenge

KSeF standardizes how invoices are exchanged with the government system, but it does not provide the business context behind each document. Accounting managers still need to know which entity the invoice belongs to, who should review it, who has approved it, whether supplier data is correct, and where the document currently stands in the process. In practice, teams fall back on manual follow-ups, scattered status checks, and avoidable delays. A smart automation solution closes this gap by turning each incoming invoice into a clear, traceable workflow.

## The solution

GoNextStage KSeF Connector was developed using Open Mercato's built-in capabilities for secure integrations, automated data synchronization, access control, and workflow management. For the GoNextStage team, it meant that they could focus on what matters most to business users: **a reliable purchase invoice automation process.**

### How it works

Incoming invoices are retrieved from KSeF, assigned to the right organization based on tax identification data, stored with all key metadata, and then passed into a workflow. Communication with KSeF is designed to be safe and repeatable. If an import needs to be run again, the system can continue the process without creating duplicate invoice records. Thanks to that, manual cleanup is minimized and accounting teams can truly rely on the data they work with.

Once an invoice is imported, it can start a **complete invoice approval path**: registration, business description, approval, accounting verification, consultation (if needed), and archiving. At each stage, an authorized person receives the right task, with the invoice preview and process context available in one place.

Importantly, the system keeps invoice data within the right company context. In other words: **users only work with the documents and organizations they are allowed to access.** This helps accounting teams maintain clarity and control, especially in multi-company environments.

e-Invoicing systems across Europe rely on XML invoice files. It is a structured, machine-readable format used to exchange data between systems. While XML is useful for automation and compliance, it is not designed for everyday business users. For accounting specialists, reading a raw XML file can be time-consuming and difficult to interpret. With GoNextStage KSeF Connector, users do not need to work with raw XML files. XML invoices are transformed into a human-readable, PDF-like format, enabling users to efficiently review the document, understand its context, and perform the required actions directly within the workflow.

## Benefits of GoNextStage KSeF Connector for finance teams

- Compliant with the current requirements of the Polish Ministry of Finance
- Automatic invoice retrieval from KSeF and automatic updates to the document report with the retrieved invoices
- Easy invoice search and complete invoice history sorted by payment due date, status, amount, issuer, invoice number, or issue date
- Preview and download invoices without logging in to the government system
- Clear invoice statuses - each invoice has its own status: Sent to KSeF, Accepted, Rejected by KSeF, Error, Ready for KSeF, and more
- Integration with any system, including document workflow and ERP systems
- Clear ownership of every invoice, as each document is assigned to the right organization and moved through defined process steps
- A user-friendly workspace - accounting users work in a dedicated front-end designed around invoices, tasks, contractors, and decisions, not system administration

## Built on Open Mercato

Open Mercato facilitated integration management, synchronization, scheduling, event handling, workflow, role-based access, multi-organization support, and secure storage. Thanks to that, GoNextStage could focus on the adaptation of KSeF-specific logic, designing accounting processes, invoice visualization, and shaping the user experience. This foundation makes the application **easier to evolve over time.** New business rules, integrations, and workflow variants can be easily added without rebuilding the Connector.
