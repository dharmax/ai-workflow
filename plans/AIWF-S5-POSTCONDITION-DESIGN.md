# AIWF — S5 Postcondition: Product Operability (Design)

**Status:** published design proposal for developer review; PC0–PC5 are not implemented or accepted. **Placement:** a prerequisite to authorizing S6, not a new runtime subsystem and not a reversal of S5's accepted DW-04 scope. This is the sole current Product Operability postcondition specification. Companion: `AIWF-S5-POSTCONDITION-PLAN.md`. Source reviewed: published `dharmax/ai-workflow` at `dc309f4af73b69747fd2c0593563d1fedc6437ac`, prior Dharmax-way design/plan, S1–S5 evidence, and current `src/{cli,artifact-command}.ts`, `src/tools/{surface,registry,product,tickets,change}.ts`, `src/product/mutation.ts`, `src/graph/{ontology,store,projections}.ts`, `src/workspace/*`. Actual local checkout, canonical DB and sibling versions must be inspected at PC0. Reported tests are not fresh independent execution.

## 1. The postcondition (the point of this correction)

A developer or appropriately authorized agent can **find, understand, define, relate, revise, plan, diagnose and inspect proof for** an existing or new project's product and architecture via discoverable public interfaces. Routine operations require neither `eval`, handcrafted Product-change JSON, direct DB writes nor manual Markdown synchronization. Product intent is developer-owned; AI suggestions are inert until reviewed and accepted. A maintenance-only repository remains usable without manufacturing product artifacts.

This postcondition covers human and agent **operability**, not autonomous S6 Ticket implementation. It is met by observing complete real-world journeys and failure cases, not by counting registered tools or diagram boxes. CLI, interactive shell, Workspace and deliberately selected MCP operations share canonical domain methods, validation, versions, provenance and authority. Existing S1–S5 acceptance, Rule governance, Ticket leases, Gate 5 safety, and true evidence states must not regress. No S6 work or premature S8 projection removal.

## 2. Verified baseline and implications

- Canonical `Goal`, `Concept`, `Flow`, `Feature`, `UserStory`, `Aspect`, `Epic`, `Ticket`, `ModuleNode`, `TestNode`, `Decision` exist. The store is Semantika-backed (`.ai-workflow/state/graph.db`). `init` indexes and scaffolds; it does **not** define a product charter. `ModuleNode` currently has `path`, `body`, completeness target, but `ProductMutationSchema` does not include Module in its general create/update entity-kind union; reviewed module intention needs a narrow canonical mutation contract without permitting indexer-owned fields to be overwritten.
- `tools/product.ts` registers Goal/Concept/Flow create/list/get/update as well as Feature/Story/Epic and internal `link_product`/`unlink_product`; `product/mutation.ts` has typed allowed Product relation triples and S2 reviewed mutations. Current CLI largely shows Epics/Features/Stories/Tickets and lacks a general relationship command. Workspace reads other kinds but edits Feature/Story/Aspect; its predicate picker is static. Internal existence does not equal public usability.
- `tools/surface.ts` has many narrowly named public MCP operations, but not all internal product CRUD/link tools. Tool count alone neither proves nor disproves good agent performance. No universal string-executing MCP escape hatch is acceptable.
- Ticket has no explicit defect classification; `recommend_next_task` currently relies on ID/title containing `bug` or `fix`. CLI dispatch case normalization is incomplete. Current predicate descriptors have generic payload fields, but `ProductMutationSchema.product_link` and `product_unlink` lack payload support. Do not claim these future features already work.
- Current generated Markdown includes `modules.md` (module health and dependencies), but no `product.md` or dedicated Goal/Concept projection; existing Markdown projections have live sync paths. They are not canonical product definitions. S8 handles replacement of live bidirectional sync only after tested export/restore.

## 3. Semantic ownership: small and precise

