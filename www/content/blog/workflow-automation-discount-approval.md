---
title: What is workflow automation? Try a discount approval
description: Test a discount approval workflow with an editable threshold. See what happens at the boundary, when a manager declines, and when nobody has answered.
date: '2026-11-26T00:00:00.000Z'
category: architecture
featured: false
thumbnail:
  src: /media/blog/6b08ba36f93ab75edc03a578-6b08b9a042a80257b3239d86-om-guide-workflow.jpeg
  alt: ''
  decorative: true
draft: false
---

Workflow automation moves a request through a defined set of steps. A sales rep submits a discount. The system checks the percentage, approves a routine request, or sends an exception to a manager. At any point the rep should be able to tell who owes the next decision.

<om-embed name="blog-workflow-automation-discount-approval-1"></om-embed>

## Turn a sentence in a sales policy into a rule

Under this sample policy, a rep may offer up to and including 10%. Anything higher needs a manager. Start with 8%, then enter exactly 10%, then 10.01%. The first two requests qualify automatically. The third waits. Testing the boundary catches a common disagreement between the person who wrote “up to 10%” and the person who implemented the comparison.

Try declining the pending request. A decline is a finished decision the rep can act on. A request that nobody has answered is still pending. Treating those as the same state creates a hard-to-explain problem for the customer waiting on the price.

## What to store when a discount is approved

Keep the quote identifier, its revision, the discount requested, the policy limit used, the outcome, the decision time, and the person or rule responsible. Suppose a manager approved 12% and the rep later changes the quote to 18%. A fresh request should reference the revised quote. Otherwise a technically valid approval can silently authorize a different deal.

Decide how your team handles silence. In this example, time passing leaves the request pending. A real team might remind the manager after one working day and escalate to a named backup after two. Make that a deliberate policy. A reminder and an approval have different consequences.

## Build the same process in Open Mercato

1. In **Workflows**, choose **Create Workflow**. Open a blank canvas or inspect the order-approval template to see an existing definition.
2. Start with the request data. Add a condition for the percentage. Route values at or below the limit to an approved outcome.
3. On the exception path, add a **User Task** assigned to the responsible role. Give approval and rejection their own transitions and end states.
4. Run the three boundary cases above. Open a pending run and look for the active step. Complete the task and check that the recorded outcome agrees with the choice you made.

The small simulator above runs only on this page. In an application, the workflow also needs a connection to the quote and the people allowed to approve it. The Studio guide shows how to assign a user task and connect its transitions. [Build an approval workflow in Open Mercato Studio.](https://docs.openmercato.com/user-guide/workflows/creating-workflows)
