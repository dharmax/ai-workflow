# P0 priority correction and first engineering repairs — 2026-10-20

Starting source: clean master `c568257f988b2733036ce38156934536662c31e5`, matched remote. Public status/doctor found 106 Tickets, no active leases, four Blocked. Developer corrected order to **MCP/skill/plugin AI engineering → native Digest → ai-cli → Shell → Workspace last**, then expressly approved core AI engineering before Workspace acceptance, retaining human approval, safe edits, tests and independent verification. The exact narrow sequence amendment is in the release plan and all four normative design/plan entry points. Same I2 of three total iterations; no fourth round or silent v1 scope reduction.

The accepted native Digest design/plan was recovered from `ea0acc3` after consolidation `e44e15e` removed both. Restored `docs/digest.md` preserves the native three-call/read-only/no-session contract; `docs/digest-plan.md` replaces its outdated ai-cli-first prerequisite with current P0 qualification. This is recovery and sequence alignment, not a new design or implementation/parity claim.

P0 source audit also distinguishes existing general-Actor ToolDiscovery and real SkillManager-backed knowledge search/read from Ticket implementation's fixed seven-tool catalog. The latter does not invoke that discovery/skill bridge; qualified reuse on real implementation and crucial skill lifecycle (`TKT-EXT-SURFACE-11`) remain P0 gaps. Existing synthesis/bounded Actor/test/verifier code is substantial but not complete target intelligence.

## Implemented repairs and public proof

**Safe host reload, existing `configureMcp` owner / `TKT-EXT-SURFACE-01`.** Public `setup --check` reported one stale Codex file and 75 stale schemas. Isolated public setup reproduced existing `apply_change.approval_mode` changing from `deny` to `approve`. The new real reload test first failed expected deny / received approve. Guarded repair preserves existing advertised-tool tables with native Bun TOML serialization; existing first-install/new-tool defaults remain unchanged. Check/no-write, command refresh, exact retained review settings, unrelated server, schema generation and byte-stable second reload pass. Actual `setup --mcp` then refreshed installed Codex wiring and 75 AGY schemas; subsequent `setup --check` reports all current. Existing saved provider routes and credentials were not edited. Restarted stdio schema discovery exposes the new resolver flag; the current conversation's already-loaded host is not claimed to have reloaded itself.

**Evidence-only resolution, existing `resolveTicket` / `AIWF-TICKET-RESOLUTION-FIRST-PROOF`.** Real native public call:

```sh
aiwf resolve TKT-DOCTRINE-SEMANTIKA-CONTRACT --max-repairs 0 --depth 0 --max-artifacts 4 --agent codex
```

The configured local implementer (`ollama/qwen2.5-coder:7b`) made one FileNode observation, returned an array where structured object output was required and blocked at implementation, mutation epoch zero. Recorded first run: 106,885 ms, 23,073 tokens; no source change or native proof. This demonstrated the existing resolver always launched a producer for unverified non-Done leaf work, even when the requested work was already implemented.

The existing operation now accepts `verifyOnly: true` / CLI and shared-shell `--verify-only`. It skips the coding producer and source repair, uses no repair rounds, and retains required Story tests, actual public checks, governance admission/source freshness/hashes, independent current verifier, atomic completion and lease release. Default implementation behavior is unchanged. No second executor or verifier was added.

Public `resolve_ticket` tests use the real registry/lifecycle and real public arithmetic API assertions, controlling only the model boundary: any implementation call fails the test; the independent verifier sees current code and executed results. Expected red preceded the flag implementation. Correct existing code reaches current receipt/Done and reopen without a producer; failing code runs its real test, blocks without a receipt/edit and releases its claim. These are controlled-provider public proofs, **not live autonomous engineering or canonical Semantika acceptance**.

**Isolated check bootstrap.** Native `--verify-only` replay reached actual tests and exposed `preview_change not found` when `ticket-resolution.test.ts` ran alone: its first Aspect setup assumed another suite had initialized the tool registry. Standalone first-test reproduction failed before any source repair. A second replay exposed the identical assumption in the preparation suite. Initialization now belongs once to the existing shared `acceptProduct` test helper, rather than scattered suite workarounds; no assertions were weakened. Standalone preparation passes **9/0** and resolver **56/0**.

All code/test edits used existing public registry `preview_change` → inspected scope/fingerprint/original hashes → `apply_change`, under existing claimed owners. Codex performed these repairs after observed native blockers; they are assisted AIWF development, not a claim that native `resolve_ticket` authored them. Separate configured `openrouter/openai/o3-mini` source reviews accepted the narrow reload and verify-only repairs after inspecting whole owners and immediate contracts. Advisory model review is not an independently executed full product gate or canonical receipt.