| Concern | Canonical meaning and recommended owner | Critical boundary |
| --- | --- | --- |
| Project charter | One optional **versioned** project-level identity, purpose, users/actors, scope, bounds/non-goals and explicit references to existing Goals/Concepts, stored through current WorkflowStore/Semantika. PC0 decides the exact existing metadata/record owner and representation; do not casually reuse an unrelated Artifact. | Not a second Goal/Concept or compulsory init ceremony. Existing projects get no invented accepted charter. |
| Goal / Concept | Outcome (`why`) / product-domain meaning (`principle`); product-wide or explicitly linked to Module. Existing entities. | Definitions stay in one place; no copied module goals, no new `ModuleGoal`. |
| Product Flow / Story / Feature | Significant actor journey / complete episode with Actor, Intent, Initial State, Action, Observable Result, relevant Exception/Bounds / reusable capability enabling Stories. | Feature `enables` Story; Flow `contains` Story. Do not confuse product Flow with engineering call flow; do not infer satisfaction from acceptance. |
| Aspect / Rule / Decision | Reusable applicable concern / effective engineering instruction / approved decision. | Distinct authorities; changing Aspect reveals actual impact without indiscriminate propagation. |
| Module | Indexed `ModuleNode` with stable source/path identity plus reviewed purpose, responsibilities and boundaries; explicit links to Goal/Concept/Aspect where allowed. | Source indexing must not overwrite human-authored intention; code ownership is evidenced, not guessed. |
| Epic / Ticket / Bug | Delivery grouping / bounded execution work / **typed defect on the same Ticket lifecycle** with reproduction, expected/actual, severity and environment where known. | Severity differs from priority; no duplicate Bug DB, queue, lease, runner or verifier. |
| Test/evidence and source graph | Executable public proof and indexed source facts in their existing owners. | Never make acceptance from static relations or permit manual link operations to rewrite AST/indexer facts. |

**Topmost human-readable location:** propose explicit **one-way generated** `product.md` for charter and linked Goal/Concept summaries, plus an expanded `modules.md` for reviewed module intention alongside existing health. Generated export is a read-only snapshot of canonical data, with provenance/revision as appropriate; no silent Markdown-to-DB import for those new sections. PC0 must settle file placement, generation triggers and collision with existing live projections. Preserve all current projection/import/restore behavior until its independently accepted S8 migration; do not promise that a newly generated file is an authoritative editing interface. `aiwf init` must not generate or accept product intent; it may only *offer* product definition as a separate next action.

## 4. One compositional human command language

**Canonical grammar:** `aiwf <topic>[:<subtopic>] <verb> [args] [flags]`. Both `product:goal show G1` **and** `product goal show G1` normalize into **one structured command intent, one dispatcher, one help/error contract**; no duplicated handlers or second command bus. A top-level topic without subtopic can own a meaningful singleton (`product show/edit` = charter); otherwise help/explicit verb resolves ambiguity. Existing useful one-word commands survive as thin compatibility conveniences, not independent implementations: `aiwf epic X` → `work:epic show X`, `aiwf bug B` → `work:bug show B`, `aiwf bugs` → `work:bug list`, `aiwf next` → documented work recommendation, `aiwf resolve T` → existing governed Ticket resolution. Do not reinterpret incomplete *explicit* commands as natural-language Actor input.

| Family | Human subjects and discoverable verbs | Owner/boundary |
| --- | --- | --- |
| `product` | Charter `show/edit`; `goal`, `concept`, `flow`, `feature`, `story`, `aspect`: `help/list/show/new/edit/retire` **only where semantically supported**; reviewed work derivation remains deliberate. | Current Product/store/Aspect/S2 owners; no duplicate per-kind command implementation. |
| `arch:module` | `help/list/show/edit` reviewed purpose/responsibilities/bounds; source navigation stays with indexing/code tools. | Existing ModuleNode and source identity; no generic File/Symbol Product CRUD. |
| `work` | `epic`, `ticket`, `bug`: `help/list/show/new/edit`; Ticket-specific `start/move/claim/release/resolve/verify` dispatched to existing owners. | Generic edit cannot set lane Done, claim, verification or authority. |
| `link` | **One top-level command** for governed relation discovery/inspection/add/remove/optional human edge payload. | Validated Product relation metadata + S2 preview/fingerprint/apply; indexed graph relations remain read-only. |
| `verify` | `story`/`ticket` status, inspect, run where implemented. | Existing S5 tests/Ticket verification; never invent S7 Story satisfaction or Gate 5 acceptance. |
| Existing specialist commands | Rule management, `graph`, `symbol`, source changes, configuration, setup, import/export, skill/knowledge/Actor operations. | Remain specialized when consolidation obscures safety or correctness. Not every operation needs the new grammar. |

