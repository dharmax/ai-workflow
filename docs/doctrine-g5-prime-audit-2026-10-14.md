# Doctrine Gate 5 — Prime Directive audit, 2026-10-14

**Gate 5 remains open / Blocked.** This is a structural audit stop with bounded local repairs, not a release or whole-design acceptance certificate. The user-added Prime Directive requirement applies in addition to the original release checks. Baseline HEAD: `9b3f78734216`.

## Critical structural finding: governance does not own actual change scope (PD-01)

The implementation has two disconnected views of work:

- `resolveTicketGovernance` selects Rule applicability from authored Ticket neighbors, linked files/symbols and explicit modules.
- `resolveTicket` allows previewed changes to other clean files and accumulates their paths in `ownedFiles/allFiles`. It does not connect those actual impacts to governance selection.
- The producing dossier, independent verifier and `ticketVerificationSignature` consequently use the initial authored governance. Repeated fingerprint comparisons recompute that same incomplete scope.

**Observed counterexample:** an isolated Ticket targets `src/add.ts`. Another file, `src/other.ts`, has a graph-grounded module owner and a mandatory Rule requiring `other()` to return one. The actual guarded implementation changes it to return two. The real addition test passes; the verifier hook receives no module Rule; the Ticket reaches `Done/verified` and a receipt hashes the changed file without assessing its Rule. Updating that Rule then reuses the receipt without calling either implementation or verification. Resolving a separately authored Ticket for the actual changed file correctly discovers the omitted Rule.

The attached [machine evidence](doctrine-g5-prime-audit-2026-10-14.json) includes the executable isolated reproduction, actual receipt and outputs. Verifier hooks are explicitly injected to test controller contracts; this is not presented as live semantic model acceptance. Git, indexing, guarded mutation, Bun test execution, persistence and reuse are real.

**Root cause:** scope ownership is fragmented between authored governance and independently tracked mutation/evidence paths. Hashing a file proves its freshness; it does not prove that the file's applicable governance was selected or assessed. There is no enforced contract that authored scope contains actual change impacts.

Related structural observations from complete-method review:

- `resolveTicketGovernance` combines each file's ownership with every explicit Ticket module, then collapses results by logical `ruleId`. Different legitimate scoped definitions can be rejected as ambiguity; this cannot faithfully represent per-scope obligations for coherent work across modules.
- `allFiles` belongs to the entire dependency work closure, while each dossier/governance belongs to one Ticket. Actual execution ownership and review ownership need an explicit relationship.
- `buildIntentContext` independently resolves Rules with no module/language context and renders Rule text/examples without approved reference evidence. It does not reuse the Ticket governance view's reference/required-material semantics.

**Required correction:** establish one graph-grounded applicability contract connecting authored intent, real change preview/apply impacts, producer context, independent acceptance and receipt reuse. Define how new files, renames, legitimate work across modules and parent/child work contribute to that scope. Reuse the existing Rule store, graph and completion gate. Do not add a second registry, guessed ownership or another compensating fingerprint guard.

This changes the ownership contract across investigation, production, mutation and proof reuse. It is substantial redesign and must be reviewed explicitly before Gate 5 can close. The defect is not deferred to obtain a green release.

## Substantive local defects repaired

### PD-02 — Draft activation could bypass mandatory change authorization

`RuleStore.previewPack` used any prior stored layer as governing authority. An existing draft project override with importance one therefore bypassed the inherited active importance-ten Rule when activated without `allowWeakening`.

The preview now treats a prior active layer as authority and otherwise resolves effective inherited authority. A regression first reproduced the unauthorized preview; it now requires explicit weakening authorization and proves that an explicitly authorized override still works. The existing native atomic batch/audit path is preserved.

### PD-03 — Whole-file review could silently become one-symbol review

`buildVerificationContext` used the 8,000-character small-file fallback threshold to decide whether authored whole-file source was supplied. Above that threshold, any available test-linked symbol snippet could silently substitute for the rest of the authored file.

Whole-file source is now supplied completely under the existing total context budget. Exceeding that budget fails explicitly. Redundant exact-symbol acquisition for whole-file targets is removed, along with a redundant continuation branch.

The regression uses a larger file containing an extra registry outside the test-linked arithmetic function. It checks complete source equality and explicit rejection under an insufficient budget.

### PD-04 — Required exact-source acquisition errors were swallowed

A failed required symbol lookup was caught and ignored. One successful sibling lookup could therefore allow a partial exact-scope context to proceed.

