# AIWF — Unified Engineering Doctrine
## Reviewed architecture, migration, and acceptance-gated implementation plan

**Status:** DESIGN / HANDOFF; not an implemented feature. **Baseline:** `dharmax/ai-workflow` master `cea00d47ed6c183f16569fa17e8709c3fe0147fa` (13 October 2026 review). **Mandate:** am-i-allowed Prime Directive, KISS, DB-first, existing primitives, no shadow systems. **No implementation mutations were made in producing this document.** Revalidate the actual HEAD before implementation.

## 0. Decision and success contract

AIWF shall expose **one effective engineering rulebase**, whose natural-language principles and illustrative source evidence govern investigation, design, implementation, refactoring, testing and review. Its applicable mandatory rules must reach the producing agent and an independent post-change verifier; the existing Ticket completion/proof-reuse gate must account for their results and current versions.

**Distinct responsibilities (do not collapse them):**
- **Hardcoded workflow invariants:** lease/authority, change preview/apply, evidence and proof validity, Ticket state transitions, cancellation, independent acceptance. Not user-overridable Rules.
- **Rule:** reusable engineering principle governing the quality of work. Editable, typed, scoped, prioritised; examples and grounded references can improve interpretation.
- **Aspect:** existing product/cross-cutting obligation and its acceptance criteria. Not migrated to Rules.
- **Decision:** existing authored architectural/product decision; retain full operative fields (`decision`, `context`, `consequences`) and status/authority. Not auto-converted to Rules.
- **Lesson:** reusable evidence/advice. It is not mandatory doctrine unless explicitly promoted and approved.

A successful end-to-end demonstration: a Ticket implementation passes normal tests yet violates a mandatory KISS/responsibility rule; independent verification supplies concrete violation evidence and AIWF refuses to mark the Ticket `Done/verified`. A compliant repair can then complete. Existing flows and proved tests remain working.

## 1. Findings from the CURRENT code that constrain the solution

Inspect these exact sources again at implementation time; these are observations at `cea00d4`, not invented requirements:

| Source | Observation / consequence |
|---|---|
| `AGENTS.md`, `src/client-guidance.ts`, `src/setup.ts`, `skills/ai-workflow/SKILL.md` | Doctrine currently repeated or delegated through host instructions; no canonical runtime Rule resolution. Treat host text as bootstrap/instructions, not a second live rulebase. Preserve users' authored guidance. |
| `src/graph/ontology.ts`, `src/graph/store.ts` | Semantika/WorkflowStore already owns durable domain entities. Add native Rule here, not in a second database. `ModuleNode` already exists. |
| `src/ticket/investigate.ts` | Generic evidence serialiser keeps title/body but omits Decision's operative fields. |
| `src/product/context.ts` | Comparable risk for governing Decision data. Preserve full validated fields in context. |
| `src/aspects.ts`, `src/synthesis/context-builder.ts` | Applicable Aspects currently include draft/proposed unless deprecated; synthesis checks `status === 'material'`, which is not a valid Aspect status, and passes title rather than criteria. Fix independently and test correct authority. |
| `src/ticket/verification.ts`, `src/ticket-operation-types.ts`, `src/ticket/resolve.ts` | Independent verifier and receipt only model Ticket criteria and Aspects; signature omits governing Rule/Decision content. Extend the *existing* verifier and receipt, don't add another completion subsystem. |
| `src/actor/prompts.ts`, `src/actor/engine.ts`, `src/tools/os.ts` | General Actor system says to follow AGENTS, but doesn't load it; general `run_command` can have project-write authority. Do not claim that Ticket-only enforcement secures arbitrary shell writes. |
| `src/entity-view.ts`, `src/shell.ts`, `src/tools/index.ts`, `src/tools/surface.ts`, `src/mcp.ts` | Reuse existing view/facilitation and central registry/public surface for selector/editor and shell/CLI/MCP parity. No new frontend framework. |
| `src/graph/indexer.ts`, `src/verification-context.ts`, source/change tools | Existing local indexed symbols, relationships, exact-source and bounded review mechanisms are useful; they do **not** automatically grant complete cross-repository enumeration or unsupported-language coverage. |
| `docs/architecture.md`, `docs/journeys.md`, `docs/operations.md` | Graph and repository are durable truth; source/verification gates have distinct ownership; real journeys, not mocks alone, certify system behavior. |

