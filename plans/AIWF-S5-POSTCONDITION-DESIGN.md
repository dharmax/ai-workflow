# AIWF — S5 Product Operability postcondition: design

**PC0 review draft, 2026-10-16.** Companion: [execution plan](AIWF-S5-POSTCONDITION-PLAN.md). Subordinate to the canonical Dharmax-way [design](AIWF-DHARMAX-WAY-DESIGN.md) and [plan](AIWF-DHARMAX-WAY-PLAN.md). This is the single active Product Operability specification. PC0 audited and refined the contract; developer acceptance is pending. Everything labelled **Target** below is a proposed implementation contract, not shipped behavior. PC1–PC5 are unexecuted. S5's accepted Story-test lifecycle stands independently; S6 remains unauthorized and Gate 5 remains open.

## 1. Audit basis and verdict

**Observed:** `git pull --ff-only origin master` returned already up to date at `ba148632407e37a327db16cc1832c375762948f3`; AIWF began clean on master. Read the canonical documents, both original postcondition documents, `docs/journeys.md`, S1–S5 evidence including S3's publication correction and S5's detailed report, then actual source and immediate callers. Historical reports are evidence for their recorded versions, not new executions of this baseline.

Canonical SQLite was inspected through a read-only connection and SQLite-consistent backup to `/tmp/aiwf-pc0-047p1mx7/.ai-workflow/state/graph.db`. AIWF symbol/source navigation, status and doctor used that disposable project, avoiding `ensureAstFresh()` writes to the canonical DB. Relevant DB snapshot facts: 82 Tickets, 54 Modules, 1 Goal, 2 Concepts, 0 Flows, 12 Features, 12 Stories, 4 Aspects, 0 Decisions, 3 Rules. `TKT-RF0W` (S4) and `TKT-7MI2` (S5) are both In Progress, unclaimed, with no incident relation between them in this snapshot. Do not infer a parent/child relationship. Gate 5 and its Semantika prerequisite are In Progress, unclaimed; Gate 5 has `depends_on` the prerequisite. Its body reports a blocker despite its lane. Preserve that discrepancy; neither a narrative report nor this audit changes canonical acceptance.

Semantika HEAD is `0d395ee2b2cef6a03a7cdee23b3a23fe9073e575`, with pre-existing changes in decisions/epics/modules projections, three source files, a batch test and untracked `aspects.md`. None was changed. AIWF resolves the installed `node_modules/@dharmax/semantika` distribution. Its SQLite batch and collection implementation hashes match the sibling's current dist: SQLite `7baf22575fdc8b180a49b14316d6c94998aedc2986f7a185837853a4aec74928`; collection `bd4bc32d2400bb9b45af07208413c349172f3e82cde045e2724a86841baf738e`. Checked installed declarations/implementation: public collection names, assertion-only entries, expected revision/absence, immediate atomic batch and rollback are available. This does not certify clean-build equivalence to the sibling's dirty source; no sibling build/install was run.

**Verdict:** the original proposal was not implementation-ready. The corrections below provide one reviewable contract. No-go for product acceptance or S6. PC1a is the only next implementation checkpoint; PC1b requires separate acceptance/authorization. External-agent approval/delegation policy in §10 remains an explicit decision before PC4 external-host write acceptance. PC0 performed no product implementation, canonical mutation, migration, commit or push. Disposable reproductions below are baseline diagnostics, not acceptance tests for proposed behavior.

### 1.1 Ranked findings and corrections

| Rank | Observed root cause / consequence | Required correction and owner |
| --- | --- | --- |
| Critical | `ticketState('Done')` maps to `verified`; `create_ticket`, `update_ticket_state`, Product mutations and `done` can reach that state without completion verification. In a fresh disposable project, `create_ticket({id:'T',title:'plain task',lane:'Done'})` with `executionAuthority:'read-only'` succeeded and incoming `verifies` was empty. | PC1 prevents new generic verified completion and read-only writes across legacy/new paths. Keep independent completion in existing Ticket verifier/store completion owner. Do not rewrite resolution (S6) or erase historical Done records. |
| Critical | `ToolRegistry.execute` validates schemas but has no general authority check. Legacy Product authoring calls the mutation adapter directly; `propose_decision` calls store upsert and sets accepted. Disposable read-only `propose_decision` persisted accepted `D`. | Canonical mutation admission must receive actual caller authority, cancellation and review context, not rely only on a new façade. Decision proposal becomes inert; accepted changes go through S2. Safety tightening is an intentional compatibility exception. |
| High | Existing relation snapshot fingerprints include endpoint/edge triples, not edge payload/revision; mutation schema has no payload. Broad whitelist includes owner-managed `verifies`. | Extend existing predicate-row snapshot/batch, with typed note payload and exact edge versions. Human `link` cannot mint proof or approve Story-test materialization. |
| High | “Existing owner to be decided” for charter, generic Module CRUD, and undefined lifecycle/field contracts leave competing designs. | One optional Product singleton, existing Module intent fields, typed Bug-on-Ticket, exact fields and relation modes in §§3–5. |
| High | CLI top-level switch, delegation parser and shell whitespace splitting diverge. Global `--help` masks scoped help. Invalid delegation can fall into Actor. | Extend the existing command parser once; shell adds lexical tokenization and missing-input facilitation only. Exact grammar/errors in §4. |
| High | `PUBLIC_MCP_TOOL_NAMES` omits registered `get_ticket`, Goal/Concept/Flow CRUD and all Story-test status/run tools. Schema conversion falls back to an empty object on failure. MCP context defaults to implicit write authority. | Strict family schemas and explicit compatibility mode; fail closed on schema conversion; host authority and approval must be real, not model-supplied strings (§6). |
| Medium | `recommend_next_task` takes first matching bug/fix title or ID, does not actually sort severity/priority or inspect prerequisites. Module health's “bugs” counts indexed Lesson notes; work grounding uses body substring heuristics. | Typed kind, dependency-aware deterministic recommendation; distinguish indexed notes, linked defect Tickets and unknown grounding. |
| Medium | Existing modules renderer queries containment using `m.path`, although indexed identity is `mod:<path>`; new export and automatic renderer would compete for one filename. | One modules renderer using canonical Module IDs. Generated intent sections survive subsequent legacy exports; explicit product export does not alter sync-state. |
| Medium | Blanket CRUD/retire and blanket “all surfaces” hide unsupported operations, Rule authority and evidence ownership. Catalog/search is unbounded and dedicated forms cover only three kinds. | Capability matrix, bounded lists/search, per-kind editing, deliberate exclusions, error/retry journeys and measured task results. |

### 1.2 Existing evidence and actual implementation boundaries

S1 proves explicit Story fields, identity-preserving legacy reads, accepted-only Aspect applicability. S2 proves inert proposals, reviewed conditional atomic Product batches and stale refusal. S3 proves real browser Feature/Story/Aspect editing and transport consistency; its first publication omitted `client.js`, corrected and verified in a pristine checkout. S4 proves manual reviewed work reconciliation/test materialization; model-backed proposal returned `authentication: User not found` and remains unqualified. S5 proves actual skipped → activated/not-run → expected-red → green/blocked/stale lifecycle through Workspace and the targeted runner. Its report records 490 pass / 5 opt-in skips / 0 fail, not a fresh PC0 run or Gate 5 release. No provider-backed acceptance was attempted here.

Actual owners reviewed include complete `artifactCommand` and facilitation; CLI/shell dispatch and Ticket command adapter; Product schema, `validateFields`, relation validation, whole `validateProductMutations`/`applyProductMutations` and change preview/apply branches; complete Ticket tool registration and state mapping; `ToolRegistry.execute`, MCP listing/call/schema generation; Workspace routes/client editors; Module/Goal/Decision descriptors; `indexSingleFile`/`removeFileFromIndex`; projection renderer/import branches; Aspect inheritance; structural coverage; Rule public tools and installed Semantika batch. Their contracts, not new parallel services, bound implementation.

