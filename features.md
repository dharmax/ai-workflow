# Features & Functional Capabilities

## FEAT-AIWF-TRUTHFUL-PRIMITIVES: Truthful, efficient code intelligence/change primitives

- **Status**: `accepted`
- **Completeness Target**: `production`
- **Epics**: `EPIC-AIWF-ARTIFACT-OPS`, `EPIC-AIWF-WORKFLOW-EFFICIENCY`

Production capability governed by docs/artifact-operations-plan.md.

### Implementing Tickets
- **AIWF-PRIMITIVE-TRUTH** [Done]: Gate 1: PRIMITIVE-TRUTH

### Verifying Tests
- **TEST-AIWF-PRIMITIVE-TRUTH**

### Coverage
- **Complete**: Yes

## FEAT-AIWF-ARTIFACT-POLICY: Completeness/depth/critic operation policy

- **Status**: `accepted`
- **Completeness Target**: `production`
- **Epics**: `EPIC-AIWF-ARTIFACT-OPS`

Production capability governed by docs/artifact-operations-plan.md.

### Implementing Tickets
- **AIWF-OPERATION-POLICY** [Done]: Gate 2: OPERATION-POLICY

### Verifying Tests
- **TEST-AIWF-OPERATION-POLICY**

### Coverage
- **Complete**: Yes

## FEAT-AIWF-ASPECTS: First-class cross-cutting Aspects

- **Status**: `accepted`
- **Completeness Target**: `production`
- **Epics**: `EPIC-AIWF-ARTIFACT-OPS`

Production capability governed by docs/artifact-operations-plan.md.

### Implementing Tickets
- **AIWF-ASPECTS** [Done]: Gate 3: ASPECTS

### Verifying Tests
- **TEST-AIWF-ASPECTS**

### Coverage
- **Complete**: Yes

## FEAT-AIWF-TICKET-OPS: Ticket investigation, preparation and end-to-end resolution

- **Status**: `accepted`
- **Completeness Target**: `production`
- **Epics**: `EPIC-AIWF-ARTIFACT-OPS`, `EPIC-AIWF-WORKFLOW-EFFICIENCY`

Production capability governed by docs/artifact-operations-plan.md.

### Legacy User Stories (read-only)
- **STORY-AIWF-INVESTIGATE-TICKET**: Caller can obtain a grounded Ticket dossier without doing repository archaeology itself
- **STORY-AIWF-PREPARE-TICKET**: Caller can make a broad Ticket executable or receive precise missing-input requirements
- **STORY-AIWF-RESOLVE-TICKET**: Caller can delegate a Ticket and receive verified completion / needs-input / blocked

### Implementing Tickets
- **AIWF-TICKET-INVESTIGATION** [Done]: Gate 4: TICKET-INVESTIGATION
- **AIWF-TICKET-PREPARATION** [Done]: Gate 5: TICKET-PREPARATION
- **AIWF-TICKET-RESOLUTION-FIRST-PROOF** [In Progress]: Gate 7: TICKET-RESOLUTION-FIRST-PROOF
- **TKT-WORKFLOW-FOUNDATION** [Backlog]: Correct demonstrated workflow friction before CodeMutator

### Coverage
- **Complete**: Yes

## FEAT-AIWF-PERFORMANCE-METRICS: Correlated AIWF + llm-utils performance telemetry

- **Status**: `accepted`
- **Completeness Target**: `production`
- **Epics**: `EPIC-AIWF-ARTIFACT-OPS`, `EPIC-AIWF-WORKFLOW-EFFICIENCY`

Production capability governed by docs/artifact-operations-plan.md.

### Implementing Tickets
- **AIWF-PERFORMANCE-METRICS** [Done]: Gate 6: PERFORMANCE-METRICS
- **TKT-WORKFLOW-BASELINE** [Backlog]: Measure Doctrine execution and governance baseline

### Verifying Tests
- **TEST-AIWF-METRICS**

### Coverage
- **Complete**: Yes

## FEAT-AIWF-PRODUCT-PROCESSING: Story/Feature/Epic semantic processing

