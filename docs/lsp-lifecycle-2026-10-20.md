# Bounded LSP timeout repair — 2026-10-20

Developer-authorized maintenance, TKT-LSP-LIFECYCLE-01. Base master: `6affefd09b887e9c37ea26fb4bb0c9934ec7334c`. Bun 1.4.3 (`c6da4a4d3`), TypeScript 7.0.2, TS6 6.0.3 via typescript-language-server 6.0.2. Unrelated `log.txt` preserved.

## Diagnosis and actual owner

Ran the three requested files first. Baseline: **41 pass / 2 fail**, 43 tests, 29.54 s. Stale refactor and missing-declaration timed out; stale rename passed this run. The developer's preceding aggregate was 550 pass / 5 skip / 3 fail.

Instrumented preview start/end, AST freshness and both native JSON-RPC connections before changing behavior. Retained opt-in `DEBUG_LSP=1` request/response tracing in both clients and freshness boundaries in the engine. The trace identifies initialization, individual requests and shutdown independently.

- Stale refactor apply at the former engine.ts:679–680 regenerates the complete preview. A traced run spent **3617.68 ms** recomputing TS7 code actions plus TS6 applicable-refactor and edit requests after the source had already changed. Initial preview took 1074.10 ms. This passed narrowly at 4713.82 ms; the uninstrumented baseline exceeded five seconds. AST freshness and initialization completed; teardown was not the blocking await.
- Missing-declaration verification reaches verification-context.ts's exact-symbol lookup, then ts-lsp.ts's **second documentSymbol request**. The original traced test received the first result in 2002 ms and never received the second before timeout. Shutdown only began after the timeout.
- Keeping the TS7 document open did **not** fix the second request: an isolated experiment still timed out at 5566.56 ms. That speculative change was removed completely.
- Awaiting the same real verification call normally before asserting its error completed both requests (78 ms and 0 ms) and the test in 335.22 ms. The final code retains the original TS7 open/request/close lifecycle. Repeated runs without tracing also pass.

The demonstrated common boundary is native asynchronous work executed inside Bun 1.4.3's pending-promise rejection matcher. This evidence does not establish a TS7 server defect or a specific Bun internal scheduler defect. The two necessary corrections belong to the existing change engine and the asynchronous assertion boundary; changing native lifecycle semantics was unsupported by the experiment.

## Implementation and safety

The engine retains only the latest unblocked preview's fingerprint and a copy of its original hashes. A matching fingerprint with changed/removed/appeared source is rejected synchronously before freshness or LSP work. These hashes can only reject: every acceptance still recomputes the complete preview/fingerprint, checks original hashes, enforces admission and rechecks immediately before filesystem writes.

No persistent preview cache, alternate fingerprint format or new authority owner was added. A fresh engine or process still performs full recomputation. Separate actual preview/apply subprocesses proved stale rejection with unchanged disk and current-fingerprint acceptance with exact verified output.

The stale-refactor regression preserves its original rejection assertion and additionally proves no preview recomputation and unchanged source. Stale rename preserves its original assertion and adds fresh-engine rejection with unchanged source. The missing-declaration test now awaits native I/O before assertions and checks the exact missing name plus the real zero-declaration cause, strengthening the previous generic error assertion.

No timeout increases, skips, retries or assertion relaxation.

## Executed checks

```sh
bun test tests/change-bridge.test.ts tests/change-engine.test.ts tests/doctrine-verifier.test.ts
DEBUG_LSP=1 bun test tests/change-bridge.test.ts tests/change-engine.test.ts tests/doctrine-verifier.test.ts
bun test
bun run typecheck
bun run pack
git diff --check
```

Focused repeated passes: **43/43** in 16.76 s, 16.12 s and 15.48 s. The latter two include the strengthened fresh-engine and no-recompute assertions. Final tracing-signature correction is type-only with explicit optional logger data; final focused execution is retained separately.

Full aggregate: **553 pass / 5 skip / 0 fail**, 558 tests across 73 files, 3753 assertions, **104.61 s**. Five existing opt-in skips remain skips. Typecheck and pack pass. Typecheck initially caught the debug logger's required second argument; corrected to its actual optional API contract and reran successfully.

Installed sibling source heads: Semantika `0775e37ef036e1eba27d42578d4ef3c67c81e234`; llm-utils `f8222aaa155a0b86f50b7cacbe0701ed29d86840`. Semantika has unrelated dirty Markdown, which was preserved; these tests use installed node_modules package artifacts. Pristine validation records the exact dependency reuse explicitly.

Raw compressed evidence is under [evidence/lsp-lifecycle-2026-10-20](evidence/lsp-lifecycle-2026-10-20/): baseline, original trace, rejected document-lifecycle experiment, ordinary-await experiment, repeated focused runs, full aggregate, cross-process checks, final typecheck and pack.

This is technical repair evidence. It does not manufacture independent PC5/Gate 5 acceptance or a canonical Done/VERIFY receipt.