## 2. Coverage inventory: artifact × operation × public surface

Codes: **P** public route exists; **I** internal registered/domain capability; **M** missing; **L** limited or misleading; **—** intentionally inapplicable. Public existence is source-observed unless a specific prior journey or PC0 probe is cited; it is not blanket qualification. `C/S/W/MCP` means CLI / interactive shell / Workspace / selected MCP. `J` is the advanced S2 Product JSON path, not convenient everyday UX. `R` means show/list; all lists still need scoped search/pagination. Future actions are in the final column; no unexplained cell means supported CRUD.

| Artifact | R/search C/S/W/MCP at baseline | Create / revise / retire at baseline | Relations, lifecycle, proof at baseline | Target public contract / owner |
| --- | --- | --- | --- | --- |
| Project init | P/P/—/— via init/setup | Scaffolds/indexes; no charter | Writes projections; not product consent | Retain init/setup, optional separate Product definition; `setup.ts` |
| Product charter | M/M/M/M | M/M/M | M | Optional singleton show/define/edit/retire; S2 + ontology/store |
| Goal | M/I/P/I | I or J / I or J / J physical delete | Typed relations I/J; no convenient CLI/MCP | Product goal list/show/search/new/edit/retire; Product tools/mutation |
| Concept | M/I/P/I | I or J / I or J / J physical delete | Same, no generic Concept impact qualification | Product concept, same operations/owner |
| Flow | M/I/P/I | I or J / I or J / J physical delete | Contains Story, serves Goal; no browser editor | Product flow, same operations/owner |
| Feature | P/P/P/P | I,J,W / I,J,W / J physical delete | enables; process, coverage/impact public | Product feature; retain process/coverage/impact specialized owners |
| UserStory | P/P/P/P | I,J,W / I,J,W / J physical delete | Complete fields/legacy review; S4/S5 in W/I, absent selected MCP | Product story; dedicated scenario form; tests in existing Story owner |
| Aspect | I/P/P/P | I,J,W / I,J,W / I,J | Accepted-only applicability and explicit inheritance P; impact incomplete | Product aspect; one policy body, link picker, existing applicability owner |
| Module | Graph/health P; no dedicated general editor | Indexer create; completeness only I; no intent editor | Identity/indexed containment; Aspect tags I/J | Arch module list/show/search/edit/retire intent only; indexer + S2 |
| File / Symbol | P/P/L/P source graph | Indexer/guarded source owner only | AST relations and governed anchors distinct | Read/navigation and guarded source change; generic CRUD/retire — |
| Epic | P/P/P/P | CLI/I/J / I/J / J delete | targets/contains; process public; limited W editing | Work epic list/show/search/new/edit/cancel; delivery status distinct |
| Ticket | P/P/P/P list; selected MCP lacks get | CLI/I/MCP/J / I/J / J delete | Leases, move/resolve public; unsafe generic verified transition | Work ticket definitions via S2; lifecycle via Ticket owner, no CRUD proof |
| Bug | M/M/M/M | M | Heuristic in next; indexed BUG note is a Lesson | Work bug is typed Ticket view/filter; same IDs, claim, state, verifier |
| Decision | Graph J/I/L/graph | `propose_decision` I immediately accepts; no reviewed editor | governs allowed I/J, no general edit/delete | Product decision list/show/search/new/edit/retire via S2; no implicit acceptance |
| Rule | P/P/M/P | Specialized preview/apply; removal in Rule pack | Scoped effective layers, pinned references, weakening consent | Keep RuleStore and rule tools/CLI; W read + specialist handoff; never generic Product CRUD |
| TestNode / Story execution | I/I/P/I (selected MCP missing) | S4 guarded materialization + separate linking | S5 actual runner/status; test code on disk | Verify story status/run, existing prepare/apply Story-test tools; no manual result editing |
| Verification Artifact / receipt | Graph/I/L/graph | Completion owner only for VERIFY IDs | Relation alone proves nothing | Verify ticket show/status with current receipt/missing/stale; no generic author/run |
| Idea | I/Actor/—/graph | Existing proposal/Idea owners; not Product editor | inspires supported | Inspect/search/link existing Ideas; full Idea editor deferred, no auto-promotion |
| Lesson / BUG note | Source graph/Actor | Indexer/knowledge owner | Source annotation, not Ticket defect | Read/navigation; conversion to Bug requires explicit new reviewed Ticket |
| Trace / CallSite / admission records | Diagnostic/source/internal | Owning runtime only | Not product authoring | No Product CRUD, no human link writes, diagnostic reads remain specialist |
| Governed relations | J/I/W limited picker/M | Internal link/unlink or J; no payload | Not all graph predicates authorable | One link contract (§5); incoming/outgoing and descriptor discovery |
| Projections / portable data | sync CLI/S, no portable restore | Existing imports/exports coupled | No product.md; modules health snapshot | Explicit one-way product export, shared module renderer; portable restore/removal stays S8 |

Target operations in this table are to become available through CLI and shell with the same normalized intent, and through typed MCP artifact/link/verify or retained specialist tools. Workspace PC4 provides forms for charter, Goal, Concept, Flow, Feature, Story, Aspect, Decision, Module intent, Epic, Ticket/Bug definitions, link review and verification reads/Story runs. Work claim/start/move/reopen/cancel actions use the same Ticket tools. Rule edits/reference approval, setup, source refactors and provider configuration remain specialist handoffs, not duplicate web implementations. Idea/trace internals are deliberate exclusions from dedicated forms, not unreported missing product functionality.

Cross-cutting operation inventory: exact-ID show, kind-filtered title/body search, list with lifecycle/kind/lane filters, incoming/outgoing relations, applicability and structural coverage/known impact, reviewed create/edit/retire or cancel, rejected/canceled/stale draft recovery, deliberate work derivation and test preparation, dependency/claim inspection, execution/status, exports. No entity merge, ID rename, arbitrary cascading delete, implicit flow ordering, automatic policy conflict oracle, generic proof editing or portable restore is promised by PC1–PC5. Explain the specialist route or unsupported reason in scoped help.

## 3. Final conceptual and field contracts — Target

### 3.1 Canonical ownership and common types

Use existing `graph/ontology.ts` descriptors, `WorkflowStore` and Semantika collections. `product/mutation.ts` owns typed definition validation and reviewed multi-record writes; Causal Change Engine owns S2 request/fingerprint/revalidation; Product tools own domain presentation; transports adapt them. No proposal table, command bus, second graph, approval database, Bug executor or parallel transaction manager.

Definitions use stable case-sensitive IDs, canonical positive record `version`, existing timestamps and `IntentStatus = draft | proposed | accepted | deprecated`. Nonblank required text means trimmed length > 0 while retaining authored text. Optional text/arrays can explicitly be cleared (`""` / `[]`); omission means retain on edit. Create requires title; edit requires identity and expected basis. Unknown/foreign fields fail, never strip. Read includes exact type, ID, version, definition status and observed evidence separately. No generic `metadata`, authority, version, createdAt, claim, lane or proof fields are authorable.

`new` creates only; edit updates only. Advanced multi-entity requests may create definitions and their approved links together in one S2 batch; ordinary single-object forms do not impose one commit per field. Generated IDs use existing per-kind conventions and collision checks; explicit ID optional except the Product singleton. No title-as-identity reuse. Creation defaults to draft; an explicit accepted definition requires human review, complete semantics and authorized commit. `retire` means status deprecated, preserving identity/edges/history; show dependents/affected current evidence before review. It is reversible via reviewed status edit. Ordinary UX has no physical delete. Existing advanced Product delete remains explicit dependent-checked for supported definitions; it cannot delete indexed anchors, Product singleton, work with history, tests, receipts, leases or admission records. No cascade.

