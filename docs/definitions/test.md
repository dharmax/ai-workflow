# Test

An executable check of actual behavior or a necessary engineering invariant. **AIWF testing is US-driven by default, almost exclusively:** the primary product acceptance test is derived **before implementation** from an accepted, complete [User/Actor Story](user-story.md), using its Initial State, Action and **Expected Result** through a genuine public interface. The reviewed test defines the acceptance target; it does not copy the current implementation's behavior.

**One cohesive executable test file per accepted US**, holding the meaningful ordinary, conditional, non-pristine, regression and failure/safety scenarios of that episode. A meaningful [sub-US](sub-user-story.md) is itself a US. Historical cases should be moved/refined when they protect real Story behavior; do not manufacture a Story to justify a technical test or discard important coverage for a file-count target.

**Limited exception:** focused internal/unit/technical tests are warranted by demonstrably complex or critical mechanisms/invariants (e.g. atomic concurrency, leases, parsers). They supplement, never substitute for, public Story acceptance. Shared fixture/helpers do not become separate US acceptance suites merely because they are reusable.

At the start of resolution, activate/run the US test to establish the actual baseline: **normally expected red** for genuinely missing new behavior, but possibly already green for implemented behavior. A wrong-reason failure is not expected red. The resolution Ticket exists to satisfy that test; any smaller coding Tickets must be justified by real unmet work. Rerun the same test and independently verify the current result.

A test definition, a Test graph node, an actual run, and **current verification evidence** are distinct. Do not infer success from graph links, a stale pass flag, a Ticket lane, a skipped run, or an unavailable dependency. No fictional historical expected-red phase. See [the testing design](../../plans/AIWF-DHARMAX-WAY-DESIGN.md#4-testing-stories-are-the-measure).
