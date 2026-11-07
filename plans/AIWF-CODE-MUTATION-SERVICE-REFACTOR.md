# AIWF — Code Mutation Service: staged refactoring plan

**Status:** Proposed for implementation review. Plan only; no production code changed.
**Work branch:** `refactor/code-mutation-service` (one short-lived branch, not a branch per step).
**Starting remote `master`:** `b203e6be8a504d3990887372aa5c9d5783639f88` (2026-11-07).
**Governing principles:** [Dharmax Architecture](../docs/definitions/dharmax-architecture.md), [Prime Directive](../docs/definitions/prime-directive.md), [active checkpoint](AIWF-V1-ACTIVE-CHECKPOINT.md). This is a bounded refactor, not a new runtime, manager framework, change format, or release-stage advancement.

## Objective and verified starting observations

Replace the misleading `src/change/` catch-all with a cohesive **Code Mutation Service**, an intentionally small facade, focused internals, a thin public adapter, and independently reusable TypeScript/source helpers. Restore semantic ownership of Product changes. Keep the same observed contracts and permissions.

At the starting commit:
- `src/change/engine.ts` is ~1,039 lines. `CausalChangeEngine` mixes `product_change` preview/apply with source edits, TypeScript rename/refactor, fingerprinting, filesystem commit/rollback, index/anchor reconciliation and post-commit checks.
- The existing Product authority and atomic graph mutation owner is `src/product/mutation.ts` (`validateProductMutations`, `applyProductMutations`, charter/review checks). **Reuse it.**
- `src/tools/change.ts` owns public `preview_change`/`apply_change`, Ticket scope/lease, dirty-target approval and host context. Moving code between files must not bypass these checks.
- `src/change/ts-lsp.ts`, `ts6-refactor.ts` and `symbol-source.ts` are also used by read-only graph queries, test artifacts, Rules and investigation; they are **not** exclusively mutation internals.
- `src/change/types.ts` and `request-schema.ts` mix LSP/code types with Product mutation and public union contracts. Public input/output shape and strict schema must remain stable during migration.
- `applyTextEdits` silently clamps out-of-range positions, with no explicit overlap rejection. This is a **potential correctness defect**; reproduce with a failing test before correcting it. Preserve legitimate edit semantics (including multiple same-offset insertions, if supported).
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

## Non-negotiable safety invariants

- Preview never changes source files or accepted Product definitions. Incidental read-model indexing, if already authorized, is not permission to mutate authored state.
- Source apply retains active Ticket lease, bounded authorized source scope, host-owned approval, dirty-file policy, stable fingerprint and pre-write freshness/ABA checks; a stale preview cannot write.
- Product apply retains trusted host review, charter answers, exact revisions, coherent Semantika batch, and independent post-commit validation. The client-supplied `decision:'accept'` field is **not itself** developer authorization.
- Edit normalization validates every touched file/path (including generated edits, deletions and renames), and rejects ambiguous/conflicting LSP edit sets before any filesystem write.
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

**Gate 0:** reproducible baseline and a finite external contract inventory. No new implementation while existing failures remain unclassified.

### Stage 1 — precise source edit primitives (one narrow correctness slice)

- Extract the pure `applyTextEdits` and `normalizeWorkspaceEdit` logic into the code-mutation internal `edits.ts`. Retain temporary named exports at their old paths only for existing callers until migration.
- First add red tests for invalid line/character, reversed range, overlapping nonempty edits, conflicting create/rename/delete, escaped/symlink paths, and multiple insertions at one position. Validate UTF-16 offsets and preserve already-supported line-ending behavior; do not silently invent ordering rules.
- Make a minimal canonical validator and ensure **the same validated edit plan** is used to compute the preview, fingerprint, expected-after hashes and eventual commit. Do not fork edit application/normalization in two places.
- Reuse the existing `workspacePath` boundary (moving its file can wait). Keep edit parsing independent of LSP startup where possible.

**Gate 1:** malformed/conflicting edits fail **before** writes; valid edits have identical bytes, touched paths and fingerprints to baseline. Focus: change foundation/engine/bridge, source authorization, public preview.

### Stage 2 — remove Product change behavior from the mutation engine

- Extract `previewProductChange` and the Product-specific `applyChange` branch (including post-commit graph checks) into `src/product/change-operations.ts`, calling the existing `product/mutation.ts` owner. Keep the preview's trusted basis/snapshot fingerprint, alignment, deletion/dependents and error/status semantics.
- Initially let `CausalChangeEngine` **delegate** Product requests to the new Product functions, to preserve direct callers while updating tests. Then route Product requests directly from their existing Product/public adapters; do not add another Product engine.
- Verify Product changes no longer require LSP initialization, and that Product review/atomicity is unchanged. Remove Product-specific imports from the code service as soon as all callers are migrated.

**Gate 2:** Product tests, charter alignment, revisions/ABA, review-denied cases, failure atomicity, projection round-trips, Product preview fingerprints and public CLI/MCP behavior all unchanged. No Product source operation reaches code apply. Run the full deterministic suite at this architecture boundary.

### Stage 3 — introduce the actual Code Mutation Service and extract preview

- Create the **real** `src/services/code-mutation-service.ts` facade with code-only preview/apply entry points, clear options and minimal state; no duplicate engine or registry. Temporarily delegate from the old engine path while callers migrate.
- Move source-preview dispatch out of `buildPreview`. Group handlers by **behavior**: file edits; symbol rename/replace; source actions and TS refactors. Where a handler is large, separate it only on a real boundary (e.g. TS7-first/TS6-fallback refactor selection).
- Separate canonical fingerprinting from preview orchestration; retain product-context impact as an optional read-only input, *not* Product mutation authority.
- Make each helper describe one observable responsibility. Aim for short operations (normally tens of lines; investigate any method > ~50–60 lines). Avoid one-line forwarding helpers, generalized visitor frameworks and one module per switch case.