Search/list: deterministic ID order, `query` literal casefold match on title/body (no regex/eval), kind plus applicable status/lane/kind filter, `limit` integer 1–100 default 25, opaque cursor bound to query and snapshot; invalid/stale cursor asks restart. Show relation counts and bounded expansion with continuation; do not return all code/source/tests by default. Casefold resolution is only a human ID convenience (§4), never DB identity or source-path matching.

| Kind | Authorable definition fields in addition to ID/title | Required meaning / owner-specific restrictions |
| --- | --- | --- |
| Product | `purpose:string`, `actors:string[]`, `scope:string`, `nonGoals:string[]`, `bounds:string`, `status:IntentStatus` | Accepted requires purpose, at least one actor and scope; arrays/bounds may explicitly be empty. Exact singleton below. |
| Goal / Concept | `body:string`, `status:IntentStatus` | Accepted requires nonblank body: desired outcome / domain meaning respectively. Preserve old accepted rows lacking body as needs-review; do not rewrite on read. |
| Flow | `body,actor,context:string`, `status:IntentStatus` | Accepted requires actor and body describing the significant journey; context optional. `contains` is membership, not ordered steps or a new flow engine. |
| Feature | `body:string`, `priority:number` finite, `acceptanceCriteria:string[]`, `status`, `completenessTarget` existing enum/null | Keep numeric priority, no new P0 mapping. Body states capability/scope; definition acceptance is not satisfaction. |
| UserStory | Existing `actor,intent,initialState,action,expectedResult,exceptions,bounds,story,context,sla:string`, `acceptanceCriteria:string[]`, `status`, `completenessTarget` | S1's complete accepted-scenario validation and legacy needs-review remain; optional legacy fields stay readable, not mandatory. No new Story format. |
| Aspect | `body:string`, `acceptanceCriteria:string[]`, `status` | One policy definition. Only accepted applies. No policy copied to consumers or auto semantic conflict winner. |
| Module intent | `body:string` (labelled Purpose), `responsibilities:string[]`, `boundaries:string`, `intentStatus:IntentStatus`, existing `completenessTarget` | Editing existing indexed Module only; acceptance requires purpose. `path`, ID, index status, source containment and indexed facts read-only. No duplicate `purpose`/`body` owner. |
| Epic | `body:string`, `priority:number` finite, existing `completenessTarget`, definition/planning status `draft|planned|active|cancelled` | `completed` read-only through delivery-owner validation; no mass Ticket transition. Cancel retains work, reports active children; never silently cancels them. |
| Ticket | `body:string`, `acceptanceCriteria:string[]`, `priority:P0|P1|P2|P3`, `kind:task|bug`, defect fields below | Create only Backlog/Todo (default Todo/planned). Definition edit cannot set state/proof/claim. Existing records without kind read as task, no mass rewrite. |
| Decision | `decision,context,consequences:string`, `status:IntentStatus` | Accepted requires decision; context/consequences may be empty. Preserve existing statuses as legacy where unknown. Inert proposal, exact reviewed revision acceptance. |
| Rule | Existing `rules/types.ts` / RuleStore pack, scope, importance, test, references, weakening controls | Not a member of generic writable definition fields. Preserve exact specialist schema and approvals. |

### 3.2 Optional Product singleton

Add **one justified entity descriptor `Product`**, fixed local ID `PRODUCT`, in the existing ontology/store. This distinct project charter has no suitable existing semantic owner: Goal is an outcome, Concept a meaning, Artifact an execution output, config operational settings. Overloading any of them would introduce hidden discrimination. No new persistence engine or package. Extend existing Product kind/schema/identity checks/admission protection narrowly for this descriptor.

One project root owns zero or one Product. Absent show returns `defined:false`, not not-found failure. `product define` is create-only; `product edit` requires it exists; `product retire` deprecates while retaining references. Init never fabricates it or refuses maintenance work because it is absent. Exact reserved ID collision with existing data blocks definition and reports the record; do not rename unrelated data. Product Goal/Concept references are **only** `Product contains Goal|Concept` edges, not parallel arrays of IDs. These are membership/reference, not destructive ownership or implicit policy inheritance. Unreferenced Goals/Concepts remain discoverable in “other definitions”. Product can be undefined/deprecated without deleting them. Aspect applies_to Product is a direct tag only.

### 3.3 Module intent and reindex

Retain existing path-keyed `mod:<resolveModulePath>` identity. `indexSingleFile` already gets an existing Module before creating one; it does not recreate its definition every run. Extend that owner, not a shadow ModuleIntent table. Indexer may create missing Module path/title/index status and maintain source facts; it never sets `body`, responsibilities, boundaries, intentStatus or governed links. Existing body remains visible with `intentStatus` undefined / needs-review until authored acceptance. Whole-row replacement that loses these fields is forbidden.

Reindex, file removal, restart and force index preserve Module intent and governed links. An empty/missing-source Module remains a readable intent anchor, with a computed missing-source indicator; do not silently transfer purpose after directory rename. A source/module rename creates or finds the new indexed identity; moving intent/links requires an explicit reviewed reconciliation, with both identities visible and conflict refusal. No automated Module rename/merge in this scope. Only indexed Modules can acquire intent here; planned non-source architecture modules are deferred, not fake indexed rows.

### 3.4 Bug on Ticket; work state

Add `kind?: 'task'|'bug'` to Ticket, legacy absent reads task. Bug is not a new entity, ID namespace requirement, table, queue, state machine or verifier. `work bug show` requires kind bug; `work ticket show` can show either, labelled correctly. Reclassification is explicit reviewed edit of the same Ticket; clear defect fields only by explicit review, keep historical proof references and invalidate current basis where changed. Title/ID/BUG note never classify automatically.

`defect` is a strict optional Ticket object: `reproduction?:string`, `expected?:string`, `actual?:string`, `severity?:critical|high|medium|low`, `impact?:string`, `environment?:string`, `evidence?:string[]`. Evidence entries are descriptive paths/URLs/references, not fetched/executed or acceptance receipts. Missing values display unknown, not fabricated text. Bug report can be partial; implementation readiness requires reproducible behavior or a concrete diagnostic acceptance contract. The latter may complete investigation, not claim a behavior fix. Existing Story links reuse `addresses`; Feature links use `implements` only when actual correction implements that capability; Module/File/Symbol context uses `targets`/`modifies` with their defined meaning. Do not add a catch-all Bug context relation.

Claim/release stay with existing lease owner. Start activates addressed Story tests through S5 **before** transition; partial source/DB activation retains S5 recovery. Move may target Backlog/Todo/Blocked/In Progress (start semantics for the last); reopening Done to Backlog/Todo is explicit with reason and preserves historical receipt while current status ceases verified. Cancel is explicit `Done/rejected` with reason, no successful verification claim. Verified completion is exclusively existing independent completion owner: Ticket + current VERIFY artifact + verifies atomic batch. `done` remains a compatibility spelling that reports a precise refusal and points to `resolve` when current independent completion has not occurred. It may report unchanged success for an already current verified completion. It does not gain an evidence-only execution mode (that is S6). No blind lane setter. Never run a provider just to make a grammar alias succeed.

`next`: default agent is configured current agent, not “any claim is mine”. Exclude Done, Backlog, Blocked, another active claimant, and any unmet/missing prerequisite (only Done/verified satisfies; rejected does not). Return blocked reasons if nothing actionable. Prefer this agent's eligible active In Progress lease; then other eligible In Progress; then Todo ordered by P0→P3 (unknown legacy priority treated P2, labelled), severity critical→low→unknown only to break equal priority among bugs, then createdAt and exact ID. Tasks have unknown severity; equal-priority bugs with known severity precede tasks. No title heuristic or hidden product/LLM ranking. Explain selected priority, blockers, claim and tie-break. Links/claims are rechecked when starting; recommendation is not a reservation.

