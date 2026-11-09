# AIWF — Code Mutation Service: staged refactoring plan

**Status:** Stage 1A–1C passed focused local gates. Stage 2 Product extraction passed typecheck, 80/80 focused tests and pack; full suite: 855 pass, 7 skip, 2 classified unrelated failures. Stage 3A passed local typecheck, 62/62 focused tests and pack. Stage 3B passed local typecheck, 158/158 focused tests and pack. Stage 3C reconciliation extraction passed local typecheck, 159/159 focused tests and pack. Stage 3C source-only service ownership, public source routing and compatibility adapter passed typecheck, 162/162 focused tests, and packaging. Full suite: **862 pass / 2 previously classified unrelated failures / 7 skip** (871 total). Stage 4A passed its developer-run local typecheck/focused gate (exact count not supplied). Stage 4B transport-independent SourceManager and explicit CodeMutationService facade **passed developer-run typecheck and focused tests** (counts not supplied). Stage 5 remaining caller-owner migration passed developer-run focused gate (count not supplied). Stage 6A shared TypeScript client/path relocation typecheck and focused regression gate passed (developer-confirmed). Stage 6B1 source lookup/fingerprint/request-schema relocation prepared, pending local gate; 6B2 remaining type contracts and legacy-engine removal not started.
**Work branch:** `refactor/code-mutation-service` (one short-lived branch, not a branch per step).
**Starting remote `master`:** `b203e6be8a504d3990887372aa5c9d5783639f88` (2026-11-07).
**Governing principles:** [Dharmax Architecture](../docs/definitions/dharmax-architecture.md), [Prime Directive](../docs/definitions/prime-directive.md), [active checkpoint](AIWF-V1-ACTIVE-CHECKPOINT.md). This is a bounded refactor, not a new runtime, manager framework, change format, or release-stage advancement.

## Objective and verified starting observations

Replace the misleading `src/change/` catch-all with a cohesive **Code Mutation Service**, an intentionally small facade, focused internals, a thin public adapter, and independently reusable TypeScript/source helpers. Restore semantic ownership of Product changes. Keep the same observed contracts and permissions.

At the original starting commit (historical observations; rechecked against the 2026-11-08 working branch):
- `src/change/engine.ts` is ~1,039 lines. `CausalChangeEngine` mixes `product_change` preview/apply with source edits, TypeScript rename/refactor, fingerprinting, filesystem commit/rollback, index/anchor reconciliation and post-commit checks.
- The existing Product authority and atomic graph mutation owner is `src/product/mutation.ts` (`validateProductMutations`, `applyProductMutations`, charter/review checks). **Reuse it.**
- `src/tools/change.ts` owns public `preview_change`/`apply_change`, Ticket scope/lease, dirty-target approval and host context. Moving code between files must not bypass these checks.
- `src/change/ts-lsp.ts`, `ts6-refactor.ts` and `symbol-source.ts` are also used by read-only graph queries, test artifacts, Rules and investigation; they are **not** exclusively mutation internals.
- `src/change/types.ts` and `request-schema.ts` mix LSP/code types with Product mutation and public union contracts. Public input/output shape and strict schema must remain stable during migration.
- `applyTextEdits` silently clamps out-of-range positions and does not reject overlaps or reversed ranges; `normalizeWorkspaceEdit` also mixes conversion with disk/path checks. These are **confirmed code risks**, not yet independently reproduced failures. Preserve valid UTF-16, CRLF and existing stable-edit-order behavior until characterization tests establish the contract.
- Preview gathers affected files and hashes via individual normalizations; fingerprinting normalizes again; apply merges all mutations and normalizes again before materialization. Cross-mutation conflicts can therefore escape per-WorkspaceEdit validation. **One aggregate plan** must be the authority for the same effect set at preview, fingerprint and commit; neither the product nor source authorization layers may use a narrower list.
- The starting master and this document do **not** prove a fresh full-suite baseline. Record it locally before implementation; do not confuse previously green targeted tests with a full qualification.

## Target ownership (no new framework)

```text
src/managers/
  source-manager.ts                    # If warranted: operation-level lease, scope, review, admission (stateless)
src/services/
  code-mutation-service.ts             # Only public facade: previewCodeChange(), applyCodeChange()
  code-mutation/
    preview.ts                         # Code-only request dispatch; narrow source/symbol/refactor handlers
    refactor-preview.ts                # TS7/TS6 edit selection, if sizeable enough to warrant its own module
    edits.ts                           # Validate/normalize WorkspaceEdit; apply precise text edits in memory
    fingerprint.ts                     # Deterministic source/effect fingerprint
    commit.ts                          # Preflight + materialize + guarded filesystem commit + rollback
    anchors.ts                         # Re-index/reattach existing durable code anchors after a committed edit
    postconditions.ts                  # Read-only observed effects and diagnostics (not independent acceptance)
    types.ts                           # Code-only contracts, not Product/transport unions
  typescript-service.ts                # Thin LSP client access/lifecycle for read-only and mutation consumers
  typescript/
    lsp-client.ts                      # Existing TS7 implementation, initially behavioral move
    refactor-client.ts                 # Existing TS6 sidecar, initially behavioral move
    lsp-shutdown.ts                    # Shared teardown
src/helpers/
  workspace-path.ts                    # Reused workspace boundary, no duplicated path policy
  source-lookup.ts                     # Reused read-only symbol lookup/target resolution, if cohesive
src/product/
  change-operations.ts                 # Product preview/review/apply adapter over existing product/mutation.ts
src/tools/
  change.ts                            # Thin registered public adapter; exact current command IDs/schemas
  change-request.ts                    # Only if needed for transport-level Code | Product union
```

