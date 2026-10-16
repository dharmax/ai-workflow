# AIWF — S5 Product Operability postcondition: execution plan

**PC0 review draft, 2026-10-16.** Normative contract: [design](AIWF-S5-POSTCONDITION-DESIGN.md), read after canonical Dharmax-way design/plan. This is the only active Product Operability plan. Starting published master: `ba148632407e37a327db16cc1832c375762948f3`, verified by fast-forward-only pull, initially clean. PC0 audit and document refinement are performed; developer approval is pending. PC1–PC5 remain unexecuted/unauthorized. S5's accepted Story-test lifecycle is unchanged. No S6, Gate 5 closure, S8 migration, commit or push is authorized.

## 1. PC0 result and implementation entry contract

PC0 read the authoritative specifications and S1–S5 evidence, inspected current source/whole relevant methods and callers, the canonical DB via read-only SQLite backup, and the actual installed/sibling Semantika contracts. Investigation used disposable source/state for AIWF freshness navigation and diagnostics. Canonical records, claims, dependencies and Semantika work were not edited. Only the two postcondition documents were revised. No lease was written: the current authorization explicitly forbids canonical DB mutation and implementation; this is a document-only audit, not Ticket implementation or closure.

The design now owns the full artifact × operation × surface inventory (§2), per-kind field/owner contracts (§3), final command grammar (§4), every permitted relation and its authorship/payload mode (§5), strict MCP action schemas (§6), safety (§7), export coexistence (§8) and journey/test traceability (§9). Do not copy these into a second policy table in code or another active roadmap. Source descriptors must be the runtime authority.

### 1.1 Critical review outcome

1. **New façades alone cannot guarantee safety.** Disposable baseline reproduction: read-only `create_ticket` produced Done with no verifies edge, and read-only `propose_decision` persisted accepted Decision. Canonical mutation authority/state enforcement and legacy paths must be addressed at PC1, before any new writer is accepted. This is a bounded correction, not S6 producer redesign.
2. **Relation payloads are not implemented.** Native predicate revisions exist, but current Product preview snapshots omit payload/revision and human link schemas have none. The contract now uses native edge versions and strict note-only replacement, with owner-only evidence links. No new edge database.
3. **Semantic identity must survive compression.** Charter is an optional Product singleton, Module intent lives on existing Module, Bug on Ticket, Rule in RuleStore, test/receipt state in their existing owners. Generic CRUD cannot flatten these contracts.
4. **Usability requires a shared parser and discoverable typed operations.** Existing shell whitespace splitting and CLI dispatch differ; selected MCP omits several real operations. Three bounded façade families supplement specialized tools; no duplicate work executor or universal command-string tool.
5. **Exports must coexist with legacy sync.** One existing modules renderer owns all versions of modules.md; product.md is new explicit-only output. New sections have no importer. S8 still owns portable restore/sync removal.

**Go/no-go:** no-go for postcondition acceptance/S6; recommend developer approval of the revised PC0 contract and then a separate bounded PC1 authorization. Design D1 (external-agent approval/delegation trust policy) is genuinely unresolved. It must be chosen before external-host write acceptance at PC4. Do not silently treat model-supplied `decision:accept` as human approval.

### 1.2 Baseline evidence and limits

- Canonical snapshot: S4 `TKT-RF0W` and S5 `TKT-7MI2` remain In Progress, no claims, no incident relation between them; Gate 5 depends on Semantika prerequisite and both are In Progress. Gate 5's body reports a blocker; do not normalize its lane from prose.
- Semantika retains its eight pre-existing changed/untracked files at HEAD `0d395ee…`; installed native batch/collection files match sibling dist (hashes in design §1). Dirty source was not rebuilt or published. API supports exact revision/absence and assertion-only native atomic batches. Do not add a private transaction API.
- Disposable status/doctor inspected runtime/DB. Doctor's “healthy” summary does not establish acceptance; copied project lacks Git/projections and cloud reachability was not tested.
- Generated MCP schema-map metric: 50 tools, 138,373 UTF-8 serialized bytes. This is not actual wire tools/list bytes or measured agent cost. Agent completion/wrong-call baseline is not yet measured.
- S1–S5 existing reports were reviewed, including S3 pristine publication correction, S4 provider authentication blocker and S5 detailed DW-04 evidence. No fresh full suite/build or provider-dependent acceptance was claimed by PC0.

