# Features & Functional Capabilities

## FEAT-AIWF-TRUTHFUL-PRIMITIVES: Truthful, efficient code intelligence/change primitives

- **Status**: `accepted`
- **Completeness Target**: `production`
- **Epics**: `EPIC-AIWF-ARTIFACT-OPS`

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
- **Epics**: `EPIC-AIWF-ARTIFACT-OPS`

Production capability governed by docs/artifact-operations-plan.md.

### User Stories
- **STORY-AIWF-INVESTIGATE-TICKET**: Caller can obtain a grounded Ticket dossier without doing repository archaeology itself
- **STORY-AIWF-PREPARE-TICKET**: Caller can make a broad Ticket executable or receive precise missing-input requirements
- **STORY-AIWF-RESOLVE-TICKET**: Caller can delegate a Ticket and receive verified completion / needs-input / blocked

### Implementing Tickets
- **AIWF-TICKET-INVESTIGATION** [Done]: Gate 4: TICKET-INVESTIGATION
- **AIWF-TICKET-PREPARATION** [Done]: Gate 5: TICKET-PREPARATION
- **AIWF-TICKET-RESOLUTION-FIRST-PROOF** [Backlog]: Gate 7: TICKET-RESOLUTION-FIRST-PROOF

### Coverage
- **Complete**: Yes

## FEAT-AIWF-PERFORMANCE-METRICS: Correlated AIWF + llm-utils performance telemetry

- **Status**: `accepted`
- **Completeness Target**: `production`
- **Epics**: `EPIC-AIWF-ARTIFACT-OPS`

Production capability governed by docs/artifact-operations-plan.md.

### Implementing Tickets
- **AIWF-PERFORMANCE-METRICS** [Blocked]: Gate 6: PERFORMANCE-METRICS

### Coverage
- **Complete**: No
- **Gaps**:
  - [ ] blocked: Feature 'FEAT-AIWF-PERFORMANCE-METRICS' is blocked by active blocker(s).
  - [ ] missing_code_grounding: Accepted Feature 'FEAT-AIWF-PERFORMANCE-METRICS' has implementation Ticket(s) but no code modifications or targets.
  - [ ] missing_verification: Accepted Feature 'FEAT-AIWF-PERFORMANCE-METRICS' has no verification Test directly or via contained stories.

## FEAT-AIWF-PRODUCT-PROCESSING: Story/Feature/Epic semantic processing

- **Status**: `accepted`
- **Completeness Target**: `production`
- **Epics**: `EPIC-AIWF-ARTIFACT-OPS`

Production capability governed by docs/artifact-operations-plan.md.

### User Stories
- **STORY-AIWF-PROCESS-INTENT**: Caller can process Story/Feature/Epic into the next useful work/intent layer without ceremonial artifacts

### Implementing Tickets
- **AIWF-PRODUCT-PROCESSING** [Backlog]: Gate 8: PRODUCT-PROCESSING

### Coverage
- **Complete**: No
- **Gaps**:
  - [ ] missing_code_grounding: Accepted Feature 'FEAT-AIWF-PRODUCT-PROCESSING' has implementation Ticket(s) but no code modifications or targets.
  - [ ] missing_verification: Accepted Feature 'FEAT-AIWF-PRODUCT-PROCESSING' has no verification Test directly or via contained stories.

## FEAT-AIWF-PRIMARY-INTERFACE: High-level shell/MCP delegation surface

- **Status**: `accepted`
- **Completeness Target**: `production`
- **Epics**: `EPIC-AIWF-ARTIFACT-OPS`

Production capability governed by docs/artifact-operations-plan.md.

### User Stories
- **STORY-AIWF-DELEGATE-WORK**: External coding agent can delegate artifact work to AIWF instead of orchestrating dozens of primitives

### Implementing Tickets
- **AIWF-PRIMARY-INTERFACE** [Backlog]: Gate 9: PRIMARY-INTERFACE

### Coverage
- **Complete**: No
- **Gaps**:
  - [ ] missing_code_grounding: Accepted Feature 'FEAT-AIWF-PRIMARY-INTERFACE' has implementation Ticket(s) but no code modifications or targets.
  - [ ] missing_verification: Accepted Feature 'FEAT-AIWF-PRIMARY-INTERFACE' has no verification Test directly or via contained stories.