**This is a responsibility map, not a file-creation quota.** Consolidate tiny modules; do not add empty facades, wrapper layers, duplicated contexts, arbitrary classes, speculative extension points or a second registry. It is acceptable to use fewer files. Prefer `CodeMutationService` as a cohesive facade with explicit `previewCodeChange` and `applyCodeChange`; service-internal state is justified only for the existing LSP handles and same-instance stale-preview check. If product/source call conventions demand a compatibility adapter, keep it temporary and delete it in the final stage.

### Authority and ownership rules

1. **Public adapter / Source manager:** authenticate trusted host context; enforce source Ticket claim, governed scope, dirty-target policy, permission, reviewed fingerprints and admission. `source-manager.ts` is justified only by the current nontrivial logic in `src/tools/change.ts`; no base manager, factory, or alternate orchestration system. Product authoring stays with the Product owner, not SourceManager.
2. **Code Mutation Service:** calculate source previews and effects; recheck source/authority evidence at the final write boundary; apply changes and report exact postconditions. It does **not** approve its own work, synthesize acceptance, or create tickets. Internal reviewed Story-test owner calls remain explicit, not accidental public bypasses.
3. **Product domain:** preview and apply Product mutations through existing Product validation, atomic Semantika-backed batch and host-owned review. Product changes must not initialize LSP clients or masquerade as source mutations.
4. **TypeScript service / helpers:** independently usable language tooling and read-only symbol/navigation. One shared TS7/TS6 client lifecycle; no speculative common superclass or bespoke LSP protocol. Leave `src/typescript-runtime.ts` as the established runtime resolver unless a concrete ownership issue is demonstrated.
5. **Entities:** move *intrinsic entity behavior* into `FileNode`/`SymbolNode`/`Ticket` only when inspection shows an actual cohesive method. Keep graph relationship persistence/atomicity in Semantika/WorkflowStore and multi-file LSP, filesystem writes, lease admission and source authorization in their proper owners. `FileNode.handleEvent` is already entity-owned; do not create artificial entity methods to fill the architecture.
6. **Contracts:** keep one validated request source for each domain. The combined Code/Product public union belongs at the transport boundary, not in a code-only service. Preserve old wire IDs, command schemas, shape/fingerprint behavior, and observed errors during the extraction; any intentional tightening requires a separate test and explanation.

## Verification cadence (updated 2026-11-09)

- After ordinary code changes: run TypeScript typecheck and the smallest relevant regression group; no routine `pack`.
- At architectural trust boundaries: run the broader targeted/regression suite; full suite when integration or completion requires it.
- Run `bun run pack` **only** when packaging/bundling/distribution behavior changes, at a release/merge candidate, or if a concrete failure implicates the build. Previously repeated packs at every small stage were unnecessary.
- Preserve exact test counts, skips, failures and whether a check was local/remote; build success is not proof of behavior. Commands should capture errors and copy output with `wl-copy` when requested.

## Non-negotiable safety invariants

- Preview never changes source files or accepted Product definitions. Incidental read-model indexing, if already authorized, is not permission to mutate authored state.
- Source apply retains active Ticket lease, bounded authorized source scope, host-owned approval, dirty-file policy, stable fingerprint and pre-write freshness/ABA checks; a stale preview cannot write.
- Product apply retains trusted host review, charter answers, exact revisions, coherent Semantika batch, and independent post-commit validation. The client-supplied `decision:'accept'` field is **not itself** developer authorization.
- Edit normalization validates every touched file/path (including generated edits, deletions and renames), and rejects ambiguous/conflicting LSP edit sets **across the complete request**, before fingerprint approval and before any filesystem write. Every affected path, including rename destinations and newly created files, is included in guarded preview evidence.
- File commit failure has the existing best-effort rollback contract; **after** an actual commit, failures in index/anchor/postconditions must truthfully report partial application and must never silently retry, roll back verified user changes, or mark a Ticket done.
- Durable graph anchors, tests, receipts, version/history, source provenance and relevant governance remain intact. Actual independent acceptance continues to be owned by Ticket verification, not the mutation service.
- A public source write must not become possible by calling an internal helper. No broadened `read-only` scope, arbitrary `codeMutationAllowed` defaults, implicit review or direct SQL workaround.
- Keep the existing internal Story-test source owner functional (`applyOwnedChange` or its explicit successor) without granting it as a public escape hatch.

## Execution stages — one stable commit boundary at a time

**Common gate at every implementation step:** inspect the *whole* touched methods and direct callers; first write a targeted before/after Story or invariant test; run `bun run typecheck`, focused tests and the directly affected public/authorization tests; inspect the diff for extraneous movement, circular imports, unused aliases and changes in authority. If the gate fails, correct this step before proceeding; do not hide or rewrite expected results to force green. Record test counts and skips. No automatic stage advancement.

### Stage 0 — establish an honest baseline (no production edits)

- Reconfirm branch ancestry and local clean worktree; pin sibling dependencies and the exact `master` starting point. Inventory **all** `src/change/*` imports (including dynamic imports and type-only imports), exported symbols, public command registrations, and test references.
- Run full `bun test`, `bun run typecheck`, and `bun run pack` locally. Collect targeted tests for source edits, Product preview/apply, CLI/MCP/REST, LSP teardown, Ticket resolution and post-commit graph anchors. Document failures/skips if present; do not call an unknown baseline green.
- Capture observable reference behavior for: a valid Product preview/apply, a guarded source preview/apply, a stale preview, a denied public source write, and a rename with anchor migration. Capture returned JSON/fingerprint where deterministic.

