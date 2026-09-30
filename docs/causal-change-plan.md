# Causal Change Engine — Implementation Plan

Status: implementation plan  
Design authority: `docs/causal-change-engine.md`  
Implementation branch: `feat/causal-change-engine`

## Goal

Deliver a small, reliable safe-change substrate whose first concrete backend is the **TypeScript 7 native LSP**, while deliberately shaping the preview/apply contract for the immediate next capability: Product Intent mutations.

Current implementation scope:

```text
AIWF-CHANGE-FOUNDATION
        ↓ HARD GATE
AIWF-NATIVE-CODE-CHANGE
```

Planned next phase, **not part of the current implementation pass**:

```text
AIWF-PRODUCT-CHANGE
```

Do not collapse these into one uncontrolled coding session. The second ticket starts only after the first acceptance gate is green.

---

# Ticket 1 — AIWF-CHANGE-FOUNDATION

## Objective

Establish exact TypeScript semantics and durable aiwf code anchors with no source mutation yet beyond tests.

At the end of Ticket 1, aiwf must reliably map:

```text
Product/graph anchor
    ↔
exact TypeScript file/position/definition/references
```

## 1. Make TS7 a real runtime/setup dependency

Before building the client:

1. move `typescript@^7` from `devDependencies` to `dependencies`.
2. add one small shared TypeScript resolver/provisioner in the setup/runtime layer.
3. resolution order:
   - compatible project-local TypeScript 7;
   - aiwf's own packaged TypeScript 7;
   - compatible host `PATH` TypeScript 7.
4. extend `aiwf setup` to ensure a compatible host-level TS7 exists:
   - verify an existing host `tsc` if compatible;
   - otherwise provision `typescript@^7` at Bun user/global scope, without sudo;
   - re-resolve and fail clearly if no compatible TS7 is usable.
5. never mutate a project's pinned TypeScript dependency merely because it is older.
6. extend `aiwf doctor` to report selected executable, version, native-LSP readiness, and host-level compatibility.
7. test resolver/setup behavior with injected executable/process seams; do not actually alter the developer machine from unit tests.

The LSP client, setup, and doctor must call the **same resolver**. No duplicated `which/version` logic.

Then verify on the real checkout:

1. selected TypeScript is 7.x.
2. selected `tsc --lsp` starts an LSP server over stdio.
3. record the server's actual initialize capabilities.
4. do not assume unsupported refactors.

If this does not work, stop and report the exact observed TypeScript version/command/capability problem. Do not invent a TS6 fallback.

## 2. Add only the transport dependency we need

Prefer:

```text
vscode-jsonrpc
```

Use it for stdio JSON-RPC transport/framing.

Do not add:

- `vscode-languageclient`
- `typescript-language-server`
- `ts-morph`
- a custom Content-Length parser

unless a concrete verified need makes the minimal choice impossible.

## 3. Add the tiny change subsystem

Preferred ownership:

```text
src/change/types.ts
  shared request/preview/mutation/fingerprint contracts

src/change/ts-lsp.ts
  one small TS7 LSP process client

src/typescript-runtime.ts (or the smallest existing setup/runtime home)
  single TS7 resolve/version/provision contract shared by setup, doctor and LSP client

src/change/engine.ts
  exact target resolution + preview/apply orchestration

src/tools/change.ts
  thin registered tool wrappers
```

Do not create Manager/Service/Repository/backend-framework layers.

## 4. Implement `TsLspClient`

Responsibilities only:

- obtain compatible TS7 `tsc` executable from the shared resolver.
- lazy-start `tsc --lsp`.
- initialize root/workspace.
- reuse one client per project root.
- expose the exact methods aiwf needs:
  - definition
  - references
  - prepareRename
  - rename
  - willRenameFiles
  - call hierarchy if useful
  - diagnostics
  - code/source actions supported by the server
- expose initialized server capabilities.
- clean shutdown.
- clear process/protocol failure errors.

Use ordinary LSP methods. Avoid TypeScript-private protocol unless the design is explicitly amended after proving no stable LSP route exists.