### 3.5 Cross-cutting quality Aspect awareness — Target (not a new entity)

AIWF should **consider relevant classical software qualities when eliciting or revising product intent**, using its existing first-class Aspect, `applies_to`, `applicableAspects`, `assessAspects` and read-only `reviewMissingAspects` machinery. A quality is a **candidate**, not automatically a requirement, acceptance, link, Ticket, Test, score or universal Rule. Developer choice establishes a specific observable obligation and its exact scope; maintain one reusable canonical Aspect per actual distinct policy rather than duplicate text on every consumer. Technical-only work remains possible without an invented product charter or checklist ceremony.

The following is a **non-exhaustive prompt vocabulary**, grouped to reduce noise, not a compulsory set of persisted entities, enums, badges or automatically enforced checks:

| Concern family | Consider when materially relevant; example observable contract |
| --- | --- |
| Data persistence, integrity and lifecycle | durability, transactions, migrations, retention/deletion, backup/restore; saved state survives restart without corruption |
| Concurrency and consistency | competing users, async workers, races, ordering, idempotency, leases; concurrent writes cannot silently lose an accepted update |
| Identity / authentication | who or what is calling, session/credential lifecycle and trust origin; unauthenticated actors cannot impersonate users |
| Authorization / access control | which actor may perform which operation on which resource/scope; denied writes have no effect |
| Security, secrets and privacy | input/trust boundaries, encryption where required, least privilege, privacy/consent, minimization and secure defaults |
| Accountability / observability | structured logging, meaningful operational metrics, traces, audit/journal provenance, actionable alerts; avoid leaking secrets |
| Reliability, availability and recovery | timeouts, retries, degraded mode, rollback, disaster recovery and bounded self-healing; failure cannot become false success |
| Errors and exceptional flows | precise error classification, user-visible explanation, retry/recovery, cancellation and failed partial effects |
| Performance and resource economy | latency, throughput, memory, scale, budgets/cost/energy, only with contextual targets and measured baselines |
| User experience and inclusion | learnability, helpful defaults, accessibility, responsiveness, localization/i18n and consistent interaction |
| Configuration and personalization | useful controls, safe defaults, preference scope, migration and configuration provenance; not a second policy source |
| Delivery and operations | setup, packaging, deployment, upgrade, rollback, portability and operability in real environments |
| Interoperability and evolution | API/contracts, compatibility, schema evolution, supported platforms, offline/connectivity needs where relevant |
| Maintainability and verifiability | modularity, comprehensibility, testability, diagnosability, reproducibility and deterministic evidence |

**Assessment flow:** derive a short, context-sensitive candidate shortlist from developer intent and existing accepted Aspects → show why each matters, proposed scope, observable expected behavior/exception and known existing coverage → developer accepts/edits/rejects → only approved definitions/links use S2. No auto-acceptance, forced aspect per category, title/keyword-only applicability, automatic policy inheritance, fabricated coverage, or expensive autonomous review loop. Explicitly allow “not applicable” with a short reason where material. Existing Aspect inheritance/impact remains the actual authority; do not invent a general quality-score or a second applicability engine. A small inspectable candidate vocabulary may assist prompting but is not persisted as accepted project Aspects; manual selection/edit must remain usable if Laya/critic/provider is unavailable, and automatic recommendations then remain explicitly unqualified.

**Distinct mechanisms:** an Aspect says *what quality the product must deliver*; RuleStore says *how engineering work is constrained*; code/tests/evidence establish *what occurred*. Authentication establishes the caller's identity; authorization decides whether that identity may act. `am-i-allowed` is an existing external authorization library (actor/entity/operation taxonomy, roles/groups/context and pluggable store), a candidate for **actual AIWF permission evaluation**, not an authentication provider, approval receipt or replacement for S2 fingerprint/lease/Rule/verifier checks. AIWF does not currently depend on it. Before any new scoped-role/permission logic is built, examine its installed/public contract and test whether a minimal adapter to trusted caller context simplifies AIWF; do not add it just to repair PC1a's immediate read-only bypass or create a second policy store. The host must supply authenticated/attested actor identity and developer approval or bounded delegation; model-provided fields are never this evidence.

## 4. One compositional CLI and shell — Target

### 4.1 Grammar and normalization

```text
command := product [verb args] | topic subject verb args | topic:subject verb args
         | link-command | specialist-command | documented-shortcut
subject(product) := goal|concept|flow|feature|story|aspect|decision
subject(arch)    := module
subject(work)    := epic|ticket|bug
subject(verify)  := story|ticket
verb(definition):= help|list|show|new|edit|retire    # only legal kind combinations
verb(product singleton) := help|show|define|edit|retire|export
verb(module) := help|list|show|edit|retire          # retire intent, not indexed module
verb(work lifecycle) := claim|release|start|move|reopen|cancel|prepare|investigate|resolve
verb(verify story) := help|show|run
verb(verify ticket) := help|show                  # evidence read, not new verifier
```

Shared normalized intent is a **typed discriminated union**, e.g. `{family:'artifact',kind:'goal',action:'show',id:'G1'}` or `{family:'link',action:'preview_remove',sourceId:'E1',predicate:'targets',targetId:'S1'}`. Colon/space variants produce byte-equivalent intent before ID lookup. Extend `artifact-command.ts` as the single parser/adapter; existing lifecycle and Rule parsers remain specialized argument owners called once from it. Remove competing interpretation in CLI/shell for covered commands; no new command bus, registry per verb or separate execution choreography.

CLI receives OS argv; never join/re-split it. Shell lexes quote/backslash tokens once (single quotes literal, double quotes/backslash escapes; no variable expansion, command substitution or eval) then uses that parser. Retain raw input separately for genuine Actor wishes. Keyword/long-option/human-enum tokens normalize ASCII case-insensitively; short `-D` is removal, `-p` payload, `-h` help (`-d` is invalid, no dangerous casefold collision). Do not lowercase IDs, paths, symbols, payload keys or values/free text. Hyphenated long flags canonical; documented existing camel-case alias `--maxArtifacts` retained.

Exact canonical/local human ID wins; otherwise unique casefold match in the declared kind (link endpoints across supported kinds). Multiple matches fail with bounded candidates; create collision fails rather than casefold-renaming existing data. Source paths/test identities/symbol names require exact spelling, including in MCP. MCP IDs are exact by default; optional `idMatch:'human'` for show/link endpoint lookup explicitly requests the same convenience. Acceptance uses resolved exact IDs/version basis; never re-resolve to another entity on apply.

Unknown topic/subject/verb, missing required noninteractive argument, unknown/duplicate scalar flag or surplus positional tokens are errors. Explicit known prefixes, colon syntax and documented shortcuts never fall into Actor on failure. Help without arguments lists families; `product goal --help`, `product:goal help`, `help product goal` give identical scoped help without opening DB/provider. `--` stops option recognition; positional IDs may then begin `-`. Value flags consume one token, including strings beginning `-`; required values cannot silently consume another declared flag. Unmatched quotes/dangling escapes fail before execution. No abbreviation guessing.

Read operations need no consent. New/edit with missing fields on a terminal opens existing form/facilitation; noninteractive returns missing fields/usage and no writes. Flags name fields (`--title`, `--body`, `--initial-state`, repeated `--criterion`, `--responsibility`, etc. from the field descriptor); `--clear FIELD` clears supported optional text/array only, conflicts with setting it. Complex reviewed batch JSON remains an advanced S2 transport, not everyday input.

