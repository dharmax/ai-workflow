# Epics & Product Roadmap

## EPIC-ONBOARDING: Project Architecture & Onboarding

- **Status**: `implemented`
- **Priority**: 1

Initial architecture grounding and capability mapping.

### Coverage
- **Complete**: Yes

## EPIC-AIWF-ARTIFACT-OPS: Artifact Operations: AIWF as the Engineering Agent

- **Status**: `active`
- **Completeness Target**: `production`
- **Priority**: 1

Historical charter: execute docs/artifact-operations-plan.md completely; production target and ten ordered gates. Preserve existing identities, acceptance, verified evidence and the unfinished AIWF-TICKET-RESOLUTION-FIRST-PROOF obligation. The current canonical development roadmap is GOAL-AIWF-AUTONOMOUS-ENGINEERING and CONCEPT-AIWF-ROADMAP; epics.md and Kanban are projections. The historical Markdown plan remains provenance, not a competing authoritative roadmap.

### Targeted Features
- **FEAT-AIWF-ARTIFACT-POLICY**: Completeness/depth/critic operation policy
- **FEAT-AIWF-ASPECTS**: First-class cross-cutting Aspects
- **FEAT-AIWF-PERFORMANCE-METRICS**: Correlated AIWF + llm-utils performance telemetry
- **FEAT-AIWF-PRIMARY-INTERFACE**: High-level shell/MCP delegation surface
- **FEAT-AIWF-PRODUCT-PROCESSING**: Story/Feature/Epic semantic processing
- **FEAT-AIWF-TICKET-OPS**: Ticket investigation, preparation and end-to-end resolution
- **FEAT-AIWF-TRUTHFUL-PRIMITIVES**: Truthful, efficient code intelligence/change primitives

### Contained Tickets
- **AIWF-PRIMITIVE-TRUTH** [Done]: Gate 1: PRIMITIVE-TRUTH
- **AIWF-OPERATION-POLICY** [Done]: Gate 2: OPERATION-POLICY
- **AIWF-ASPECTS** [Done]: Gate 3: ASPECTS
- **AIWF-TICKET-INVESTIGATION** [Done]: Gate 4: TICKET-INVESTIGATION
- **AIWF-TICKET-PREPARATION** [Done]: Gate 5: TICKET-PREPARATION
- **AIWF-PERFORMANCE-METRICS** [Done]: Gate 6: PERFORMANCE-METRICS
- **AIWF-TICKET-RESOLUTION-FIRST-PROOF** [Blocked]: Gate 7: TICKET-RESOLUTION-FIRST-PROOF
- **AIWF-PRODUCT-PROCESSING** [Done]: Gate 8: PRODUCT-PROCESSING
- **AIWF-PRIMARY-INTERFACE** [Done]: Gate 9: PRIMARY-INTERFACE
- **AIWF-FINAL-DOGFOOD-AUDIT** [Done]: Gate 10: FINAL-DOGFOOD-AUDIT

### Coverage
- **Complete**: No
- **Gaps**:
  - [ ] blocked: Epic 'EPIC-AIWF-ARTIFACT-OPS' is blocked by active blocker(s).

## EPIC-AIWF-DOCTRINE: Finish Doctrine Enforcement

- **Status**: `planned`
- **Priority**: 1

Narrow Semantika prerequisite and the EXISTING TKT-DOCTRINE-G5-RELEASE: governed scope, receipt validity, dirty-tree/child/Rule-layer attribution, full adversarial acceptance and whole-method Prime Directive audit. Gates 1-4 remain verified historical work; Gate 5 remains Blocked. Only its new prerequisite links are changed. G5 is the Doctrine closure gate; no competing scope implementation or ceremonial closure ticket. Evidence: docs/doctrine-g3-acceptance-2026-10-13.json, docs/doctrine-g4-acceptance-2026-10-14.json, docs/doctrine-g5-prime-audit-2026-10-14.md/.json.

### Targeted Features
- **FEAT-AIWF-GOVERNED-COMPLETION**: Governed source completion and current proof

### Targeted Stories
- **STORY-AIWF-RESOLVE-TICKET**: Caller can delegate a Ticket and receive verified completion / needs-input / blocked

### Contained Tickets
- **TKT-DOCTRINE-SEMANTIKA-CONTRACT** [Blocked]: Prove atomic admission assertions and coherent completion contract

### Coverage
- **Complete**: No
- **Gaps**:
  - [ ] blocked: Epic 'EPIC-AIWF-DOCTRINE' is blocked by active blocker(s).
  - [ ] missing_target_path: Epic 'EPIC-AIWF-DOCTRINE' targets UserStory 'STORY-AIWF-RESOLVE-TICKET' but has no contained Ticket addressing it.

## EPIC-AIWF-TRANSACTION-INTEGRITY: Transaction Integrity & Integration

- **Status**: `planned`
- **Priority**: 2