- **Status**: `accepted`
- **Completeness Target**: `production`
- **Epics**: `EPIC-AIWF-ARTIFACT-OPS`

Production capability governed by docs/artifact-operations-plan.md.

### Legacy User Stories (read-only)
- **STORY-AIWF-PROCESS-INTENT**: Caller can process Story/Feature/Epic into the next useful work/intent layer without ceremonial artifacts

### Implementing Tickets
- **AIWF-PRODUCT-PROCESSING** [Done]: Gate 8: PRODUCT-PROCESSING

### Verifying Tests
- **TEST-AIWF-PROCESS**

### Coverage
- **Complete**: Yes

## FEAT-AIWF-PRIMARY-INTERFACE: High-level shell/MCP delegation surface

- **Status**: `accepted`
- **Completeness Target**: `production`
- **Epics**: `EPIC-AIWF-ARTIFACT-OPS`, `EPIC-AIWF-INTERFACE-CONSOLIDATION`

Production capability governed by docs/artifact-operations-plan.md.

### User Stories
- **STORY-AIWF-CONTEXTUAL-EDIT**: Developer can edit a contextually referenced Ticket

### Legacy User Stories (read-only)
- **STORY-AIWF-DELEGATE-WORK**: External coding agent can delegate artifact work to AIWF instead of orchestrating dozens of primitives

### Implementing Tickets
- **AIWF-PRIMARY-INTERFACE** [Done]: Gate 9: PRIMARY-INTERFACE
- **TKT-BUG-CONTEXTUAL-EDIT** [Backlog]: Bug: shell cannot resolve edit last ticket

### Verifying Tests
- **TEST-AIWF-DELEGATION**

### Coverage
- **Complete**: Yes

## FEAT-AIWF-GOVERNED-COMPLETION: Governed source completion and current proof

- **Status**: `accepted`
- **Epics**: `EPIC-AIWF-DOCTRINE`, `EPIC-AIWF-TRANSACTION-INTEGRITY`

Completion covers declared and attributable actual changes, all applicable Rule layers and current evidence.

### Acceptance Criteria
- [ ] Producer-authored links never prune actual governed changes.
- [ ] Verification/receipt scope and Rule identity/version match; relevant races invalidate proof.
- [ ] Dirty-tree attribution, child boundaries, old receipts and unknown scope have explicit truthful behavior.

### User Stories
- **STORY-AIWF-RESOLVE-TICKET**: Caller can delegate a Ticket and receive verified completion / needs-input / blocked

### Implementing Tickets
- **TKT-DOCTRINE-SEMANTIKA-CONTRACT** [Todo]: Establish Gate 5 Semantika selection/completion contract
- **TKT-TRANSACTION-PRODUCT-BATCH** [Backlog]: Make guarded Product batches atomic through Semantika

### Coverage
- **Complete**: Yes

## FEAT-AIWF-CONSUMER-CONTRACTS: Usable public ecosystem contracts

- **Status**: `accepted`
- **Epics**: `EPIC-AIWF-CONSUMER-CONTRACTS`

Consumers can use sibling libraries from public contracts and verified examples.

### Acceptance Criteria
- [ ] Critical contracts identify owners, invariants, failures, concurrency and backend limits.
- [ ] Consumer examples compile/run without speculative wrappers, nonexistent imports or routine internal inspection.
- [ ] Semantika gaps are documented at the dependency boundary, not compensated inside AIWF.

### User Stories
- **STORY-AIWF-PUBLIC-CONTRACT-CONSUMER**: Producer can ground dependency calls through public contracts

### Implementing Tickets
- **TKT-CONSUMER-CRITICAL-CONTRACTS** [Backlog]: Qualify critical Semantika and LLM Utils consumer contracts

### Coverage
- **Complete**: No
- **Gaps**:
  - [ ] missing_code_grounding: Accepted Feature 'FEAT-AIWF-CONSUMER-CONTRACTS' has implementation Ticket(s) but no code modifications or targets.
  - [ ] missing_verification: Accepted Feature 'FEAT-AIWF-CONSUMER-CONTRACTS' has no verification Test directly or via contained stories.

