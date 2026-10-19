# AIWF — Usable v1 release: three-iteration execution plan

**Planning baseline:** `dharmax/ai-workflow` remote `master` at `72d052a` (recheck HEAD at execution).  
**Purpose:** Make packed/public AIWF useful in a *different real repository* for reviewed Product intent through AIWF-native independently verified Ticket resolution, without a misleading Kanban.  
**Status:** Proposed integrated release handoff, for developer approval. This file does not mutate the canonical Ticket graph or itself authorize a Done/VERIFY transition. It is subordinate to `plans/AIWF-DHARMAX-WAY-{DESIGN,PLAN}.md`, `plans/AIWF-S5-POSTCONDITION-{DESIGN,PLAN}.md` and existing Gate 5/S1–S5/resolution contracts, not a replacement architecture. Prior audits: `docs/ext-surface-10-authority-2026-10-18.md`; deferred ideas: `plans/AIWF-FUTURE-INGESTION-SEED.md`.

## 1. One finish line

In a separately initialized, tracked project, through public AIWF surfaces rather than manual SQLite or hand-built internal JSON, a person can:

1. Define/review an optional canonical Product Manifest, Goal/Concept, minimal enduring Feature **responsibility**, and relevant Aspect/Rule; Product absence must not prevent technical maintenance.
2. Define a Flow *where useful* and complete User/Actor Story (Actor, Intent, Initial State, Action, observable Result, exceptions/bounds); preview/review/accept exact versions. Existing functionality is revised in place, not duplicated. Critic/proposal is not approval.
3. Derive/reconcile the necessary Epic/Tickets from accepted meaning, with exact responsibility/relations and applied obligations, and review a genuine public-interface Story test. Missing test = uncovered; materialized but unstarted = skipped; activation must establish an actual attributable expected red, not a bad fixture/provider.
4. Have **AIWF's own `Ticket.resolve`** investigate/claim, navigate exact source, make governed code change, rerun tests, check applicable Aspects and effective Rules, independently verify current acceptance, produce the existing coherent receipt/Done, release the lease, survive restart. Codex/AGY may repair *AIWF*; they may not substitute an edit in the target repository for this journey.
5. Report/inspect/prioritize and actually correct a typed **Bug** modifying an existing Feature/Story with the same identity. Use accurate `next`, canonical Kanban and truthful evidence/unknowns.
6. Install/use the **packed public binary** and relevant CLI/shell/Workspace/MCP on tracked inputs, with working model/doctor/setup and provenance; no repository-source imports, manual credentials in Git, or false portability claims.

**D1 v1 choice:** external agents get proposal/read authority for Product definition changes. Exact host/user-reviewed fingerprint is required to apply; generic project-write, a model's `decision:'accept'`, or model-supplied `--yes` is not consent. Without supported host review, return inert `review_required`. Future bounded delegation is deferred, not quietly granted. Local human review uses existing host context.

**Preserve:** intent ≠ implementation; graph coverage ≠ observed behavior; current Story satisfaction ≠ old green; actual acceptance ≠ passing fixture; Bug kind ≠ workflow lane; no duplicate persistence, parser, agent executor, approval service, test runner, registry or receipt framework. Keep legitimate historical identities, Rules/Aspect obligations, atomic admission, source scope, dirty-target/stale/cancel/rollback and owner-only completion.

## 2. Scope — finish what was started, don't restart it