**Gate 0:** reproducible baseline and a finite external contract inventory. No new implementation while existing failures remain unclassified. A *classified* pre-existing failure is recorded, not repaired under this refactor unless it blocks the code-change contract; full green is not an invented precondition.

### Stage 1 — exact edit semantics, in three small commits

**1A — Characterize and extract, no behavioral change.**
- First pin current supported effects in `tests/change-edits.test.ts`: ordinary replacements, UTF-16 surrogate positions, CRLF, multiple edits, same-position insertions, direct `changes`, `documentChanges`, rename/delete/create and path rejection. Record **current** insertion order; do not claim it is correct for all LSP producers.
- Move `applyTextEdits` and `normalizeWorkspaceEdit` to `src/services/code-mutation/edits.ts`. Keep the old `engine.ts` named exports as thin aliases; imports still come from `src/change/types.ts` until Stage 6. The current normalizer performs filesystem checks and is **not pure**. Separate a pure parser only where a real boundary warrants it.
- Keep preview, fingerprints, disk effects and error strings unchanged. No broad refactor, no SourceManager work in 1A.

**1B — Validate exact source edit sets (security/correctness change, red tests first).**
- Add failing tests: negative/fractional/NaN/Infinity/out-of-bounds line or UTF-16 character; reversed range; overlapping nonempty ranges; overlapping replacements plus insertions; duplicate/contradictory creates, deletes and renames; conflicting operations **across multiple mutations**; symlink/lexical escapes and protected paths.
- Explicitly characterize CRLF: `replace_text` computes raw-string offsets, whereas LSP positions are UTF-16 line coordinates. Do **not** silently reinterpret existing valid internal replacements; make a deliberate, tested mapping or reject ambiguous input.
- `documentChanges` is ordered in LSP; current code flattens it. Preserve supported sequences; reject unsupported dependent sequences before writes rather than silently reordering them. Same-offset insertions must have one documented, deterministic rule; if changing the old observable order, isolate that as a deliberate contract change.
- Route all paths through the existing `workspacePath` owner, including **every** rename endpoint; validate unknown `kind` values rather than treating them as implicit creates. Do not add a second path policy.

**1C — One aggregate validated plan (source-only).**
- Build one bounded aggregate of **all** source mutations, text edits, creates/deletes/renames, affected paths and file hash basis. Normalize/validate before preview approval. Compute the fingerprint from the same canonical effect set that apply re-materializes. Preserve the old fingerprint bytes for valid unchanged effects; if impossible, surface the exact difference and isolate a documented breaking change—never silently invalidate external previews.
- Apply independently rebuilds and checks the entire plan from the current request/graph/files, never trusts a client-supplied plan, then rechecks hashes, scope, admission and lease **immediately before the commit boundary**. Avoid a second validator in the commit path.
- Include rename destinations in `originalHashes` (missing sentinel where appropriate); guard create-after-preview races, rename targets, direct source actions and LSP-generated edits. Preserve existing filesystem commit/rollback and anchor reconciliation; extraction of those belongs to Stage 4.
- Tests must prove **no writes** on any rejected edit, source and Product previews remain separate, and valid multi-file preview/commit effects exactly match.

**Gate 1A:** pure relocation with identical existing outputs and targeted tests green. **Gate 1B:** invalid edits blocked with unchanged files; accepted cases still match the characterization baseline. **Gate 1C:** preview fingerprint, authorized scope, materialization and guarded commit all cover precisely the same aggregate paths/effects. Typecheck, pack and focused public-denial tests pass at each gate. **Do not merge these gates into one giant patch.**

### Stage 2 — remove Product change behavior from the mutation engine

- Extract `previewProductChange` and the Product-specific `applyChange` branch (including post-commit graph checks) into `src/product/change-operations.ts`, calling the existing `product/mutation.ts` owner. Keep the preview's trusted basis/snapshot fingerprint, alignment, deletion/dependents and error/status semantics.
- Initially let `CausalChangeEngine` **delegate** Product requests to the new Product functions, to preserve direct callers while updating tests. Then route Product requests directly from their existing Product/public adapters; do not add another Product engine.
- Verify Product changes no longer require LSP initialization, and that Product review/atomicity is unchanged. Remove Product-specific imports from the code service as soon as all callers are migrated.

**Gate 2:** Product tests, charter alignment, revisions/ABA, review-denied cases, failure atomicity, projection round-trips, Product preview fingerprints and public CLI/MCP behavior all unchanged. No Product source operation reaches code apply. Run the full deterministic suite at this architecture boundary.

**Stage 2 qualification checkpoint (2026-11-08):** `src/product/change-operations.ts` now owns Product preview, fresh fingerprint check, and post-commit validation over the existing atomic `product/mutation.ts` owner. `CausalChangeEngine` delegates Product requests for compatibility; registered public `preview_change`/`apply_change` dispatch Product directly without constructing a code engine. Engine fingerprint exports remain re-exported from `src/change/fingerprint.ts`; serialization is unchanged. Direct/legacy/public Product preview parity and denial tests passed.

