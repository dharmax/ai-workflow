# Causal Change Engine — Design

Status: authoritative design for the next ai-workflow implementation phase  
Branch: `feat/causal-change-engine`  
Base: `master@aedbfee41940e4f5e0211e4ef954facd5de1f7fb`

## 1. Purpose

ai-workflow should make changes from **intent to verified implementation** without rebuilding mature language tooling.

The engine is not primarily a refactoring library. It is the common safe-change path that will first power JS/TS refactoring and later power Product Intent mutations such as adding/changing/deleting Epics, Features, User Stories, and Tickets.

Canonical flow:

```text
change request
    ↓
resolve product intent / exact code target
    ↓
bounded causal impact
    ↓
native mutation proposal
    ↓
ChangePreview
    ↓
explicit apply using preview fingerprint
    ↓
re-index / graph reconciliation
    ↓
coverage + diagnostics + tests
```

The invariant is:

> Mature engines own domain mechanics. aiwf owns intent, causal context, orchestration, preview, safety, graph continuity, and verification.

## 2. Ownership boundaries

### aiwf owns

- Product Intent Graph: Epic, Feature, UserStory, Ticket, Test, Decision and causal relations.
- mapping product intent to code anchors through `getProductImpact()`.
- change request resolution and ambiguity handling.
- a small generic preview/apply/fingerprint contract.
- stable semantic graph anchors across ordinary source edits.
- change-set validation and safe disk application.
- post-change graph reconciliation.
- verification selection and reporting.
- natural-language/tool/shell orchestration.

### TypeScript 7 owns exact JS/TS semantics

Use the project TypeScript 7 executable as a long-lived native LSP server:

```text
tsc --lsp
```

The stable LSP surface is authoritative for exact JS/TS operations it actually advertises, including:

- definition / type-aware target resolution
- references
- rename (`prepareRename` + `rename`)
- file-rename edits (`workspace/willRenameFiles`)
- call hierarchy
- diagnostics
- supported source/code actions such as organize/sort/remove-unused imports and quick fixes

Never infer availability from an old TypeScript/VS Code feature list. Capability-probe the running server and only expose operations the installed TypeScript 7 server actually supports.

As of the design review, TypeScript 7's native LSP clearly advertises rename, file-rename, references, call hierarchy, diagnostics, and a bounded set of code actions. Do **not** assume richer refactors such as extract/inline/move-symbol are exposed until the running server advertises a usable stable operation.

### TypeScript installation and resolution

TypeScript 7 is a **runtime dependency** of aiwf, not merely a development dependency.

`aiwf setup` must ensure a compatible TypeScript 7 installation is actually usable on the host:

1. detect compatible project-local TypeScript 7 without modifying it.
2. detect aiwf's own packaged/runtime TypeScript 7.
3. detect a compatible `tsc` already on `PATH`.
4. if no usable host-level TypeScript 7 command exists, provision `typescript@^7` at user/global Bun scope (no sudo), then verify it.
5. fail setup clearly if provisioning or verification fails.

Do **not** overwrite, upgrade, or downgrade a project's pinned TypeScript version as a side effect of aiwf setup.

Runtime selection for the change engine should prefer:

```text
compatible project-local TS7
→ aiwf packaged TS7
→ compatible host PATH TS7
```

This gives project fidelity where possible while guaranteeing aiwf still has a known compatible semantic engine.

`aiwf doctor` must report:

- selected TypeScript executable path
- version
- whether native LSP startup is usable
- whether the host-level `tsc` command is compatible

The resolver/provisioner should have one owner shared by setup, doctor, and the LSP client. Do not duplicate TypeScript discovery logic.

### codebase-parser owns cheap indexing

`@dharmax/codebase-parser` remains the lightweight multi-language indexer for:

- files
- symbols
- imports/facts
- notes
- cheap cross-language discovery

It is intentionally heuristic for JS/TS. It is **not** a correctness source for rename/reference/refactoring.

### block-patcher owns generic surgical text patches

`@dharmax/block-patcher` remains useful for LLM-generated SEARCH/REPLACE edits.

It must **not** be used to implement semantic TypeScript refactors when TypeScript already returns exact edits.

## 3. Do not duplicate TypeScript's graph

Semantika is the persistent causal/product/architecture graph.

TypeScript maintains the live code-semantic model needed for exact JS/TS operations.

```text
Semantika
  = why, ownership, architecture, tickets, tests, ADRs, stable code anchors

TypeScript 7
  = exact declarations, references, types, calls, imports, diagnostics
```

Existing heuristic `calls` / import facts may remain useful for fast discovery and non-TS languages, but no JS/TS change may claim correctness from them when TypeScript can answer directly.

Do not create a second exact code graph in aiwf.

## 4. Generic change contract

The implementation must use **change** terminology, not a refactor-only architecture, because Product Intent mutation is the next capability.

