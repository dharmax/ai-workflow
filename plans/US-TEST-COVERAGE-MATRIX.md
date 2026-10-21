# Acceptance coverage register — original suites with US-E01 migration recorded

**Organizational supersession (2026-10-21):** [US-led test digestion plan](US-TEST-CONSOLIDATION-PLAN.md) is the active three-iteration method. The following is a historical **file-level inventory**, not the intended end-state, an automatically accepted US list, or an order to preserve/delete tests. Digest every *scenario*, especially non-pristine, alternative, sub-flow, discovered-bug and safety flows, into one file per accepted real US. Counts are observations, never targets.
**Proposed Story descriptions:** cycles 1–4. **Audited:** exact repository tree at USs-and-consolidation. This is an ownership inventory, not a green-test claim.
Legend: *public* executes a client/API/UI/CLI or relevant external host; *technical* proves distinct primitive; *candidate* may contain redundant assertions but is not authorized for deletion; *gap* leaves a specified acceptance obligation unproved. Conditional-live is not counted as always-on acceptance.

| Test file | Owner(s) | Coverage class |
|---|---|---|
| `tests/artifact-policy.test.ts` | US-P07 | technical |
| `tests/aspects.test.ts` | US-P06 | technical |
| `tests/bug-public.test.ts` | US-P08 | public |
| `tests/decompose.test.ts` | US-P07 | technical |
| `tests/dharmax-s1.test.ts` | US-P01,US-P06 | public |
| `tests/dharmax-s2.test.ts` | US-P03 | public |
| `tests/dharmax-s3.test.ts` | US-P05 | public |
| `tests/dharmax-s4.test.ts` | US-P02 | public/gap |
| `tests/dharmax-s5.test.ts` | US-P02 | public |
| `tests/product.test.ts` | US-P01,US-P09 | technical |
| `tests/product-authority.test.ts` | US-P03 | public/security |
| `tests/product-change.test.ts` | US-P03 | technical |
| `tests/product-operability-definition.test.ts` | US-P01,US-P09 | public |
| `tests/product-operability-links.test.ts` | US-P04 | public |
| `tests/product-operability-parity.test.ts` | US-E05,US-P03 | public |
| `tests/product-processing.test.ts` | US-P07,US-P02 | technical/gap |
| `tests/top-level-product-intent.test.ts` | US-P01 | technical |
| `tests/technical-proof.test.ts` | US-P10,US-T02 | public |
| `tests/ticket-resolution.test.ts` | US-T02,US-T03 | public/internal-mixed |
| `tests/ticket-investigation.test.ts` | US-T01 | technical |
| `tests/ticket-preparation.test.ts` | US-T01 | technical |
| `tests/doctrine-batch.test.ts` | US-T04 | technical |
| `tests/doctrine-enforcement-live.test.ts` | US-T05 | conditional-live |
| `tests/doctrine-management.test.ts` | US-T04 | public |
| `tests/doctrine-management-live.test.ts` | US-T04 | conditional-live |
| `tests/doctrine-model.test.ts` | US-T04 | technical |
| `tests/doctrine-producer-context.test.ts` | US-T05 | technical |
| `tests/doctrine-scope.test.ts` | US-T03,US-T05 | public/security |
| `tests/doctrine-verifier.test.ts` | US-T05,US-T02 | public/internal-mixed |
| `tests/pc1a-safety.test.ts` | US-A03,US-P03 | public/security |
| `tests/graph.test.ts` | US-T06 | technical |
| `tests/store-lifecycle.test.ts` | US-T06 | technical |
| `tests/change-engine.test.ts` | US-E02,US-E04 | technical |
| `tests/change-bridge.test.ts` | US-E04 | technical |
| `tests/change-foundation.test.ts` | US-E04 | technical |
| `tests/workspace-text.test.ts` | US-E04 | technical |
| `tests/ast-freshness-and-search.test.ts` | US-E01 | technical |
| `tests/primitive-truth.test.ts` | US-E01,US-E04 | technical |
| `tests/ts6-refactor-sync.test.ts` | US-E04 | technical |
| `tests/lsp-shutdown.test.ts` | US-E04 | technical |
| `tests/source-synthesis.test.ts` | US-A05 | technical |
| `tests/scaffold.test.ts` | US-E04 | technical |
| `tests/debugger.test.ts` | US-E04 | technical |
| `tests/us/e01-investigate-sibling.test.ts` | US-E01 | public primary/non-pristine/installed-host |
| `tests/mcp-public-surface.test.ts` | US-E05 | historical generic MCP assertions pending digestion |
| `tests/p0-engineering.test.ts` | US-E02 | public/gap |
| `tests/cli-help.test.ts` | US-E03 | candidate |
| `tests/artifact-command.test.ts` | US-E03 | public |
| `tests/product-operability-commands.test.ts` | US-E03 | public |
| `tests/setup.test.ts` | US-A06 | public |
| `tests/setup-truth.test.ts` | US-A06 | public |
| `tests/shell.test.ts` | US-E06 | public |
| `tests/shell-daily.test.ts` | US-A08 | public |
| `tests/shell-config-setup.test.ts` | US-A06 | public |
| `tests/shell-trace.test.ts` | US-A07 | public |
| `tests/config.test.ts` | US-A04 | technical |
| `tests/os.test.ts` | US-A03 | technical |
| `tests/actor.test.ts` | US-A01 | public/internal-mixed |
| `tests/actor-engine-boundaries.test.ts` | US-A03 | technical |
| `tests/actor-runtime-refresh.test.ts` | US-A04 | technical |
| `tests/actor-prompts.test.ts` | US-A03 | technical |
| `tests/actor-budget-policy.test.ts` | US-A04 | technical |
| `tests/user-story-j24-sophisticated-goal.test.ts` | US-A01 | public |
| `tests/escalation.test.ts` | US-A04 | technical |
| `tests/tool-discovery.test.ts` | US-A02 | technical |
| `tests/model-service.test.ts` | US-A04 | technical |
| `tests/structured-repair.test.ts` | US-A05 | technical |
| `tests/execution-economics.test.ts` | US-A07 | technical |
| `tests/performance-metrics.test.ts` | US-A07 | technical |
| `tests/skill-synthesis-acceptance.test.ts` | US-A05 | public |
| `tests/skill-manager-bridge.test.ts` | US-A05 | technical |
| `tests/tools.test.ts` | US-A08 | candidate |
| `tests/kb.test.ts` | US-A05 | technical |
| `tests/radar.test.ts` | separate Radar work | out-of-scope |
| `tests/compiler.test.ts` | US-A05 | technical |