**Case semantics:** command topic/kind/verb/option names and human enums are case-insensitive; typed parser emits canonical names. For **human-facing entity lookup only**, prefer exact canonical ID; else unique casefold match; collision fails with candidates. The same ID-resolution intent must apply to CLI/shell/Workspace selection and the appropriately declared human-ID MCP entrypoint without redefining DB identity. Preserve original stored ID spelling, paths, symbols, test-file identity, quoted titles, payload string values and free text. Do not assert `AIWF` executable works on case-sensitive OS without actual alias. Maintain proper shell token/quote/`--` handling. `new` is create-only; `edit` requires an existing identity; `retire` is explicit review, never physical deletion by accident. Direct single-purpose input (`--title`, `--body`, `--query`, etc.) and Workspace forms are everyday UX; full JSON only advanced batch/transport. `--apply` is explicit CLI approval of its own freshly generated preview and revalidated fingerprint, not a bypass of review.

Proposed examples (future contracts, **not currently implemented**):

```sh
aiwf product show
aiwf product edit
aiwf product:goal list                   # identical: aiwf product goal list
aiwf PRODUCT GOAL show G1
aiwf product:story edit S1
aiwf arch module show M1                 # identical: aiwf arch:module show M1
aiwf work:bug new
aiwf bugs                               # convenience over work:bug list
aiwf bug B1                             # convenience over work:bug show B1
aiwf epic E1                            # existing convenience, case-insensitive
aiwf work ticket start T1
aiwf verify story show S1
```

## 5. `link` — one governed-relation command, NOT a universal graph writer

The human contract is one oriented `(source ID, predicate, target ID)` plus supported, typed, human-authored edge payload. `-D` removes exactly that **edge**, never an endpoint. No new separate `unlink`/`relations` human families. `link` without target inspects (filterable by `--incoming|--outgoing|--predicate P|--json`); `--allowed` lists permitted governed triples (optionally filtered by endpoint kinds), not *all* predicate names from the graph ontology. It shows type, direction, meaning, read-only/legacy status and payload support. Preserve distinction `Epic targets Story`, `Feature enables Story`, `Ticket addresses Story`. A `Feature contains Story` legacy edge is readable/removable but cannot newly be authored.

```sh
aiwf link E1                              # governed incoming + outgoing
aiwf link E1 --incoming --predicate targets --json
aiwf link --allowed
aiwf link --allowed Epic UserStory
aiwf link E1 targets S1                   # inert preview, no state change
aiwf link E1 targets S1 --apply           # user authorizes exact fresh preview
aiwf link E1 targets S1 -D                # inert removal preview
aiwf link E1 targets S1 -D --apply        # removes edge, not E1/S1
aiwf link E1 targets S1 -p note=purpose -p weight=2
aiwf link E1 targets S1 -p '{"note":"purpose","weight":2}'
aiwf link E1 targets S1 -p @edge.json      # optional advanced file input
```

**Payload decision (developer-approved): both modes**, repeated `-p key=value` **or** `-p <JSON object>`; optional `@file.json` is a transport convenience. They normalize to the same per-predicate schema; reject mixed modes, duplicate keys, invalid type, unsupported field, array/scalar JSON, unsafe `@` path (project-relative, bounded regular file, no traversal/symlink escape) and `-D` with payload. Do not use eval or shell interpolation. CLI assignment conversion is driven by the **actual allowed field type**, so string `"2"` is not silently converted to number. MCP accepts typed object only, never CLI syntax. Defaults do not expose system-authored `confidence`, `timestamp`, `sourceRange` simply because generic predicate descriptors have them. **Source fact:** existing `product_link`/`product_unlink` mutations have no payload field despite generic predicate payload slots. PC0 must define authorable fields, schema, existence/duplicate behavior, payload-only revision, edge fingerprint/version storage and no-op policy; a bare repeated link must not silently overwrite existing payload. Use the narrowest change to the existing Product mutation owner, no second edge writer.

**Governed-only boundary:** authorable relation descriptors derive from **one exported canonical allowed-triples contract** in `product/mutation.ts`, enriched with direction/help, payload and legacy unlink-only policy. Workspace picker, CLI help, MCP discovery and validation read that same contract. `graph/ontology.ts` defines a broader graph including indexed `calls`, `imports`, `inherits` and other indexer/source facts; `link` cannot mutate them. If a source-related relation is deliberately human-governed, it must be explicitly listed with an owner, never generalized from graph predicate existence. Proposed module links (e.g., `Module serves Goal`, `Concept governs Module`) require explicit reviewed additions; existing `Aspect applies_to Module` must retain correct direct/inherited semantics.

