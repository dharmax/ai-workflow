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

The reported empty-discovery/unavailable-tool failure is reproduced with a deterministic real Actor loop: three unavailable calls followed by `max_steps_exceeded`. The trace explicitly reports `(none)` for available tools and preserves the rejected calls and parameters. This trace repair does not establish that the natural-language recommendation routing problem is fixed.

## Verification

- AIWF: 33 focused tests, full suite 254 pass / 0 fail; strict typecheck passed.
- shell-ui: full suite 42 pass / 0 fail; strict typecheck passed.
- Real PTY smoke: failed Actor run, `trace open`, Page Down, Escape, Alt+O with partial input, Enter, and resumed editing. Two modal openings/closings returned terminal ownership correctly.
- Regression coverage: empty discovery/budget failure; thrown errors after a step; discovery exceptions before steps; recovered tool surfaces; complete answers/results; persisted restart inspection; TUI fallback; truthful failed status in TTY/non-TTY modes; idempotent viewport stop and clean live verbosity switching; circular/BigInt evidence; and preserved input/cursor during Alt+O.
- TKT-LBBL completed through `Ticket.resolve()` with full AIWF tests/typecheck, current TestNode evidence and fresh independent model review of all five exact acceptance criteria. Implementation was manually audited and edited under the ticket lease; the final resolver invocation used a no-edit implementation callback and a supplied independent verifier. The first review hit an OpenRouter key prompt limit; removing duplicate review material allowed the same configured route to complete. Acceptance proof is persisted as `VERIFY-TKT-LBBL`, and the lease is released.