Local results supplied by developer: `bun run typecheck` passed; 80 focused tests in 9 files passed, 0 failed; `bun run pack` succeeded; full `bun test` reported **855 pass / 2 fail / 7 skip** (864 total). Classified failures:
- `tests/model-headers.test.ts` requires `Scope:` on the second header line; `src/model/workflow-entity.ts` uses a different second-line description. The test and file are byte-identical on `master` and this branch. Not caused by Stage 2.
- `tests/doctrine-producer-context.test.ts:394` expects only `ASP-GOV-1` from `Aspect.getAspectList(ticket)` but receives additionally `ASP-DRAFT-2` and `ASP-PROPOSED`. Its assertion is byte-identical on `master`, and `tests/aspects.test.ts` explicitly establishes `getAspectList()` returning draft/proposed candidates; assessment/governance filters are separate. Not caused by Stage 2. The branch contains an earlier change to `src/model/aspect.ts`, outside Stage 2; the specific conflicting test expectation exists in `master` too.

These are **classified, unresolved** failures; full-suite green is **not** claimed. Do not change them within this bounded Code Mutation Service extraction or amend an assertion merely to force green. Stage 3 proceeds only as a separately gated slice.

### Stage 3 — complexity-first decomposition (before facade)

**Design constraint:** no hundred-line operation branches living inside a dispatcher. One request = one explicitly named operation. The dispatch switch, if retained, contains *only calls* (no branch implementation). Avoid micro-files and arbitrary line-count rules: move cohesive work behind meaningful semantic boundaries, not wrapper methods. Split mechanics and behavioral changes into different commits. Preserve the old API and runtime ownership until Step 3C passes.

**3A — source preparation operations (first gate).** Characterize edge cases first, then extract the existing `buildPreview` request-handling cases into a small, explicitly typed source preparation module, grouping ordinary files, symbol operations and source actions. Move the TS7-first / TS6-fallback refactor selection into one separately named function/file because it is sizeable. Composite `source_change` recursion must retain its current child preview semantics, summaries, warnings, blocked reasons and no-write contract. The dispatcher must not own any case implementation. Keep original path/LSP checks and exact return shapes, including unusual errors.

**Stage 3A implementation note (2026-11-08):** Characterization for a rejected later composite source edit was added before changes. The large inline `buildPreview` operation switch was replaced with dispatch to `src/services/code-mutation/preview-operations.ts` (file/symbol/source-action) and `src/services/code-mutation/refactor-preview.ts` (TS7 preferred, TS6 fallback). `engine.ts` shrank from 742 to 451 lines; `buildPreview` retains only composite recursion and aggregate preview finalization. No facade or commit/authority movement. Local Bun test gate remains **pending**, and Stage 3B/3C are not authorized to advance until it passes.

**Gate 3A:** targeted tests first, then `bun run typecheck`, `tests/change-edits.test.ts`, `tests/workspace-text.test.ts`, `tests/change-engine.test.ts`, `tests/change-bridge.test.ts`, `tests/ts6-refactor-sync.test.ts`, and governed source authorization. Check exact positive and blocked previews, TS7 preference, TS6 fallbacks, fingerprints, unchanged files, and public operations. Do not proceed without passing local evidence.

**3B — apply preflight, materialization and synchronous commit.** Keep `CausalChangeEngine.applyChange` as the public compatibility entry. Mechanically move source preflight/materialization and the fenced, synchronous filesystem commit/rollback into small cohesive functions, preserving ordered edits, backups, rename/delete order, unchanged stale and partial-error text, and immediate source recheck **inside** the existing Ticket lease. Do not add a second validator or a new authority owner.

**Gate 3B:** Stage 3A plus race tests, write-failure rollback, stale hashes, dirty-file approval and lease fencing. No authority bypass or partial-effect misreporting.

**Stage 3B implementation checkpoint (2026-11-08, awaiting local verification):** Extracted inert edit-plan validation/materialization and synchronous commit/rollback to `src/services/code-mutation/source-commit.ts`; `CausalChangeEngine.applyChange` is ~152 lines, retaining stale cached-preview detection, Product delegation, existing Ticket lease/admission ownership and post-commit graph reconciliation. The synchronous pre-write hash and workspace-path checks are executed by `commitSourceFiles` *inside* the existing lease callback. `tests/change-commit.test.ts` covers mixed effects without preview writes, stale materialization, and late rename destination races. No changes to public interfaces, Product authorization, or anchor migration. Do not start 3C before local typecheck and full Stage 3B focused gate.

**3C — post-commit reconciliation and service facade.** Move graph reindexing, durable-anchor migration and post-write observations into a cohesive module while leaving post-commit failure classification explicit. Only **after** those extractions pass, introduce the real `src/services/code-mutation-service.ts` entry points and migrate public/internal code callers. Retain the legacy engine as an adapter temporarily; remove it at a final explicitly tested boundary. Code service must have no Product mutation authority; Product domain stays in `src/product/change-operations.ts`.

**Stage 3C reconciliation checkpoint (2026-11-08, developer-verified 2026-11-09):** Moved post-write anchor collection, guarded reindex, durable inbound-relationship migration, AST refresh and observed hash/definition checks to one cohesive `src/services/code-mutation/source-reconciliation.ts` module. `engine.ts` is 281 lines; it retains commit ordering, Ticket/admission and the explicit post-write `PARTIALLY APPLIED` exception boundary. Added a public governed integration test injecting a post-index disk discrepancy. The mechanical extraction intentionally preserves the pre-existing result convention `ok: true` when file commit succeeded but post-verification fails; this can conflict with consumers interpreting `ok` as fully verified and is a separately identified **contract/safety concern** to resolve explicitly before final acceptance, not silently changed in a relocation. The service facade waits for this local qualification gate.