**Write boundary:** inspect/allowed/preview are read-only. Add, remove and authorized payload changes generate one S2 Product change with basis, snapshot, fingerprint and explicit consent; approval revalidates latest state and permissions before atomic canonical commit. CLI `--apply` is explicit user intent only for that exact invocation. Shell/Workspace review that same preview. MCP *proposal* is not developer approval; MCP application requires unchanged request/fingerprint, explicit approved decision and genuine write authority from the host/user. Batch changes use one canonical Product batch, not sequential partial links. Classify no-op/duplicate, missing edge, wrong direction/type, case collision, stale revision, dependency/cycle and unauthorized edges. Do not conflate graph DB atomicity with separate filesystem effects.

## 6. MCP/agent architecture: reduce surface, not precision

**Do not replace dozens of narrow tools with one opaque `{command:string,args:any}` or unbounded optional-parameter soup.** Keep the current domain methods and specialized safety owners. A deliberately compact *public façade* may use bounded family tools, each with strict action-discriminated schemas and kind-specific validation; use scoped `describe`/`allowed` for an agent to discover legal verbs/fields/targets without seeing the whole registry. Existing public MCP tools remain until parity and migration are proven. No gratuitous tool-count target; measure end-to-end task correctness, wrong calls and advertised schema/context size.

| Proposed selected public family | Action shapes (illustrative, not yet implemented) | Routes to |
| --- | --- | --- |
| `artifact` | `describe/list/show/preview_new/preview_edit/preview_retire` with typed `scope,kind,id,fields` combinations; `project` charter as singleton. | Existing Product, Aspect, Module and work-definition owners through S2 preview. |
| `link` | `allowed/inspect/preview_add/preview_remove/preview_payload` with typed endpoint IDs, predicate, direction, typed object payload where permitted. | One governed Product relation contract + S2. |
| `work` | `next/claim/release/start/move/prepare/resolve/verify` with explicit Ticket/Bug context and strict transitions; retain specialized `resolve_ticket` if this wrapper harms safety or discoverability. | Existing Ticket state/lease/implementation/verification owners. |
| `verify` | `status/show/run` only where existing evidence owner supports it. | S5 Story tests and current Ticket proof. |
| Existing `preview_change` / `apply_change` | Current guarded request, fingerprint, explicit user approval/authority; remain separate safety boundary. | Causal Change Engine and S2 Product mutation. |

Sample MCP intent: `artifact({scope:'product',kind:'goal',action:'show',id:'G1'})`; `link({action:'preview_add',sourceId:'E1',predicate:'targets',targetId:'S1',payload:{note:'purpose'}})`. MCP never parses `topic:subtopic` or shell strings; it receives already typed dimensions. `describe` advertises bounded capabilities relevant to chosen scope/kind, not a whole schema dump. Replies carry canonical IDs, versions, provenance, preview-vs-applied status and precise errors with bounded details. External agents may propose; developer/host authority controls acceptance. Do not expose `script_eval`, generic registry enumeration, raw SQLite or unrestricted graph mutation. Public MCP changes must be measured against existing selected tools and introduced with an explicit backward-compatibility/migration decision; **do not delete old tools during this postcondition by default**.

## 7. Acceptance journeys (public first, realistic and adversarial)

| ID | Observable end-to-end postcondition | Non-negotiable negative |
| --- | --- | --- |
| PC-J1 Fresh/maintenance start | `init`, optional reviewed charter, Goal/Concept/Aspect; reopen exact canonical identities; maintainer can create technical Ticket while charter undefined. | No auto-accepted fake intent or silent generated writes. |
| PC-J2 Module meaning | Indexed Module gains reviewed purpose/bounds, explicit Goal/Concept/Aspect links, query in both directions; reindex/reopen preserves intent. | No source-index overwrite or inferred links from unrelated Epic. |
| PC-J3 Normal product evolution | Flow → complete Story, Feature enables Story, reviewed Epic/Ticket reuse and real S4/S5 Story test. | Repeated intent does not duplicate active definitions; reject leaves no state. |
| PC-J4 Complete governed links | `allowed` enumerates all approved triples; inspect/add/remove/payload both formats via CLI and typed MCP; exact edge persists/reopens. | Indexed edge cannot be authored; invalid triple, malformed payload, stale preview and cancel leave DB unchanged; legacy read/unlink-only. |
| PC-J5 First-class defect | Typed Bug created/listed/inspected via `work:bug` **and** `bug`/`bugs`, linked context, ranked by documented next policy and verified on existing Ticket substrate. | Title containing 'fix' alone is not a Bug; no invented reproduction/red/Done. |
| PC-J6 Parsing/help and IDs | Colon/space plus case variations normalize identically; `aiwf epic X`/`aiwf bug B` work; scoped help/error lists real operations. | Case collision fails; IDs/paths/payload text intact; invalid explicit syntax never falls into Actor. |
| PC-J7 Mature project/lifecycle | Legacy Tickets/edges/claims/Done and current Story proof survive open/edit/reopen without silent reclassification or status mutation. | Generic artifact edit cannot bypass Ticket state or delete an entity with dependents. |
| PC-J8 Cross-surface parity | Same approved intent/link observed with equivalent IDs/versions through real CLI, shell, Workspace and selected MCP; agent can discover a valid action from scoped description. | One canceled, one stale, one DB-failed change leave no partial accepted graph; illegal agent operation fails. |
| PC-J9 Safety/verification | Scope/admission, Rule, dirty-file, source-change, lease and independent verifier regressions remain effective; S1–S5 journeys still pass. | No fake green/verified or Gate 5 acceptance due to presentation or graph changes. |
| PC-J10 Everyday usability | A human and an agent each complete representative journeys without `eval`, handmade JSON, direct DB/projection edits or hidden tool knowledge. Compare action count, MCP schema footprint and wrong-call rate with baseline. | Do not substitute mocks or tool-count reduction for public task completion. |

