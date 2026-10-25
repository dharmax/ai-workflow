# Verification and Evidence

**Verification** establishes whether the actual product and engineering result satisfies the **currently applicable** approved definition and obligations. **Evidence** is the attributable record of what actually ran or was inspected, under which inputs/versions and with what result. Neither an AI's confident narration nor a graph edge is proof.

The primary product acceptance basis is the [US](user-story.md)'s **Expected Result** and applicable [Aspects](aspect.md), with the [Test](test.md) exercising real public behavior. A separate skeleton test may prove wiring, **not** acceptance. Narrow specialist/invariant checks supplement Story evidence; independent verification evaluates the result, not simply the implementation actor's own claim.

Keep these distinctions truthful:
- Accepted intent **does not mean implemented**; a Done Ticket **does not by itself mean satisfied Story**.
- Uncreated/uncovered, intentionally skipped before work, active expected-red for genuinely missing behavior, actual green, blocked/provider failure, not-run and stale evidence must not be conflated.
- A pass applies only to the specific current definition, applicable policy, test, source/fixture and relevant environment basis. Material changes require impact review and appropriate re-verification; retain historical evidence as history, not current proof.
- Missing charter or an unanswered material [charter-alignment warning](product.md) cannot be hidden by a passing test.

## Mutation-proportional postconditions

**Verification and acceptance effort must be proportional to the actual change, its impact, uncertainty and applicable obligations.** A diff's line count is only a weak signal: select the narrowest current tests and review evidence that genuinely cover the affected behavior and credible blast radius. Reuse still-valid evidence for unaffected parts, rather than rerunning everything automatically.

A localized, well-understood three-line fix should normally be **very quick to accept or reject**: a relevant existing US/regression test, a focused change/contract check and proportionate independent assessment may suffice. Do not require a full-suite run, comprehensive reinvestigation or repeated LLM reviews for routine low-risk work. Conversely, a one-line change to authentication, shared persistence, authorization, concurrency or a widely used API might need much more. A **new US** or material change to approved product behavior requires developer approval, its genuine Story test lifecycle and applicable independent acceptance.

**Proportional does not mean optional correctness.** Preserve applicable authorization, mandatory Rules/Aspects, genuine test oracles, source-change safeguards, evidence freshness and coherent independent completion. Select checks based on actual impact and evidence; if scope/risk is not sufficiently understood, investigate further or report an unresolved state. Do not build a new risk-scoring engine, static tier taxonomy or additional gate ceremony for this principle.

The [Project Graph](project-graph.md) connects definitions, runs and receipts for traceability. Structural links and count totals are not behavioral acceptance.
