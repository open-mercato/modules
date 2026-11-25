---
webflowId: 6af1f6077800d8a6e0170da0
title: 'Vistula Valley: a custom member platform powered by Open Mercato'
heading: How Vistula Valley built a custom member platform with Open Mercato as its backend
description: A branded member directory, board approval workflows and annual membership access, connected through Open Mercato with Zeffy, Resend and Prelude.
thumbnail:
  src: /media/case-studies/6af1fb4bebbf1b254910586a-6af1fb43d021ecd8c3b2d5a7-vistula-cover-wide.jpeg
  alt: Vistula Valley logo and eagle in flight, landscape cover
heroVideo: xd9YxWFfAoE
overview:
  client: Vistula Valley
  industry: Community / professional network
  timeline: Around two months of testing at the time of the walkthrough
  type: Member platform with a custom frontend
  stack: |-
    - Open Mercato backend and admin
    - Custom member-facing frontend
    - Open Mercato forms
    - Zeffy payments
    - Resend email
    - Prelude SMS verification
stats:
  - title: Custom frontend
    description: A branded experience for members
  - title: 3 integrations
    description: Payments, email and SMS verification
  - title: Annual membership
    description: Access rules connected to payment and membership status
screenshots: []
categories:
  - crm
featuredOnAgencies: false
draft: false
---

## A member directory with a workflow behind it

Vistula Valley is a global Polish community connecting people across regions. Its members needed one place to find each other, browse profiles and professional information, and request introductions.

The visible product was a member directory. Behind it, the organization needed a much more specific process: applications reviewed by the board, invitations, onboarding, annual membership payments and access rules. The experience also had to reflect Vistula Valley's own identity.

Bartek built a custom frontend and used Open Mercato as its backend and administrative workspace. This gave the community its own member experience, with the operational process implemented in a framework the developer could extend.

<figure><img src="/media/case-studies/6af2d0b14c918da2c831c29c-6af2d0170acbd78719ecfb8e-vistula-directory-gradient-clean.jpeg" alt="Recreated Vistula Valley member directory with fictional profiles on a purple and green gradient" /><figcaption>The custom member-facing directory, recreated with fictional profiles and sample results.</figcaption></figure>

## The challenge: more than a searchable list

A new applicant could not simply register and gain access. The board first had to approve the application. Only then could the applicant continue through onboarding. Payment status determined access to the directory, while profile creation and visibility followed their own rules.

Bartek explored backend options but did not find one that matched the required level of customization. Building the entire backend from scratch would also mean taking responsibility for foundational concerns such as security, complexity and stability.

His approach was to use Open Mercato as the foundation, then implement the community's features and workflows on top.

## The architecture: a custom frontend, Open Mercato underneath

The member-facing frontend was built separately. Open Mercato handles the backend, administrative tools and forms used for applications and updates. The implementation connects three external services: Zeffy for payments, Resend for email and Prelude for SMS verification.

That separation lets Vistula Valley shape the member experience without making the board work through the same interface. Members use the branded directory; administrators use a simplified workspace focused on the actions they need to take.

<figure><img src="/media/case-studies/6af2d0b14c918da2c831c270-6af2d017ead7d7f72ea6318a-vistula-architecture-gradient-clean.jpeg" alt="Vistula Valley architecture linking a custom frontend and forms to Open Mercato, Zeffy, Resend and Prelude" /><figcaption>Architecture recreated from the supplied diagram. Connections show integrated systems, not detailed data-flow directions.</figcaption></figure>

## A review process the board can actually use

The board members using the admin panel are not technical users. Bartek adapted the default layout to put the important tasks first: applications to review, payments to match and members without a login. Existing members had been imported from the community's WhatsApp group.

Applications are assigned to a regional owner. The review screen brings the applicant's information, review status and approval actions into one place. After acceptance, the system sends an invitation automatically, and an administrator can resend it when needed.

The member record brings together profile details, membership status and administrative information. The board can help a member complete or correct information without needing to work directly with the database.

<figure><img src="/media/case-studies/6af2d0b14c918da2c831c29f-6af2d01ca434a527628a3549-vistula-review-gradient-clean.jpeg" alt="Recreated Open Mercato application-review screen for Vistula Valley with fictional member details" /><figcaption>Application-review workflow for the board, recreated with fictional data. Names and account identifiers from the recording are not included.</figcaption></figure>

## Membership status controls the experience

The directory is connected to the same member information managed in Open Mercato. Members can edit their profiles in the frontend, and those changes go back to the backend.

Access follows annual membership status. A person can create a profile and be listed without having paid, while browsing other members requires an active membership. In the demonstration, changing the membership expiry date in the admin panel caused the frontend to show a lapsed-membership screen when the directory was refreshed.

That screen explains what has paused and gives the member a renewal path. Restoring the membership date in the backend restores access. The rule is part of the application workflow, rather than a separate manual checklist for the board.

<figure><img src="/media/case-studies/6af2d0b14c918da2c831c282-6af2d0188949ac4cedeed785-vistula-membership-gradient-clean.jpeg" alt="Recreated Vistula Valley lapsed-membership screen with renewal and sign-out actions" /><figcaption>A clear access state for expired memberships. The date shown is illustrative.</figcaption></figure>

## The result: a tailored application on an existing foundation

Vistula Valley gained a custom member platform with a connected administrative workflow. Applications, invitations, profiles, payments and membership access can be managed as parts of the same process.

Bartek says that using Open Mercato saved time and integration work compared with building his own backend. At the time of the recording, he reported testing the application for around two months without encountering problems with Open Mercato or the app. That is his experience of this implementation, rather than a general reliability guarantee.

> “I just created the main framework and added my features to Open Mercato. That saved me a lot of time and a lot of trouble with integrations.”

_Bartek, developer of the Vistula Valley member platform. Lightly edited for readability from the supplied walkthrough._

The project shows how Open Mercato can serve as the backend for a distinct customer-facing application: a custom frontend for members, an operational workspace for the board, and shared rules connecting the two.

## Watch the walkthrough

Bartek demonstrates the architecture, application review, member directory and membership access rules in the video at the top of this case study. [Watch the Vistula Valley walkthrough on YouTube](https://youtu.be/xd9YxWFfAoE).

_Based on the supplied product walkthrough and screenshots. All interface illustrations have been recreated with fictional data. Learn more about the community at [vistulavalley.org](https://vistulavalley.org/)._