After Doctrine closure, extend only demonstrated ecosystem transaction requirements: atomic multi-artifact/graph batches, optimistic concurrency, audit coherence, rollback/recovery and explicit backend limits. Reuse Semantika public guarantees; no AIWF shadow transaction manager. First slice is atomic Product mutation integration; later slices require observed needs. Acceptance: public-contract concurrent and injected-failure scenarios demonstrate all-or-nothing canonical state and coherent audit; record before/after capability/correctness/cost.

### Targeted Features
- **FEAT-AIWF-GOVERNED-COMPLETION**: Governed source completion and current proof

### Contained Tickets
- **TKT-TRANSACTION-PRODUCT-BATCH** [Backlog]: Make guarded Product batches atomic through Semantika

### Coverage
- **Complete**: Yes

## EPIC-AIWF-CONSUMER-CONTRACTS: Ecosystem Consumer Contracts

- **Status**: `planned`
- **Priority**: 2

Public APIs, ownership, invariants, failure/concurrency semantics and verified examples for Semantika, Skill Manager, Semantic Registry, Context Manager and LLM Utils. Reuse READMEs and contract tests, not a documentation framework or routine internal reverse-engineering. Semantika transaction guarantees belong to its public contract; share the narrow prerequisite and EPIC A evidence instead of duplicate transaction work. Initial slice qualifies the critical Semantika/LLM Utils consumers; extend the remaining libraries progressively using observed gaps. Existing TKT-SKILL-MANAGER-UPGRADE is verified integration evidence, not a reason to reimplement it.

### Targeted Features
- **FEAT-AIWF-CONSUMER-CONTRACTS**: Usable public ecosystem contracts

### Contained Tickets
- **TKT-CONSUMER-CRITICAL-CONTRACTS** [Backlog]: Qualify critical Semantika and LLM Utils consumer contracts

### Coverage
- **Complete**: Yes

## EPIC-AIWF-INTERFACE-CONSOLIDATION: Configuration, Setup & Interface Consolidation

- **Status**: `planned`
- **Priority**: 2

Reuse verified TKT-SHELL-CONFIG-A, TKT-SHELL-SETUP-B, TKT-SHELL-CONFIG-C, TKT-SHELL-SETUP-D and TKT-SHELL-DAILY-E. Their receipts/fields remain unchanged; do not reopen generic configuration work without a reproducible defect. Preserve Blocked TKT-SHELL-DOGFOOD-F for remaining installed CLI/human-shell/MCP acceptance. Normalize existing TKT-1585 shell visibility. Register the exact edit-last-ticket Bug and typed Bug/Bug-lane contract gap, without relabeling the Bug as a feature. Explicit config/credential precedence, truthful setup/startup/runtime diagnostics and shared paths remain requirements. Acceptance: clean installation, realistic repeat/CLI/shell/MCP journeys, readable theme/NO_COLOR/non-TTY output and explicit contextual-resolution semantics; only genuinely obsolete paths removed.

### Targeted Features
- **FEAT-AIWF-BUG-LIFECYCLE**: Typed Bug identity and governed lifecycle
- **FEAT-AIWF-PRIMARY-INTERFACE**: High-level shell/MCP delegation surface

### Targeted Stories
- **STORY-AIWF-CONTEXTUAL-EDIT**: Developer can edit a contextually referenced Ticket

### Contained Tickets
- **TKT-SHELL-DOGFOOD-F** [Backlog]: Delete superseded shell machinery and verify operational journeys
- **TKT-1585** [Backlog]: Visually distinguish AIWF shell responses from user input
- **TKT-BUG-TYPE-LANE** [Blocked]: Establish explicit Bug typing and lane semantics
- **TKT-BUG-CONTEXTUAL-EDIT** [Backlog]: Bug: shell cannot resolve edit last ticket
- **TKT-BUG-SYNC-MODULE-DRIFT** [Backlog]: Bug: repeated sync changes module symbol count without source edits

### Coverage
- **Complete**: No
- **Gaps**:
  - [ ] blocked: Epic 'EPIC-AIWF-INTERFACE-CONSOLIDATION' is blocked by active blocker(s).

## EPIC-AIWF-WORKFLOW-EFFICIENCY: Workflow Efficiency & Producer Grounding

- **Status**: `planned`
- **Priority**: 2

Use actual Doctrine G3-G5 execution evidence as baseline. Reuse FEAT-AIWF-PERFORMANCE-METRICS, FEAT-AIWF-TICKET-OPS, FEAT-AIWF-TRUTHFUL-PRIMITIVES and completed grounding/repetition/circuit-breaker work. Initial slices measure elapsed/tokens/calls/repeated retrieval/failed iterations/manual interventions/governance overhead, then correct only demonstrated minimal grounding/execution friction before CodeMutator. Ground symbols and public dependency contracts before generation; detect nonexistent imports, wrong callers and broken CLI startup early; use bounded graph context and valid evidence reuse. Independent real-task acceptance must demonstrate improvement rather than extra automation. Existing R3/RILZ obligations remain Blocked until their own acceptance; no transport/guard redesign without contradictory evidence. Do not place every future efficiency improvement before CodeMutator.