## 5. Fix incremental Symbol reconciliation

Refactor `indexSingleFile()` so normal line movement does not destroy Symbol entities.

Algorithm:

1. parse file.
2. load existing symbols for that file.
3. group both sides by:
   `containerName + kind + name`.
4. if exactly one old and one new symbol share a key:
   - update the old entity in place;
   - keep its ID and connected semantic relations;
   - update line/column/signature/exported fields.
5. create unmatched new symbols.
6. delete unmatched old symbols only after matching finishes.
7. continue rebuilding parser-owned file/import/call/containment facts normally.

Ambiguous duplicate keys are **not** guessed. Treat them as unmatched.

Do not redesign all Symbol IDs.

## 6. Exact target resolution

Implement a small internal target type, sufficient for:

- graph entity ID / SymbolNode
- file + symbol name
- file + explicit position

Resolution:

1. `ensureAstFresh()`.
2. find candidate graph anchor(s).
3. convert to file URI + LSP position.
4. ask TS7 for exact definition/rename target.
5. reject ambiguity.

No fuzzy semantic retrieval.

## 7. Expose semantic inspection only as needed

Ticket 1 does not need a large public API.

Internal methods are enough. If tests or actor integration genuinely require one public inspection tool, keep it narrow rather than adding a family of LSP proxy tools.

## Ticket 1 deterministic tests

Add focused tests proving:

### Stable anchor

Given:

```text
Ticket --modifies--> foo SymbolNode
```

after inserting unrelated lines above `foo` and reindexing:

- same Symbol entity ID remains.
- line metadata changes.
- Ticket→Symbol relation survives.

### Definition/reference correctness

Fixture with:

```ts
// a.ts
export function foo() {}

// b.ts
import { foo } from './a'
foo()
```

Assert TS7 resolution finds the exact definition and reference set.

### Ambiguity

Two plausible same-name symbols without enough target context must not be guessed.

### Process lifecycle

- client starts.
- repeated requests reuse it.
- shutdown leaves no leaked child process.

### TypeScript setup/runtime

Prove deterministically that:

- compatible project-local TS7 wins.
- aiwf-packaged TS7 is the fallback when project TypeScript is absent or incompatible.
- compatible host TS7 is recognized.
- setup requests user-level Bun provisioning only when required.
- an older project-pinned TypeScript is not modified.
- doctor and LSP client resolve the same executable.

### Unsupported server

Inject or simulate an incompatible server/version and prove the error is explicit.

## Ticket 1 acceptance gate

Run:

```bash
bun run typecheck
bun test
```

Then do an am-i-allowed-style method-by-method KISS audit.

Reject Ticket 1 if it introduces:

- custom LSP framing
- generic backend/plugin architecture
- duplicated TypeScript semantic graph
- fuzzy resolution where an exact target is required
- complex symbol migration machinery
- hidden TS6 fallback

Only after this gate is clean may Ticket 2 start.

---

# Ticket 2 — AIWF-NATIVE-CODE-CHANGE

## Objective

Build the generic preview/apply/verify path and use TS7's **actually supported** native edit operations as the first mutation source.

## 1. Freeze the minimal contracts

Keep `ChangeMutation` extensible by discriminated union, but implement only code mutations now.

Initial implemented mutation:

```ts
{
  kind: 'workspace_edit'
  source: 'typescript-lsp'
  edit: WorkspaceEditLike
}
```

A file rename/create/delete may be represented as LSP resource operations inside the normalized workspace edit.

Do not implement Product mutation variants yet.

## 2. Initial request types

Implement only what current TS7 can reliably supply:

### `rename_symbol`

Inputs:

- exact target
- `newName`

Native source:

- `prepareRename`
- `textDocument/rename`

### `rename_file`

Inputs:

- `oldPath`
- `newPath`

Native source:

- `workspace/willRenameFiles`
- explicit filesystem rename represented in the normalized mutation

### `source_action`

Inputs:

- file
- action from a strict small set derived from advertised server capabilities

Expected candidates include:

- organize imports
- remove unused imports
- sort imports
- supported fix-all/quick-fix actions when safely selectable