Exact-source acquisition now throws an identified error with the original cause. The regression requires rejection when one of several required exact declarations cannot be supplied.

### PD-05 — Expected deviations were omitted, rejected as unknown or reused after changing

Default verification selected only mandatory Rules. The assessment validator also mistook Rule membership for mandatory severity, so a valid expected Rule assessment could block completion as “unknown.” Expected normative changes did not invalidate their receipt.

The verifier now receives mandatory and expected Rules; its prompt distinguishes their severity. Known expected assessments remain visible and nonblocking. Applicable expected normative content participates in the existing governance fingerprint, while unrelated advisory content still does not. Regressions cover a retained nonblocking failure, real local HTTP delivery through the default verifier, and fresh review after an expected Rule changes.

### Receipt policy

`DOCTRINE_VERIFIER_VERSION` is now two. Existing version-one receipts require fresh verification; historical evidence is preserved. A regression checks rejection of the older receipt version.

## Test contract correction

An existing “current graph proof” test authored a whole-file Ticket target while demanding omission of source outside one symbol. Its fixture now explicitly authors that symbol scope. All original negative and positive assertions remain. The new whole-file regression separately proves the broader obligation. The contract was clarified at the fixture's ownership edge; assertions were not weakened to conceal the defect.

## Method and contract review coverage

| Scope reviewed | Responsibility and outcome |
| --- | --- |
| `RuleStore` identity, validation, single/batch persistence, read/convert, folding, resolve, defaults, preview/apply/export | One native layered store remains; draft authority defect repaired. Schema, optimistic versions, deletion links, audit atomicity and caller boundaries examined. |
| Reference manifest validation, pinned Git resolution and evidence rendering | Existing bounded read-only source acquisition and explicit approval remain. No acquisition, executable imported JS or new reference subsystem was introduced. |
| `SqliteStore.applyBatch` in Semantika | Actual synchronous transaction, optimistic versions, rollback and returned nondeleted rows examined; existing real SQL-failure/restart tests pass. |
| `investigateTicket`, `implementTicket`, `resolveTicketGovernance` and `resolveTicket` | Producer delivery, lease ownership, preview/apply, dirty-file guards, repairs, state transitions, races, receipts and release/sync traced. Structural scope defect prevents approval. |
| `executeTicketChecks`, `verifyTicketAcceptance`, `ruleAcceptanceFailures`, receipt parsing and signature generation | Actual test evidence remains distinct from acceptance. Missing/duplicate/unknown/pinned mandatory assessments and failure paths retained. Expected-rule behavior repaired. |
| Entire `buildVerificationContext` and its source/test helpers | Full-file and exact-symbol scopes remain distinct; complete evidence and propagation defects repaired. Existing budget owns completeness failure. |
| `buildIntentContext`, `collectProductMeaning`, synthesis context construction and Aspect applicability/assessment | Operative Decision fields and accepted Aspect criteria preserved. Product Rule context divergence remains part of PD-01. |
| Rule registry operations, command adapter and entity save path | Registry/domain ownership, approval fingerprints, stale edits, read-only mutation rejection and shared surfaces inspected; existing integration tests pass. |
| Onboarding/diagnostic methods and CLI/shell/public surface integration | Doctrine installation/inspection and shared adapter paths inspected. This structural stop does not certify all release/interface journeys. |

No new stage controller, compatibility layer, registry, branch or production diagnostic subsystem was added. The JSON reproduction is an evidence artifact, not runtime machinery. Native operator/OS bypasses remain outside the managed Ticket enforcement guarantee.

## Validation and limits

The machine evidence records final commands, counts, diagnostic locations and log hashes. The full regression run is separate from new live semantic acceptance. Four opt-in live tests were skipped. No new configured end-to-end Gate 5 acceptance or full migration/rollback release certification is claimed.

Typecheck baseline was verified by extracting untouched HEAD into a temporary directory and using the same installed dependencies. It has 19 errors, chiefly incompatible Zod identities across the sibling dependency and the pre-existing `diagnosticsOk` reference. The audit repairs introduce no additional diagnostics after correcting a test-only type annotation. Typecheck is still failing, not green.

Existing dirty ledgers and recovery artifacts were preserved. No commit or push was made. Initial AIWF-owned resolution was attempted and stopped before edits on an oversized observation/context budget; manual work followed an active Ticket claim and fingerprinted preview/apply changes.

Gate 5 can close only after PD-01 is resolved through a coherent ownership design, the full method audit is renewed for that design, remaining release checks are satisfied, and current independent live acceptance verifies the actual contracts.
