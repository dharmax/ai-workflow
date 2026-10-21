# User Stories & Behavioral Specifications

## STORY-AIWF-INVESTIGATE-TICKET: Caller can obtain a grounded Ticket dossier without doing repository archaeology itself
- **Status**: `accepted`
- **Enabling Features**: `FEAT-AIWF-TICKET-OPS`
- **Actor**: External caller
- **Story**: Caller can obtain a grounded Ticket dossier without doing repository archaeology itself
- **Tickets**: `AIWF-TICKET-INVESTIGATION`
- **Tests**: `TEST-AIWF-INVESTIGATE`
- **Acceptance Criteria**:
  - [ ] Caller obtains a grounded read-only Ticket dossier with mandatory acceptance, Aspect and exact code evidence or precise missing-input requirements.
  - [ ] System-1 unavailable still yields correct behavior by retaining all mandatory evidence and falling back safely without failing engineering work.
- **Coverage**: Complete

## STORY-AIWF-PREPARE-TICKET: Caller can make a broad Ticket executable or receive precise missing-input requirements
- **Status**: `accepted`
- **Enabling Features**: `FEAT-AIWF-TICKET-OPS`
- **Actor**: External caller
- **Story**: Caller can make a broad Ticket executable or receive precise missing-input requirements
- **Tickets**: `AIWF-TICKET-PREPARATION`
- **Tests**: `TEST-AIWF-PREPARE`
- **Acceptance Criteria**:
  - [ ] Caller makes a broad Ticket executable through reviewed ordinary Ticket children or receives precise missing-input requirements; rerun creates no duplicates.
- **Coverage**: Complete

## STORY-AIWF-RESOLVE-TICKET: Caller can delegate a Ticket and receive verified completion / needs-input / blocked
- **Status**: `accepted`
- **Enabling Features**: `FEAT-AIWF-GOVERNED-COMPLETION`, `FEAT-AIWF-TICKET-OPS`
- **Epics**: `EPIC-AIWF-DOCTRINE`
- **Actor**: External caller
- **Story**: Caller can delegate a Ticket and receive verified completion / needs-input / blocked
- **Tickets**: `AIWF-TICKET-RESOLUTION-FIRST-PROOF`
- **Tests**: `TEST-AIWF-RESOLVE`
- **Acceptance Criteria**:
  - [ ] Caller delegates a Ticket and receives explicitly verified completion, needs_input or blocked, with safe edits, bounded repair and truthful leases.
- **Coverage**: blocked

## STORY-AIWF-PROCESS-INTENT: Caller can process Story/Feature/Epic into the next useful work/intent layer without ceremonial artifacts
- **Status**: `accepted`
- **Enabling Features**: `FEAT-AIWF-PRODUCT-PROCESSING`
- **Actor**: External caller
- **Story**: Caller can process Story/Feature/Epic into the next useful work/intent layer without ceremonial artifacts
- **Tickets**: `AIWF-PRODUCT-PROCESSING`
- **Tests**: `TEST-AIWF-PROCESS`
- **Acceptance Criteria**:
  - [ ] Caller processes Story/Feature/Epic into necessary reviewed next-layer intent/work, reusing stable artifacts without ceremonial Stories or duplicate Tickets.
- **Coverage**: Complete

## STORY-AIWF-DELEGATE-WORK: External coding agent can delegate artifact work to AIWF instead of orchestrating dozens of primitives
- **Status**: `accepted`
- **Enabling Features**: `FEAT-AIWF-PRIMARY-INTERFACE`
- **Epics**: `EPIC-AIWF-WORKFLOW-EFFICIENCY`
- **Actor**: External caller
- **Story**: External coding agent can delegate artifact work to AIWF instead of orchestrating dozens of primitives
- **Tickets**: `AIWF-PRIMARY-INTERFACE`
- **Tests**: `TEST-AIWF-DELEGATION`
- **Acceptance Criteria**:
  - [ ] An external coding agent given a Ticket invokes artifact-level AIWF delegation first; consistent policy, explicit target persistence and primitive drill-down remain available.
- **Coverage**: Complete

## STORY-AIWF-SOPHISTICATED-GOAL: Developer can ask compound goals and receive grounded, truthful answers across all requested parts
- **Status**: `accepted`
- **Actor**: External developer
- **Story**: Developer can ask compound goals and receive grounded, truthful answers across all requested parts
- **Acceptance Criteria**:
  - [ ] Compound multi-part goals (e.g. project goal + critical path + missing work) acquire governing evidence, do not exhaust steps echoing notes, and answer every requested part.
  - [ ] Recommendation and candidate ranking queries (e.g. 2nd recommended ticket, extremes comparison) evaluate eligibility constraints against governing policy without hallucinating or selecting ineligible items.
  - [ ] Semantic capability discovery on compound queries correctly normalizes domain/object aliases (e.g. "project", "critical path") to valid registered capabilities without unsupported classification errors.
- **Coverage**: missing_parent, missing_work, missing_verification