**Gate 3:** each request family yields identical applicable LSP edits, affected-file set, hashes, summaries, blocked errors and fingerprints. Preview stays inert. Focused engine/bridge/graph-query/Story-test tests green.

### Stage 4 — extract guarded source commit and post-commit reconciliation

Do this as **three separately testable commits**, not one 300-line transplant:

- **4A Preflight/materialization:** verify the exact current preview, guard scope/lease/fingerprint and all source hashes, normalize once, produce an immutable in-memory file effect plan. No filesystem writes yet.
- **4B Commit/rollback:** one bounded synchronous guarded commit of creates/edits/deletes/renames under existing lease/admission; preserve best-effort rollback only for commit-phase failure. No swallowed exceptions or claim that rollback covers post-commit effects.
- **4C After-commit:** re-index, reconcile durable FileNode/SymbolNode anchors and linked obligations through the current graph owner, then compare observed file effects and report incomplete/partially applied states precisely. Do not introduce an independent verifier or reimplement graph persistence.

**Gate 4:** targeted tests for stale-before-write, dirty-file rejection, mixed multi-file edits, rename/delete conflicts, simulated write failure, index/reconciliation failure, partial-commit reporting, anchor continuity and exact effects. No false `ok`/verification/receipt claims. Run full deterministic suite after 4C.

### Stage 5 — clean public orchestration and entity responsibilities

- Move the substantial Ticket-scope, claim, dirty-target, review and governance orchestration out of `src/tools/change.ts` to a small stateless `src/managers/source-manager.ts` **if that extraction removes real adapter business logic**. Keep existing `ticket/source-scope.ts` and `WorkflowStore` as their current canonical enforcement owners; do not duplicate them in the manager or service.
- Leave `src/tools/change.ts` for strict typed registration, input/output adaptation and host delegation. Route Product preview/apply directly to Product domain functions and code requests to SourceManager → CodeMutationService, without a second dispatcher class.
- Review touched entity-bound behavior: pure entity identity/relationship operations may move to `FileNode`, `SymbolNode`, or `Ticket` if they genuinely belong there. Keep cross-entity graph migrations, permission decisions, LSP and disk effects **out** of entity methods. State explicitly if no move is justified.

**Gate 5:** read-only and denied/approved public CLI, Shell, MCP and REST paths retain the same authorization and output contracts; internal reviewed Story-test operations still work. No direct service call from public transport can bypass the manager/owner.

### Stage 6 — isolate reusable TypeScript tooling and delete `src/change/`

- Relocate TS7 LSP, TS6 refactor sidecar, shared shutdown, and read-only symbol/target inspection into independent TypeScript service/helper ownership. Preserve client cache/reuse, startup, cancellation, UTF-16 LSP positions, diagnostics and close/shutdown behavior. No new LSP abstraction/base class unless duplicated code demonstrably demands it.
- Move code-only contracts and schemas with the code service; keep shared LSP protocol types with TypeScript facilities; Product types with Product; put any Code/Product union at the **public adapter**. Import each from one real owner.
- Migrate *all* static, dynamic, type-only and test imports. Delete temporary aliases/delegators, `CausalChangeEngine` if no longer used, and finally the entire `src/change/` folder. Preserve public command IDs and finite schemas; do not leave an empty directory or `export *` compatibility forest.
- Inspect for cyclic dependencies, duplicate LSP registries, duplicate path rules, name-only abstractions, or >100-line orchestrator methods. Simplify only at established boundaries. Avoid unrelated modernizations.

**Gate 6:** no references to `src/change/` in active source/tests; same registered public command metadata, same callable operations, all LSP/read-only consumers working, process teardown clean. Full typecheck, pack, focused/full tests.

### Stage 7 — independent end-to-end acceptance and merge

- Exercise actual external/public paths: valid read-only source query, source preview, host-approved governed apply, stale/unauthorized rejection, Product preview/review/apply, TS symbol rename and anchor migration, failed post-commit reconciliation and honest partial state. Do not equate internal unit tests with a live host journey.
- Inspect the final **whole methods**, dependencies and folders for single responsibility, small semantic functions, useful entity methods, no dead exports, no fake acceptance/verification and zero redundant wrappers.
- Publish a short change inventory + actual run counts/skips; compare against Stage 0 contracts. If an unrelated pre-existing failure persists, report it rather than relabel zero-regression as proven.
- Merge the **single** branch to `master` only after its gates and developer acceptance; delete branch promptly. No separate branches per stage and no permanent compatibility layer. Tag the verified base/merge only if rollback value justifies it.

## Explicit stop / rollback criteria

Stop at the current stage on any unaccounted-for public shape change; Product/source trust-boundary widening; lost or duplicated graph anchors; any source write during denied/stale preview; index or filesystem partial state falsely reported as success; flaky LSP teardown; unclassified test failure; or a new circular dependency. Revert the stage's isolated commit if safe rather than layering patches. If a narrow real security defect is found, isolate a red regression test and fix it in its canonical owner first; don't disguise it as a relocation.

**Definition of complete:** no `src/change/`; one narrow Code Mutation Service facade and meaningful internals; independent TS tooling; Product changes owned by Product; thin public adapter; justified (not ceremonial) entity behavior; unchanged permissions and external semantics; clean focused, full and real public-path qualification. Green tests alone are insufficient if responsibility/complexity is worse.
