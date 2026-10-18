# AIWF external semantic interface — prioritized issue seed

Status: user-approved issue-ingestion brief, NOT approval to implement the issues. Prepared 2026-10-18 against AIWF master 59fd50a6ec0fb9167c40517df4894abd29082a9a. The live Google Doc remains the discussion/design record:
https://docs.google.com/document/d/1qieBfgOo_5oxviYyRWWSK61UQUvrq12xfrfm3nvoEUs/edit

## Purpose and precedence

Populate AIWF's OWN canonical Ticket graph from these briefs, reusing existing matching Tickets and creating only missing ones. This file is a one-time import specification, not another backlog/database. After ingestion the canonical Ticket IDs and state are authoritative. Do not turn these into GitHub Issues, change ai-cli, create a branch forest, or start implementing the roadmap as part of ingestion.

The user's delivery priority is deliberate:
1. FIRST: adapt already-implemented capabilities to the agreed semantics. The expectation of roughly 80% reuse is a hypothesis, not a measured claim. Verify the actual owner before estimating or changing code. Favor a thin public façade, shared command normalization, and reuse of existing safety, registry, graph, language and test machinery.
2. SECOND: implement only genuinely missing, crucial capabilities that block ordinary safe usage. Any governance bypass encountered while exposing existing mutations is a prerequisite BUG, not optional polish.
3. OTHER GAPS: keep explicit Bug/Backlog Tickets, but do not start them without an observed dependency or subsequent authorization. Broad V2 interface tables describe a possible target, not a 36-tool or 100-operation checklist.

## Ingestion contract

- Read skills/ai-workflow/SKILL.md, current canonical design/plan and the actual graph before modifying Ticket state. Search by meaning, scope, owner and source marker; do not use title-only identity.
- Stable marker for each issue is EXT-SURFACE-NN below. Keep the marker in Ticket body for repeatable idempotent imports, along with this seed path and the observed source basis. On a matching existing Ticket, reconcile its description and acceptance without wiping prior work, evidence, claim, links or status. If a match is ambiguous, report candidates and do not create a duplicate.
- Create only missing canonical Tickets through AIWF's governed public operations (not GitHub Issues, raw SQL, projection Markdown, or private database mutation). All newly created Tickets start Backlog; use Ticket kind task or bug as indicated. Suggested priorities below are AIWF P0/P1/P2/P3, not a request to enter In Progress.
- The user authorizes this bounded Backlog Ticket ingestion, not Product acceptance, Rule weakening, source mutation, execution, self-certification or automatic ticket resolution. If a host's review step is required, return its actual preview and use real host authorization; do not manufacture an approval flag.
- Link to an appropriate existing Epic if unambiguous; otherwise leave ungrouped instead of inventing a new hierarchy. Retain current active checkpoint ownership. No implementation during this ingestion run.
- For each brief return CREATED / UPDATED EXISTING / ALREADY COVERED / BLOCKED with actual Ticket ID, actual lane, and exact reason. Do not invent IDs or report a Ticket as created based on a prose plan. End with counts, unresolved ambiguity and the next minimal active slice.

## Acceptance shared by all active interface tasks

A real operation through the executable CLI, once-lexed interactive shell and stdio MCP must reach the SAME domain owner and return consistent canonical ID/version, authoritative status and actual evidence. Test a representative denied/stale/cancel or read-only negative for mutations, restart/reopen for authored persistence, precise failure classification, and a real external-agent tool-selection trial. Measure published tools/list bytes and wrong/repeated tool calls. Green parser-only/unit tests or merely adding names to PUBLIC_MCP_TOOL_NAMES do not establish acceptance. Do not expose a branch for a capability that is not implemented.

## First priority — REUSE/ADAPT existing implementation (sequence of small slices)