**Stage 3C service checkpoint (2026-11-09, local tests pending):** The actual source preview/build/apply implementation moved into `src/services/code-mutation-service.ts` as a source-only service (not a forwarding facade); direct source implementation has byte-identical preview and apply bodies apart from Product exclusion and runtime fail-closed guards. The old `src/change/engine.ts` is now a ~50-line temporary adapter that inherits the code service and retains legacy Product calls; it re-exports the original edit/fingerprint functions. Public source preview and Ticket-governed apply now call `CodeMutationService` directly; public Product still dispatches to Product owner. Characterization tests cover direct/legacy/public preview parity, direct apply, denied host mutation and untyped Product-request rejection. No Ticket or governance enforcement moved. **Do not infer full compatibility or begin Stage 4 until typecheck, focused tests, pack and full deterministic suite have been reviewed.** The existing `ok: true` with failed verification remains a separately tracked contract issue: changing it requires reviewing scope-effect persistence and other consumers so committed mutations cannot be mistaken for rolled-back work.

**Gate 3C:** all source families identical in LSP edits, summaries, affected files, hashes, fingerprints and observed disk effects; source and Product tests plus full deterministic suite (classify existing unrelated failures). No false `ok`, no regression to post-commit partial-application semantics. Only then plan legacy adapter removal.

**Stage 4A checkpoint (2026-11-09; developer confirms local gate passed):** Added regression expectations for failed post-write graph reconciliation and post-write foreign edits, requiring the public governed route to persist the *authorized intended* effect hashes and report explicit failure status without claiming acceptance. CodeMutationService.applyChange now returns `ok: true` (filesystem commit completed), `verification.passed: false`, `status: 'committed_unreconciled'` and an error with nested cause if reconciliation throws, or `status: 'committed_verification_failed'` if postconditions detect divergence. The public operation's existing effect-persistence condition (`ok && effects`) can now record the otherwise lost result. No change to pre-commit permission, stale hashes or Ticket lease checks. **Limitations**: abrupt process death between filesystem mutation and persistence, failed effect persistence, and unsuccessful best-effort rollback are *not* solved by structured outcomes; filesystem and SQL are not a single atomic transaction. Do not claim restart-proof recovery. The next gate must test these two scenarios before manager extraction or interface renaming.

**Stage 4B after Gate 4A:** Introduce a transport-independent SourceManager owning Ticket authorization, governed scope/review/lease orchestration and effect recording (using existing store/scope primitives); slim `src/tools/change.ts` to validation/transport. Narrow the source service's named API to `previewCodeChange` / `applyCodeChange` while retaining temporary legacy compatibility and independent Product ownership. Add direct manager tests, review internal callers, and gate before deleting any adapter. Do not add a framework or copy permission logic.

**Stage 4B checkpoint (2026-11-09; developer confirms local gate passed):** `src/managers/source-manager.ts` (~99 lines) now owns Ticket lease/scope, governed admission, reviewed dirty targets and attributable effect persistence. `src/tools/change.ts` (~93 lines) is a transport adapter retaining exact registered source/Product command IDs and schemas; Product still dispatches to `src/product/change-operations.ts`. The top-level facade is `src/services/code-mutation-service.ts` (~84 lines) with `previewCodeChange` / `applyCodeChange`; the aggregate preview and guarded apply algorithms were moved without behavioral alteration to `src/services/code-mutation/preview.ts` and `apply.ts`, alongside the pre-existing `source-commit.ts`, `source-reconciliation.ts`, edit and refactor helpers. The temporary CausalChangeEngine compatibility adapter retains `previewChange/applyChange` for legacy and internal Product consumers. Added direct manager/public preview parity, governed persistence and denial tests; updated direct service tests to the new explicit API. Mechanical comparison of extracted source preview/apply code to the prior version is equal after only naming/context/fingerprint substitutions and whitespace normalization. **No Bun execution took place in the remote editing environment**; the focused typecheck/test gate is required before further architectural changes. No package build necessary yet.

### Stage 4 — code-service consolidation and architecture audit

**Stage 4 preliminary contract audit (2026-11-09):** The source service currently reports `{ok:true, verification:{passed:false}, error:'PARTIALLY APPLIED...'}` when disk commits but post-write hash/definition checks fail. This is inherited behavior and the preceding extraction preserved it. The change tool persists governed scope effects only under `result.ok && result.effects`; `src/ticket/resolve.ts` persists effects before separately requiring `result.ok && result.verification.passed`; internal Story-test and technical-proof consumers often check only `ok`. Thus changing `ok` to false without a proper committed-effects persistence path would lose needed recovery evidence, while leaving it true can mislead some consumers. **Do not blindly flip the boolean.** Design and test explicit `committed` vs `verified` semantics and recoverable partial status across all involved owners; distinguish actual observed hashes from the expected authorized effect, never attribute a foreign post-write edit to the source mutation. This is a separate behavior-change gate, not a mechanical move.


After 3C, check the architecture as a whole: class/module sizes, cohesion, public API stability, import cycles, direct public bypasses, duplicate policies, duplicated request preparation and LSP lifecycle ownership. Resolve concrete defects as individually gated patches, **not** speculative rewrites. Preserve the already-established 3A–3C test evidence. No facade-only wrappers, framework layers or new generalized registry. Run full deterministic suite; retain classified unrelated failures as such.