Do not hard-code extract/inline/move-symbol support unless the installed TS7 stable server demonstrably exposes a callable action.

## 3. Capability discovery policy

At initialization, retain server capabilities.

For a requested action:

1. ask the server for the relevant advertised/available action.
2. if native edit is available, use it.
3. if not, return `unsupported` with exact product/code impact.
4. do not synthesize a deterministic replacement algorithm.

This lets aiwf inherit future TS7 refactors without architecture changes.

## 4. Build `previewChange()`

Preview must perform zero disk mutation.

It should return:

- normalized request
- exact target
- mutation(s)
- affected files
- original hashes
- exact reference count/details where relevant
- Product Impact when supplied/derivable
- warnings/blockers
- verification plan
- fingerprint

A blocked preview is still useful and should explain why.

## 5. Product-aware context

When request starts from Epic/Feature/UserStory, or the actor already knows one:

- call existing `getProductImpact()`.
- use returned code anchors to narrow target resolution.
- include related Tickets/Tests/Decisions in preview.

Do not broaden to sibling Stories or unrestricted graph traversal.

For a direct code target, only derive reverse product context if existing relations make it simple and deterministic.

## 6. Fingerprint

Compute a deterministic hash from:

- normalized request
- resolved target
- normalized workspace edit/resource operations
- original hashes of all touched files

`applyChange(request, fingerprint)` must recompute the preview immediately.

Mismatch => reject as stale.

No persisted plans.

## 7. Normalize and validate WorkspaceEdit

Handle the subset returned by TS7 that the acceptance fixtures exercise:

- text edits
- document changes
- rename file
- create file if genuinely returned
- delete file if genuinely returned

Before first write:

- every target file exists when required.
- destination collisions are explicit.
- all file hashes match.
- edit ranges are valid and non-overlapping after normalization.
- every resulting file is materialized in memory.

If TS7 returns an unhandled WorkspaceEdit operation, block clearly. Do not partially apply.

## 8. Apply safely

```text
recompute preview
→ fingerprint match
→ materialize all results
→ snapshot originals in memory
→ validate
→ write/rename
→ on failure restore touched originals best-effort
→ re-index
→ migrate durable graph anchors
→ verify
```

Do not call `apply_block_patch`.

Do not create git commits.

## 9. Durable semantic anchor migration

For rename/move:

1. remember old anchor and its non-parser semantic incoming/outgoing relations.
2. perform source change.
3. re-index.
4. resolve the post-change exact TypeScript definition.
5. map it to the new/current SymbolNode.
6. recreate only durable semantic relations that are not parser-owned.
7. remove stale old anchor if still present.
8. ensure repeated reconciliation does not duplicate relations.

Keep this helper tiny and explicit.

Do not blindly copy all graph predicates.

At minimum preserve relations such as:

- Ticket `modifies` / `targets` code
- Decision `governs` code
- other manually authored durable relations demonstrated by current ontology

Parser-owned `contains`, `imports`, `calls`, `depends_on` are regenerated rather than copied.

## 10. Verification plan

Preview derives verification.

After apply:

1. LSP diagnostics on affected code/project as feasible.
2. confirm expected definition exists / old one no longer resolves where appropriate.
3. verify graph anchor continuity.
4. run targeted tests using existing test tools.
5. run typecheck.
6. full `bun test` for ticket acceptance.

No separate test-runner subsystem.

## 11. Public tools

Register a `change` category and bucket.

Expose only:

### `preview_change`

Typed request → `ChangePreview`.

### `apply_change`

Typed request + fingerprint → verified result.

Do not expose raw LSP proxy tools unless a proven workflow requires them.

## 12. Shell/actor integration

Add `change` keywords/capability routing for intent such as:

- rename
- refactor
- move/rename file
- organize imports
- change symbol safely

Natural-language actor should produce a typed request, then use the same public tools.

Interactive shell:

```text
user intent
→ preview
→ concise diff/impact summary
→ confirm
→ apply
→ verification
```

MCP/non-TTY: explicit preview then explicit apply.