### EXT-SURFACE-01 — Compact semantic MCP adapter
Kind: task. Suggested priority: P1. Existing owners: src/tools/index.ts, registry.ts, surface.ts, mcp.ts.
Deliver a measured, typed, small default MCP interface representing EXISTING operations (agent/project, artifact, product, flow/ticket, test, source/change, link/rule and knowledge as applicable). Dotted names are flat MCP names; finite action/kind schemas and descriptions provide topic/subtopic meaning. One registry, no duplicate domain logic; legacy compatibility is opt-in and still subject to safety. Start with owner inventory in the Ticket, not a speculative wholesale rewrite.
Accept: real tools/list/call succeeds and advertised schemas match executable actions; real agent chooses appropriate operations with fewer gratuitous disclosures; no bypass writer is exposed. Avoid one giant unmanageable union and avoid one-tool-per-internal-method.

### EXT-SURFACE-02 — CLI and shell semantic parity
Kind: task. Priority: P1. Existing owner: src/artifact-command.ts / shared Commander command tree.
Normalize one parser for topic[:subtopic] verb and approved space equivalents. Shell omits the aiwf binary prefix. Keep ergonomic ticket ID verb syntax. Change unlink to exactly: unlink PREDICATE from A to B. Keep existing aliases only where safe and unambiguous; preserve quoting, explicit help and typed argument checking.
Accept: same realistic commands and failures work via CLI and shell and map to same typed domain intent, without divergent regex parsers or automatic consent.

### EXT-SURFACE-03 — One public Product Manifest and existing definitions
Kind: task. Priority: P1. Existing owners: Product singleton, product/manifest.ts, product/mutation.ts, product/links.ts and current product tools.
Combine 'Charter' and 'Manifest' in the PUBLIC vocabulary: product manifest show/define/edit/export, including canonical membership, linked/unlinked Feature/Goal/Concept visibility, and existing reviewed definition operations. Internally retain one canonical Product entity, reviewed relations and generated product-manifest.md; do NOT make Markdown a second editable store. Retire means reviewed deprecation, not rejecting a preview.
Accept: same identity/revision after edit/reopen; no duplicate definitions or independent manifest copy; actual reviewed membership; stale/rejected write has no effect. Governance blocker EXT-SURFACE-10 is a prerequisite to exposing mutators.

### EXT-SURFACE-04 — Architecture Manifest from existing Module state
Kind: task. Priority: P1. Existing owners: ModuleNode, indexer and modules.md projection.
Use one arch manifest view over existing indexed Modules, their authored purpose/responsibilities/boundaries and observed structure; simple arch:module show/edit intent. Do not create a new Module-manifest entity/store or rewrite indexed path/containment via generic CRUD.
Accept: show/export coherent architecture meaning; reviewed Module intent survives changed-file reindex and reopen without changing source-derived facts.

### EXT-SURFACE-05 — Flow planning and practical Ticket verbs
Kind: task. Priority: P1. Existing owners: product/process.ts and Ticket investigate/prepare/resolve/lease/state/list/next.
Expose 'flow plan SOURCE' as the single public verb for deriving/reconciling reviewed work from new OR changed accepted intent, reusing existing process machinery; proposal remains inert. Expose only already-supported ticket ID show/status/investigate/prepare/resolve/claim/release/lifecycle and next-task operations. Do not create a competing workflow engine or implement all aspirational Ticket verbs.
Accept: existing work is reused, no duplicate Ticket/Story or auto-accept; 'ticket ID resolve' reaches the existing bounded executor and truthfully reports evidence and blockers.

### EXT-SURFACE-06 — Test/status/evidence façade
Kind: task. Priority: P1. Existing owners: current Story test prepare/apply/status/run, test-runner and Ticket verification.
Expose the existing test lifecycle through one coherent 'test' family. Include materialization/review, status, lawful skip/activation, targeted run and actual evidence where supported. Do not introduce generic writes of pass/Verified or a second runner.
Accept: real public Story test path reports executable fixture, skipped/red/green/unknown and current proof accurately; missing fixture and provider failure do not become green.

