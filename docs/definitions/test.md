# Test

An executable check of actual behavior or a necessary engineering invariant. **AIWF testing is US-driven by default, almost exclusively.** Derive the genuine product acceptance test **before implementation** from an accepted, complete [User/Actor Story](user-story.md): its actual Initial State, Actor Action and **Expected Result**, exercised through a public interface. The approved US, not a stub or existing implementation, determines the oracle.

**One cohesive executable acceptance-test file per accepted US** holds ordinary, conditional, non-pristine, regression and relevant failure/safety scenarios. A meaningful [sub-US](sub-user-story.md) is itself a US. Preserve/refine historical cases when they protect real Story behavior, without manufacturing Stories or chasing test-file counts.

## Separate full-flow skeleton test

For multi-component work, a separate **skeleton test** may prove the complete path is connected while deliberately temporary internal stubs/mocks provide missing functionality. Real components are preferred wherever practical. **Skeleton green means wired, not implemented or accepted.** The real US test is *not* changed, mocked into passing or replaced. It remains active/red for genuinely unmet behavior; if temporary placeholders misleadingly make it report green, that run is not valid acceptance. The skeleton test is an implementation aid, **not** another US or competing acceptance oracle.

Each temporary internal implementation stub automatically has **one coding Ticket** to replace it with real behavior and remove the placeholder; reconcile an existing Ticket for that same stub, without duplication. Controlled test doubles for genuinely external dependencies are distinct from unfinished internal functionality. Do not create artificial production interfaces purely to facilitate mocking. Full-flow-first is preferred when several components must cooperate, not mandatory for trivial changes.

**Other focused technical/unit tests** are justified by demonstrably complex/critical invariants (e.g. atomic batches, leases, parsers). They supplement, never substitute for, genuine Story proof. Shared fixtures/helpers do not become new Story suites.

At work start, establish the actual US-test baseline (normally expected red for missing behavior, but potentially already green for implemented behavior); a wrong-reason failure is not expected red. Rerun the same genuine test after implementation and verify current results independently. A test definition, Test graph node, test run and current proof are distinct; do not infer success from graph links, stale pass flags, Ticket lanes or skipped/unavailable tests. Never invent historical red. See [the governing testing design](../../plans/AIWF-DHARMAX-WAY-DESIGN.md#4-testing-stories-are-the-measure).