## Test removal ledger (PROPOSED, not performed)
| Target | Why review | Mandatory surviving oracle and action |
|---|---|---|
| `cli-help.test.ts`, repeated spelling fixtures | Multiple CLI/Shell help cases already in `product-operability-commands` | Inspect actual no-DB and no-write evidence; consolidate into its canonical parser Story, only then delete redundant file |
| `mcp.test.ts`, generic advertising/assertion cases | P0 installed-host and typed-stdio parity prove stricter public surface | Retain unique schema-export/handler invocation evidence; only prune generic duplicate lines/cases |
| `setup.test.ts`, direct config and doctor checks | `config`, `setup-truth`, `shell-config-setup` exercise same primitives | Keep real fresh install and subprocess; reduce repeated fixture setup once matched |
| `tools.test.ts`, generic specialist smoke checks | Specialist Ticket, graph, KB, script suites own detailed behavior | Retain one registry integration test and any currently unique public cross-capability Story |
| `actor-review-regressions.test.ts` and portions of `model-service` | Effective route and locality repeated in `actor-runtime-refresh` and `escalation` | Match exact provider absence, local-only and forced-route negative before pruning |
| `decompose.test.ts` repeated reuse variants | `product-processing` covers public idempotence | Retain pure proposal/no-mutation and blocking/collision counterexamples |
| `change-engine.test.ts` generic tool adapter case | P0 exercises actual installed guarded writer | Keep primitive preview/apply semantics, anchor migration, semantic rename |
| Historical `dharmax-s1..s5` shared fixture/review steps | Repeated browser construction obscures distinct journey evidence | Refactor shared setup only; retain at least one actual UI journey per observable contract. Replace Ticket-first S4 case **only after** US-P02 is reviewed/implemented |
| `ticket-resolution.test.ts` repeated proof hashes/reuse cases | Overlapping positive proof paths occupy oversized file | Partition by source/acceptance/Actor/governance ownership, compare exact exceptions before removing cases |
| `doctrine-verifier` + `doctrine-scope` generic positive cases | Both recheck success path | Keep scope/admission races in scope, independent rule review and actual checker/proof in verifier |
| `escalation` duplicated local-only cases | Same policy appears in separate scenarios | Preserve both policy and observable no-progress failure contexts if they differ |

The executable Given/Action/Observable/negative specifications are in [US-ACCEPTANCE-TEST-SPECS.md](US-ACCEPTANCE-TEST-SPECS.md); their status is **proposed**, not executed or automatically accepted.