## FEAT-AIWF-BUG-LIFECYCLE: Typed Bug identity and governed lifecycle

- **Status**: `accepted`
- **Epics**: `EPIC-AIWF-INTERFACE-CONSOLIDATION`

A reporter retains reproducible defects as Bugs; execution and reopening remain evidence-governed.

### Acceptance Criteria
- [ ] Explicit Bug identity/classification and Bug-lane semantics replace title-substring guesses while preserving existing Ticket identities/history.
- [ ] Bugs retain exact reproduction, expected/actual behavior and relevant source/test evidence.
- [ ] One failure is not necessarily one Bug; one passing test does not automatically close a Bug.

### User Stories
- **STORY-AIWF-REPORT-BUG**: Reporter can register and retain a reproducible Bug

### Implementing Tickets
- **TKT-BUG-TYPE-LANE** [Backlog]: Establish explicit Bug typing and lane semantics

### Coverage
- **Complete**: No
- **Gaps**:
  - [ ] missing_code_grounding: Accepted Feature 'FEAT-AIWF-BUG-LIFECYCLE' has implementation Ticket(s) but no code modifications or targets.
  - [ ] missing_verification: Accepted Feature 'FEAT-AIWF-BUG-LIFECYCLE' has no verification Test directly or via contained stories.

## FEAT-AIWF-CONTINUOUS-VERIFICATION: Bidirectional product-to-reality verification

- **Status**: `accepted`
- **Epics**: `EPIC-AIWF-CONTINUOUS-VERIFICATION`

Maintain relationships between enduring product guarantees and observed execution.

### Acceptance Criteria
- [ ] Both failure-to-product and product-to-current-evidence journeys work on real examples.
- [ ] Stable suite/individual-test identities, evidence provenance and many-to-many Bug/Story/source mappings remain canonical.
- [ ] Stale evidence, unverified claims and release gaps are explicit; facts/inferences/proposals are distinguishable.

### User Stories
- **STORY-AIWF-FAILURE-TO-PRODUCT**: Maintainer can trace a failure to affected product behavior
- **STORY-AIWF-CLAIM-TO-EVIDENCE**: Release actor can inspect evidence and gaps for a product claim

### Implementing Tickets
- **TKT-CPV-REPRESENTATION** [Backlog]: Establish canonical test identity and product evidence relationships
- **TKT-CPV-PRODUCT-ACCEPTANCE** [Backlog]: Accept bidirectional Continuous Product Verification

### Coverage
- **Complete**: No
- **Gaps**:
  - [ ] missing_code_grounding: Accepted Feature 'FEAT-AIWF-CONTINUOUS-VERIFICATION' has implementation Ticket(s) but no code modifications or targets.
  - [ ] missing_verification: Accepted Feature 'FEAT-AIWF-CONTINUOUS-VERIFICATION' has no verification Test directly or via contained stories.

## FEAT-AIWF-ENGINEERING-INTELLIGENCE: Evidence-backed engineering insights

- **Status**: `accepted`
- **Epics**: `EPIC-AIWF-ENGINEERING-INTELLIGENCE`

Use current verification graph to identify demonstrated maintenance/product readiness needs.

### Acceptance Criteria
- [ ] A bounded use case has observed user value and measured accuracy/cost.
- [ ] Recommendations cite current facts and disclose inference/uncertainty.
- [ ] No speculative autonomous housekeeping or duplicate graph/evidence state.

### User Stories
- **STORY-AIWF-EVIDENCE-BACKED-INSIGHT**: Maintainer receives useful evidence-backed engineering recommendations

### Implementing Tickets
- **TKT-INTELLIGENCE-FIRST-USECASE** [Backlog]: Select first demonstrated graph engineering intelligence use case

### Coverage
- **Complete**: No
- **Gaps**:
  - [ ] missing_code_grounding: Accepted Feature 'FEAT-AIWF-ENGINEERING-INTELLIGENCE' has implementation Ticket(s) but no code modifications or targets.
  - [ ] missing_verification: Accepted Feature 'FEAT-AIWF-ENGINEERING-INTELLIGENCE' has no verification Test directly or via contained stories.