## Validation and real remaining boundary

- Setup/shell/MCP/authority focused checks: **39 pass / 0 fail**.
- Resolution/CLI/Story lifecycle/G5 focused checks: **75 pass / 1 existing live skip / 0 fail**.
- Final source `bun test --max-concurrency=1`: **568 pass / 5 existing opt-in skips / 0 fail**, 573 tests / 74 files, 117.63 seconds. Typecheck, pack and diff checks pass.
- No live-skip acceptance, full PC5, Gate 5, S6a/S6b GO or Ledger/ai-cli delivery is inferred. Three original trial previews remain unapproved; original trial evidence is untouched.

The first deterministic stdio MCP replay advertised `verifyOnly` but exceeded its 90-second client limit after adding broad `src/graph/store.ts` scope; it is not successful agent acceptance. A subsequent native CLI replay using the Ticket's existing evidence returned an actual failed-check result. Besides the isolated registry defect repaired above, browser regressions could not find the browser at the sandbox's temporary `XDG_CACHE_HOME/cache/ms-playwright/...` location. Host Playwright browser exists in `/home/dharmax/.cache/ms-playwright`; `run_command` intentionally redirects writable cache into scratch while keeping the filesystem read-only. A bounded replay resolved browser discovery using Playwright's existing explicit runtime-asset path **only in that child environment**, preserving the sandbox, provider and project configuration:

```sh
PLAYWRIGHT_BROWSERS_PATH=/home/dharmax/.cache/ms-playwright \
  aiwf resolve TKT-DOCTRINE-SEMANTIKA-CONTRACT --verify-only \
  --max-repairs 0 --depth 0 --max-artifacts 4 --agent codex
```

The browser-path replay passed deterministic checks but correctly refused closure because two required live TestNodes retained stale proof. An evidence audit of the actual persisted scope (`src/graph/store.ts`) found **63/65 current**; the two missing records were the opt-in live G3/G4 verifier fixtures. The developer explicitly authorized a temporary `openrouter/openai/o3-mini` critic plus `gateway:auto`, with original settings restored after the run. Their first actual enabled execution failed on hard-coded `/tmp` diagnostic writes outside the runner scratch, not on their semantic assertions. Only those two evidence paths now use `os.tmpdir()`; assertion text and sandbox policy are unchanged. The first temporary routing restoration matched the original file byte-for-byte. The corrected live replay uses the same approved bounded route, not a new provider experiment.

Runs remove the known stale `OPENROUTER_API_KEY` environment override without displaying or changing stored credentials. No test is skipped or run writable to obtain acceptance. The browser-path replay reached the preparation-suite registry defect above, now corrected in the shared helper. The final native replay outcome and publication qualification are recorded in the active checkpoint; absence of a result never means Done.

## Canonical disposition

Reuse existing identities and obligations. `TKT-EXT-SURFACE-01` is P0/Todo with reload evidence and no fake completion. `AIWF-TICKET-RESOLUTION-FIRST-PROOF` owns the S6a correction and remains unverified; the actual unresolved native boundary controls its lane. `TKT-DOCTRINE-SEMANTIKA-CONTRACT` retains all original acceptance and its Gate 5 prerequisite relationship. `TKT-DW-S3` moves to Backlog because Workspace is now P4, with all historical evidence and unaccepted PC5 status retained. No Ticket was created or falsely closed. Unrelated LSP work/state is retained.

## Approved bounded proof scopes and remaining native integration

After the approved live retry, all 65 required TestNodes had current execution evidence. Native acceptance then stopped on a parser-derived `WorkflowStore.bind` call anchor incorrectly requested as a declaration. The existing context builder already planned to replace all snippets with complete whole-file source. Its fix skips those redundant exact lookups for whole-file scope; explicit symbol targets still fail when their exact declaration is missing. A focused regression first failed on real indexed `BoundAddition.bind`, then passed with complete source retained. Context/resolution regressions pass **87/0**; typecheck passes.

A deterministic composition audit after this fix now gives the actual remaining boundary: **935,230 characters exceeds the unchanged 64,000-character verification-context limit**. The existing Ticket has no direct authored acceptance-test bindings, so all inferred regressions are being treated as source proof. No model call, truncation, larger limit or fake Done was used to hide this.