## Uncovered tests that must be authored/reviewed before implementing or pruning
- **US-P02:** Real public Story approval/materialization precedes implementation Ticket proposal; Ticket exists because an identified behavioral test obligation is unmet. Current S4 Ticket-first fixture is a contrary historical behavior.
- **US-E02/US-T02:** External installed host goes beyond source writes through activated Story expected-red → green and independently verified Ticket closure.
- **US-E02/US-T03:** Inject a *write-time* failure after an earlier file write and verify no partial source changes; stale preview alone is insufficient.
- **US-E03:** Actual executable CLI/Shell source-change parity, beyond a parser-only equality check.
- **US-E01:** Read-only sibling inspection after restart remains correct and leaves no persistent sibling graph.

No test deletion is justified merely by a higher pass count. The deletion unit is a genuinely duplicate behavioral oracle, not an arbitrary percentage or file extension.

### Cycle 5 reviewed disposition
- **Deleted as duplicate:** standalone `setup.test.ts` “should read, update, and persist configuration”. All its default-agent/default-lease and explicit save/reload assertions are folded into `config.test.ts`'s layered persistence case. One fixture lifecycle and one test case removed; no observable contract dropped. **Source inspection only; still requires Bun verification.**
- **Retained after double-check:** `cli-help.test.ts` probes `next/init/resolve/claim` help without a DB, whereas the apparent overlap checks namespaced Product help. Different command families.
- **Retained after double-check:** the two `escalation.test.ts` local-only cases cover ordinary completion vs repeated no-progress. Different failure conditions.

### Cycle 6 — MCP and CLI consolidation (pending Bun verification)
- Retired `tests/mcp.test.ts`: all three former handler-internal scenarios are represented using a real linked SDK Client in `mcp-client-investigation.test.ts`. Unique advertised tools, hidden/unknown refusal, invocation, exported JSON schema and stale-file cleanup assertions were retained. Actual installed stdio transport remains independently covered in `p0-engineering` and `product-operability-parity`.
- Consolidated four common CLI help test cases into one cohesive per-command loop with one isolated fixture. All four binary invocations and no-write assertions remain.
- These changes consolidate *test ownership and fixture lifecycle*, not reduce safety checks by target percentage. Run targeted tests and full suite before considering acceptance.

### Cycle 7 — strengthened proof after batch review (pending Bun verification)
- Replaced the original sibling-first cold-host smoke with one SDK Client Story that repeats host/sibling source queries across a closed and reopened server/client/store session; asserts sibling source unchanged and no persistent sibling AIWF state. No extra test case added.
- Reviewed `tools.test.ts` case by case: its registry wiring, recommendation semantics, qualified symbol ambiguity, OS and Git errors, scratchpad/ADR, TestNode triage and `script_eval` each include distinguishable oracles. **Retain**; a broad file deletion would reduce coverage.
- Real installed **stdio** restart remains a distinct acceptance improvement; do not claim the in-memory SDK session proves deployment/restart.

### Cycle 8 — installed-host restart test and source-read ownership (requires Bun verification)
- Extended the existing P0 sibling grant-refusal Story (not a new test case) to exercise real stdio Client/server restart, exact cross-project symbol investigation, unchanged sibling bytes and no new sibling persistence, and refusal of transferred write authority before and after restart.
- The test revealed a real mismatch: sibling `read_workspace_file` opened a persistent store, unlike sibling AST reads. It now reuses the same ephemeral read-only sibling store without needless AST indexing for literal file reads. No new store, registry or authorization subsystem.
- **Do not infer** this proves all non-source graph reads on an absent sibling DB are non-mutating; those remain separately governed. Actual source read/restart proof is pending Bun execution.

### Cycle 9 — Actor boundary and routing ownership (pending verification)
- Removed catch-all `actor-review-regressions.test.ts`: its cloud-only/explicit-local route behavior is one test in `model-service.test.ts`, and its SOTA locality/escalated discovery budget scenarios moved to `escalation.test.ts` with the original explicit configured-model fixture. No unique behavioral case dropped.
- Removed one redundant *disabled discovery* Actor matrix instance. The stronger dedicated `does not advertise a capability that is explicitly disabled` test retains missing tool/schema and successful universal-execution checks; failed and empty discovery remain independently executed.
- Distinct provider, forced-local, no-progress and budget safety oracles remain. Await targeted + full Bun results.

### Concrete US-E01 migration (2026-10-21; pending new Bun run)
The completed [US-E01 case ledger](US-E01-DIGEST.md) is the authoritative migration record for this Story. Four sibling cases, research discovery/guidance, and the installed-host restart/write-denial case now have a **single** owner: `tests/us/e01-investigate-sibling.test.ts`. Generic MCP advertisements/hidden-tool behavior remain under their *different*, pending US-E05 owner `tests/mcp-public-surface.test.ts`; three unrelated P0 cases stay in `tests/p0-engineering.test.ts`. The original mixed `tests/mcp-client-investigation.test.ts` is retired. No corresponding behavior was intentionally dropped; verification at the new commit is pending.
