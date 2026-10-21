# US test

**Status:** Developer-agreed consolidation/testing principle; not a US field.

A test establishes whether actual product behavior meets the **Expected Result** of a real [User/Actor Story](user-story.md). **One executable test file per accepted US**; its scenarios can cover the primary episode, real alternatives, non-pristine Initial States, meaningful sub-flow/conditional outcomes, discovered bug regressions and necessary failure/safety cases.

- Keep or refine an old test **when it represents a real US/sub-US flow or meaningful edge condition**, even if technically detailed. Place it under its owning US, not under a historical subsystem/test-count bucket.
- A distinct implementation assertion alone does not justify keeping a case. Inspect unmatched old tests for a genuinely missing US/sub-US **before** deciding to retire them.
- Do not manufacture a US around an easy-to-migrate technical test.
- A test's observation is **verification evidence**, not the Story's Expected Result and not authority to invent product meaning.
- For existing behavior, verify current truth; do not invent a historical red run or pretend skipped/unavailable tests passed.

Test organization is downstream of the developer-approved Story definition. It is not a reason to rewrite that definition.
