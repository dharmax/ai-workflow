# resolve_ticket reliability — 2026-10-27

**Partial completion.** Engineering corrections have regression evidence; general autonomous resolution and real independent acceptance remain unproved. Starting AIWF master: `9d1c27e`; sibling llm-utils baseline: `2fafca5`, correction: `86a17b0`.

## Scope, authority and executor

Reused `TKT-LIFECYCLE-STATE`; inspected `TKT-CORE-LIFECYCLE-01`, preserving its identity and work. Canonical PRODUCT remains accepted revision 1; the three universal engineering Rules remain revision 1. This is developer-authorized technical maintenance, without Product changes, stage advancement or historical Ticket cleanup.

All production/test corrections in this delivery were **Codex-authored through AIWF preview/fingerprint/apply primitives**, after demonstrated native failures. The sibling repair uses the existing source engine with its explicit sibling project and the upstream canonical repair lease; it creates no duplicate Ticket. Actual AIWF Actor edits described below occurred only in disposable live projects. They are not authorship or acceptance of this patch.

## Demonstrated causes and corrections

| Cause | Existing owner corrected | Observable contract |
| --- | --- | --- |
| Local stopReason helpers missed direct preparation/investigation/check/proposal results | ticket/resolve | One captured final result governs cleanup of every acquired unfinished reservation. Partial child Done remains preserved. |
| Agent ID conflated separate executions; acquisition was read/update without CAS | graph/store and TicketClaim | New UUID execution identity; acquisition and release use conditional commits. Renewal, scope persistence and completion require the exact owning claim; expiry cannot silently reacquire. |
| A replacement installed inside guarded apply still allowed an old execution to write source | change/engine and graph/store | Hold the existing SQLite write lock while checking the exact claim and performing the synchronous filesystem commit. This serializes source commit with lease takeover. |
| Completion could outlive its initial expiry check while awaiting evidence/admission | graph/store | Recheck expiry immediately before atomic scope/Done persistence. |
| SDK cancellation was omitted from ToolContext | mcp | Forward the SDK signal through ordinary tools and the Actor. Exact cleanup remains possible after cancellation. |
| Implementation saw pre-activation skipped-test snapshots and no observed red baseline | ticket/resolve | Refresh the existing dossier after Story baseline and supply the actual bounded test output as feedback. |
| A failed later proposal skipped tests for already-applied guarded effects | ticket/resolve | Authority/scope failures stop. A preview failure reaches verification only after this execution has attributable effects; unchanged green work cannot turn a rejected request into success. |
| The existing stalled-tool guard exempted safe_change, allowing repeated no-op mutations | ticket/implementation | Apply the existing observation/epoch guard to effect-free change calls as well as navigation. |
| llm-utils repeated identical malformed arguments until all 16 steps were spent | llm-utils LLMActor.run | Classify validation rejection as an effect-free result in the existing repeat guard: stop at 3 unchanged failures, while allowing corrected arguments. No parameter shim or model substitution. |
| Canonical TestNodes retained bun:test while current source inference emits bun | ticket/verification | Reconcile relevant source-derived framework metadata through the existing classifier before selecting runners, preserving identities and all execution/acceptance evidence. No framework-alias registry. |

Public release_ticket accepts the returned leaseId for fenced automated cleanup. Omission retains the existing administrative release-current operation; resolver/preparation cleanup always supplies its exact captured claim.

## Validation

| Check | Observed result |
| --- | --- |
| AIWF before corrections | 665 pass, 6 skip, 3 fail; 674 tests |
| AIWF final aggregate | **685 pass, 6 skip, 3 fail**; 694 tests across 83 files, 5211 assertions, 213.07 seconds |
| Focused regression runs | Expected red observed for missing lease identity, SDK cancellation, partial-proposal recovery, stale source ownership and stale runner metadata; corresponding final public cases pass. All 20 added AIWF cases pass in the aggregate. |
| llm-utils before source correction, including the two new tests | 200 pass, 6 skip, 4 fail; one failure is the new 16-versus-3 regression |
| llm-utils final aggregate | **201 pass, 6 skip, 3 existing fail**; 210 tests across 26 files |
| Typecheck | Both repositories pass |
| Definitions | 21 concepts, 171 internal links, 9 exact US fields pass |
| Diff whitespace | Pass |