### EXT-SURFACE-07 — Source navigation and governed change façade
Kind: task. Priority: P1. Existing owners: graph queries, TS/LSP source slices, blast radius and Causal Change Engine.
Expose existing find/outline/source/callers/references/dependency/blast and preview/apply as useful file/symbol semantics. Preserve exact targets, fingerprint, scope and source edit governance. Do not promise extract/inline or high-level improvement algorithms in this slice.
Accept: source-dependent read auto-freshens when necessary; a guarded exact change is reviewed and yields observable actual code/test outcome; unsupported operations are not advertised.

### EXT-SURFACE-08 — Existing Link and Rule ergonomics
Kind: task. Priority: P1. Existing owners: PRODUCT_RELATIONS, product/links.ts, RuleStore and Rule tools.
Use central finite typed predicate/endpoint authorability; expose direct link/unlink verbs and supported note payload (including omitted vs explicit clear). Hidden governed preview/apply is still mandatory when authority requires it. Rule operations stay specialized and cannot be modified through generic artifact fields.
Accept: 'link A to B as PREDICATE --note ...' and 'unlink PREDICATE from A to B' preserve reviewed, versioned edge semantics; invalid triple, denied mutation and Rule weakening fail closed.

### EXT-SURFACE-09 — Existing artifact, knowledge and project/agent read semantics
Kind: task. Priority: P1. Existing owners: graph/ontology, search_graph, kb.ts, current diagnostics/metrics.
Expose a typed cross-kind artifact show/find/links for actually indexed kinds (including file/class/symbol); Knowledge find/show/skill discovery reuses current KnowledgeBaseClient and SkillManager; distinguish existing observed agent and project status/doctor/metrics without fabricating missing telemetry. Include scoped help/describe. Do not implement universal memory or tagging persistence here.
Accept: typed references resolve current owners and remain distinct from generic CRUD authority; results are bounded; 'not found' vs unavailable index/scope is truthful. If dedicated agent/project counters do not exist, explicitly defer them.

## Second priority — only crucial missing functionality

### EXT-SURFACE-10 — BUG: close public Product mutation authority bypass
Kind: bug. Priority: P0, prerequisite to ANY exposed Product/Link writing, including EXT-SURFACE-03 and -08.
Observed: direct public writers including define_product/update_product use applyProductMutations independently of the separately available S2 preview/apply review boundary. Investigate actual host execution context and full direct callers first; patch at the canonical owner, not a cosmetic tool allowlist.
Accept: external agent/read-only, reject/cancel, stale expected-version/fingerprint and invalid relation do NOT persist partial canonical changes, including via legacy adapters. Real host-owned authorized review applies once. Keep existing S2, no shadow permission/review system.

### EXT-SURFACE-11 — Crucial SkillManager passthrough
Kind: task. Priority: P1. Existing AIWF kb.ts only surfaces search/get/find_skills; @dharmax/skill-manager already documents create, import, review, retrieve, activate and isolated test/demonstrate.
Expose the minimum essential knowledge:skill find/show/create/review/test/activate actions by calling REAL installed SkillManager APIs/CLI behind current execution authority; reuse its configured SkillAuthor/compiler and isolation. Do not implement another skill registry, generator, sandbox or fictional API.
Accept: actual skill generated in configured writable source, reviewed, tested through real isolation and discoverable/activatable after restart; malformed/unconfigured provider fails precisely without registering a fake skill. Import/sync/run breadth can remain backlog.

### EXT-SURFACE-12 — BUG: do not advertise unreliable authored-state recovery
Kind: bug. Priority: P1 WHEN recovery is part of the active public cut; otherwise Backlog with project restore hidden/unavailable.
Observed: product/manifest.ts restoreAuthoredState currently writes entities and relations sequentially. Sync already exports authored snapshot; restore completeness/transactionality is not established by export alone.
Fix only the demonstrated gap in the existing store/manifest owner using supported Semantika batch capabilities. Validate schema, identities, all endpoints, conflict policy and rollback/failure before claiming recovery. Never treat live SQLite DB/WAL as the portable source.
Accept: valid fresh-project restore retains canonical authored IDs, links and module intent; corrupted/missing relation or injected failure leaves original coherent state; project export/sync reports failures truthfully. Do not expand into wholesale S8 portability work.