Definition and link writes **default to inert preview**. Interactive review displays exact diff, affected IDs/versions, policy/scope implications and accept/reject/cancel. CLI `--apply` explicitly authorizes only the exact user-supplied deterministic fields/edge operation in that invocation, after displaying that preview and rechecking it at commit. It cannot accept newly generated AI content, unrelated mutation batch or a refreshed stale preview. Replaying an already reviewed file continues to use existing `product-change accept <preview.json>`; JSON mode emits full preview for machines. MCP approval policy is §6/§10, not inherited from a model emitting `--apply`.

Preserve `epic E`, `epics`, `ticket T`, `tickets`, `feature F`, `features`, `story S`, `stories`, `bug B`, `bugs`, `next`, `resolve`, `prepare`, `investigate`, `process`, `claim`, `release`, `move`, `done`, `coverage`, `impact`, completeness and Rule commands. Old source/setup/config/Actor commands keep their specialized owners. `bug/bugs` are newly supported shortcuts, not claims that they work at baseline. No entity/verb multiplication in backend implementation.

### 4.2 Representative future usage

```sh
aiwf product show                        # undefined is a valid maintenance state
aiwf product define --title 'Avatar editor' --purpose 'Edit identity images' --actor 'Signed-in user' --scope 'Avatar editing' --apply
aiwf product:goal new --id G1 --title 'Keep the chosen image' --body 'Saved avatars survive reload'
aiwf PRODUCT GOAL show G1                 # same as product:goal show G1
aiwf product concept list --query persistence --limit 10
aiwf product flow edit FL1                # structured interactive form, then review
aiwf product:story edit S1 --expected-result 'Saved image remains after reload'
aiwf arch module edit mod:src/product --body 'Own reviewed product definitions' --responsibility 'Validate canonical edits'
aiwf work:bug new --title 'Save clears previous avatar' --expected 'Previous image retained on error' --actual 'Previous image lost'
aiwf bugs --lane Todo
aiwf bug TKT-123
aiwf epic E1
aiwf work ticket start TKT-123
aiwf next
aiwf resolve TKT-123                      # existing bounded resolution, not PC0 execution
aiwf verify:story show S1
aiwf verify story run S1                  # executes code, write/run authority required
aiwf verify ticket show TKT-123           # missing receipt remains missing
aiwf product decision edit ADR1
aiwf rule get engineering.kiss-simplicity # existing specialist grammar
aiwf product export                      # explicit one-way product.md + modules.md snapshots
```

Help shows only legal actions/fields, required fields for acceptance, default preview, explicit apply semantics, unsupported reasons, examples and specialist handoffs. Output/exit contract: success/read/preview/no-op 0, invalid/conflict/refused/apply failure 1, explicit needs_input/blocked operation 2; canceled review is reported canceled and never applied. Preserve legacy result keys; add structured status/errors rather than silent false success.

## 5. One governed link family — Target

### 5.1 Complete relation descriptor

Export the existing allowed Product triples as **one descriptor** used by Product validation, CLI help, MCP discovery and Workspace picker. Graph ontology remains broader; a registered predicate alone grants no authorship. Rows below enumerate the entire current whitelist plus five narrow triples (Product contains Goal, Product contains Concept, Aspect applies_to Product, Module serves Goal and Concept governs Module). `Bug` endpoints are Ticket. `Module/File/Symbol/Test` are UI aliases for actual indexed descriptor names. All directions are literal; no automatic reversal or inverse duplicate.

Modes: **H** human governed add/remove/note; **O** owner-managed, readable but manual mutation forbidden; **L** legacy readable/removable only. Existing O edges are preserved, not migrated/reclassified as H. Existing unlisted historical governed edges are visible with unsupported reason; no blanket unlink escape hatch.

| Source | Predicate | Allowed targets | Mode / exact meaning |
| --- | --- | --- | --- |
| Product (new) | contains | Goal, Concept | H: references top-level definitions; no cascade/inheritance |
| Aspect | applies_to | Idea, Goal, Concept, Flow, Module, Epic, Feature, UserStory, File, Symbol, Ticket, Test, Artifact; Product (new) | H: direct applicability; accepted Aspect required to become effective |
| Idea | inspires | Goal, Concept, Flow | H: provenance of intent |
| Goal | inspires | Concept | H: outcome motivates meaning |
| Flow | serves | Goal | H: journey serves outcome |
| Module (new) | serves | Goal | H: reviewed module purpose supports outcome |
| Concept | governs | Flow, UserStory, Feature, Epic, Ticket; Module (new) | H: explicit conceptual constraint; not automatic Rule inheritance |
| Flow | contains | UserStory | H: membership; no implied execution order |
| Feature | enables | UserStory | H: capability enables episode |
| Feature | contains | UserStory | L: unlink existing only; new authorship refused, no auto-conversion |
| Epic | targets | Goal, Concept, Flow, Feature, UserStory | H: delivery scope, no Aspect propagation |
| Epic | contains | Ticket | H: delivery grouping, no proof/state transition |
| Ticket | implements | Feature | H: implementation obligation |
| Ticket | addresses | UserStory, Aspect | H: behavioral/policy obligation |
| Ticket | targets | Module, File, Symbol | H: intended engineering scope |
| Ticket | modifies | File, Symbol | H: declared change obligation, **not** proof of actual file effect |
| Ticket | contains | Ticket | H: bounded child work |
| Ticket | depends_on | Ticket | H: source waits for target; no transitive execution authorization |
| Decision | governs | Aspect, Goal, Concept, Flow, Epic, Feature, UserStory, Ticket | H: explicit decision scope; accepted Decision only is authoritative |
| Test | verifies | Aspect, Ticket, Flow, Feature, UserStory | O: Story-test/review/index/evidence owners, never human proof minting |
| Artifact | verifies | Aspect, Ticket | O: existing assessment/completion owners, including protected VERIFY receipt |

All other triples are unsupported. In particular File imports/depends_on/calls, Symbol inherits/calls, Module contains File, File contains Symbol/Test/Lesson, trace links and runtime admission records are indexed/runtime-only. Rule scope remains RuleStore's typed scope, not a new Rule governs graph edge. No manually authored Test/Artifact verifies edge, including via old `link_product` or advanced Product JSON; their specialized trusted operation must prove its existing preconditions. Direct Aspect-to-Rule/Decision is unsupported (current whitelist excludes them); use the actual policy owners, no copied text.

Protected admission/VERIFY runtime records cannot be endpoints of human mutations, including otherwise valid Aspect tags; use their owning operation. Self-links fail. Ticket `contains` plus `depends_on` must stay acyclic across the full relevant existing closure and whole proposed batch; no cycle hidden through an untouched Ticket. A Ticket may belong to an Epic and parent Ticket without implied extra authorization. Other membership has no single-parent requirement; multiple Features can enable one Story and multiple Flows can contain it. Cyclic freeform rationale is not invented as executable dependency. Dangling endpoints, wrong kind/direction, retired source/target on new links and ambiguous IDs refuse. Existing deprecated links can be inspected/removed; retiring does not erase them. No graph inference creates accepted edges.

### 5.2 Human syntax, payload and edge state

```sh
aiwf link --allowed                       # includes H/O/L, meanings and payload schema
aiwf link --allowed Epic UserStory        # optional source/target kind filter
aiwf link E1                              # governed incoming + outgoing, paginated
aiwf link E1 --incoming --predicate targets --json
aiwf link E1 targets S1                    # preview ensure edge, no mutation
aiwf link E1 targets S1 --apply
aiwf link E1 targets S1 -D                 # preview remove edge only
aiwf link E1 targets S1 -D --apply
aiwf link E1 targets S1 -p note='Delivery scope' --apply
aiwf link E1 targets S1 -p '{"note":"Delivery scope"}' --apply
aiwf link E1 targets S1 -p '{}'            # preview explicit clearing of human payload
```