Keep the model small:

```ts
type ChangeMutation =
  | {
      kind: 'workspace_edit'
      source: 'typescript-lsp'
      edit: WorkspaceEditLike
    }

// Future extension, not implemented in the first code-change phase:
// | { kind: 'product_create'; ... }
// | { kind: 'product_update'; ... }
// | { kind: 'product_delete'; ... }
// | { kind: 'product_link'; ... }
// | { kind: 'product_unlink'; ... }

interface ChangePreview {
  fingerprint: string
  summary: string
  mutations: ChangeMutation[]
  affectedFiles: string[]
  productImpact?: ProductImpact
  verification: VerificationPlan
  warnings: string[]
  blocked: boolean
}
```

No persisted plan table/entity.

`previewChange(request)` computes a preview.  
`applyChange(request, fingerprint)` recomputes it immediately and applies only if the fingerprint is identical.

Fingerprint input must include all mutation-defining information, especially:

- normalized request
- target identity
- exact workspace edits
- original hashes of touched files
- file rename/create/delete operations
- the relevant causal graph snapshot that affects impact, durable anchor migration, or verification

This prevents stale previews without another persistence subsystem. A code-identical preview is still stale if the causal graph state it relied on has materially changed.

## 5. JS/TS target resolution

A request should prefer a graph code anchor when one exists:

```text
Feature/Story
  ↓ productImpact()
Ticket
  ↓ modifies/targets
Symbol/File anchor
  ↓ file + source position
TypeScript LSP
  ↓ exact definition/references
```

Direct code requests are also valid.

Resolution rules:

1. ensure aiwf index freshness first.
2. derive file/position from an existing SymbolNode where possible.
3. ask TypeScript for the exact definition/rename target.
4. if a name-only request yields multiple plausible targets, return candidates and stop.
5. never guess between ambiguous symbols.
6. for unsupported/non-JS/TS targets, return a clear unsupported result rather than silently using heuristic replacement.

## 6. Stabilize aiwf Symbol anchors

Current incremental indexing deletes/recreates all symbols for an edited file and symbol IDs contain line/column. Ordinary source edits can therefore destroy durable semantic links such as:

```text
Ticket --modifies--> Symbol
Decision --governs--> Symbol
```

This must be fixed before semantic refactoring is considered reliable.

### Reconciliation rule

When re-indexing one file:

1. parse the new symbols.
2. load old SymbolNodes for that file.
3. match old/new symbols by a simple semantic key:
   `container + kind + name`.
4. only when the match is unique, update the existing entity's line/column/signature/file metadata in place.
5. create unmatched new symbols.
6. delete unmatched old symbols after reconciliation.

Do not migrate the entire graph to a new symbol-ID scheme in this phase.

For a true rename/move, the key intentionally changes. The change engine already knows the old target and the post-change definition; after re-index it must transfer **non-parser-owned semantic edges** from old anchor to new anchor deliberately.

Parser-owned facts/containment are regenerated normally.

If anchor migration cannot be proven unique, block/report it rather than guessing.

## 7. TS7 LSP client

Use a mature JSON-RPC transport library. Do not hand-roll Content-Length framing.

Preferred minimal dependency: `vscode-jsonrpc` (or an equivalently small established library if already available in the dependency tree).

The client should:

- use the shared TypeScript resolver established by setup.
- prefer compatible project-local TypeScript 7, then aiwf's packaged runtime TypeScript 7, then a compatible host PATH TypeScript 7.
- launch `tsc --lsp` over stdio lazily.
- initialize exactly one process per project root and reuse it.
- advertise only the client capabilities aiwf actually supports.
- close cleanly.
- surface server exit/protocol errors clearly.
- expose tiny methods needed by the change engine; do not mirror the entire LSP API.

No TS6/tsserver fallback in the first implementation. No unstable TypeScript 7 compiler API dependency. If the stable LSP capability is unavailable, fail clearly.

Embedded-language/template systems that require special language-server plugins are out of scope for the first phase.

## 8. Initial native code changes

The first implementation should expose only operations backed by stable native TS7 capabilities.

### Rename symbol

```text
target
→ prepareRename
→ references/impact
→ rename
→ WorkspaceEdit
→ preview/apply/verify
```

This is the primary acceptance operation.

### Rename/move file

```text
old path + new path
→ workspace/willRenameFiles
→ TS import/reference edits
→ include actual file rename in ChangePreview
→ preview/apply/verify
```

Directory rename can follow only if the same mechanism is proven reliable.

### Source actions

Use advertised native source/code actions where useful, especially:

- organize imports
- remove unused imports
- sort imports
- supported quick fixes/fix-all

### Richer refactors

The engine should capability-probe and inherit richer refactors automatically **when TypeScript 7 exposes them through a stable callable surface**.

Do not implement custom extract/inline/move-symbol/signature propagation merely to fill a temporary server gap.