**Stage 5 gate checkpoint (2026-11-09):** User-run `tsc --noEmit` passed. Focused suite: 184 pass / 2 fail across 10 files. Both failures in `tests/ticket-resolution.test.ts` were outdated spies on `CausalChangeEngine.applyChange` after the Ticket resolver source path migrated to `CodeMutationService.applyCodeChange`; the first could no longer inject lease replacement, and the second counted zero calls. Updated those two test spies to the real method in commit `77cd844`; all original assertions, including lease fencing and single genuine apply, remain unchanged. This narrow correction is **awaiting developer-run tests**. No production behavior changed; no pack or full-suite gate yet.

### Stage 5 — clean public orchestration and entity responsibilities

- Move the substantial Ticket-scope, claim, dirty-target, review and governance orchestration out of `src/tools/change.ts` to a small stateless `src/managers/source-manager.ts` **if that extraction removes real adapter business logic**. Keep existing `ticket/source-scope.ts` and `WorkflowStore` as their current canonical enforcement owners; do not duplicate them in the manager or service.
- Leave `src/tools/change.ts` for strict typed registration, input/output adaptation and host delegation. Route Product preview/apply directly to Product domain functions and code requests to SourceManager → CodeMutationService, without a second dispatcher class.
- Review touched entity-bound behavior: pure entity identity/relationship operations may move to `FileNode`, `SymbolNode`, or `Ticket` if they genuinely belong there. Keep cross-entity graph migrations, permission decisions, LSP and disk effects **out** of entity methods. State explicitly if no move is justified.

**Gate 5:** read-only and denied/approved public CLI, Shell, MCP and REST paths retain the same authorization and output contracts; internal reviewed Story-test operations still work. No direct service call from public transport can bypass the manager/owner.

**Stage 5 final caller-migration checkpoint (2026-11-09, pending local gate):** Removed remaining production `CausalChangeEngine` calls in Product Link previews, Story-test source/Product previews, Ticket resolver's three reviewed Story-test apply callbacks, and the internal `applyOwnedChange` fallback. Source changes use `CodeMutationService` and Product changes use existing `previewProductChange` / `applyProductChange`; no public command IDs, Ticket lease checks, or dirty-target admission rules were changed. The legacy engine remains for tests until Stage 6. No local Bun/typecheck execution is available in this remote editing environment. **Gate before Stage 6:** local typecheck and focused Ticket resolution, Story-test, Product, public mutation, and source authorization regression tests; report exact failures rather than weakening checks. Scope review: no intrinsic entity method move is justified; cross-entity graph and LSP behaviors remain with their governing owners.

### Stage 6 — isolate reusable TypeScript tooling and delete `src/change/`

- Relocate TS7 LSP, TS6 refactor sidecar, shared shutdown, and read-only symbol/target inspection into independent TypeScript service/helper ownership. Preserve client cache/reuse, startup, cancellation, UTF-16 LSP positions, diagnostics and close/shutdown behavior. No new LSP abstraction/base class unless duplicated code demonstrably demands it.
- Move code-only contracts and schemas with the code service; keep shared LSP protocol types with TypeScript facilities; Product types with Product; put any Code/Product union at the **public adapter**. Import each from one real owner.
- Migrate *all* static, dynamic, type-only and test imports. Delete temporary aliases/delegators, `CausalChangeEngine` if no longer used, and finally the entire `src/change/` folder. Preserve public command IDs and finite schemas; do not leave an empty directory or `export *` compatibility forest.
- Inspect for cyclic dependencies, duplicate LSP registries, duplicate path rules, name-only abstractions, or >100-line orchestrator methods. Simplify only at established boundaries. Avoid unrelated modernizations.

**Gate 6:** no references to `src/change/` in active source/tests; same registered public command metadata, same callable operations, all LSP/read-only consumers working, process teardown clean. Full typecheck, pack, focused/full tests.

**Stage 6A checkpoint (2026-11-09, local gate pending):** Move TS7 and TS6 clients and shared LSP shutdown together to `src/services/typescript/`; move the single `workspacePath` implementation to `src/helpers/workspace-path.ts`. All known source and test consumers use the canonical new imports, including read-only graph/rules and LSP teardown. Staged as one atomic Git tree with no compatibility reexports or duplicate clients, retaining the original implementation and correcting only relocated relative imports. No local Bun execution available through the connector; Stage 6B must wait for a clean typecheck, focused LSP/TypeScript, code change, authorization and Ticket gates. The residual `src/change/` files remain until their separate contract/engine migration is qualified.

**Stage 6B1 checkpoint (2026-11-09, pending local gate):** Move exact symbol source and target resolver to `src/helpers/source-lookup.ts` and `target-resolver.ts`; move deterministic fingerprints to `src/services/code-mutation/fingerprint.ts`; split original request-schema into `src/services/code-mutation/request-schema.ts` (code-only) and `src/tools/change-request.ts` (public combined union). Update direct source/test consumers and preserve tool schema exports, values and descriptions. Source parsing/fingerprinting logic is unchanged; relative imports adjusted. Legacy engine and `src/change/types.ts` remain for separate gated 6B2. Local focused gate must include typecheck, change edits/bridge, Product, investigation, public command schemas, source authorization, Story tests, and Ticket resolution. No new background branch.

### Stage 7 — independent end-to-end acceptance and merge