AIWF's unchanged baseline failures are the two Dharmax S2 DW-02 snapshot assertions concerning INDEX-ADMISSION, and the Actor final-prose test expecting 2 calls while the existing bounded final-schema correction makes 3. llm-utils retains its three original unsupported-final-proposal/history assertions from before this source change. None was weakened to produce a green aggregate.

Public journeys include actual stdio MCP claim/interruption and CLI TTL recovery/sync; SDK client/server cancellation during independent review; same-agent replacement during review and inside source application; nested blocked/needs_input/exception outcomes; concurrent acquisition, renewal, expiry during completion and restart; guarded partial edits and repeated no-ops; already-correct verify-only; stale synchronization preserving genuine fixture receipts. Controlled model/verifier fixtures establish lifecycle invariants, **not general real-model competence or acceptance of this patch**.

## Actual configured-provider and MCP outcomes

- Original canonical connected-MCP attempt eventually recorded 16 steps, repeated missing-name find_symbol validation failures, zero edits and no independent acceptance. Interrupting the caller did not stop that old host; its exact abandoned admission was explicitly released. This motivated SDK propagation and the sibling repeat-guard repair.
- A real small-catalog qwen2.5-coder:7b Actor probe completed in 5.6 seconds with valid name arguments. Raw full-resolver outputs also contained valid read/search/source/change arguments: transport or normalization stripping valid arguments was **not demonstrated**. Normalization returns already-valid arguments unchanged; no shim was added.
- The early real greeting exercise exposed stale baseline context and partial-proposal recovery. After refreshing context, qwen read real source and applied a guarded uppercase edit but omitted required punctuation. In a bounded fresh MCP exercise it spent 7 decisions, made 1 attributable edit, then repeated graph observations and stopped at 35.3 seconds. It did not reach the workflow test/acceptance stages.
- The already-configured design route ollama/gemma4:e4b was tested explicitly in the disposable project. Its first request produced no successful response before the 60-second parent cancellation. The repository/global routes were not changed.
- A separate real malformed-input recovery probe timed out at its 15-second inference bound before a tool decision. It is **not a passed recovery demonstration**; corrected-argument recovery has controlled-provider regression evidence only.
- A fresh canonical stdio MCP verify-only retry returned needs_input in 19.4 seconds because of stale bun:test metadata. After its source-grounded correction, another real canonical retry progressed into test execution, then hit the explicit 60-second bound. Cancellation durably recorded Blocked, released the exact claim and admission, preserved partial evidence, and minted no receipt.

Raw request/output and execution logs remain under `/tmp/aiwf-real-qwen-bounded`, `/tmp/aiwf-real-design-evidence`, `/tmp/aiwf-real-recovery-result.json`, `/tmp/aiwf-final-native-after-framework.log`, `/tmp/aiwf-resolver-aggregate-delivery.log` and `/tmp/llm-utils-reliability-final.log`. Live provider responses were captured without replacing them or recording credentials.

## Remaining completion boundary

A configured real Actor has not reproduced **LLM → tools → correct source → executed tests → independent accepted receipt/Done**. Default-route semantic/replanning capability, real feedback-driven recovery, independent configured review of a successful edit, and a repeated successful public live path remain unqualified. The design-route observation establishes a latency/cancellation limit, not general model incapability. Existing aggregate failures remain visible.

`TKT-LIFECYCLE-STATE` must remain unverified/Blocked pending genuine acceptance. `TKT-CORE-LIFECYCLE-01` and historical Ticket dispositions are unchanged. No false Done or bulk cleanup occurred. Fresh CLI/SDK/stdio hosts exercised the new source; already-running connected MCP hosts need reconnect/restart to load the published modules and schemas.