Each journey must record actor, initial state, public action, observable output and persisted effect, relevant exception/bounds, actual test location, and any skipped/blocked coverage. Internal mechanism tests supplement, never substitute for end-to-end public behavior. CLI help and documentation must describe *implemented* functionality, not unqualified future commands.

## 8. Findings already exposed by adversarial review, and required PC0 decisions

1. **Naming explosion → bounded grammar.** One family per domain, not per kind×verb. Aliases `bug`/`bugs` and `epic` are cheap compatibility syntax, not backend duplication. Avoid a second dispatcher/shell parser.
2. **Overcompression → typed MCP.** Fewer public tools can inflate optional fields/context and cause agent errors; keep discriminated actions and specialized safety operations. Compare observed outcomes, not count.
3. **Two spellings → one AST.** Parser ambiguities, help, `--` quoting and casefold collisions have required negative tests; no guessed Actor fallback.
4. **Payload illusion → explicit storage contract.** Current Product relation mutations lack payload. Edge authorship, defaults, metadata revision and idempotent behavior must be frozen before edits.
5. **Indexer integrity → split authorship.** Governed whitelist is not the graph ontology; preserve AST/indexer-managed edges.
6. **Consent ≠ proposal.** CLI `--apply` is explicit per-invocation user consent; MCP proposal never elevates itself. Same S2 fingerprint and existing governance admission apply at commit.
7. **Typed Bug ≠ new queue.** No substring heuristic, shadow bug graph, proof mutation or `Done` through CRUD.
8. **Product charter and Modules require real owner decisions.** PC0 fixes charter store representation, module intent survival under reindex, exact relation set and explicit Markdown export semantics without S8 migration.
9. **Missed operation risk:** Audit create/read/search/revise/retire, direct/incoming relations, payload updates, scope, impact, dependency and error recovery for *each relevant artifact*, including Decision/Rule. Mark intentional exclusions; no blanket exposure of all internals.
10. **One active roadmap:** This postcondition is inserted after S5 and before S6 in the canonical Dharmax-way plan. Earlier draft proposals are retired rather than retained as competing authorities. Publishing the specification does not establish PC0 or later acceptance.

**PC0 deliverables:** actual artifact×operation×surface inventory; domain owner map; grammar and normalized intent examples; strict family/action schema matrix; allowed relation and edge-payload contract; charter/module/Bug field decisions; MD projection/restore boundary; compatibility/deprecation plan; fully specified public fixtures and traceability matrix; ranked findings and explicitly decided residuals. No speculative methods or hidden acceptance. PC0 is read-only on implementation and canonical project state and stops for developer review.

## 9. Acceptance boundary

S5's published test-lifecycle report remains the evidence for S5, not a claim of postcondition completion. This postcondition is complete only when PC-J1–J10 pass on actual public interfaces, mature-state preservation/restart and all safety negatives are demonstrated, selected MCP succeeds with typed real actions, full deterministic regression/typecheck/build/clean checkout pass, and developer accepts the evidence. It enables consideration of S6 **only after** explicit authorization. Gate 5 cannot be marked accepted by relabeling this work. Preserve unrelated dirty files/Semantika state; no fabricated provider success or automatic stage advancement.