## 2. Rules for PC1–PC5

Each checkpoint requires its own explicit developer authorization, active appropriate canonical lease for implementation, accepted complete public Story and attributable expected-red before code edits. Existing completed behavior needs current verification, not invented historical red. Preserve unrelated dirty work, database/evidence/backups and sibling dependencies; no reset/stash/force-push or branch forest. Work on current master after checking drift. Do not create parallel roadmap Tickets to evade existing dependencies; report assisted implementation versus AIWF-owned acceptance truthfully.

Use scoped graph/exact source and inspect whole affected methods/immediate callers. Make guarded `preview → original hashes/fingerprint → apply` source changes. Reuse native Semantika conditional batches. Source filesystem effects, SQLite commits and exports are separate outcomes. Preserve existing source admission, effective Rules, dirty-target, scope attribution, cancellation, independent completion and S5 activation recovery. Fix only demonstrated related defects; defer unrelated cleanup explicitly.

For each checkpoint report actual initial state/action/observable result, changed owners, expected-red and corrected result, restart/persistence, safety negatives, skipped/unknown/provider outcomes and residual decisions. Run focused public journeys and relevant regressions; full serialized Bun suite, typecheck/build at shared-contract stable boundaries. No unit-test-only acceptance, mirror tests or threshold loosening. Claim release/Done only through current independent canonical proof, never from this plan. Stop after reporting; publication requires separate commit/push authorization.

## 3. PC1 — Canonical safety, shared parsing and governed links

**Purpose:** establish a trustworthy common authoring boundary before adding charter/Module/Bug writers. No new runtime subsystem and no S6 resolution redesign.

**Existing owners:** `product/mutation.ts`, `graph/store.ts`, `change/engine.ts`, `tools/{change,product,tickets,planning,registry}.ts`, `graph/ticket-state.ts`, `ticket-command.ts`, existing independent Ticket completion owner; `artifact-command.ts`, CLI/shell lexer/dispatch/facilitation; `tools/surface.ts` and MCP schema conversion only as required for link/read transport.

**Bounded work:**

- Put actual authority, abort/review context and reserved verification-field/edge enforcement at shared mutation/owner boundaries. Route old authoring adapters through the same validation/commit path. Generic create/update/Product JSON cannot make Done/verified or edit Test execution/receipt state. Existing specialized completion and S4/S5 test linking retain narrow owner authority. `propose_decision` becomes inert rather than auto-accepting; full Decision editor is PC2. No migration of historical Done/accepted rows.
- Keep valid legacy invocation/result keys; document deliberate refusal of previously unsafe calls. Old `done` reports unchanged only for an already current independently verified completion; otherwise it refuses with `resolve` guidance, never blind state update, a new evidence-only resolution mode or a surprise provider run. Audit legacy projection imports/native writers for the same safety semantics. Do not remove them as an S8 shortcut.
- Extend the existing command-intent parser to colon/space grammar. Shell tokenizes once and facilitates only missing arguments; covered CLI/shell paths no longer reinterpret tokens. Preserve aliases/help/keyword case/exact ID and `--` rules from design §4. Recognize future kinds truthfully; missing PC2/PC3 capabilities return deferred/unsupported, not fabricated output. No Actor fallback for explicit invalid syntax.
- Export the single relation descriptor from Product mutation owner. Implement allowed/inspect/preview_add/preview_remove, both payload forms, exact native edge revision/absence/fingerprint, note replacement/no-ops, H/O/L authorability and cycle rules from design §5. No AST writer, generic evidence authoring or separate unlink family.
- Expose strict link façade/read discovery and exact schema errors, retaining legacy tools. Fail closed on schema conversion. Do not implement a second work dispatcher.

**Proof:** `tests/product-operability-commands.test.ts` and `tests/product-operability-links.test.ts` (new, planned) run actual CLI subprocesses, shell parser/process boundary and stdio MCP with temporary real DB. Supplement atomic/authority invariants where public transport cannot inject failure. Regress `artifact-command`, shell daily, Product changes, S2, doctrine scope and Ticket resolution without claiming S6 improvement.