- Exercise actual external/public paths: valid read-only source query, source preview, host-approved governed apply, stale/unauthorized rejection, Product preview/review/apply, TS symbol rename and anchor migration, failed post-commit reconciliation and honest partial state. Do not equate internal unit tests with a live host journey.
- Inspect the final **whole methods**, dependencies and folders for single responsibility, small semantic functions, useful entity methods, no dead exports, no fake acceptance/verification and zero redundant wrappers.
- Publish a short change inventory + actual run counts/skips; compare against Stage 0 contracts. If an unrelated pre-existing failure persists, report it rather than relabel zero-regression as proven.
- Merge the **single** branch to `master` only after its gates and developer acceptance; delete branch promptly. No separate branches per stage and no permanent compatibility layer. Tag the verified base/merge only if rollback value justifies it.

## Explicit stop / rollback criteria

Stop at the current stage on any unaccounted-for public shape change; Product/source trust-boundary widening; lost or duplicated graph anchors; any source write during denied/stale preview; index or filesystem partial state falsely reported as success; flaky LSP teardown; unclassified test failure; or a new circular dependency. Revert the stage's isolated commit if safe rather than layering patches. If a narrow real security defect is found, isolate a red regression test and fix it in its canonical owner first; don't disguise it as a relocation.

**Definition of complete:** no `src/change/`; one narrow Code Mutation Service facade and meaningful internals; independent TS tooling; Product changes owned by Product; thin public adapter; justified (not ceremonial) entity behavior; unchanged permissions and external semantics; clean focused, full and real public-path qualification. Green tests alone are insufficient if responsibility/complexity is worse.

## Stage 0 audit record — 2026-11-07

**Status: inventory complete for tracked TypeScript; local execution gate not run. Stage 1 NOT authorized by Gate 0.**

### Repository and execution evidence

- Inspected remote `master` at `b203e6be8a504d3990887372aa5c9d5783639f88` and this branch at its plan-only commit `b8f70f0848764555e126b2cf94a0d3f45b8f44d6`. The branch started from exactly that master commit. No source edits performed in Stage 0.
- Scanned **all 136 `src/**/*.ts` files and 100 `tests/**/*.ts` files** in the starting master Git tree for static, dynamic, and type-only imports from `src/change/` (including the in-folder relative references).
- Local execution is unavailable in the current review environment: **no Bun executable, no mounted AIWF checkout, and outbound GitHub DNS unavailable**. GitHub connector provides source inspection and branch commits, not a Bun test runner. No fresh typecheck, pack, test counts or live public-host results can be asserted here.
- The remote tree has **no `.github/workflows/` files**. Historical GitHub Actions run discovered (2026-10-04) is unrelated and failed; it does not qualify this branch.
- User-confirmed latest focused tests on the same master were green (Aspects/Doctrine/Ticket investigation); this is **not** a fresh full source-change baseline.

### Import inventory (external to `src/change/`, grouped by owner)

| Owner | Files and imported roles |
|---|---|
| CLI | `src/cli.ts` — TS7/TS6 shutdown |
| Graph | `src/graph/indexer.ts` — workspace paths; `technical-proof.ts` — engine and preview/apply types; `test-artifacts.ts` — LSP client |
| Helpers/Rules | `src/helpers/verification-context.ts`, `src/rules/references.ts` — exact symbol source/LSP |
| Product | `src/product/{apply,links,process,story-tests}.ts` — engine, types, paths; `{mutation,process-types}.ts` — shared change type coupling |
| Services | `src/services/investigation-evidence.ts` — exact source; `src/services/projection/aspect-projections.ts` — engine (dynamic) |
| Tickets | `src/ticket-operation-types.ts` — request schema / LSP types; `src/ticket/{implementation,prepare,resolve,source-scope,verification}.ts` — engine, change types, paths and symbol source; several dynamic imports |
| Tools | `src/tools/change.ts` — engine, schema and file paths; `src/tools/graph-queries.ts` — LSP, source lookup, target resolver, workspace paths |

**22 external source files**, with internal `src/change/*` imports additionally present. No one-to-one public service rename is safe until these callers are migrated.

**Test files with change imports (32):**

- Core: `actor-engine-boundaries`, `aspects`, `change-bridge`, `change-engine`, `change-foundation`, `dharmax-s1`, `dharmax-s2`, `dharmax-s5`, `evidence-first-verification`, `lsp-shutdown`, `primitive-truth`, `source-change-authorization`, `technical-proof`, `ticket-investigation`, `ticket-resolution`, `ts6-refactor-sync`, `workspace-text`.
- Doctrine: `doctrine-enforcement-live`, `doctrine-management-live`, `doctrine-management`, `doctrine-scope`, `doctrine-verifier`.
- Product: `product-change`, `product-charter-screen`, `product-operability-definition`.
- Other and Story/fixtures: `skill-synthesis-acceptance`, `fixtures/graph-field-migration`, `integration/graph-field-migration`, `us/basic-product-intent`, `us/fixtures/greeting-project`, `us/product-charter-feature`, `us/reviewer-reliability`.

Paths in those groups resolve under `tests/` (with their given subdirectories); count includes fixtures because they are import consumers. These tests must migrate with their owning production modules.

### Export ownership inventory (all nine original files)