| Existing work | v1 treatment / existing owner |
| --- | --- |
| PC1a/b; S2 Product atomic review; `EXT-SURFACE-10` | Mandatory safety and honest independent acceptance. Reuse `TKT-PC1A`, `TKT-PC1B`, `TKT-TRANSACTION-PRODUCT-BATCH`, `TKT-EXT-SURFACE-10` and current corrections. |
| S1 Story/Aspect, S3 editor, S4 derivation, S5 test lifecycle | Mandatory existing foundation: `TKT-DW-S1`, `TKT-DW-S3`, `TKT-RF0W`, `TKT-7MI2`. Qualify evidence on current source; no gratuitous rewrite. |
| PC2 Manifest/Feature/module intent/export | Complete practical public journey using existing shipped work and overlapping `TKT-EXT-SURFACE-03`; no imaginary retroactive PC2 Ticket. One definition/identity/version, explicit generated `product-manifest.md`, existing sync preserved. |
| PC3 Bug and work behavior | Implement at existing `TKT-BUG-TYPE-LANE` / Ticket owner; `TKT-BUG-CONTEXTUAL-EDIT` only if its original defect blocks the journey. |
| PC4/PC5 public operability | The minimum genuinely usable CLI/shell/Workspace/typed MCP operations for real journeys. Reuse and update relevant subsets of `EXT-SURFACE-01/02/05/06/07/08/09`; no blanket promise to deliver every aspirational tool. Independent public postcondition must actually be accepted before S6. |
| S6 native resolution; Doctrine G5 | Existing Gate 7/`Ticket.resolve`, R2/R3 when their original failures reproduce, `TKT-DOCTRINE-SEMANTIKA-CONTRACT`, `TKT-DOCTRINE-G5-RELEASE`. Preserve PD-01 unlinked-module Rule counterexample. |
| Setup/doctor/provider, exact source navigation, pack | Essential to adoption. Repair actual broken behavior in existing owners, not create broader infrastructure. |
| Full multi-shell autocomplete, compositional queries, generalized log intelligence, complete outline redesign, full MCP/SkillManager expansion, CPV, CodeMutator rename, full S8 migration, optional metrics/UI polish | **Backlog** unless a narrow observed subset directly blocks correct v1 usage. Retain `AIWF-FUTURE-INGESTION-SEED.md` without auto-ingestion. |

### Why Bugs are missing today — and exact v1 correction

Inspected current `Ticket` ontology and `TicketData` have no typed `kind`/`defect`; `src/graph/projections.ts` renders lanes only; `recommend_next_task` infers bugs from title/ID strings; module health's Bug count is not a trustworthy typed-Ticket Bug count. This is planned in PC3, **not shipped**.

Implement Bug **on the existing Ticket**: `kind?: 'task'|'bug'` (legacy absence reads task) plus design §3.4 strict optional defect fields `reproduction, expected, actual, severity, impact, environment, evidence`. Unknown remains unknown; partial reports allowed; implementation-ready only with actual reproducibility or explicit diagnostic acceptance. Same Ticket IDs, lease/lane/status, independent verifier and reviewed reclassification, no new entity/store/queue/lifecycle. Make `bug`, `bugs`, work/artifact kind filtering and practical UI available. Show `[BUG]` or equivalent clear type on each Kanban card *inside its existing lane*, with a derived filtered Bug view if useful, **not** a new Bug lane or writable Bug board. Verify projection import/export round-trips without corrupting titles/IDs. Distinguish real typed Bug counts from source Lesson/notes. `next` uses priority P0→P3, then equal-priority bug severity, prerequisites/claims, deterministic ties; no title heuristic and no suggestion that overrides required review.

## 3. Kanban — practical focus without manufactured closure

The last *read-only* reconciliation found **10 In Progress, 7 Blocked, 31 Backlog, 56 Done**, **zero claimed**; canonical/projected lanes agreed and none of those 17 had an exact individual `VERIFY-${ticketId}` receipt. Recheck actual live DB and claims first. Reports of implementation/source review are not thereby verified/Done.

Desired operational policy: **one actively executing primary Ticket maximum; short Todo (roughly 1–3 eligible next release items); Blocked reserved for real immediate release-path impediments; all nonpriority work in Backlog**, with original blockers, dependencies, delivered artifacts and review debt preserved in canonical body/evidence. Do not invent an Awaiting Review state. Work delivered but not accepted may be deferred to Backlog while clearly labelled awaiting independent acceptance; do not rewrite its history to make this look like unstarted work.

- Immediate release path: `TKT-EXT-SURFACE-10` (native LSP teardown/pristine acceptance); relevant PC1a/b, S1–S5/PC2 review, PC3, Doctrine/Semantika Gate 5, actual resolver/Gate 7 and reproduced recovery blocker. Treat D1 external-host boundary as the chosen v1 policy above, with unsupported flows honestly unavailable.
- Previously Blocked R2/R3, V56W, shell-F, GB73 and historical Gate 7 are immediate only **if** their behavior actually blocks the new target-project journey; otherwise preserve in Backlog with exact evidence and prerequisites. `AIWF-TOPLEVEL1-PHASE-A` and noncritical optional shell/polish belong in Backlog when not selected. Do not bulk close any of them.
- Doctrine G5 may be Blocked if its actual Semantika dependency/PD-01 criterion is unmet. Reconcile documentary claims of S4/S5 acceptance, PC1a source review, PC1b and S1/S2/S3 implementation against their actual canonical evidence. No synthetic receipts.
- PC2 implementation exists but no separately named canonical PC2 Ticket: reconcile ownership with existing Product/Manifest scope, not a speculative duplicate. Preserve canonical prerequisite edges, including CodeMutator dependencies and rejected duplicates.