## Deferred BUG/BACKLOG tickets — create, but do not execute now

### EXT-SURFACE-13 — Ticket deliberation and rich editing
Kind: task. Priority: P2. Add bounded interactive view/deliberate, elaborate/refine/simplify, rich external dossier and precise assess; decide promote/demote meaning with user before implementing. Accept: existing ID reused, provenance/evidence/unknowns preserved, proposal remains inert.

### EXT-SURFACE-14 — Observation and RFC semantics
Kind: task. Priority: P2. Decide whether these warrant first-class canonical kinds or authorized reuse of existing types. Observation requires source/time/provenance plus searchable and act-on-able tags; selecting a tagged item does not grant authority to act. RFC review is not a disguised Ticket. Accept one real end-to-end user Story before schema changes.

### EXT-SURFACE-15 — Higher-level source improvements/refactoring
Kind: task. Priority: P2. Add per-file/symbol enhance, simplify, test, observe and further safe extract/inline/move support only after provider capability inventory. Guard each proposed change, test real output, keep unsupported languages honest; test uses the existing test owner, observe instrumentation requires source review.

### EXT-SURFACE-16 — Scoped knowledge memory and cross-kind tags
Kind: task. Priority: P2. Investigate existing Semantika tags and knowledge owner before adding scoped remember/revise/forget and artifact tag/untag/search/actions with provenance/version. No new tag DB and forgetting an authored note must not destroy source/history. A small needed subset may be promoted only by observed active-slice dependency.

### EXT-SURFACE-17 — Extended test-management ergonomics
Kind: task. Priority: P2. Rich test-case edit/skip/unskip/run history, result observation and UI coverage beyond already-supported Story test operations. Acceptance: correct lifecycle and current evidence; never manually assert pass.

### EXT-SURFACE-18 — Dedicated agent/project/flow metrics and Workspace polish
Kind: task. Priority: P2. Build distinct measured views over existing telemetry, plus Workspace parity only after common typed contract settles. No duplicate counters or ungrounded dashboard figures.

### EXT-SURFACE-19 — Advanced Git, publication and portability
Kind: task. Priority: P2. Add useful Git checkpoint/summary/assisted stage/commit/push and fuller portability only under explicit per-action authority and verified export inputs. No implicit push; never stage secrets or live SQLite/WAL/cache. Reconcile against the existing canonical S8 plan rather than opening a parallel project.

### EXT-SURFACE-20 — Additional skill lifecycle and surface breadth
Kind: task. Priority: P2. Import/sync/demonstrate/run and other optional V2 adapters only when an actual workflow needs them. Measure real external agent outcomes, not a 36-tool completeness checklist. Keep one SkillManager and one registry.

### EXT-SURFACE-21 — Existing sync Module drift, if still unresolved
Kind: bug. Priority: P2. Search for existing TKT-BUG-SYNC-MODULE-DRIFT or equivalent and UPDATE it, do not duplicate. Verify whether repeated sync without source changes incorrectly changes indexed Module symbol counts; only keep open if reproduced at current master. If fixed, retain historical evidence without reopening it.

## Execution order (not an authorization to execute)

Ingest/deduplicate ALL markers first, as Backlog. Choose the smallest approved Priority 1 read-only façade slice, address EXT-SURFACE-10 before any public writes, then complete the remaining reuse-driven slices by their actual dependencies. Add EXT-SURFACE-11 after the basic Knowledge adapter. EXT-SURFACE-12 is a hard gate to advertising project restore. Defer -13 through -21 unless specifically authorized or they block a real acceptance Story. Keep master clean; merge/delete any temporary branch at first stable opportunity if a branch is genuinely necessary.

Ingestion completion report: repository+seed SHA, exact canonical IDs/statuses for each marker, mapping to reused pre-existing Tickets, ambiguous/blocked cases, and a 3–5 line proposed FIRST implementation slice. Do not claim tests, implementations or backlog creation that did not actually happen.
