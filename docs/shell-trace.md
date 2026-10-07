# Shell trace

Use `trace show` for text, or `trace open` / Alt+O for a scrollable floating terminal view. Use Page Up/Page Down or arrow keys to scroll; Enter/Escape closes the window. Alt+O preserves the current input and cursor. When a TUI is unavailable or fails, `trace open` returns the text trace instead.

`trace on` enables live full output, `trace off` folds it, and `trace compact` keeps compact progress. These controls and trace inspection are deterministic commands.

The viewport owns the observable step records. The shell adds the exact request, selected mode, discovery timing, initial/final available tools, step budget, termination, errors and final response. All calls and results in a step remain visible, including error observations and full final answers. Private model reasoning is omitted. An actual runtime model ID is shown only when reported; otherwise the trace explicitly says it is unavailable rather than claiming a configured fallback was used.

The latest free-form Actor run is atomically saved to `.ai-workflow/state/last-shell-trace.txt`, including failures before the first step. `trace show/open` can read it in a new shell. Deterministic commands do not overwrite it. This is a latest-run diagnostic snapshot, not a run-history system. Artifact operations retain their existing `metrics` diagnostics.

## Demonstrated defects corrected

- Alt+O was advertised by ProcessViewport but its input callback was never connected or handled. The existing input hook now suspends editing while the existing modal owns stdin, then restores the buffer, cursor and raw input.
- A thrown Actor error left the viewport timer/raw input running. Shell termination now happens in `finally`, and the viewport restores input ownership and stops idempotently.
- Compact/non-TTY failure output showed a success tick. All folded/compact output now identifies failure correctly.
- Trace omitted discovery and final termination, shortened final answers, and sometimes replaced structured evidence with a short summary. The latest-run view now retains those details, including every tool call/result.
- Step events were emitted only after a run returned. They now stream as observed, so partial steps survive errors; recovered tools update the observed available surface.

The original trace repair reproduced empty discovery and preserved rejected calls. The subsequent discovery repair makes unmatched or failed classification explicit before Actor execution; legitimate tool-free conversation has one answer step. Trace reports the effective step budget. Repeated unavailable calls stop with a concrete error while available-tool retries remain possible.

The live recommendation classifier produced `ticket / ticket / recommend / read`, but `recommend_next_task` was indexed as object `task`. Canonicalizing that existing synonym restores strict AND selection without broadening the registry. PRODUCT instructions no longer advertise tools outside the discovered surface, and failed recovery attempts count toward the existing two-attempt limit. The exact request `what's the next recommeded ticket?` then executed the selector once and answered with the observed ticket ID and title: two steps, 12.9 seconds, no errors. A metadata-only intermediate run still took eight steps and answered vaguely, demonstrating why prompt and recovery corrections were also necessary. These live timings are observations, not a controlled speed benchmark.

## Verification

- AIWF: 33 focused tests, full suite 254 pass / 0 fail; strict typecheck passed.
- shell-ui: full suite 42 pass / 0 fail; strict typecheck passed.
- Real PTY smoke: failed Actor run, `trace open`, Page Down, Escape, Alt+O with partial input, Enter, and resumed editing. Two modal openings/closings returned terminal ownership correctly.
- Regression coverage: empty discovery/budget failure; thrown errors after a step; discovery exceptions before steps; recovered tool surfaces; complete answers/results; persisted restart inspection; TUI fallback; truthful failed status in TTY/non-TTY modes; idempotent viewport stop and clean live verbosity switching; circular/BigInt evidence; and preserved input/cursor during Alt+O.
- TKT-LBBL completed through `Ticket.resolve()` with full AIWF tests/typecheck, current TestNode evidence and fresh independent model review of all five exact acceptance criteria. Implementation was manually audited and edited under the ticket lease; the final resolver invocation used a no-edit implementation callback and a supplied independent verifier. The first review hit an OpenRouter key prompt limit; removing duplicate review material allowed the same configured route to complete. Acceptance proof is persisted as `VERIFY-TKT-LBBL`, and the lease is released.

Discovery follow-up TKT-IEG7: 38 focused tests, 262 full AIWF tests, 144 shared-runtime tests (6 opt-in live skips), and both typechecks passed. AIWF `prepare()` and `resolve()` were used for lifecycle and proof; implementation was manually diagnosed and edited. `resolve()` reran full AIWF tests/typecheck and persisted independent acceptance as `VERIFY-TKT-IEG7`. Review succeeded on the same configured route with a smaller output budget after the key spending limit rejected the first request.

## Candidate sufficiency and unchanged observations

TKT-4K6K corrects the next failure exposed by the trace: coarse semantic tags selected the next-task selector for a comparative question, and successful identical reads could consume all ten steps. Discovery now qualifies the small candidate set against the full request and actual tool descriptions using the existing semantic-registry refinement contract. If candidates are insufficient, it makes one constrained search for underlying evidence, qualifies those alternatives, and fails explicitly if none fit. It never exposes the full registry or uses a least-ticket keyword rule. This adds a qualification call because coarse matching cannot establish semantic sufficiency.

The shared Actor accepts explicit read-only metadata; AIWF derives it from existing capability semantics. Repeating the same read with unchanged output preserves the observation and adds actionable replanning feedback. A further identical observation stops the run. Argument/result key order and alternating readers cannot evade the guard. Changed arguments, changed output, intervening successful mutations, ordinary execution failures and successful capability recovery remain valid. Missing-capability recovery classifies the requested capability rather than reselecting the original insufficient action. Ticket listing now includes authored priority, allowing comparisons from evidence.

Live checks on the configured route: next selected the canonical selector and answered in two steps (17.3 seconds); least selected ticket listing and truthfully reported empty Backlog/Todo lanes in three steps (19.9 seconds), confirmed directly. With an isolated P1 Todo/P3 Backlog fixture, least read the P3 candidate and answered in two steps (15.0 seconds). These are individual observations, not controlled speed comparisons. An intermediate loop-only correction still falsely answered least from next; it was rejected rather than counted as success. Comparative ranking remains dependent on a meaningful criterion; only next has a canonical selection policy.

Verification: 44 focused AIWF tests, 268 full AIWF tests, 151 shared-runtime tests (6 opt-in live skips), and both typechecks passed. `investigate()` was blocked by the configured key's output budget; manual diagnosis and edits proceeded under the ticket lease. `resolve()` reran full AIWF checks with a no-edit implementation callback and independently reviewed current implementation, canonical TestNode evidence and live observations; proof is persisted as `VERIFY-TKT-4K6K`.