Old `legacy-reference/docs/*` provides migration *candidates*, not executable current authority. Its obsolete tooling, rules and historical workflow policies must not be copied blindly. The attached project baseline likewise favors DB truth, bounded indexing and phase gates.

## 2. Severity-ranked audit of the proposed design

**Blockers:** (B1) repository-name-only examples hallucinate provenance; (B2) broad references can turn into expensive false claims of exhaustiveness; (B3) producer can launder a failing rule by changing it; (B4) old proof reuse can bypass updated governance; (B5) model-evaluated compliance is probabilistic and cannot be declared infallible; (B6) unconstrained source content could prompt-inject producer/verifier; (B7) project-host instructions and DB rules could conflict without authority rules.

**Major:** (M1) incomplete Decision and Aspect delivery already exists; (M2) existing broad shell has an explicitly different trust boundary; (M3) global/default upgrade semantics and module ownership need a precise contract; (M4) rules UI should reuse current shell-ui rather than trigger a UI platform rewrite; (M5) importing JS as data would introduce remote code execution; (M6) applying every rule to every change is wasteful and likely lowers judgment quality; (M7) a rule dependent on an unavailable external repo must not quietly become unenforced.

**Implementation principle:** solve the causes at the owning boundaries. Do not introduce a generic policies DSL, rule compiler, parallel reviewer, second graph, independent Markdown truth, new command bus or permanent compatibility pipeline.

## 3. Rule model (contract, illustrative JSON)

```json
{
  "id": "engineering.abstraction-placement",
  "type": "architecture",
  "scope": { "kind": "universal" },
  "importance": 10,
  "rule": "Introduce abstractions wherever genuinely justified and nowhere else; first inspect existing owners and simpler alternatives.",
  "examples": [
    { "kind": "negative", "description": "Creating a new registry for a responsibility already owned by the current registry.", "lesson": "Duplication is not an abstraction improvement." }
  ],
  "references": [
    {
      "sourceType": "gitRepo",
      "locator": "<a user-authorized, canonical repository locator>",
      "revision": "<verified immutable commit SHA>",
      "selector": { "kind": "declarationKinds", "kinds": ["class", "interface"], "coverage": "all" },
      "purpose": "Study the presence and absence of abstractions against actual responsibilities and usage. Extract illustrative findings, not a universal mandate to imitate the repository."
    }
  ],
  "test": {
    "kind": "llm",
    "instruction": "Review each touched artifact and immediate contracts. Identify justified and unjustified abstractions, alternatives already available, and exact evidence. Report pass, fail, not_applicable or inconclusive per rule."
  }
}
```

This is an *authoring model*, not a demand to persist every property as nested opaque JSON in a rigid new schema. Use existing Semantika descriptor/validation practices. Optional fields: `languages` (absent = any supported language), `apply` (absent = contextual instruction delivery), `examples`, `references`, `test` (absent = default independent semantic check). Keep descriptive fields such as `title` where current entity/view contracts require them; do not duplicate `rule` in inconsistent `title/body` authorities. Active/draft/disabled state and revision/provenance are managed domain metadata, not independent `level`/`when` rule semantics. **Identity:** the public `ruleId` remains stable across layers, while each persisted layer has a distinct graph entity ID derived from `(ruleId, scope kind, scope ID)`; the effective view folds those records. Never upsert project/module overrides onto the same entity key as the bundled default.

**Type:** small code-owned vocabulary: `universal`, `design`, `architecture`, `coding`, `refactoring`, `testing`, `documentation`. Type nominates activity candidates; actual change impacts can add a relevant cross-cutting type. Do not infer the impact of a structural edit solely from a shell mode string. No `when` property or per-rule workflow scripts.

**Severity:** only `importance` 1–10. 8–10 = mandatory (fail/inconclusive blocks governed completion); 5–7 = expected, nonblocking surfaced deviations; 1–4 = advisory. `not_applicable` is an explicit justified outcome, not silent omission. The immutable workflow invariants are separate from importance and cannot be lowered with a Rule override.

**Scope:** universal within the installed/effective project doctrine, project, or an existing module identity. Project/module layers can override a stable Rule ID; more-specific layer wins, with per-field provenance and explicit disabled state. `universal` does **not** confer a user-imported rule systemwide privilege across unrelated workspaces. Module ownership must be graph-grounded; ambiguous modules cause needs_input, not guessed glob matching. Language filtering is orthogonal. Default layer versions and local overrides survive updates; JSON is distribution/import/export, not parallel live state.