### Targeted Features
- **FEAT-AIWF-PERFORMANCE-METRICS**: Correlated AIWF + llm-utils performance telemetry
- **FEAT-AIWF-TICKET-OPS**: Ticket investigation, preparation and end-to-end resolution
- **FEAT-AIWF-TRUTHFUL-PRIMITIVES**: Truthful, efficient code intelligence/change primitives

### Targeted Stories
- **STORY-AIWF-DELEGATE-WORK**: External coding agent can delegate artifact work to AIWF instead of orchestrating dozens of primitives
- **STORY-AIWF-PUBLIC-CONTRACT-CONSUMER**: Producer can ground dependency calls through public contracts

### Contained Tickets
- **TKT-DOGFOOD-CODE-MUTATOR** [Backlog]: Dogfood: rename CausalChangeEngine to CodeMutator
- **TKT-WORKFLOW-BASELINE** [Backlog]: Measure Doctrine execution and governance baseline
- **TKT-WORKFLOW-FOUNDATION** [Backlog]: Correct demonstrated workflow friction before CodeMutator
- **TKT-CODEMUTATOR-GO-NOGO** [Backlog]: CodeMutator dogfooding go/no-go checkpoint

### Coverage
- **Complete**: No
- **Gaps**:
  - [ ] missing_target_path: Epic 'EPIC-AIWF-WORKFLOW-EFFICIENCY' targets Feature 'FEAT-AIWF-TRUTHFUL-PRIMITIVES' but has no contained Ticket implementing it or addressing its stories.
  - [ ] missing_target_path: Epic 'EPIC-AIWF-WORKFLOW-EFFICIENCY' targets UserStory 'STORY-AIWF-DELEGATE-WORK' but has no contained Ticket addressing it.
  - [ ] missing_target_path: Epic 'EPIC-AIWF-WORKFLOW-EFFICIENCY' targets UserStory 'STORY-AIWF-PUBLIC-CONTRACT-CONSUMER' but has no contained Ticket addressing it.

## EPIC-AIWF-CONTINUOUS-VERIFICATION: Continuous Product Verification

- **Status**: `planned`
- **Priority**: 3

After CodeMutator GO and Bug lifecycle foundation, connect enduring product intent/capabilities/Actor Stories/requirements/governance/source/tests/execution/evidence/Bugs/risks through many-to-many canonical graph relationships. Reuse Goal/Feature/UserStory/Concept/Aspect/Rule/Ticket/Module/Symbol/TestNode capabilities. Slices: (1) canonical suite/individual-test identity, provenance and grounded relationships; (2) existing Bun runner structured evidence ingestion; (3) governed Bug reconciliation, resolution and reopening with many-to-many failure attribution; (4) graph impact and risk-proportional selection; (5) product claim/evidence/gap queries and stale-evidence release checks. Native unsupported artifact kinds are explicit representation questions, not invented APIs. Facts, inferences and proposals remain distinguishable. Deterministic graph operations first; AI only for ambiguous attribution/clustering. No separate test DB, duplicate governance, scheduler or generic agent. Acceptance: observed failure -> affected product behavior and higher intent, AND product claim -> current evidence and meaningful gaps. A passing test is evidence, not absolute proof or automatic Bug closure.

### Targeted Features
- **FEAT-AIWF-CONTINUOUS-VERIFICATION**: Bidirectional product-to-reality verification

### Contained Tickets
- **TKT-CPV-REPRESENTATION** [Backlog]: Establish canonical test identity and product evidence relationships
- **TKT-CPV-PRODUCT-ACCEPTANCE** [Backlog]: Accept bidirectional Continuous Product Verification

### Coverage
- **Complete**: Yes

## EPIC-AIWF-ENGINEERING-INTELLIGENCE: Graph-Driven Engineering Intelligence

- **Status**: `planned`
- **Priority**: 4

Only after current Continuous Product Verification acceptance: demonstrated-value impact prediction, redundant-work detection, orphaned tests/requirements, stale evidence, architectural deterioration/neglected risks and evidence-backed readiness/recommendations. Begin by selecting one useful case from actual CPV evidence; do not construct speculative autonomous housekeeping. Baseline/outcome and false-positive/negative costs are acceptance requirements; reuse canonical graph/evidence instead of new trackers or persistent managers.

### Targeted Features
- **FEAT-AIWF-ENGINEERING-INTELLIGENCE**: Evidence-backed engineering insights

### Contained Tickets
- **TKT-INTELLIGENCE-FIRST-USECASE** [Backlog]: Select first demonstrated graph engineering intelligence use case

### Coverage
- **Complete**: Yes

