# Dharmax-way

**The governing, test-first (TDD) method for defining and delivering correct product behavior**, implemented by [AI-Workflow](ai-workflow.md) and governed in engineering by the [Prime Directive](prime-directive.md). The developer owns intended product behavior and its approval; AI helps discover, propose, implement and verify it, but cannot approve its own product definition.

## Normal US-driven cycle

1. **Define and approve the US.** Resolve its actual Actor, Intent, Initial State, Action and full **Expected Result**, including relevant Feature/Aspect context. Reuse/revise existing canonical definitions instead of inventing parallel ones.
2. **Generate and review the executable US test file first.** Derive its behavioral assertions from the accepted effective US, not from existing code or an AI-invented oracle. One cohesive file owns the episode and meaningful scenarios. Before implementation starts, a materialized test may be marked skipped; an uncreated test is uncovered, not skipped.
3. **Establish the actual baseline when work begins.** Activate and run the test. For missing new behavior it **normally fails for the expected product reason (red)**. Existing behavior may already pass; a provider/fixture/infrastructure failure is not expected red. Never manufacture a historical failure.
4. **Resolve the US test through a governing resolution Ticket.** Establish or reconcile the Ticket that owns making this accepted test pass (it may be established before the baseline run to govern execution). Investigate only enough to identify the actual unmet obligations. Derive **smaller coding Tickets only when useful**; each is bounded by the real need, not a mechanical one-Ticket-per-step ceremony.
5. **Engineer and resolve the necessary work.** Apply the [Prime Directive](prime-directive.md) to every touched scope: establish **Concepts → Architecture → execution Flow → Implementation**; reuse existing owners, make guarded changes, keep methods/APIs tight, and obey actual Rules, authorization and applicable Aspects.
6. **Prove the outcome.** Rerun the **same US test** and any necessary specialist tests; obtain real green and independent *current* verification. Record actual evidence and unresolved gaps truthfully. A code change, completed Ticket or graph link alone does not establish Story satisfaction.

Changes in accepted intent or an applicable Aspect may require revisiting the test and affected work. For a bug, reproduce the incorrect behavior through the owning Story where possible and fix the existing identity; for justified technical-only maintenance, a direct Ticket is legitimate without inventing a US.

This is an iterative operating method, not a requirement to create every kind of record for every change. See [the detailed engineering design](../../plans/AIWF-DHARMAX-WAY-DESIGN.md).
