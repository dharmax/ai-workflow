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

The primary Story resolution acceptance test invokes **real configured models**.
It is intentionally opt-in to avoid false offline success and unapproved inference
costs in routine `bun test` runs:

```sh
AIWF_LIVE_US_TESTS=1 bun test tests/us/graph-field-migration.test.ts
```

Set up an available implementation model and an independent reviewer in the
normal AIWF configuration first. A skipped US test is **not** a passed
acceptance test. Deterministic scripted resolution and lower-level mechanics
remain available separately under `tests/integration/` and are not reported as
independent end-to-end US acceptance.