## STORY-AIWF-PUBLIC-CONTRACT-CONSUMER: Producer can ground dependency calls through public contracts
- **Status**: `accepted`
- **Enabling Features**: `FEAT-AIWF-CONSUMER-CONTRACTS`
- **Epics**: `EPIC-AIWF-WORKFLOW-EFFICIENCY`
- **Actor**: Autonomous engineering producer
- **Story**: When generating or reviewing code, I can resolve real exported operations, callers, invariants and failure semantics from public contracts before proposing mutations.
- **Acceptance Criteria**:
  - [ ] Required operations and imports are real and scope-grounded; ambiguous contracts produce an exact blocker.
  - [ ] Examples and measurements show fewer first-attempt failures and repeated retrieval without weakening governance.
- **Coverage**: missing_parent, missing_work, missing_verification

## STORY-AIWF-CONTEXTUAL-EDIT: Developer can edit a contextually referenced Ticket
- **Status**: `accepted`
- **Enabling Features**: `FEAT-AIWF-PRIMARY-INTERFACE`
- **Epics**: `EPIC-AIWF-INTERFACE-CONSOLIDATION`
- **Actor**: Human developer
- **Story**: When I request edit last ticket, AIWF resolves the relevant creation/reference context and opens the canonical entity, or asks only the missing disambiguation question.
- **Tickets**: `TKT-BUG-CONTEXTUAL-EDIT`
- **Acceptance Criteria**:
  - [ ] Literal last ticket is never treated as an entity ID.
  - [ ] Most-recently-created and most-recently-referenced semantics are defined; ambiguous/no-context cases fail explicitly.
  - [ ] Explicit-ID editing, CLI/plain-shell/TTY behavior and unrelated records remain unchanged.
- **Coverage**: missing_parent, missing_code_grounding, missing_verification

## STORY-AIWF-REPORT-BUG: Reporter can register and retain a reproducible Bug
- **Status**: `accepted`
- **Enabling Features**: `FEAT-AIWF-BUG-LIFECYCLE`
- **Actor**: Human or automated reporter
- **Story**: When observed behavior differs from an accepted requirement, I can register/reuse a typed Bug with reproducible evidence and governed lifecycle, without losing its identity in generic feature work.
- **Tickets**: `TKT-BUG-SYNC-MODULE-DRIFT`
- **Acceptance Criteria**:
  - [ ] Bug identity and lane semantics are explicit, not inferred from fix/bug substrings.
  - [ ] Duplicate reports and multiple failed tests reconcile without assuming one-to-one mapping.
  - [ ] Resolution/reopening cites current evidence and does not follow one passing test automatically.
- **Coverage**: missing_parent, missing_code_grounding, missing_verification

## STORY-AIWF-FAILURE-TO-PRODUCT: Maintainer can trace a failure to affected product behavior
- **Status**: `accepted`
- **Enabling Features**: `FEAT-AIWF-CONTINUOUS-VERIFICATION`
- **Actor**: Maintainer or autonomous monitor
- **Story**: When execution fails, I can trace the evidence through tests/source/governance to affected Actor Stories, requirements and capabilities, with attribution uncertainty explicit.
- **Acceptance Criteria**:
  - [ ] A real failing Bun execution links to affected enduring Stories and capability/requirements.
  - [ ] Failure clusters can relate to multiple Bugs or no confirmed Bug; proposals are not promoted to facts.
  - [ ] Recovery preserves verification history and does not automatically close related Bugs.
- **Coverage**: missing_parent, missing_work, missing_verification

## STORY-AIWF-CLAIM-TO-EVIDENCE: Release actor can inspect evidence and gaps for a product claim
- **Status**: `accepted`
- **Enabling Features**: `FEAT-AIWF-CONTINUOUS-VERIFICATION`
- **Actor**: Human release reviewer or autonomous verifier
- **Story**: Before relying on a capability or Actor Story, I can inspect its current supporting evidence, stale evidence and meaningful verification gaps.
- **Acceptance Criteria**:
  - [ ] Capability -> enduring Story/requirements -> source/tests -> current execution evidence is navigable.
  - [ ] Changed source/governance/test evidence invalidates affected support; historical receipts remain readable.
  - [ ] Release output distinguishes unsupported claims, current observations and inferences; green tests alone do not certify readiness.
- **Coverage**: missing_parent, missing_work, missing_verification

## STORY-AIWF-EVIDENCE-BACKED-INSIGHT: Maintainer receives useful evidence-backed engineering recommendations
- **Status**: `accepted`
- **Enabling Features**: `FEAT-AIWF-ENGINEERING-INTELLIGENCE`
- **Actor**: Maintainer
- **Story**: With a current product verification graph, I can request one demonstrated engineering insight with cited evidence, uncertainty and measured benefit.
- **Acceptance Criteria**:
  - [ ] A real use case is justified by CPV evidence before implementation.
  - [ ] Accuracy/false-positive costs and effort improvement are measured.
  - [ ] No autonomous repair/housekeeping is implied by a recommendation.
- **Coverage**: missing_parent, missing_work, missing_verification

