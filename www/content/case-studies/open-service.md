---
webflowId: 6a4e81c674f233a19120fe88
title: 'Open Service: connect every step of a repair'
heading: 'Open Service: connect every step of a repair'
description: 'A field service demo built around the handoffs that matter: capture the request, identify the machine, assign the technician and preserve what happened, in one Open Mercato workspace.'
thumbnail:
  src: /media/case-studies/6af1fadaee6670759c32ef4f-6af1fabaed75836ab66ea196-open-service-cover.jpeg
  alt: Illustrative mockup of Open Service tickets and map on an office desktop monitor
heroVideo: Kj-qMf5RRo4
deliveredBy: scaleoma
overview:
  client: 'Demo: field service management'
  industry: Field Service Management
  timeline: Hackathon build
  type: Vertical operations system (demo)
  stack: |-
    - Open Mercato core: auth, multi-tenancy, audit logs, module APIs
    - Omnichannel ticket intake (email, phone, SMS, web)
    - Machine + technician data model
screenshots: []
categories:
  - crm
featuredOnAgencies: true
draft: false
---

## The repair starts before a technician arrives

A service request can arrive by email, phone, SMS or a web form. Before anyone schedules a visit, the team still has to identify the machine, find its history and work out who has the right skills to help.

When each answer lives somewhere different, coordination becomes part of every repair. A message contains the reported problem. A separate file holds the serial number. Someone on the team knows the warranty status or remembers the previous visit.

Open Service explores how that workflow can work in one application. Built as a hackathon demo on Open Mercato, it brings request intake, equipment records and technician scheduling into a shared operational workspace.

<figure><img src="/media/case-studies/6af2d0b14c918da2c831c2c5-6af2d00e4b3709454aa2e16f-open-service-1-gradient-clean.jpeg" alt="Open Service demo showing the operations dashboard and map" /><figcaption>The Open Service demo brings service records and a location view into one operational surface.</figcaption></figure>

## Give every incoming request the same starting point

The first step is a common place to capture the work. Open Service is designed around centralised intake for reports originating from email, phone, SMS and web forms.

That shared starting point matters because the communication channel should not decide where the service history lives. Once a report becomes part of the workflow, the team can work with the request as an operational record.

The demo’s request list makes the work visible through records with statuses and priorities. It gives the team an overview before moving into the details of a particular issue, and a shared reference when responsibility moves from one person to another.

<figure><img src="/media/case-studies/6af2d0b14c918da2c831c2c2-6af2d00e25bad80337bd29eb-open-service-2-gradient-clean.jpeg" alt="Open Service demo service request list with status and priority" /><figcaption>Service requests in the demo, with status and priority visible in a shared list.</figcaption></figure>

## Identify the machine before assigning the work

A report alone is not enough to plan a useful visit. The technician needs to know which piece of equipment is involved and what is already known about it.

Open Service includes a machine database with serial numbers, locations, warranty status and repair history. The service workflow connects a customer report to that equipment context before moving on to assignment.

This is the point where a ticket becomes more than an isolated message. A machine can appear in many requests over time. Keeping its identity and history together gives each new report a context that does not depend on finding the person who handled the last one.

<figure><img src="/media/case-studies/6af2d0b14c918da2c831c2bf-6af2d00f8f2eeccf9ee131eb-open-service-3-gradient-clean.jpeg" alt="Open Service demo machine inventory" /><figcaption>The machine inventory provides a stable equipment record behind individual service requests.</figcaption></figure>

## Make the handoffs explicit

The demo follows five steps: customer report, machine lookup, technician assignment, visit scheduling and service-history documentation. Each step answers a different operational question.

The report captures what needs attention. Machine lookup establishes the equipment context. Technician profiles include competencies and certifications to inform assignment. Scheduling turns the assignment into a planned visit. Documentation preserves what happened for the next time that machine needs service.

Making that sequence explicit gives the application a clear domain workflow. The product is organised around moving work from a reported problem to an informed visit and a retained history.

## Build the service logic on an existing foundation

Open Mercato supplied authentication, multi-tenancy, audit logs and module APIs. Those capabilities give the application its underlying structure, while the custom layer models requests, machines, technicians and the transitions between them.

That separation allowed the hackathon team to concentrate on field service. They could use the framework’s common application capabilities while designing the relationships that make this particular workflow useful.

The result demonstrates how a business application can take shape around an operational process. The equipment model and service handoffs remain specific to the domain; the team does not need to recreate the entire application foundation to express them.

## What the demo makes tangible

Open Service shows a connected path from intake to service history. The same workspace holds the request, the machine context and the work of assigning and scheduling a technician.

The practical idea is continuity. Information gathered at the start of a service request should still be useful when the technician is assigned, when the visit is planned and when the next request arrives.

The project is presented by [ScaleOMa](/certified-partners/scaleoma). The build team includes Bartosz Wysocki, Łukasz Chruściel, Łukasz Kurasiński, Jarek Kałasz, Robert Starecki and Dawid Posała. Watch the walkthrough above to see the demo in action.
