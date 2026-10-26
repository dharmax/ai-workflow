# Graph Issue 6 — coding-host evidence, 2026-10-26

## Defects and corrections

The original full Bun baseline reproduced **44 pass, 92 fail, 67 errors**. The missing parenthesis introduced by `b769773` prevented importing the indexer and caused the mass cascade. Fixing it exposed independent failures in governance admission, derived test relationships and source identity.

The synthetic `call-candidate` symbols introduced by `a02e801` conflated unrelated name occurrences with declarations. They are removed: Oxc call names remain compact, explicitly unresolved parser facts on their owning File. No name-based declaration call edges are asserted. Legacy candidate anchors are excluded from source lookup and cleaned during explicit full indexing.

The indexer now reconciles declarations, containment and structural imports through the same owner for workspace and dependency sources. Missing declarations with authored links become tombstones and recover their identities if restored. Unchanged dependent tests refresh verification relationships without reindexing source outside the admitted scope. Derived test-to-symbol links require actual TS7 references; an import remains structural coverage, not execution evidence.

Exact position lookup bypasses Graph admission, validates workspace paths and preserves identifier coordinates. The former same-line name scan could redirect an instance property to its static namesake. TS7 receives workspace file-change notifications so later-created/deleted consumers are reflected without restarting the client. Existing authority and guarded-change owners remain in force.

Repository literal discovery shares file enumeration with indexing but includes unindexed text/schema/configuration extensions. It reports exclusions, skipped files and truncation. Investigation records exact references, structural import candidates and literal candidates separately; discoveries do not authorize edits. The implementation Actor and public MCP surface use the same search tool.

Standalone packaging embeds the unchanged Oxc JS/native runtime with Bun assets. The regression starts the compiled MCP executable outside this repository, without node_modules, and checks property discovery, exact references and configuration text search.

## Real field-contract migration

`tests/fixtures/graph-field-migration.ts` and `tests/us/graph-field-migration.test.ts` exercise `waitSeconds` to `delayMs`, including unit conversion, across declarations, destructured/optional/escaped consumers, a barrel import, Zod schema, configuration, serialization and immutable tests. The genuine baseline fails two assertions. Existing preview/fingerprint/apply executes the authorized migration. The unchanged tests then pass and typecheck succeeds. Residual explanatory text and negative-test text are reported rather than erased.

A separate native replay used the default Ticket investigation and independent local `ollama/gemma4:e4b` verification with repairs disabled. The fixture Ticket received a canonical `VERIFY-FIELD-MIGRATION` receipt and Done; restart/readback confirmed all three criteria and receipt freshness. This proves that fixture lifecycle, not root Ticket or general Product acceptance. Retained coding-host evidence: `/tmp/aiwf-issue6-live-migration.json`, `/tmp/aiwf-issue6-receipt-readback.json`; retained fixture `/tmp/aiwf-field-contract-sGV5R1`.

## Verification and limits

Run `bun run typecheck`, `bun test`, and the migration regression above. The latter includes a real standalone build/MCP test. Parser sibling checks passed: typecheck, build and 22 tests. The preceding complete AIWF run passed 655 tests with five existing opt-in skips; the final aggregate after adding standalone packaging coverage is recorded in the publication report.

TS7 7.0.2 omits some escaped computed property references and rename edits. Structural dependency traversal, source inspection and explicit raw-text search cover the demonstrated case; no exhaustive semantic or textual coverage is claimed. Text search follows Git-visible files (or recursive fallback), excludes tool directories, skips binary/oversized/symlink files and bounds results. External dependency discovery covers package entry/direct imports, not arbitrary full package reachability. Same-name ambiguous declarations require exact positions. Non-JS/TS parsing remains explicitly heuristic.

Issue #6 remains open: this technical migration and its independent receipt do not manufacture an approved Product Story or certify the wider release gates. No Gate 5 acceptance is claimed.