Only human payload is strict `{note?: string}`, note maximum 4000 characters for bounded rationale. Its content is uninterpreted text, never effective policy or executable code. No invented numeric weight use case: `weight`, confidence, state, timestamps, sourceRange, provenance and revision are system fields and rejected. Both agreed `-p` forms are supported: repeated `key=value` assignments or **one JSON object**. Split assignments at first `=` and retain all following text. Schema drives conversion: here note stays string, including `2`, `false`, `a=b`. JSON note must also be string; number/null/array/scalar fails. Unknown/case-mismatched keys, duplicate keys (including JSON duplicate members), prototype keys, mixed assignment/JSON modes, multiple JSON objects, malformed/trailing JSON and `-D` with payload fail before preview. Repeated assignments support future declared multi-field schemas; today repeating note is a duplicate-key error. `-p @file` is deliberately unsupported in this bounded scope; advanced S2 request files already provide transport, avoiding another path/read parser.

Presence of payload means **replace the entire human payload**, never merge an unknown key; omitted payload preserves it. `{}` clears note. System payload/provenance is preserved and never writable. Apply shows old/new note explicitly. Semantically identical payload is no-op; empty note normalizes to no note consistently in CLI/MCP/Workspace. No payload on O or L writes.

| Existing edge | Requested operation | Result |
| --- | --- | --- |
| Missing | add, no payload | Create one H edge with empty human payload |
| Missing | add with payload | Create one H edge with exact typed human payload |
| Present | add, no payload | No-op; preserve note/system fields/edge ID/version |
| Present | add with differing payload | Reviewed replacement on same edge ID, increment native row version once |
| Present | add with identical payload | No-op, no timestamp/version churn |
| Present | remove | Remove exactly that H/L edge; endpoints unchanged |
| Missing | remove | Explicit unchanged/no-op, not misleading removed |
| Duplicate physical rows for triple | any write | Conflict with row IDs/revisions; no arbitrary first-wins cleanup |
| O/indexed or unsupported | any write | Refuse with owning operation; no hidden force option |

Use existing Semantika predicate `_id`/`_version`, no parallel edge revision table. Snapshot includes endpoint types/versions, edge identity/version/existence and human/system payload required for the operation, sorted canonically. Fingerprint includes normalized request, basis and snapshot. Native conditional batch asserts old revision or absence and admission token. Removal followed by recreation cannot reuse an old preview (ABA); identity/version change is visible. Governance admission serializes allowed writers and protects absent-triple uniqueness; all compatibility writers use it. No-op still checks authority/freshness; it does not acquire a gratuitous new entity revision. Admission bookkeeping may change on attempted authorized commits; compare canonical product/evidence rows for rollback, whole DB for reject/cancel. Failed SQL batch leaves no partial accepted graph. Postcommit refresh/export failure is reported **committed with refresh/export failure**, not safe-to-repeat create.

Inspect shows literal source/target, direction relative to selected entity, endpoint kind/status, edge ID/version, human payload, authorship mode and available owning operation. `--incoming` and `--outgoing` together are invalid (default both); `--allowed` cannot combine with entity/write/payload/removal flags. Invalid extra operands/options fail. All previews and discovery are inert; cancellation/rejection writes nothing. Retain specialized exact AST navigation; indexed edges are not silently presented as human editable.

## 6. Strict MCP façade and discovery — Target

Use **two new family tools** `artifact` and `link`, plus one `verify` family for the presently missing S5/evidence reads and Story run. Keep existing specialized work/Rule/source/change operations; do **not** add a second `work` wrapper duplicating every lifecycle schema. A small façade is a division of responsibility, not a tool-count quota. Domain methods stay distinct. Legacy names remain advertised/callable during this postcondition, subject to the safety restrictions above; a compact selection is opt-in and uses the same tool definitions, not a second registry. No removal/deprecation deadline without measured parity and developer approval.

Every action is a strict object with `additionalProperties:false`, explicit required fields and finite enums; use discriminated unions, not optional-field soup or `{command,args:any}`. The table below is the normative schema definition: expand `K` into separate exact kind branches using §3 fields/filters; do not advertise an unrestricted `fields` map. Runtime and advertised JSON Schema must reject the same inputs. Root union schema must survive existing `withProjectRoot`; conversion failure prevents exposing the affected tool and reports diagnostic, never substitutes `{type:object}`.

Common optional transport field: `projectRoot:string` nonblank, resolved by host within authorized project roots; no tool-argument authority escalation. Common ID match only on lookup actions: `idMatch:'exact'|'human'` default exact. `ID` nonblank string; `Version` positive integer; request fingerprint 64 lowercase hex. IDs returned exact canonical spelling. Create requires collision refusal and does not use idMatch.

| Tool/action | Exact action fields beyond optional transport fields | Result / owner |
| --- | --- | --- |
| artifact `describe` | `kind:K` optional; absence returns compact kind/action index | Legal actions/required fields/enums/example, next relevant specialist, schemas only for requested kind |
| artifact `list` | `kind:K`, optional `query`, applicable typed `filter`, `limit`, `cursor` (§3) | Bounded summaries/continuation; no source dump |
| artifact `show` | `kind:K,id:ID` (Product id fixed/omittable), optional idMatch | Typed definition, version, separate review/evidence state, bounded relations |
| artifact `preview_new` | `kind:K,id?:ID,fields:CreateFields<K>` | Inert S2 request/fingerprint/diff/basis; only Product/Goal/Concept/Flow/Feature/UserStory/Aspect/Epic/Ticket/Bug/Decision; Product uses fixed ID |
| artifact `preview_edit` | `kind:K,id:ID,version:Version,fields:NonemptyEditFields<K>` | Same; Module intent only; no Ticket lane/proof/claim |
| artifact `preview_retire` | `kind:K,id:ID,version:Version` | Deprecated definition with dependent warning; only Product/Goal/Concept/Flow/Feature/Story/Aspect/Decision/Module intent. Work uses specialized cancel. |
| link `allowed` | Optional `sourceKind`, `targetKind` finite supported kind enums | Descriptor rows H/O/L, payload schema and owner |
| link `inspect` | `id:ID`, optional idMatch, `direction:incoming|outgoing|both` default both, `predicate` descriptor enum, limit/cursor | Literal edges and authorability, payload and revisions |
| link `preview_add` | `sourceId,predicate,targetId`, optional typed `{note?:string}` payload, optional idMatch | One S2 preview ensure/set edge; no separate payload tool/action |
| link `preview_remove` | `sourceId,predicate,targetId`, optional idMatch | S2 preview remove, no payload permitted |
| verify `describe` | Optional `kind:story|ticket` | Status semantics/required rights and specialist handoffs |
| verify `show` | `kind:story|ticket,id:ID`, optional idMatch | Story S5 status/basis or Ticket current receipt/missing/stale; no invented satisfaction |
| verify `run` | `kind:'story',id:ID`, optional idMatch | Actual existing `run_story_test`; run/write authority required; accepts no arbitrary command |

`K` for reads: Product, Goal, Concept, Flow, Feature, UserStory, Aspect, Module, Epic, Ticket, Bug, Decision, Idea. MCP kind enums use these exact spellings; CLI subject spellings map explicitly to them. Rule/source/Test/evidence use their specialist readers/verify. For write branches K is restricted by table actions and §3; Bug is Ticket with kind bug and required view consistency. Product absent returns defined:false. Read filter status is the selected kind's exact status enum; Ticket/Bug lane/priority/kind are work filters. Foreign fields on a branch fail (e.g. Module path or Ticket status). Do not make all enums optional strings to shrink JSON.