**Rule status:** draft proposals do not enforce; active rules resolve; disabled rules remain visible with reason/provenance. A missing or unresolvable *mandatory active* rule/check is an actionable blocker, never a pass.

**Application:** always deliver the operative English rule and select useful, grounded examples. Only use a registered, validated deterministic application mechanism where truly needed. Never execute JS from rule JSON. `test` may point to `llm`, `system1` or registered codelet; for mandatory semantic judgments, low-confidence System-1 must escalate to independent LLM/evidence, not certify success alone. Explicit test absence falls back to independent semantic assessment.

## 4. Grounded references: authoring, resolution and trust

A reference is **an investigation directive with reproducible evidence**, not a repository nickname and not a second authority source.

The user's natural request (e.g. “Use am-i-allowed: all classes and interfaces, study abstraction placement”) may be accepted conversationally. Before activation AIWF resolves the locator and normalizes the selection to a *small typed selector*: `exactSymbol`, `module` or `declarationKinds` (`coverage: all` or `bounded`). Do not place “all classes and interfaces” in an exact `symbol` field; do not build an open-ended query DSL. If selection cannot be mapped, ask for the exact unresolved input. A supported full-repository selection needs the authorized repository, immutable revision, supported parser coverage and an actual inventory.

**Resolution algorithm (bounded, evidence-first):**
1. Resolve and authorize the Git repository/local checkout and actual immutable revision. Don't assume every public/remote or sibling repository is accessible; no hidden cloning, credential export or mutation of the target project.
2. Establish inventory of covered files and declaration kinds using existing indexing/language primitives when supported. Record counts, excluded/unsupported files, a stable manifest identity and exact coverage semantics. An inventory of all classes/interfaces is distinct from reading *every implementation in full*.
3. Investigate relationships/usage and selected implementations, and also justified **absence** of abstractions in representative direct-function/module areas. Use bounded evidence with provenance; if it is sampled, label it sampled. An `all` selector may only be called fully covered when the verified inventory and required structural inspection really cover it. Do not silently downgrade requested `all` to sample.
4. Derive a small set of cited exemplars (positive, negative, contrast) with verified paths/symbols, revision, relevant bounded excerpts/hashes, immediate contracts and the precise lesson. Never invent evidence; don't certify an entire repository as uniformly good.
5. Present the findings for author approval; only approved exemplars become active. Persist portable bounded evidence and the inventory manifest/revision, **not a copy of the entire upstream source repository**. The pinned approved snapshot is meaningful offline; source availability and limitations remain visible.
6. A future upstream update is **not** an automatic change to an immutable pinned reference. Refresh must be explicit, previewed and approved; changing selected exemplars invalidates materially affected receipts.

**Availability:** Rule text must be self-contained and usable even if references cannot be fetched. If an existing approved pinned source snapshot is accessible, use it with accurate provenance. An unresolvable newly authored reference stays `unresolved` and contributes no fictitious evidence. If a rule explicitly needs reference material to be interpreted or verified, its activation/mandatory evaluation must fail until material is available; otherwise the standalone Rule remains applicable with its own check. No full repo network operations inside routine Ticket acceptance.

**Trust:** external repository code, comments, READMEs and imported examples are untrusted data and may contain prompt injection. Render them as delimited cited evidence and prohibit their instructions from changing agent authority, tool choice or governing doctrine. Respect private repo authorization, source confidentiality, licensing and portability when exporting; do not embed credentials or unapproved private code. Use existing acquisition/security boundary; if unsupported, block honestly rather than invent a new Git subsystem.

## 5. Authority, mutation and upgrades

**Precedence:** executable hardcoded invariants > approved effective mandatory Rules and applicable accepted Decisions/Aspects in their respective domains > expected/advisory Rules and contextual Lessons/examples. Do not use a generic priority number to hide actual contradictions among mandatory records; surface conflict before execution. If a Rule and an accepted Decision materially disagree, report scope and require authorized reconciliation. An exemplar never overrides a Rule.