Required negatives: original read-only Done and accepted-Decision counterexamples; generic Test/receipt/hash edits and verifies links through old/new/JSON paths; already-aborted authority; wrong scope/secondary source/Rule; every invalid triple/direction and O/indexed attempt; L add versus L removal; full Ticket combined cycle; malformed/mixed/duplicate/prototype payload keys; numeric JSON note versus assignment string; removal with payload; exact/casefold collisions; quote/escape/-- preservation; duplicate scalar flags/extra operands; absent edge remove no-op; add preserves payload; explicit {} clearing; payload-only revision invalidates old preview; remove/recreate ABA; duplicate physical edge conflict; stale endpoint, canceled/rejected preview, injected SQL rollback and restart. No-op has no entity/edge version churn. Owner-only trusted paths still work.

**Observable gate:** one actual CLI/shell grammar produces equivalent intent; governed edges are discoverable, previewable and correctly applied through CLI/stdio under real authority. Both agreed payload forms round-trip identically after reopen. All legacy bypass reproductions refuse, while actual completion/test owners remain functional. No false Done/green or partial accepted graph. **STOP.**

## 4. PC2 — Optional Product, Module meaning and complete definition authoring

**Prerequisite:** accepted PC1; no open safety bypass. Design §3/§5 is the exact approved field/relation contract, not a menu of alternatives.

**Owners:** ontology/types/store, Product schema/mutation/tools, existing source indexer, existing projection renderer/import boundaries; artifact façade/readers; no shadow intent store.

**Bounded work:**

- Add optional fixed-ID Product descriptor through existing store and reviewed S2. Zero/one charter, no init-generated intent. References use Product contains Goal/Concept only. Define/edit/retire and undefined state; reserved collision fails without rewriting data.
- Expose existing Goal/Concept/Flow/Feature/Story/Aspect, Epic/Ticket definitions and newly reviewed Decision fields through exact per-kind artifact schemas and compact CLI. Search/pagination and incoming/outgoing navigation are usable. Complete accepted semantics and legacy needs-review are distinct; new/edit create/update-only, no title identity guesses.
- Add Module intent fields/status on existing indexed Module, retaining source identity/path/status ownership. Reindex/file removal/reopen preserve intent/links; rename ambiguity is explicit. No planned source-free Module creation or generic code CRUD.
- Human definition edits all reach S2; work state/Rules/proof remain specialized. Default retire deprecates definitions/Module intent, keeps dependents; Ticket cancel is not generic retire. No physical delete convenience.
- Implement one-way product export and shared modules renderer exactly as design §8. Reuse automatic modules export until S8, add no modules/product importer, do not update unrelated sync-state on explicit product export. Correct canonical Module-ID dependency rendering and distinguish indexed BUG notes from defect Ticket facts.

**Proof:** `tests/product-operability-definition.test.ts` through real CLI/stdio with temporary fresh, mature and maintenance projects; later browser parity is PC4. Regress top-level-product-intent, Product/S1–S4 tests and projection/sync tests.

Negatives: charter absence never blocks technical work; reserved-ID collision; incomplete accepted fields; kind-specific foreign fields; stale basis; reject/cancel; retire with linked work preserves links/history; explicit clear versus omit; unknown legacy statuses; Modules cannot be created/moved/deleted through definition CRUD; ordinary/forced reindex/last file removal retain intent; directory rename does not copy intent; export existing user product.md conflict, symlink/path escape, concurrent file edit, write failure, and subsequent ordinary sync retaining Module intent. Explicit export cannot import unrelated edited projections or advance their export timestamp. Test source/DB atomicity claims stay separate.

**Observable gate:** CLI/typed MCP can author and revise the whole supported product definition and module purpose without eval/raw DB/handmade JSON. Exact definitions/relations survive restart and indexing; exports contain accurate versions/status and coexist with current legacy sync. **STOP.**

## 5. PC3 — Defect operations on the existing Ticket lifecycle

**Prerequisite:** PC1 safety and PC2 definition contracts accepted. No Bug table, lifecycle, runner, verifier or proof format.

**Owners:** Ticket ontology/types/readers, Product definition validation, existing Ticket state/lease/start/verification operations, `recommend_next_task`, command adapters and artifact Bug filter/schema.