Keep `process_epic/feature/story`, prepare/apply Story-test, claim/release/start/move-compatible Ticket owners, prepare/investigate/resolve Ticket, `preview_change/apply_change`, Rule preview/apply, source navigation and tests. Retain existing `claim_ticket` (`ticketId`, optional `agentId`, positive finite `durationMinutes`) and `release_ticket` (`ticketId`) names with explicit caller ownership checks; claim uses configured current agent/default TTL, release refuses another active owner unless separately authorized. Extend existing `update_ticket_state` as a strict union: compatibility `{ticketId,lane,status?}` (coherent nonverified state only), `{action:'start',ticketId}`, `{action:'move',ticketId,lane:Backlog|Todo|Blocked|In Progress,reason?}`, `{action:'reopen',ticketId,lane:Backlog|Todo,reason:nonblank}`, `{action:'cancel',ticketId,reason:nonblank}`. No model-controlled proof/claim fields. Cancel/reopen use the existing Ticket state owner and original authority, not new tools per action. Epic cancel remains a reviewed Epic status edit. Existing resolution/preparation transport options keep their registered exact schemas; do not reimplement them in artifact fields. Expose missing S5 preparation/application through their existing strict schemas where needed; no universal registry enumeration. Compact help can name the next required specialized tool; all public tasks must be possible without hidden internal names. `get_ticket` remains supported through artifact show even while absent as legacy public tool.

Examples (future):

```json
{"tool":"artifact","arguments":{"action":"describe","kind":"Goal"}}
{"tool":"artifact","arguments":{"action":"preview_edit","kind":"Module","id":"mod:src/product","version":3,"fields":{"body":"Own reviewed intent"}}}
{"tool":"link","arguments":{"action":"allowed","sourceKind":"Epic","targetKind":"UserStory"}}
{"tool":"link","arguments":{"action":"preview_add","sourceId":"E1","predicate":"targets","targetId":"S1","payload":{"note":"Delivery scope"}}}
{"tool":"verify","arguments":{"action":"show","kind":"story","id":"S1"}}
```

Replies preserve existing domain payloads and include action status (`preview|applied|unchanged|rejected|cancelled|blocked|needs_input`), exact IDs/versions, bounded diff/basis/impact/warnings and structured errors with field path, code, expected shape, candidates/next action. Never infer applied from a preview or verified from accepted. Existing `apply_change({request,fingerprint,decision:'accept'})` is the only S2 acceptance transport; §10 requires real host approval for external-agent accepted intent. Reject/cancel need no write authority and remain inert. After an edit, re-preview and re-review; do not renew a stale imported fingerprint automatically.

**Measured baseline:** `buildMcpSchemas()` generated 50 advertised schemas including the wish tool, 138,373 UTF-8 bytes for `JSON.stringify(schemaFileMap)` (map contains pretty-printed schema strings). This is a reproducible local serialization metric, not a token bill or wire tools/list size. No live model usability score was fabricated. Baseline omits get_ticket, Goal readers, link_product and Story status/run. PC4/PC5 must measure actual tools/list bytes and action-schema validity through stdio, task completion, calls, wrong-call count and needed corrections against the legacy selection. Three families can still be worse than narrow tools if a host mishandles oneOf; measure the actual supported host. Do not delete specialist tools to meet a count goal. No provider-dependent claim is needed for deterministic discovery; actual agent trial remains explicitly unverified until run with an available authorized route.

## 7. Review, authority, freshness and safety — Target

**Binding implementation discipline (am-i-allowed tight / Prime Directive / Dharmax-way):** protect writes at existing canonical owners, not by relying on new façade-only checks; centralize actual authority/context admission while leaving specialized Ticket/Rule/Test/source invariants at their legitimate owners. Add no generic permission framework, alternate command bus, duplicated relation policy or implicit approval. A new abstraction must represent a missing domain concept or eliminate demonstrated duplication. Inspect complete changed methods and immediate callers; write public negative Story tests before fixing each observed root cause. Security hardening cannot be traded away for backward compatibility or passing counts. Split PC1 into PC1a safety and PC1b operability and accept each separately.

One definition/relation mutation path means both new interfaces and old helpers reach the same validator and conditional batch, with originating authority/signal/review context retained. It does not mean replacing RuleStore, source change, lease, Story-test or verifier safety owners with generic CRUD. Trusted internal owner-only operations use narrow capabilities from their existing calling operation, never a user-controlled `owner:true`/`force` field. Review snapshots and final batch assertions include all relevant definition/edge revisions. Source mutations retain current hash/dirty-file/rename/admission guards.

Prevent generic creates/updates from setting Ticket verified state, Test run fields/hashes, receipt identity/content or owner-managed evidence links. Initial Todo Ticket or reopening with addressed accepted Stories cannot bypass S5 materialization/activation/readiness. Product accepted status is definition approval only. Link scope changes show affected obligations and make stale evidence ineligible through existing current-basis checks; do not call this S7's full reverse-impact engine. Generic Module/Concept links do not automatically expand an Actor's leased change authority. Actual file effects remain independently attributed; authored modifies is not actual-effect proof.

Definition retirement/applicability removal can weaken obligations. Preview shows effective policy impact; governance admission prevents concurrent producer completion under changed policy. Preserve existing Rule weakening/reference checks. Disallow an agent from editing its own governing definitions or accepting its own generated proposal without developer authority. No new semantic contradiction oracle; show conflicting applicable policies and ask for actual resolution.

Failure classifications remain S5's uncovered/skipped/not-run/expected-red/green/blocked plus computed stale, Ticket operation blocked/needs_input versus lane, and unknown current receipt. No fabricated red history, provider success, aggregate Story satisfaction or Gate 5 acceptance. Current proof after reopen must use actual test/fixture/Story/Aspect basis; generic edge data cannot make it current. An already committed write with failed refresh/export is distinguishable from a rolled-back write; retry first reads exact identity, never blindly recreates it. No SQLite/filesystem atomicity claim.

## 8. One-way Markdown and pre-S8 compatibility — Target

`product export` explicitly renders root `product.md` and `modules.md`. Product output includes optional charter status/version, linked Goal/Concept definitions, other unlinked definitions, Flow/Feature/Story/Aspect summaries and exact references; accepted definitions are distinguished from draft/proposed/deprecated and execution unknown/stale. No giant source dump, credentials or generated acceptance checkmarks. Stable ID ordering and deterministic text make snapshots reviewable; source record versions identify freshness without a changing wall-clock stamp. Both formats identify themselves as generated snapshots and name canonical edit commands.

There is **one modules renderer** at the existing projection owner. Extend it with reviewed purpose/responsibilities/boundaries/intent status/version, explicit Goal/Concept/Aspect links and source/health sections. Existing automatic export calls continue to invoke that same renderer until S8, so they cannot erase newly exported intent. This is the narrow necessary exception to “only explicit export”: modules.md is already automatic; product.md is new and explicit only. Do not add a second exporter competing for modules.md or an implicit product.md writer.

Observed importProjections has no modules import branch. Keep it that way for new intent sections; product.md is also never imported. Preserve current supported kanban/epic/feature/story/Decision/Aspect legacy import/export behavior and triggers; do not add new implicit coupling or claim live sync retired. Explicit product export calls the renderers directly, never importProjections or the aggregate exporter that updates sync-state timestamps. It must not mark unrelated edited projections as synchronized. Legacy imports remain a compatibility boundary and must obey canonical safety validation for accepted definitions/work, without pretending S8 migration happened.

