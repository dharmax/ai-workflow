# AIWF Agency Constitution

**Authority:** architectural invariant for every Actor, discovery, tool, skill, codelet, routing and shell change.

AIWF wraps a general reasoning model. Infrastructure must make that model more capable, grounded, safe and efficient — never reduce solvable goals to a pre-enumerated catalog or one preferred execution mechanism.

## Constitutional rules

1. **The Actor is the general problem solver.** The user supplies a goal. The Actor determines what it needs to know or do, chooses useful means, gathers evidence, acts, observes, replans and finishes.
2. **Goal precedes strategy; strategy precedes capability.** Never start from “which tool handles this phrase?”. Start from outcome and evidence/action needs.
3. **General knowledge is valid methodology; project facts require evidence.** Model knowledge may determine *how* to solve a problem. Claims about the current project/runtime require observed evidence or valid derivation from observed evidence.
4. **System-1 advises; it never governs.** Cheap tactical assessment may describe task shape, evidence needs and promising means. It cannot permit/forbid a goal, shrink the Actor's available powers, or force one route.
5. **Discovery is optimization, never a competence boundary.** Failed/empty/misleading semantic discovery may reduce convenience, not make an otherwise solvable goal impossible.
6. **Bootstrap competence is plural.** The Actor must retain access to universal environment execution, capability acquisition, reusable know-how acquisition, and bounded deterministic composition. No single one of these is “the universal solution”.
7. **Skills, capabilities and codelets are distinct.** Skills provide reusable know-how; capabilities provide operations/evidence; compiled codelets provide deterministic composition. Keep the semantic distinction.
8. **Self-extension is first-class and ephemeral by default.** Missing deterministic composition may be compiled for the run. Persistence/promotion requires reuse evidence or explicit intent.
9. **Generated artifacts are not source evidence.** Tests/examples/scratch data can verify computation but cannot establish facts about the project. Derived facts must retain input provenance.
10. **Execution authority applies to generated code too.** No compiler/codelet path may bypass cancellation, read-only scope or safety boundaries by executing generated code in-process without equivalent enforcement.
11. **Modes optimize; they do not define competence.** DEV/PRODUCT/DESIGN/TRIAGE influence preferences, not the set of goals the Actor may attempt.
12. **Optimizations may not become prerequisites.** Registry ranking, System-1, skills, semantic tags, cached context, specialist tools and model routing are optional aids unless the goal genuinely depends on them.
13. **Failure is evidence, not surrender permission.** AIWF may claim inability only after the concrete required dependency is inaccessible, unsafe, unauthorized, or requires user input.
14. **No phrase-shaped architecture.** Never add production logic for “second”, “least”, “critical path”, or another acceptance phrase when general reasoning/composition can solve the class.
15. **Outcome proves agency.** Classifier/tool/unit tests prove mechanisms. General competence is accepted only through realistic actor journeys plus independently checked truth.

## Degradation law

Disable or break any *one* optimization — System-1, semantic discovery, a specialized skill, or the compiler — and AIWF should either find another reasonable route or name the concrete dependency that truly became unavailable. It must not collapse into generic “tool limitations”.

## Merge law

Any Actor/discovery/skill/compiler/routing change that violates this constitution or the current Agency Gate in `docs/agency-restoration-plan.md` must not merge as completed agency restoration.

When an optimization conflicts with agency, agency wins.