**Bounded work:**

- Add explicit Ticket kind/strict optional defect fields; legacy absent reads task, no title heuristic or bulk reclassification. Bug report/list/show/edit/reclassification keeps one identity. Complete reproduction and diagnostic-readiness rules; unknown is useful, fabricated content is prohibited.
- `work:bug`, `work bug`, `bug`, `bugs` normalize to the same kind constraint. Task/Ticket show can display a Bug; Bug show rejects a task. Same claim/release/start/move/reopen/cancel operations; no generic lane/verification editing. Canceled/reopened historical evidence remains visible without a current verified claim.
- Implement design §3.4 exact recommendation ranking and prerequisite/claim eligibility, explanations and deterministic ties. A suggestion is not authority to expand scope or execute a dependency.
- Link context using existing typed relations only. Reproduction is actual failing public behavior when available; unavailable environment is blocked/unknown, not fake red. A diagnostic Ticket may close investigation only against its explicit contract. No new autonomous producer behavior.

**Proof:** `tests/product-operability-work.test.ts`: actual CLI/registry/stdio report→filter→inspect→link→next→claim/start, S5 test fixture reproduce→guarded correction→rerun and current-evidence inspection. Existing Ticket completion tests prove refusal/atomic completion under a controlled independent verifier; do not call them new provider-backed acceptance. Regress S5, tools/work selection, ticket-resolution, doctrine-scope.

Negatives: “fix” title remains task; missing kind defaults read-only task; partial defect reports not implementation-ready by invention; invalid severity/extra fields; severity cannot override higher explicit priority; unmet/missing/rejected prerequisite; another claimant/expired lease; blocked active lease; no configured agent cannot adopt another claim; start activation partial failure/recovery; bad fixture versus expected-red; same-ID reclassification; reopen/cancel preserves history; raw Product JSON and legacy move/done cannot manufacture completion.

**Observable gate:** real Bug operations are as convenient as Ticket operations and share their safety/identity. Recommendation is deterministic and explains actionable choices. Proof is actual current behavior or a precise blocker. **STOP.**

## 6. PC4 — Finish Workspace, shell facilitation and agent operability

**Prerequisite:** PC1–PC3 accepted. Developer resolves D1 trust policy before external-agent acceptance is claimed. If host supplies neither exact approval nor bounded delegation, return preview/review_required; do not invent an approval service or self-attested token.

**Owners:** existing Workspace server/page/client, CLI/shell presentation, entity views, shared command/field/relation descriptors, existing public tool selection/MCP transport. No browser business rules or second tool registry.

**Bounded work:**

- Deliver dedicated forms/list/search for target Workspace coverage in design §2, correct complete Story/charter/Module/Bug fields, both-direction relation picker with H/O/L and note review, Work state actions and Verification views. Rule/source/setup/provider operations are explicit specialist handoffs. Derive work and prepare/apply Story tests reuse S4/S5, not another planner/test runner.
- Add missing-argument shell forms and scoped completions over the shared parser. Fully specified command executes without redundant questions; cancel leaves state unchanged. Keyboard-only navigation, meaningful empty/missing/stale/errors and retained unsaved edits.
- Finish strict artifact/link/verify façade branches and retained specialist Story-test tools. Validate actual tools/list JSON Schema, union conversion, projectRoot authority, exact versus explicitly human ID lookup and errors through stdio and supported host. Keep legacy public tools; compact selection opt-in. No duplicate work family and no generic command-string executor.
- Exercise cross-surface exact IDs/versions/fields/edges and authority, no surface-specific persistence. Review invalidation, two editors, duplicate clicks, untrusted Workspace origin/token, stale imported preview, unavailable provider, and committed-but-refresh-failed recovery.

**Proof:** `tests/product-operability-parity.test.ts` uses actual browser, executable CLI, interactive shell processing and stdio MCP in fresh and mature fixtures. Existing S3–S5 browser stories run unchanged unless a deliberately approved safety contract requires stronger assertions. Exercise every authorable target kind at least once, every unsupported action at its boundary, no mock browser model.