Implementation procedure: **one compact per-ID proposed disposition** with current lane, claim, evidence, real blocker and exact proposed change → developer approval → individual supported canonical Ticket operations → one sync → compare graph/kanban. No direct `kanban.md` authoring, raw SQL, bulk deletion, or arbitrary moves of claimed work. The board is a projection of priority and truth, not a substitute for independent review.

## 4. Three integrated iterations — no separate audit-only cycle

Each iteration combines bounded investigation, actual public reproduction, minimal owner correction, relevant regressions, fast-forward commit/push to `master`, remote SHA check and one concise human **GO/NO-GO**. Do not convert 3 iterations into 3 arbitrary deadlines or success despite a broken external provider.

### Iteration 1 — stabilize, focus board, product → real reviewed work/test

1. Verify HEAD/clean state and installed sibling provenance. Read canonical claims/evidence; propose/apply the approved §3 lane/action table. Keep exactly one active implementation owner; no new seed ingestion.
2. Reproduce/fix unbounded graceful shutdown at `TsLspClient.close()` and `Ts6RefactorClient.close()` with guaranteed connection disposal and owned child cleanup, including normal, unresponsive, repeated and concurrent close. No raised test hook timeout. Run a *detached pristine full aggregate* and packed Product-authority public regressions, then independent `EXT-SURFACE-10` assessment. Do not conflate this with the unresolved external-host policy.
3. Independently smoke-test the **configured implementation and verifier/critic routes** before depending on them. `OpenRouter: User not found` must be solved at auth/config or a deliberate supported alternative route must demonstrate adequate actual task quality. Ollama reachability alone is not qualification; no secret logging or blind provider switch.
4. Finish the minimum public PC2/PC3 and necessary PC4 surface: reviewed optional charter/Manifest + Feature responsibility + applicable Aspect/Rule + meaningful Flow/Story + in-place edit + reviewed relation + Bug report/inspect/filter + honest priority/next + real S4 work derivation and test preparation/S5 status. Use existing command tree and UI/typed tools; do not implement every PC4 wishlist item.
5. In a **tracked disposable external project** with a genuinely executable public CLI/API/UI scenario, demonstrate `init/setup → Product/Feature → Story/Aspect/Rules → reviewed Epic/Tickets → materialized public Story test → activated attributable expected red`; also register a Bug for existing functionality. Prove reject, stale preview, reopen, same-ID meaning, and technical maintenance without Product.

**Gate 1:** Human can do this through supported public surfaces without raw DB/internal JSON; Bug is actually typed and visible; board is focused and truthful; configured routes are qualified or precise blockers; LSP lifetime is bounded; pristine aggregate and packed public negatives genuinely pass. Do not start native resolution if this foundation is still unsafe/unusable.

### Iteration 2 — native S6 resolution and trustworthy completion

1. Reconcile PC5 Product Operability and separate S6 developer authorization from current public evidence. Carry forward all existing S1–S5/Gate 5 guards rather than circumventing them.
2. First exercise **S6a evidence-only** on a narrow already-implemented Ticket: current proof/Rule/Aspect/scope checking, no needless provider-powered source tour, truthful result and owner-only completion.
3. Then **S6b new source implementation** on the iteration-1 external project: AIWF's own `Ticket.resolve` investigates/claims, gathers grounded source, makes exact guarded preview/fingerprint/apply, runs real Story and specialist tests, repairs boundedly, obtains **independent current** approval, commits existing canonical proof/Done coherently, releases claim. An agent's proposed source is not an approval or a receipt.
4. If R2/R3 repeated navigation, narrow-evidence exhaustion, model/SkillManager discovery or Gate 5 PD-01 fails *on this run*, reproduce the failure with its original evidence and repair the existing owner only. Preserve System-1 deterministic-first, optional LLM, code-change authority and finite budgets; no fresh Actor/graph framework.
5. Repeat as a typed Bug correcting **existing** behavior: same Feature/Story identity; reviewed revision, current impact/test basis, genuine reproduction/expected red if applicable, guarded correction, actual green and independent satisfaction. Provider/fixture unavailability is blocked/unknown, never fabricated red/green.