If such a request arrives before native support exists:

- return the exact impact/context gathered by aiwf + TS7;
- optionally let the existing general coding actor handle it as ordinary coding;
- do not label that fallback as a deterministic/native refactor.

This preserves honesty and avoids rebuilding an IDE/compiler.

## 9. Change application

Never write files while the preview is still being computed.

Application:

```text
recompute preview
→ fingerprint match
→ read/check all original hashes
→ materialize every resulting file in memory
→ validate all edit ranges/resource operations
→ only then begin disk writes
→ apply renames/creates/edits in dependency-safe order
→ on write failure restore already-touched originals best-effort
→ re-index touched paths
→ migrate durable semantic anchors
→ verify
```

Do not call this a filesystem transaction. It is prepare/validate/commit with best-effort rollback.

Do not auto-create git commits.

`block-patcher` is not involved in native LSP WorkspaceEdits.

## 10. Verification

Verification is derived from impact and mutation, not manually invented.

### Before mutation

- exact target resolves.
- requested operation is supported.
- no ambiguity remains.
- all touched file hashes match preview.
- all WorkspaceEdit ranges/resource operations are valid.
- destination paths do not unexpectedly collide.
- graph anchor migration is either known or explicitly unnecessary.

### After mutation

- touched/deleted/renamed files re-index correctly.
- expected new symbol/definition exists.
- expected old definition disappears where applicable.
- migrated durable graph relations point to the new anchor.
- no migration is duplicated.

### Project proof

Use existing test facilities:

- TypeScript diagnostics/typecheck.
- targeted tests derived from Product Impact / touched test files.
- broader `bun test` for acceptance and when impact warrants it.

A verification failure after a successful disk commit does **not** trigger speculative source rollback. Return the failed verification with the changed workspace intact for inspection/fix-forward. Rollback is only best-effort recovery from failures while committing the prepared filesystem mutation itself.

The change engine does not become another test runner.

## 11. Product-aware impact

For changes starting from Feature/UserStory/Epic, use existing `getProductImpact()` first.

For direct code changes, reverse product lookup may be added only if a simple graph query can derive it from existing Ticket→code and intent relations. Do not add fuzzy/RAG machinery.

Preview should explain both dimensions when known:

```text
WHY / BEHAVIOR
  Feature, Story, Epic, Decisions

WORK
  Tickets

CODE
  exact TypeScript target, references, affected files

PROOF
  tests, diagnostics, coverage
```

## 12. Tool/shell surface

Add a real `change` category/bucket to the existing two-tier router.

Initial public tools should remain small:

- `preview_change`
- `apply_change`

The typed request distinguishes operations; do not expose dozens of one-off tools.

The shell/actor may turn natural language into a typed request:

```text
"rename WorkflowStore to ProjectStore"
"rename src/a.ts to src/core/a.ts"
"organize imports in src/foo.ts"
```

Normal interactive flow:

```text
understand request
→ optional productImpact
→ preview_change
→ concise human preview
→ confirmation
→ apply_change
→ verification report
```

MCP/non-TTY callers perform preview and apply explicitly.

## 13. Next capability: Product Intent mutations

The same change contract must intentionally support the immediate next feature:

- add/change/delete Epic
- add/change/delete Feature
- add/change/delete UserStory
- add/change/delete Ticket

This phase is **designed now but implemented after native code changes are accepted**.

It must reuse existing deterministic product/ticket tools and graph primitives; do not duplicate CRUD.

Future Product mutations become additional `ChangeMutation` variants and use the same:

- preview
- fingerprint
- impact
- validation
- apply
- coverage verification

Deletion is never blind cascading. Preview must expose incoming/outgoing causal relations. The mutation must either:

- include explicit unlink/deprecation/removal operations, or
- block with exact dependents.

A future mixed change may therefore be one coherent preview:

```text
change STORY-X acceptance criteria
+ update TKT-Y
+ native TypeScript rename/edit
+ verify STORY-X coverage and tests
```

That is the reason the subsystem is named **change**, not **refactor**.

## 14. Hard non-goals

Do not build:

- a TypeScript parser/type checker/reference engine
- a second exact JS/TS graph
- a custom rename/import-rewrite engine
- a generic language-backend framework
- an LSP implementation or JSON-RPC framing layer
- a persisted change-plan subsystem
- an artificial transaction framework
- automatic git commits
- embeddings/RAG for change discovery
- TypeScript 6 compatibility machinery in this phase
- unsupported extract/inline/move-symbol algorithms just to match IDE feature lists

## 15. Engineering rule

Before adding any low-level capability, check whether a mature existing component already owns it.

The burden of proof is on **new machinery**, not on reuse.

For this subsystem:

> TypeScript owns TypeScript semantics. Semantika owns causal/project knowledge. aiwf composes them into safe change.