**Developer approved: “Approve the three bounded proof scopes.”** retain the original four Semantika criteria, original parent Ticket and all mandatory regression executions/results. Establish three bounded proof scopes through the existing TestNode/verification and Semantika owners; do not make 65 regression source files one semantic proof input. Reconcile existing work before creating any child, and keep dependency-local evidence owned by its actual project rather than copying historical pass metadata into this graph.

| Proof scope | Existing actual evidence / source owner | Original criterion covered |
|---|---|---|
| Public SQLite batch | Semantika `tests/sqlite-batch.spec.ts`; exact `SqliteStore.applyBatch` in `src/storage/sqlite-store/sqlite-store.ts`; public entity/predicate collection APIs. Preserve the sibling's pre-existing dirty Markdown. | Assertion-only revision/absence + atomic writes, no uncommitted DTOs, public collection names. |
| Governed admission | AIWF `tests/doctrine-scope.test.ts`, especially fresh-process race, expiry/stale-owner recovery and governance exclusion; exact `WorkflowStore.admitGovernance`, `updateGovernanceAdmission`, renew/release/commit methods. | Cross-process admission and stale/expired owner rejection. |
| Coherent completion | AIWF `tests/doctrine-scope.test.ts` injected-SQL-failure/restart case; `WorkflowStore.completeTicket`, `governanceAssertion` and `commitGovernance`, with source that actually owns the native batch. | Ticket + receipt + verifies commit together or all roll back; no private provider API or parallel store. |

Reviewing this exact proof basis is a real acceptance/ownership decision, not approval to weaken assertions, skip safety checks, enlarge context budgets, mark Gate 5 Done or implement another planner/executor. Direct authored test bindings and dependency evidence must use their existing protected owners. The current generic link/metadata writer is not a shortcut around those owners. The basis is now explicitly accepted; until its protected native bindings are implemented and executed with current independent review, S6a/Semantika/Gate 5 remain unaccepted. No S6b or Ledger source changes occurred.

Approved-scope execution: Semantika's real public batch suite passes **9/0** (37 assertions); AIWF's current admission/completion suite passes **12 / 1 existing live skip / 0** (109 assertions). Three separate existing-Asker o3-mini reviews accepted the bounded evidence: **14,711 / 38,167 / 41,200 characters**, each below the unchanged 64,000 cap. Exact source hashes, unfiltered reviewer caveats and execution classification are retained in [scope evidence](p0-proof-scopes-2026-10-20.json). These are assisted independent reviews, not native receipts. The admission reviewer correctly notes that the standalone opt-in live case was skipped; separate native live results must establish that obligation. Speculative logging/type suggestions are not demonstrated defects and do not justify unrelated refactoring.

The current public authoring gap is precise: `prepare_story_test` / `apply_story_test` own protected Test bindings for an accepted Story fixture; this technical prerequisite has no such Story and must not acquire a fabricated one. `resolve_test_target` and `triage_test_failures` derive/record evidence but cannot author the developer-reviewed technical Ticket binding. `hashFiles` rejects evidence outside its owning project. Reusing the Test owner and actual Semantika evidence owner is required; generic link/metadata writes, copied passing TestNodes and a second proof database are prohibited. The scope decision is **approved**, not pending further approval. Native integration remains real engineering work under `AIWF-TICKET-RESOLUTION-FIRST-PROOF` and the existing Semantika prerequisite, not a reason to reopen Workspace or create a new plan.

## Clean publication qualification

Source commit `c8f6063` passes in a detached tracked-source checkout with shared local `node_modules` disclosed: **568 pass / 5 pre-existing opt-in skips / 0 fail** across 573 tests, typecheck and pack. The package build identifies `c8f6063`; six packed public suites pass 51/52. One packed `dharmax-s3` PC5 pagination case fails reproducibly in a focused rerun: after adding 26 Features, the public Reload and Feature filter return zero rows instead of the expected 25. No Workspace source changed in this task. This is a concrete P4 failure to preserve for later; it does not reinstate PC5 as a prerequisite to starting P0.

The approved final native replay freshly executed all 65 required TestNodes, including opt-in live G3/G4 under the approved temporary reviewer route. It exited `blocked` with the unchanged 935,230/64,000 context-limit message. Route/config restoration was checked both structurally and byte-for-byte (matching SHA-256 `befbcc33416f50546ba89ac5f5b0d16f93848c0a7fc47c2730616558e192932d`). The source fix and all current acceptance decisions still produce no canonical receipt, Done, S6a/S6b GO or Gate 5 acceptance.
