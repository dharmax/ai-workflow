# Acceptance coverage register — all 76 current test files
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
| `tests/mcp.test.ts` | US-E05 | public |
| `tests/mcp-client-investigation.test.ts` | US-E01 | public |
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
| `tests/actor-review-regressions.test.ts` | US-A04 | candidate |
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