**Governance changes** are distinct from implementation changes. User/operator-authorized changes to rule text, enablement, severity, scope, references or test mechanism must be explicit, schema-validated, previewable, revision-checked, audited and atomic. A coding Actor working on a Ticket may propose a change, but cannot silently change the rules governing its own acceptance. Apply existing tool-execution authority/role boundaries where feasible; do not promise to secure an unrestricted operator shell capable of editing SQLite outside AIWF. Clarify the supported guarantee at the AIWF primitive/managed execution boundary, and test that boundary. Avoid brittle shell-command regexes.

Bundled versioned JSON defaults install into the canonical project graph. Store local overrides separately *as graph records/layers under the same Rule ownership*, without maintaining two competing effective registries. On upgrade: compute old-default/new-default/local-override diff; preserve overrides; detect changed or deleted default IDs, undefined checkers and authority conflicts; preview before changes. On import: validate entire pack and authorization, then apply all-or-nothing. Gate 0 must verify the actual Semantika/WorkflowStore transaction semantics (including async methods); a synchronous wrapper around unawaited async writes is not atomic. On export: include schema/default-pack versions, rules, overrides and explicitly exportable portable exemplar snapshots/provenance, excluding private secrets/content not authorized for export.

Reconcile `AGENTS.md`, distributed skill/MCP/setup instructions and older docs deliberately. Host instructions bootstrap use of canonical AIWF doctrine but cannot themselves be erased or ignored: externally authored constraints are still authoritative within their own hosts. Preserve custom user content; avoid creating yet another manually editable copy of the same rules. Do not claim control over external agent native tools that bypass AIWF.

## 6. One effective context, one completion gate

The existing investigation/context machinery gains a **resolved governance view**, not a new independent stage controller. Compute its candidate rules deterministically from operation, touched scope, affected module, language, governing graph edges, inheritance, status, type. System-1 may cheaply rank ambiguous optional relevance but never prune explicit/must candidates on uncertain evidence. Resolve conflict and missing checker/reference states explicitly; keep context bounded. Preserve full Decision fields and full applicable Aspect acceptance criteria.

Use the *same pinned effective governance content* for preparation/design, synthesis, implementation and independent verification. Verify against the **actual post-change source and immediate contracts**; producer narration is not evidence. The existing acceptance schema receives identifiable per-rule assessments (`rule id`, effective revision/fingerprint, `pass|fail|not_applicable|inconclusive`, cited evidence, limitations) alongside Ticket criteria and Aspects. Verifier may group related checks for model efficiency but must report each required rule distinctly. Detect missing, duplicate, unknown and uncited rule verdicts.

The existing receipt/signature incorporates canonicalized **applicable** normative Rule content + effective scope/status/importance + the identities of illustrative examples/reference evidence actually supplied to producer/verifier + checker identity/version, governing Decision/Aspect obligations, the authored Ticket contract and existing source/test evidence. Do not hash arbitrary unrelated advisory collections or mutable upstream HEAD. At resolution start capture the effective governance fingerprint; immediately before committing verified state, recompute it and reject races. On proof reuse require current governance match plus existing source/tests and acceptance coverage. Legacy receipts must not silently count as newly governance-compliant; preserve historical Done status and label historical proof as legacy/unassessed until current verification is required. Avoid bulk reopening every Done Ticket as a migration side effect.

**Enforcement honesty:** semantic LLM review is fallible. Use independent post-change source, concrete evidence, narrow criteria, adversarial tests and explicit uncertainty. Never claim formal proof of a judgment whose nature is semantic. If no adequate model is configured for a mandatory rule, return blocked/needs_input rather than success. `critic=none` may omit optional preparation critique but cannot bypass required acceptance.

**Actor authority:** ensure managed AIWF code-generation and governed source changes share Rule delivery and the acceptance boundary. The existing broad `run_command` operator tool differs from Ticket `safe_change`; investigate supported restrictions/reuse and document any residual bypass explicitly. Never claim universal control over arbitrary OS commands or native host edits simply because the prompt contains a guideline.

## 7. Management surfaces: one owner, many adapters

Expose minimal operations through existing entity/store and tool registry: `list/select`, `get/effective`, `create/update`, `override`, `disable/restore`, `preview/import/export`, `resolve reference`, `evaluate rule against selected scope`. These are logical functions, not a requirement for one MCP tool each. Respect public MCP surface/tool discovery: do not advertise a giant administrative tool suite to every coding Actor. Shell and CLI reuse domain operations, not separate mutation logic. A Rule selector and form editor should extend existing `src/entity-view.ts` and `@dharmax/shell-ui`: type, scope, language, importance, state/source filters; show inherited versus overridden values, provenance, examples/references, effective rule, test mechanism and preview/diff; enable governed edits. If shell-ui lacks a nested reference editor, offer a compact structured/plain editor and only the minimum underlying view support; do **not** introduce an independent web frontend.

