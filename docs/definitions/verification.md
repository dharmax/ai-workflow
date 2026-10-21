# Verification and Evidence

**Verification** establishes whether the actual product and engineering result satisfies the **currently applicable** approved definition and obligations. **Evidence** is the attributable record of what actually ran or was inspected, under which inputs/versions and with what result. Neither an AI's confident narration nor a graph edge is proof.

The primary product acceptance basis is the [US](user-story.md)'s **Expected Result** and applicable [Aspects](aspect.md), with the [Test](test.md) exercising real public behavior. A separate skeleton test may prove wiring, **not** acceptance. Narrow specialist/invariant checks supplement Story evidence; independent verification evaluates the result, not simply the implementation actor's own claim.

Keep these distinctions truthful:
- Accepted intent **does not mean implemented**; a Done Ticket **does not by itself mean satisfied Story**.
- Uncreated/uncovered, intentionally skipped before work, active expected-red for genuinely missing behavior, actual green, blocked/provider failure, not-run and stale evidence must not be conflated.
- A pass applies only to the specific current definition, applicable policy, test, source/fixture and relevant environment basis. Material changes require impact review and appropriate re-verification; retain historical evidence as history, not current proof.
- Missing charter or an unanswered material [charter-alignment warning](product.md) cannot be hidden by a passing test.

The [Project Graph](project-graph.md) connects definitions, runs and receipts for traceability. Structural links and count totals are not behavioral acceptance.