**Gate 2:** Both new-feature work and existing-feature Bug run end-to-end through **AIWF itself** with current source/tests and rightful independent verification, or a precisely isolated NO-GO. Doctrine G5 and Semantika admission/rollback acceptance must be separately true; an assisted Codex edit in the target project is not native proof.

### Iteration 3 — packed installation, everyday UX and release acceptance

1. Install packed public AIWF in a clean *other* root with tracked nontrivial application inputs and reproducible dependency provenance (AIWF `file:` siblings must not silently make the test appear more portable than it is). Verify real init/setup/doctor, model configuration, CLI, shell, required Workspace and selected MCP operations, no developer-only source import/DB handwork. Do not promise generic packaged installation if the supported route is explicitly workspace-based; document the real supported route.
2. Repeat **both** journeys using the public product and human host review, including restarted canonical state, stable identity, generated Manifest and authored snapshot. Legacy Markdown sync remains supported; full portable restore/live-sync retirement is S8, not secretly inserted into v1.
3. Prove relevant adversarial journeys: unapproved/self-approved Product edits refused; reject/cancel/stale/ABA/SQL rollback; wrong/ambiguous IDs; partial Bug; claim/dependency eligibility; Test skipped vs expected red vs green; material Aspects/effective Rules, changed-basis proof invalidation and existing PD-01; dirty/secondary source edits; unavailable model/bad fixture; restart/coherent receipt. Only promise/publicly advertise what is actually supported.
4. Run focused public end-to-end tests, serialized full suite, typecheck, pack, diff check, **detached pristine full aggregate**, packed CLI/MCP/UX and actual configured provider/verifier; log every failure and opt-in skip. Do not substitute isolated pass for a failing aggregate or a scripted actor for an independent live journey.
5. Publish a verified short quickstart with actual executed commands, limitations, source/dependency revision, provider requirements, two journey transcripts, and one-page GO/NO-GO. Independently accept actual completed canonical work; return the rest to Backlog/appropriate immediate Blocked, sync and verify final Kanban.

**GO only if:** another project completes a real reviewed Manifest → Story → test → AIWF-native source implementation → independently verified Done, plus same-identity Bug correction, on tracked public release inputs; all required acceptance is independently attributed. **NO-GO:** missing provider/verifier, broken host approval, failed pristine aggregate, false evidence, or a central journey not executed. Name the exact blocker; do not create a new roadmap to hide it.

## 5. Controls, measurement and handoff

- A three-iteration **execution budget** does not license a claim of success despite facts. If a gate fails, use the next iteration to correct the identified blocker rather than adding speculative work. No more than one primary coding Ticket at a time.
- Minor discovered issues go to their existing Backlog owner unless they threaten core correctness, truthful everyday UX, or repeatable adoption. No mandatory cosmetic completion of the 31 historical backlog items.
- Retain normal project/git/source history; no branch forest, force-push, destructive reset, fabricated child/Feature/Test/evidence, auto-closed Stage, or new authorization mechanism. Publication means bounded commit/push, not automatic product acceptance.
- Measure representative journey steps, elapsed time, tool/model calls, repeated reads, wrong calls and human recovery where observable. No made-up metrics or dashboard prerequisite.
- At each iteration report **one page maximum**: actual working public behavior; exact remaining failed contract; affected owner/Ticket and dependency; verification counts including skips/pristine/provider; commit and remote SHA; `GO`/`NO-GO` and next specific act. Source-review/acceptance must be independent and recorded by the existing owner.
- Preserve the separate `AIWF-FUTURE-INGESTION-SEED.md` for deferred shell completion, engineering queries, full outline revision and log deliberation; never ingest it wholesale during v1.

**First executor action upon approval:** read current master and canonical graph, produce one compact `requirement | existing owner/Ticket | current proof | observed missing journey | iteration` release-gap table and one per-ID proposed Kanban disposition (not another design document); get approval for the exact canonical lane moves, then execute Iteration 1 immediately. Stop after an evidenced push and report.