Rule data updates should be transactional and optimistically revision-checked. A view is not an authorization bypass. Mutations that would weaken a mandatory rule need explicit operator authorization and visible consequences for dependent receipts.

## 8. Migration: protect installed projects and truth

**Preflight:** capture `bun test`, `bun run typecheck`, build, current HEAD/dirty state, installed DB schema/projections, a backed-up representative actual project DB, and existing proof-reuse behavior. Audit old guidance against active repo docs; map each principle to hardcoded invariant, Rule, Aspect, Decision, Lesson or obsolete text. No automatic copying. Record preexisting issues separately and do not conceal them in the Rule implementation.

**Mechanics:** Semantika descriptor upgrade must be idempotent and preserve every existing entity/predicate/receipt. No destructive reindex or import rewrite. Install small validated default doctrine. Project overrides are explicit; no automated semantic merging of conflicting human-authored rules. Exported JSON is not live authority. Existing AGENTS/skills changes must preserve unmanaged text and never overwrite user customization. Feature rollout must not claim enforcement before the receipt gate is operational. Any temporary comparison/migration mechanism must have a removal condition, not become a permanent second policy path.

**Legacy proofs:** keep historical records readable. A legacy receipt may retain historical status but is never accepted as proof of the new governance version. Revalidate when relied on; avoid bulk rewriting historical Ticket states.

## 9. Execution plan: gated, single master, smallest stable changes

**Gate 0 — contract and baseline (NO FEATURE CODING).** Revalidate repo HEAD and affected paths, document the authority matrix, user journey/acceptance tests, exact Rule/reference schema and migration/upgrader behavior, actual cross-repo source support, full-set inventory feasibility and general Actor boundary. Identify true dependencies. Run clean baseline and back up DB. Resolve blockers in the design; do not start a speculative platform rewrite. Deliver concise risk register and approve the implementation path.

**Gate 1 — native persisted Rule model.** Add one Rule descriptor and validation, minimal versioned default pack, graph-owned override resolution, provenance, revision and individual persistence. Initialization must detect incomplete default installation. Unit/integration tests for fresh/restart/upgrade/conflict/module inheritance/language filtering. No public claim of rule enforcement yet. Keep public mutation gated until validated.

**Gate 2 — producer context integration (inline examples first).** Use one effective resolver in investigation, preparation/design, implementation and synthesis, initially with self-contained Rules/inline examples. Fix Decision content and Aspect criterion/status defects with independent regression tests. Show actual context reaches LLMActor/source synthesis. Reject ambiguous mandatory applicability; bound optional context. Minimal read-only Rule management surfaces may be exposed; **do not advertise Rule enforcement until Gate 3**. No second planner.

**Gate 3 — verifier and proof closure (first enforcement milestone).** Extend independent acceptance and its schemas/receipt/signature. Bind the exact effective governance snapshot, check races and old proofs, enforce mandatory per-rule verdicts and feed failures into bounded repair. Test that the governed code-generation path cannot approve its own weakening rule. Document unmanaged arbitrary shell boundary truthfully; do not regress existing read-only and command agency. The first live adversarial test uses an inline Rule/example, requiring no external repository. This gate is the first moment the new rules may be advertised as enforced.

**Gate 4 — grounded source references, governed import/export and editable management.** Implement resolvable `gitRepo` references using existing source/repository discovery facilities. Typed selectors, pinned revision, verified manifest, bounded source-backed exemplars, approval step, offline behavior, injection/authorization defenses. Investigate and implement governed JSON import/export and its atomicity requirement via a narrowly scoped Semantika batch persistence operation (prevalidated mutations, one synchronous native SQLite transaction, no asynchronous operations inside the transaction, optimistic revision checks, and fresh entity instances returned only after commit). Test failure injection to verify no partial entity or index state survives. Add governed Rule CRUD/import/export tools across CLI/MCP and shell selector/form by extending existing `entity-view.ts`/shell-ui. Use only the existing service, and test that reference-enriched rules still reach the already-working Gate 3 verifier. If cross-repo indexed source is unsupported, narrow the supported contract and report an exact blocker; do not fabricate coverage or delay basic doctrine enforcement for elaborate UI.

