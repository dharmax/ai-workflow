# Ticket.resolve / TestNode audit

Scope: Ticket resolution only, on master, owned by TKT-SUPY. Debug/fix and digest are excluded.

## Permission and responsibility audit

The question for each stage was: what authorizes this action, which existing contract owns it, and what observable evidence permits the next stage?

| Method/helper or stage | Authority and invariant | Finding / action |
| --- | --- | --- |
| `Ticket.investigate` | Authored Ticket, code anchors, parent constraints and material Aspects; fresh AST snapshot | Keep grounded discovery and exact source reads. Optional candidates cannot replace authored scope. Its SystemOne routing remains shared investigation behavior. |
| `Ticket.prepare` | Reuse executable atomic work; reviewed enrichment only when necessary | Keep ordinary children, budget checks, and existing product mutation engine. Correct legacy `Test` filtering to `TestNode` in preparation review evidence. |
| Resolve closure discovery | Prepare bounded work before implementation | Removed a duplicate investigation: preparation already returns its investigated dossier. Refresh only after preparation actually changes the contract. |
| Lease helper | Fresh active lease, matching agent, bounded TTL | Keep existing claim owner and release only leases acquired by resolution. |
| Dependency order | Ordinary `contains` / `depends_on` edges | Keep cycle detection, dependency ordering and verified external prerequisites. |
| Receipt reuse | Exact contract/completeness, current graph obligations, current source/test hashes and passing TestNodes | Old receipts omitted full-suite/spec tests and ignored later failing TestNode evidence. Typed safe parsing now treats malformed/legacy receipts as stale; explicit new commands and full-suite additions also invalidate reuse. |
| Implementation selection | One exact target permits synthesis; otherwise bounded existing Actor | Remove the default LLM mechanism/tier/failure classifier. Normal routing is deterministic. An explicitly injected SystemOne can still supply routing hints. |
| Actor execution | Existing tool schemas, mutation fingerprints, lease and dirty-file guard | Keep three 16-step tranches, progress-gated continuation and duplicate-observation protection. No second editor or execution engine. |
| Safe-change helper | Existing CausalChangeEngine owns preview/apply and verification | Removed the proposal loop's duplicate preview/guard/lease. Both synthesis and Actor edits go through the same helper. Demonstrated proposal/apply failures feed the existing bounded repair loop. |
| Test discovery | Existing TestNodes and their `verifies` edges | Reuse `test-artifacts.ts`: file and symbol edges, directly linked tests, and changed-file symbol targets precede fallback. Producers cannot substitute a passing unrelated test for a graph obligation. |
| Fallback | Graph insufficient for a particular source | Invoke existing `resolve_test_target` only for uncovered files; use every returned test, not just its first filename. Deduplicate commands; an unfiltered Bun full suite subsumes Bun targeted commands. |
| Execution recorder | Actual runner execution, canonical TestNode identity/path | Backfill unchanged indexed test files that predate TestNode support; older projects otherwise silently dropped executed files. Update authored IDs as well as indexed IDs. Persist command, result/output, timing and source/test hashes. Parse complete output before truncating review excerpts. Runner verbs are not test targets. Filtered/no-test runs cannot fabricate full-suite evidence. |
| Acceptance verifier | Fresh independent review of every exact criterion and material Aspect | Current TestNode evidence and actual test sources replace `.test.ts` command regex discovery. Passing executions do not imply acceptance. Missing, negative, blank or contradictory checks cannot mark Done. |
| Bounded repair | Verification feedback, existing maxRepairs (0–3) | Formerly Done tickets previously skipped implementation on every repair. First reverify unchanged code; subsequent failed checks may invoke repair. Keep the global Actor tranche bound. |
| Persist proof / Done | Passing current TestNodes plus explicit complete acceptance | Snapshot local test/import/verification scope before execution. Reject source/test changes during execution or independent review. Persist immutable acceptance receipt with canonical TestNode references and hashes, then Done. |
| Finally | Resolver owns acquired leases and projection synchronization | Always release acquired leases and export projections, including blocked/needs-input paths. |

## Final lifecycle

Prepare/investigate bounded work → dependency order → reuse genuinely current proof if possible → determine implementation → leased fingerprinted safe change → graph-first TestNode selection → per-source fallback only where needed → actual checks and TestNode evidence → bounded repair for failing checks or unproved requirements → independent acceptance/Aspect review with freshness guard → persist proof → Done → release and sync.

TestNodes own test identity, verification relations and execution evidence. Runner output and command parsing are boundary adapters, not a second test inventory. Acceptance receipts retain the separate semantic decision and immutable references/hashes; they do not replace TestNode evidence.

## Limits retained deliberately

- Static imports/calls derive verification edges; dynamic dependencies require authored edges. Hash freshness covers authored scope and graph-visible local imports, not arbitrary external service state or environment variables.
- Resolver runners are Bun tests, Playwright and Bun build/typecheck checks. Other identified frameworks return needs_input rather than running them as Bun. Build/typecheck alone cannot fabricate passing TestNode evidence.
- A runner's aggregate failure conservatively marks its reported/selected TestNodes failing; this is not an assertion-level per-file failure classifier.
- Independent semantic acceptance remains a reasoning step (or an explicit verifier injection). Provider failures remain blocked; they are not successful completion.
- Existing preparation/dependency/Actor mechanisms remain; no new resolver, service, workflow, branch or debug/fix system was added.

## Verification

Focused regression suite covers file and symbol verifies selection, uncovered fallback, passing-decoy rejection, actual evidence including custom IDs, authored/derived edge preservation, targeted/full-suite execution, legacy unchanged test inventory migration, stale spec/source/receipt rejection, unchanged proof reuse, formerly Done repair, explicit unproved/contradictory acceptance, and source mutation during execution/review. Existing tests retain lease, dirty-file, dependency, rename, Actor-bound and provider-boundary coverage.

Validated on the final code:

- Focused: 47 pass, 0 fail (ticket resolution and existing test tools).
- Full: 234 pass, 0 fail across 32 test files; strict typecheck passed.
- Real `TKT-SUPY.resolve()` dogfood: no-edit implementation callback, full Bun suite and typecheck, actual TestNode updates, fresh independent acceptance review on the configured model route, persisted `VERIFY-TKT-SUPY`, Done and released lease.
- The configured provider rejected oversized review prompts despite available account credit. Surgical code/regression excerpts allowed the same route to complete all five criteria. This validates the lifecycle with the existing verifier-injection contract; it does not establish an unlimited default-verifier context budget. The default verifier still reads whole source/test files and can exceed provider limits for large scopes.

The final dogfood receipt contains 33 TestNodes (including authored identities) for all 32 executed files. A subsequent unchanged real-ticket resolution completed through receipt reuse with implementation and verification callbacks that throw if invoked. Final projection sync completed and no audit-ticket lease remains.
