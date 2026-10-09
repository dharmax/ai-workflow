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
- **Enabling Features**: `FEAT-AIWF-TICKET-OPS`
- **Actor**: External caller
- **Story**: Caller can delegate a Ticket and receive verified completion / needs-input / blocked
- **Tickets**: `AIWF-TICKET-RESOLUTION-FIRST-PROOF`
- **Tests**: `TEST-AIWF-RESOLVE`
- **Acceptance Criteria**:
  - [ ] Caller delegates a Ticket and receives explicitly verified completion, needs_input or blocked, with safe edits, bounded repair and truthful leases.
- **Coverage**: Complete

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