## Ticket 2 acceptance fixtures

### A. Symbol rename

Project:

```text
Feature/Story → Ticket → foo()
a.ts exports foo
b.ts imports/calls foo
test references behavior
```

Request:

```text
rename foo → parseFoo
```

Assert:

- preview changes zero files on disk.
- exact TS references are included.
- Product Impact is bounded.
- apply changes declaration/import/calls.
- Ticket→code semantic anchor survives and points to renamed symbol.
- diagnostics/typecheck clean.

### B. Stale preview

- preview rename.
- modify one touched file manually.
- apply old fingerprint.
- must reject before any write.

### C. File rename

- rename/move a TS file.
- imports are updated by TS7.
- graph file/symbol indexing reflects new path.
- unrelated files unchanged.

### D. Unsupported rich refactor

Ask for a refactor that the current native server does not expose.

Assert:

- no mutation.
- result says unsupported.
- exact impact/context is returned.
- no home-grown transformation silently runs.

### E. Source action

Exercise one action actually advertised by the installed TS7 server, e.g. organize imports.

### F. Failure during commit

Simulate write failure after at least one prepared mutation and prove best-effort restoration/reporting.

## Ticket 2 gate

```bash
bun run typecheck
bun test
```

Then:

- inspect full diff
- method-by-method KISS audit
- run at least two live refactors on ai-workflow itself in a disposable/resettable worktree
- verify no leaked LSP processes
- verify no unrelated formatting churn

Do not call the feature complete from unit fixtures alone.

---

# Planned Ticket 3 — AIWF-PRODUCT-CHANGE

**Do not implement during the current Agy prompt.**

This is documented now to constrain Ticket 1/2 architecture.

## Objective

Use the same `ChangePreview → fingerprint → apply → verify` machinery for:

- create/update/delete Epic
- create/update/delete Feature
- create/update/delete UserStory
- create/update/delete Ticket
- canonical product link/unlink operations

## Reuse, do not duplicate

Reuse:

- existing `create_*/update_*` product tools
- existing ticket tools
- `link_product` / `unlink_product`
- `WorkflowStore.deleteEntity` only behind product-specific delete validation
- Product Impact
- Coverage

No second Product CRUD implementation.

## Product delete rule

Deletion must never mean uncontrolled cascade.

Preview all inbound/outbound durable product relations.

Then either:

1. include the exact unlink/deprecate/delete mutations necessary for a coherent change, or
2. block and list dependents.

Examples:

```text
delete STORY-X
→ show containing Feature, targeting Epic, addressing Tickets, verifying Tests, Decisions
→ require explicit coherent resolution
```

```text
delete FEATURE-X
→ show Stories, Epics, implementing Tickets, Tests, Decisions
→ never silently erase the causal neighborhood
```

## Mixed changes

The end-state supports one preview containing Product + code mutations:

```text
change STORY-X behavior
+ update TKT-Y
+ TS native rename/edit
+ re-check coverage
+ typecheck/tests
```

This future requirement is why Ticket 1/2 use generic `ChangePreview` terminology and avoid a refactor-only persistence model.

---

# Stop conditions

Stop and report rather than inventing architecture if:

- installed TypeScript 7 cannot provide the required stable LSP operation.
- TS7 returns WorkspaceEdit/resource operations not safely handled by the narrow implementation.
- exact target resolution remains ambiguous.
- Symbol anchor migration cannot be made deterministic for an acceptance case.
- `vscode-jsonrpc` is not compatible with Bun and no comparably small mature transport is available.
- a proposed fix requires implementing TypeScript parsing/reference/import semantics ourselves.
- a change requires a generic language-provider framework before a second language actually exists.
- a test can pass only by weakening ambiguity/safety checks.

---

# Final implementation report

Keep it compact and factual:

- commits
- files changed
- TS7 executable/version used
- observed LSP capabilities used
- Ticket 1 gate result
- Ticket 2 gate result
- live acceptance cases
- unsupported native refactors observed
- deviations from design
- remaining concrete risk

Never report a gate as green unless it was actually run.
