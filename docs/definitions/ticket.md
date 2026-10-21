# Ticket

A **bounded unit of engineering work** grounded in real product/Story obligations, an existing defect or justified technical need. It identifies the work and enough priority, prerequisites, targets and acceptance obligations to execute and independently verify it. Current Tickets include **task** and **bug** kinds, with their own work lifecycle, claim and governance.

For US-driven delivery, a **resolution Ticket** owns satisfying the already approved genuine US acceptance test. During full-flow skeleton development, **every introduced temporary internal implementation stub immediately gets one coding Ticket** specifying the stub, its missing real behavior and the obligation to replace/remove it. Reconcile/reuse any Ticket already tracking that same stub; never silently lose an obligation or create needless duplicates. Other smaller coding Tickets are derived only from genuine unmet work.

A separate skeleton test passing cannot complete the resolution Ticket. Completion requires all unfinished internal placeholders replaced, their Tickets resolved, the genuine US test passing without their assistance, and valid independent evidence. Controlled test doubles for external services are not automatically unfinished implementation stubs.

An [Epic](epic.md) groups work; a [US](user-story.md) defines intended behavior. A Bug describes incorrect existing behavior and need not generate a new Feature/Story. Pure technical maintenance/refactoring can use a direct Ticket grounded in existing behavior and safety, without a fictitious hierarchy. Accepting a definition, claiming work, implementation and independently verified completion remain distinct.
