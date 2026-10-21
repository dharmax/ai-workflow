# Ticket — canonical work item

A **bounded unit of engineering work** grounded in approved product/US obligations, an existing defect or a justified technical need. It describes the action, relevant priority, prerequisites/dependencies, targets and completion obligations sufficiently to execute and independently verify it. A Ticket represents **work to perform**, not product functionality ([Feature](feature.md)), an episode of use ([US](user-story.md)), or proof.

## Planning views, not competing Ticket models

The *same canonical Tickets* can be understood or displayed through complementary familiar approaches:

| View | What it clarifies |
| --- | --- |
| **Kanban** | A board/card for each Ticket, grouped by actual work state (e.g. Backlog, Todo, In Progress, Blocked, Done); movement is governed, not merely dragging a label. |
| **Gantt** | A scheduled/dependency view of Tickets, showing estimated/actual duration, dates and ordering **only where known and useful**; it must not invent a deadline or estimate. |
| **Scrum** | A Ticket may be an item of planned iteration/sprint work, be decomposed when useful, and contribute to an Epic or a larger goal. Sprints, points and Scrum ceremonies are **not** mandatory properties of every Ticket. |

Priority, dependency, state, claim/owner and verification are distinct concerns. Views do not become alternative databases, proof states or competing authorities. Do not confuse a Kanban Ticket in Done with a satisfied US.

## Types and resolution

- A **resolution Ticket** owns making an already approved, genuine US acceptance test pass through correct implementation and current verification.
- A **coding Ticket** is bounded necessary implementation work under that resolution; when a temporary internal stub is introduced in a full-flow skeleton, **one coding Ticket per stub is mandatory immediately**, identifying the placeholder and required real replacement/removal. Reuse/reconcile an existing Ticket for that exact stub, rather than duplicate it. Other decomposition follows actual needs, not ceremonial task counts.
- A **Bug** is a typed Ticket for incorrect existing behavior, normally grounded in its existing US/Feature; it does not automatically create a new US.
- Justified technical maintenance/refactoring can use a direct Ticket without a fictional product hierarchy.

A [primary Epic](epic.md) groups delivery and may supply common Story context; a Ticket can have dependencies and relevant parent work, but neither an Epic nor a board lane silently changes the Ticket's acceptance contract. A skeleton test passing cannot close the resolution Ticket. Its real US test, missing internal stubs, necessary specialist checks and independently valid [evidence](verification.md) determine completion. Definition acceptance, work claim, progress, Done and verified product behavior are distinct.