Output collision: existing unmarked product.md is user content, refuse with an alternate `--output-dir` instruction. Known legacy generated modules.md is compatible; hand-authored/conflicting content requires explicit overwrite consent. Write review identifies exact paths/hashes; recheck before overwrite, refuse path traversal/symlink escape/nonregular targets. Render in memory, write each file via temporary file + rename, report each outcome; two filesystem files are not one SQLite transaction. Failed export changes no canonical entities and preserves prior file content where replacement failed. Git/projections are not backups of the ignored canonical DB. Portable JSON import/restore, sync retirement and destructive removal remain S8 with independent restore proof and explicit approval.

Correct modules dependency rendering to use canonical Module IDs, not m.path; distinguish indexed BUG/FIXME notes from linked Bug Ticket count and unlinked/unknown work. Do not publish substring heuristics as causal ownership. Changes outside that directly affected renderer/health contract should be recorded and deferred.

## 9. Journey → operation → owner → proof

All listed test locations prefixed `tests/product-operability-*` are **planned**, not existing/running. Existing suites are regressions, not substitutes. Fixtures use temporary real projects with reopened SQLite, tracked source/Story tests and exact public transports; no direct DB setup as a substitute for user actions. SQL failure injection is a justified internal invariant test inside an actual reviewed public journey.

| Journey | Initial state / public action / observable result | Actual owner and realistic acceptance location |
| --- | --- | --- |
| PC-J1 fresh + maintenance | Empty repo: init, product show undefined, define optional charter, create Goal/Concept/Aspect, link, reject/cancel a proposal, reopen. Parallel maintenance repo creates technical Todo Ticket with no Product/Story. Exact definitions persist only after approval. | setup, S2 mutation/ontology; `tests/product-operability-definition.test.ts`, actual CLI and Workspace |
| PC-J2 Module purpose | Indexed module; arch module edit, Concept governs Module/Module serves Goal/Aspect applies_to Module; inspect both endpoints, force index, delete last file, reopen. Intent survives; renamed directory does not silently receive it. | indexSingleFile/removeFile, Module descriptor, mutation; definition suite + CLI/index/reopen |
| PC-J3 normal evolution | Accepted Feature + Flow and complete Story; Feature enables Story, Flow contains Story; actual process manual proposal review reuses IDs; existing S4 test prepare/apply then S5 status. Repeat/reject stays inert; unavailable model remains unqualified. | process/context/apply/story-tests, Workspace; `tests/dharmax-s4.test.ts`, `tests/dharmax-s5.test.ts` plus definition suite |
| PC-J4 governed links | CLI allowed/inspect/add/remove, both payload forms and typed MCP preview + host review; reopen exact edge/payload. Include every descriptor row as allowed H or owner-only O, inverse endpoint errors, L unlink. | mutation + change engine + shared descriptor; `tests/product-operability-links.test.ts`, actual CLI/stdio/W link picker |
| PC-J5 defect | Existing Story with failing public behavior; report partial Bug, complete reproduction/expected/actual, filter/show shortcuts, link, next, claim/start, real S5 reproduction and governed fixture fix, independent evidence inspection. No provider required to prove UX; autonomous resolution remains S6. | Ticket tools/state/leases, S5, existing verifier; `tests/product-operability-work.test.ts` plus S5 fixture; fake Done/receipt attempts fail |
| PC-J6 grammar/help/IDs | Same argv/string tokens with colon/space and keyword case; quote/escape/-- paths, note with spaces/equals, exact/unique/colliding IDs. Scoped help matches legal action. Unknown explicit syntax never invokes Actor. | artifact-command + shell lexer/facilitation + CLI; `tests/product-operability-commands.test.ts`, executable CLI and shell processShellInput |
| PC-J7 mature data | Copy consistent mature fixture with legacy accepted Stories, Feature contains edges, claim, Done/receipt and Module body. Read/edit ordinary field/reopen; no silent classification, policy, lane, version or intent acceptance changes. Explicit retire/reopen preserves history. | store/mutation/projections/state; definition/work suites; raw snapshot comparison supplements public reads |
| PC-J8 parity | One approved charter/Goal/Module/Bug/link operation in CLI; shell modifies note; browser sees/edit/reviews; typed MCP sees same versions. Stale second editor, canceled and SQL-failed commit cannot partially apply. | all adapters → S2; `tests/product-operability-parity.test.ts`, real browser/stdio/shell/CLI |
| PC-J9 safety | Read-only/aborted actor tries old and new definition tools, Product JSON Done and proof link, source secondary edit, Rule weakening, stale preview, admission conflict, failing exception. Refusal preserves canonical graph and unrelated source. | change/registry/mutation/Ticket verifier/RuleStore; work/links suites + doctrine-scope, doctrine-management, S1–S5 regressions |
| PC-J10 everyday usability | Human and configured coding agent independently discover define→relate→revise→report Bug→inspect proof, no raw DB/eval/handmade JSON/internal tool names. Record complete action/call counts, errors, bytes and time with comparable fixtures. | actual help/forms/MCP tools/list; parity suite plus recorded human/agent transcript, not a mock agent score |

Additional everyday cases are mandatory within those suites: (a) misspelled/ambiguous search and no results; paginate a large catalog without losing selection/drafts; (b) deprecate/restore an unused Goal and refuse physical deletion with dependents; (c) remove/restore a direct Aspect and display changed obligations without rewriting consumers; (d) cancel/reopen/reclassify a Bug and inspect blocked/missing prerequisite; (e) interrupted review with retained draft, edited preview invalidation, duplicate click and committed-but-refresh-failed recovery; (f) approved Decision revision plus existing Rule-layer/reference read, refused agent self-weakening; (g) explicit export collision and write failure with legacy sync afterward retaining Module intent; (h) inaccessible/unauthorized projectRoot, unsupported edge, missing source target, test fixture unavailable; (i) no provider or Actor call for deterministic CRUD/discovery; (j) context-sensitive Aspect review proposes persistence/concurrency/error or access-control obligations only where material, reuses an existing definition when appropriate, preserves rejected/not-applicable decisions and never auto-accepts or fabricates evidence. Accessibility: keyboard-only form/review, focus/error labels, visible unknown/empty states. These are ordinary operability, not an extra runtime subsystem.

## 10. Developer decision still required

**D1 — Accepted Product edits from external agents. Recommendation:** default external-agent product-definition calls to proposal/read authority; the existing host/user review UI authorizes an exact fingerprint, or the developer explicitly delegates a bounded deterministic edit scope for the session. The MCP `decision:'accept'` argument is necessary review data but is never evidence that a human actually approved. Work execution/leases can retain their existing separately authorized routes.

Alternative: treat every trusted stdio MCP caller as already delegated project-write authority. This preserves current behavior and reduces prompts, but permits an agent to accept its own product/governance changes. Do not claim developer review is enforced under that policy. No remote identity/signature/approval service is proposed. `am-i-allowed` may be evaluated as a narrowly scoped authorization policy engine (not an authentication or host-approval service) if a real delegation requirement justifies it; first verify its public API and avoid competing policy stores. Use existing host authority/context and review flow; if a host cannot supply approval or bounded delegation, return preview/review_required rather than invent a receipt. **Unresolved until developer chooses the trust policy.** PC1 may prove domain refusal/context propagation on controlled hosts, but PC4 external-host acceptance is blocked on this decision. All other architecture choices above form one recommended contract for review, not parallel options.

## 11. Acceptance and stop

Implementation must prove current public journeys, negative contracts, mature-state preservation, serialized full deterministic suite, typecheck/build, actual stdio/browser/shell behavior and tracked-input pristine-checkout validation. Report opt-in/provider skips explicitly. Independent review must assess whole changed methods/immediate callers and actual UX, not raw test counts. PC5 evidence and developer acceptance are required before considering S6 under fresh authorization. Do not alter Gate 5, fabricate canonical closure, remove legacy projections or treat this PC0 document revision as product acceptance.