**Gate 5 — release audit.** Execute deterministic suites, typecheck/build, actual DB migration tests, CLI/shell/MCP adapter parity and live configured end-to-end acceptance; test before/after source and real contract. Perform am-i-allowed audit on *every complete touched method* and immediate contracts, not only diffs; remove obsolete guidance duplication and temporary gates. Update examples and documentation to verifiable real syntax. Work on current master with small stable commits and rollback tag if needed; do not grow a branch forest. Each gate needs evidence of exit criteria before continuation.

## 10. Adversarial acceptance checklist (must be executable)

- [ ] A real compliant Ticket passes its authored tests, Aspects, mandatory Rules and independent acceptance.
- [ ] A second Ticket passes tests but adds a redundant registry/abstraction; a Rule 10 finds evidence and prevents `Done/verified` until repaired.
- [ ] A required rule's verdict is missing, duplicated, hallucinated, inconclusive or unsupported by current code: no completion.
- [ ] Explicitly relevant Rule 8–10 cannot be pruned by System-1; unrelated language/type/module rules are excluded with grounded explanation.
- [ ] Accepted Decision's actual decision/context/consequences and Aspect's real criteria reach both producer and verifier; drafts do not gain accepted authority accidentally.
- [ ] User request for `gitRepo` “all classes and interfaces” resolves an actual repo + pinned SHA + typed selector. Fully inventoried vs sampled/unsupported coverage is accurately reported. Relevant absence of abstraction can be evaluated.
- [ ] Unavailable/moved/private source, unsupported parser, dirty local checkout, hostile README/comment or source too large cannot yield fabricated reference evidence or prompt-instruction authority.
- [ ] Rule remains independently understandable with pinned/approved saved exemplar snapshot when upstream repo is offline; unresolved required reference cannot silently certify compliance.
- [ ] Coding Actor cannot use its own governance-mutation primitive to downgrade a failing rule. Authorized override shows diff and invalidates dependent receipts.
- [ ] Default-pack update preserves project/module overrides; explicit conflict is surfaced; import failure is atomic; concurrent editor write rejects stale revision.
- [ ] Relevant rule, approved exemplar, checker version, governing Decision or Aspect change invalidates reused proof; unrelated advisory data need not invalidate it. Race during acceptance fails safely.
- [ ] A historical receipt does not masquerade as proof under the new schema; historical Ticket state is preserved without bulk reopening.
- [ ] CLI, shell and MCP operations share graph truth and revision/authorization checks; selector/viewer/editor use existing shell-ui with plain fallback.
- [ ] Existing J2.4/J2.5, J3.1/J3.2/J3.4, J5.1/J6.3/J6.4 journeys and test/typecheck/build remain sound. Opt-in live acceptance uses configured real model and observed tool effects; mocks alone are not release proof.

## 11. Non-goals and honest limitations

No free-form rule scripting language; no rule-generation/chat-memory automation; no autonomous permanent upstream watch; no clone-all-repositories job; no blanket indexing of unrelated private projects; no universal security guarantee over ungoverned native host/OS writes; no independent design-flow orchestrator; no new web app; no bulk conversion of Aspects/Decisions/Lessons to Rules. External semantic compliance is evidence-based and probabilistic, not a mathematical correctness theorem. An inability to access a particular source or configured verifier is an explicit input/capability blocker, not permission to fabricate success.

## 12. Handoff instructions

Use this file as the design target, not as proof of current implementation. Run Gate 0 FIRST and present observed deviations and a concise concrete work breakdown. For subsequent work, reuse existing AIWF Ticket workflow, keep all changes on current master via small safe commits, no permanent extra branches. At each gate present: actual files touched, whole-method responsibility audit, real tests/typecheck/build, migration/rollback result, user-journey evidence, unresolved risks. Never silently modify acceptance contracts to make failing work pass. Do not assert work is complete until Gate 5 including an actual independent verifier journey passes.

Source anchors at audited baseline: https://github.com/dharmax/ai-workflow/tree/cea00d47ed6c183f16569fa17e8709c3fe0147fa ; use exact paths in Section 1. Revalidate HEAD and file differences before execution.