Measure comparable fresh human and agent tasks, recording setup steps, user actions, domain/model/tool calls, wrong calls, corrections, latency and tools/list serialized bytes. Separately record legacy selection and compact selection. Deterministic scripted protocol discovery is schema proof, not a coding-agent performance trial. If no authorized working agent route is available, mark the agent part blocked; do not invent a usability score or loosen a schema. Do not issue provider retries to fill a report.

**Observable gate:** PC-J1–J8 complete through actual human/agent surfaces, with legal operations discoverable from scoped help/schema, identical canonical results and no everyday JSON workarounds. PC-J10's actual agent evidence is present or explicitly blocked, preventing full PC5 acceptance. **STOP.**

## 7. PC5 — Independent public postcondition acceptance

**Prerequisite:** accepted PC1–PC4; all remaining decisions resolved; implementation source, fixtures, test files, help and build inputs tracked/reviewable. No silent acceptance of S6, S7 or S8 work.

Independent reviewer executes design §9 PC-J1–J10 and additional everyday cases, recording actor, Intent/State/Action/Expected versus Observed, exact invocation/transport, source revision, test location, DB record/edge versions, fixture/Story/Aspect basis, failure classification and restart result. Fresh/mature/maintenance fixtures must be independently reproducible. Verify every inventory row's promised operation/surface or explicit exclusion; relation descriptor enumeration must match validation/help/MCP/Workspace, including owner-only and legacy rows.

Required final evidence:

- Real CLI colon/space, shell, browser and MCP coding-agent tasks succeed without eval/raw DB/handmade Product JSON/hidden internal operations. Report costs and errors against the reproducible baseline with same measurement units; tool-count reduction alone is not acceptance.
- Negative authority/approval, generic completion/evidence bypass, indexed edge writes, payload, ambiguity/cycle, stale/ABA, SQL rollback/restart, reindex/Module preservation, legacy claim/Done/proof preservation, export collision/failure/sync coexistence all hold.
- Existing S1–S5 public journeys and applicable Gate 5 adversarial controls remain effective. Run focused public suites, then `bun test --max-concurrency=1`, `bun run typecheck`, `bun run pack`, `git diff --check` at stable boundary; no repeat without relevant changes/failures. Report all skips/provider limits explicitly. No provider-dependent acceptance invented from deterministic results.
- Pristine AIWF checkout validates tracked import/test/fixture/help closure, actual build and public journeys; pin installed sibling artifact versions/hashes and local dirty dependency assumptions. Do not claim the whole ecosystem is pristine or independently packaged without proving it. Audit whole changed methods/callers and actual CLI examples, not only diff lines.
- Reconcile canonical work through existing appropriate acceptance owners only against actual evidence; no synthetic VERIFY receipts, parent relation assumptions or narrative Done. Preserve unrelated changes and recovery data. Publication needs explicit commit/push permission; a local independently reviewed report can be delivered without publishing.

**Observable gate:** independent evidence supports the complete contract and developer explicitly accepts PC5. Postcondition acceptance permits consideration of S6 only under fresh authorization. Gate 5 is neither renamed nor closed. **STOP for developer decision.**

## 8. Consistency, migration and rollback constraints

Before each commit proposal, repeat the design/plan consistency pass: field names/types, parser examples, per-kind lifecycle, relation directions/modes/payload, MCP runtime versus advertised schema, snapshot/no-op behavior, host authority, expected test locations and checkpoint containment. “Pending” remains pending if proof or developer acceptance is missing.

Schema changes are additive at existing owners; legacy absence/status is surfaced, not auto-accepted/reclassified. No destructive data rewrite is required for Product absence, Module intent or Ticket kind. Back up live SQLite consistently before any future schema implementation. A downgrade must not silently drop new intent/defect data; retain backup/export and report old-reader limits. Do not use Markdown round-trip as rollback for fields it never supported. Preserve unsafe legacy callers' names while intentionally refusing unsafe behavior, with diagnostic guidance; do not preserve an authorization bypass for compatibility.

No portable project restore, sync-state retirement, legacy projection deletion, mass Ticket reopening, actor/model budget changes, new provider routing, new independent completion system or Gate 5 acceptance belongs here. When implementation reveals a genuine missing contract, amend this single design/plan for review; do not accumulate competing designs or quietly expand the checkpoint.