| Existing file | Exported API groups | Target owner |
|---|---|---|
| `engine.ts` | `CausalChangeEngine`, `ChangeEngineOptions`, `computeFileSha256`, `applyTextEdits`, `normalizeWorkspaceEdit`, `computeChangeFingerprint` | Code service facade, edit/fingerprint helpers; product branch removed |
| `ts-lsp.ts` | `TsLspClient`, client factory/shutdown, capability and LSP query contracts | Independent TypeScript facilities |
| `ts6-refactor.ts` | `Ts6RefactorClient`, client factory/shutdown, applicable refactor/action contracts | Independent TypeScript facilities |
| `target-resolver.ts` | `resolveCodeTarget` | Shared source lookup helper; depends on LSP and Semantika |
| `symbol-source.ts` | `findExactSymbolCandidates`, `getExactSymbolSource`, candidate contract | Shared read-only source lookup |
| `types.ts` | LSP edit/position/range/WorkspaceEdit types; code target/request/mutation; mixed Code/Product `ChangeRequest`, preview/apply result and verification contracts | TypeScript types, code service types, Product types; public union only at adapter |
| `request-schema.ts` | `CodeChangeRequestSchema`, `ChangeRequestSchema` | Code service + combined public adapter schema |
| `workspace-path.ts` | `workspacePath` | Shared workspace path helper |
| `lsp-shutdown.ts` | `closeLspTransport` | TypeScript facilities |

The inventory is based on actual `export` declarations, **not** a proposed API. Do not blindly move public contracts to match folder structure: verify direct consumers, then place each type next to its semantic owner.

### Critical observed contracts and extraction order

1. **Public transport:** `src/tools/change.ts` registers `read_workspace_file`, `preview_change`, `apply_change`; code operations require scope, claim and trusted admission. Product review is separately host-owned in `src/product/links.ts`. Preserve command IDs, Zod request union, fingerprints and error statuses.
2. **Product:** `src/change/engine.ts` lines 653–695 own `previewProductChange`; lines 768–809 own Product commit/verification dispatch. `src/product/mutation.ts` already owns validation, charter checks and coherent `applyBatch`. Stage 2 moves just those branches, not the entire engine.
3. **Source:** lines 256–651 prepare edits/fingerprints; 736–766 recheck preview; 811–934 materialize and write; 935–1039 reindex, migrate anchors, check exact effects and report partial application. Do not break the lease/admission boundary inside this flow.
4. **Shared tooling:** TS7 client, TS6 refactor sidecar and source lookup have read-only callers unrelated to mutation. They move only after Product/source separation and stable code-only APIs.
5. **Unproven potential defect:** `applyTextEdits` clamps invalid position values and has no overlap check. First produce reproducing red tests; do not silently alter supported semantics.

### Required local Gate 0 report

From a clean working tree at this branch, record the exact `HEAD`, `origin/master`, Bun/TypeScript/sibling dependency versions, and actual outcomes of:

```bash
git status --short
git rev-parse HEAD
bun --version
bun run typecheck
bun run pack
bun test
bun test tests/change-foundation.test.ts tests/change-engine.test.ts tests/change-bridge.test.ts tests/source-change-authorization.test.ts tests/product-change.test.ts tests/product-charter-screen.test.ts tests/ticket-resolution.test.ts tests/lsp-shutdown.test.ts tests/public-api-s1.test.ts
```

Also execute representative **real public-path** source and Product preview/apply cases under a disposable project, with stale/denied cases, source rename/anchor preservation and explicit no-write-on-preview observations. Summarize failures/skips and actual fingerprints/output shape; isolate local environment limitations rather than modifying assertions.

**Historical Gate 0 status (2026-11-07): BLOCKED on execution evidence.** This was the state at the original plan-only commit, not the current branch status.

## 2026-11-08 revalidation / next executable handoff

- Current branch is `refactor/code-mutation-service`; subsequent commits repaired **Aspect** applicability and governance independently. User reports targeted `tests/aspects.test.ts`, `tests/doctrine-verifier.test.ts`, and `tests/technical-proof.test.ts` passing. These changes do not constitute Code Mutation Service work.
- Earlier user-reported full baseline: **828 pass, 6 fail, 7 skip** (before Aspect repairs). Four failures were Aspect-related; the other known classes concern model-header metadata and CLI/Shell help presentation. **Do not infer a fresh full-suite status from the targeted runs.**
- Re-inspection confirms `engine.ts` implements repeated workspace normalizations at preview, fingerprint and apply, and stages edits/renames/deletes in distinct steps. Its conflict checks are per-normalization and per-delete, not a complete cross-mutation effect validator. This is the **first code-change target**, not a reason to continue unrelated baseline cleanup.
- **User-operated local gate:** from a clean branch, record `git status --short`, `git rev-parse HEAD`, `bun --version`, `bun run typecheck`, `bun run pack`, focused change tests and the full suite when practicable. Identify pre-existing failures explicitly. Capture representative preview JSON/fingerprints and exact output for `replace_text`, `source_change`, `rename_file`, Product preview and denied source apply. Do not commit golden values recorded under a different Bun/sibling-dependency version.
- **Next coding commit = Stage 1A only:** add characterization tests, then behavior-preserving helper extraction. The user runs Bun checks; do not claim tests passed without their actual output. Advance to 1B only when 1A passes.

**Stop conditions specific to Stage 1:** unclear same-offset insertion semantics; an unrecognized LSP `documentChanges` dependency; changed valid-output fingerprints; missing rename-destination hash in a guarded preview; path normalization bypass; failure in public denied/stale apply. Document the exact counterexample before extending the implementation.
