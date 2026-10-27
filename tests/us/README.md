# Official User Story acceptance tests

Start with **one primary scenario per User Story**:

- **Given:** create and accept a complete User Story through public AIWF tools/facades in a fresh test project.
- **When:** invoke the public user operation (for resolution, `resolve_ticket`).
- **Then:** verify independently observable behavior and the Story's effective state.

Do **not** supply the desired code edits or a passing acceptance verdict to the resolver.
Add variants only for distinct user outcomes. Internal parsing, indexing, locks,
receipts and contract mechanisms belong in `tests/integration/` or component tests;
they cannot substitute for public US acceptance.

## Isolation

Every test owns a new `mkdtemp` project with its own Git repository, AIWF
database and config. It must close its store/processes and delete the project
in `finally`, **including on failure**. Never run these tests against the
developer's current project or share state between tests. Export diagnostics
outside the project if necessary; never retain the project as a side effect.

## Run

The primary Story resolution acceptance test uses the established controlled
definition reviewer **only to construct its accepted Story initial state through
public operations**. It restores the actual configured implementation and
independent acceptance models before calling `resolve_ticket`. This tests real
Story resolution, not real charter-review model reliability. Charter-review
model behavior requires a separate, dedicated US test.

The resolution test invokes **real configured models**. It is intentionally opt-in to avoid false offline success and unapproved inference
costs in routine `bun test` runs:

```sh
AIWF_LIVE_US_TESTS=1 bun test tests/us/resolve-greeting-story.test.ts
```

Set up an available implementation model and an independent reviewer in the
normal AIWF configuration first. A skipped US test is **not** a passed
acceptance test. Deterministic scripted resolution and lower-level mechanics
remain available separately under `tests/integration/` and are not reported as
independent end-to-end US acceptance.

## Local llm-utils dependency

This project links `@dharmax/llm-utils` from `../llm-utils` (see
`package.json`). The Actor's bounded schema correction is tracked in
`dharmax/llm-utils#11`. Until that fix is merged, running the updated
end-to-end test requires checking out that sibling branch too. Do not
mistake an AIWF-only checkout for the complete fix.

## Failure diagnosis

Live acceptance prints `START`, `PASS`, and `STILL` messages with elapsed
seconds for each setup and resolution stage. The `resolve_ticket` operation
receives a 180-second cancellation signal; Bun's 300-second ceiling is the
last-resort guard. Read the **last START/STILL stage** to distinguish slow
Product review/setup from resolution. The project is removed on test failure
and a process-exit cleanup is also registered for runner-level timeouts.
