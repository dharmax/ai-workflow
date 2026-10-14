# Aspects & Cross-cutting Intent

## ASP-AIWF-KISS: Maintainability / KISS

- **Status**: `accepted`
- **Scopes**: `EPIC-AIWF-ARTIFACT-OPS`, `EPIC-AIWF-CONSUMER-CONTRACTS`, `EPIC-AIWF-CONTINUOUS-VERIFICATION`, `EPIC-AIWF-DOCTRINE`, `EPIC-AIWF-ENGINEERING-INTELLIGENCE`, `EPIC-AIWF-INTERFACE-CONSOLIDATION`, `EPIC-AIWF-TRANSACTION-INTEGRITY`, `EPIC-AIWF-WORKFLOW-EFFICIENCY`

### Description


### Acceptance Criteria
- [ ] Entity-owned behavior and thin adapters; no service wrappers, shadow graph or generic workflow infrastructure.
- [ ] Method-level review finds the smallest implementation that meets acceptance.

### Evidence (read-only)
- Tickets: TKT-RESOLVE-RECOVERY-R3, TKT-RILZ
- Tests: None
- Artifacts: REPORT-AIWF-GATE10, REPORT-AIWF-GATE7, REPORT-AIWF-GATES-1-2, REPORT-AIWF-GATES8-9
- Decisions: None
- Code: None
- Gaps: None

## ASP-AIWF-TRUTH: Robustness / truthfulness

- **Status**: `accepted`
- **Scopes**: `EPIC-AIWF-ARTIFACT-OPS`, `EPIC-AIWF-CONSUMER-CONTRACTS`, `EPIC-AIWF-CONTINUOUS-VERIFICATION`, `EPIC-AIWF-DOCTRINE`, `EPIC-AIWF-ENGINEERING-INTELLIGENCE`, `EPIC-AIWF-INTERFACE-CONSOLIDATION`, `EPIC-AIWF-TRANSACTION-INTEGRITY`, `EPIC-AIWF-WORKFLOW-EFFICIENCY`, `FEAT-AIWF-TICKET-OPS`, `FEAT-AIWF-TRUTHFUL-PRIMITIVES`

### Description


### Acceptance Criteria
- [ ] Exact facts use language tooling; heuristic facts and excerpts are labelled.
- [ ] Completion requires verified acceptance; missing capability or evidence returns a truthful blocker.

### Evidence (read-only)
- Tickets: None
- Tests: None
- Artifacts: REPORT-AIWF-GATE10, REPORT-AIWF-GATE7, REPORT-AIWF-GATES-1-2, REPORT-AIWF-GATES8-9
- Decisions: None
- Code: None
- Gaps: None

## ASP-AIWF-EFFICIENCY: Execution efficiency / token attention

- **Status**: `accepted`
- **Scopes**: `EPIC-AIWF-ARTIFACT-OPS`, `EPIC-AIWF-CONSUMER-CONTRACTS`, `EPIC-AIWF-CONTINUOUS-VERIFICATION`, `EPIC-AIWF-DOCTRINE`, `EPIC-AIWF-ENGINEERING-INTELLIGENCE`, `EPIC-AIWF-INTERFACE-CONSOLIDATION`, `EPIC-AIWF-TRANSACTION-INTEGRITY`, `EPIC-AIWF-WORKFLOW-EFFICIENCY`, `FEAT-AIWF-PRIMARY-INTERFACE`, `FEAT-AIWF-TICKET-OPS`

### Description


### Acceptance Criteria
- [ ] Bounded retrieval and freshness reuse avoid unnecessary writes/source exposure.
- [ ] Token savings are claimed only when measured; deterministic operation timings and result sizes are recorded.

### Evidence (read-only)
- Tickets: None
- Tests: None
- Artifacts: REPORT-AIWF-GATE10, REPORT-AIWF-GATE7, REPORT-AIWF-GATES-1-2, REPORT-AIWF-GATES8-9
- Decisions: None
- Code: None
- Gaps: None

## ASP-AIWF-EXECUTION-ACCEPTANCE: Bounded, proportional and measured autonomous acceptance

- **Status**: `accepted`
- **Scopes**: `EPIC-AIWF-CONSUMER-CONTRACTS`, `EPIC-AIWF-CONTINUOUS-VERIFICATION`, `EPIC-AIWF-DOCTRINE`, `EPIC-AIWF-ENGINEERING-INTELLIGENCE`, `EPIC-AIWF-INTERFACE-CONSOLIDATION`, `EPIC-AIWF-TRANSACTION-INTEGRITY`, `EPIC-AIWF-WORKFLOW-EFFICIENCY`

### Description
Complements existing KISS, truthfulness and efficiency Aspects with the new roadmap's execution/acceptance obligations. Applies to downstream slices, not a new enforcement subsystem.

### Acceptance Criteria
- [ ] Scale investigation, retrieval and verification to demonstrated impact; mandatory governance remains mandatory and evidence reuse requires current validity.
- [ ] At acceptance record baseline and outcome for at least one of capability, correctness, architectural simplicity or operational efficiency; demonstrate no unjustified regression in the others.
- [ ] Repeated failure without new evidence stops execution, preserves recoverable state/evidence and reports the exact blocker; no threshold escalation or repetitive repository scans.
- [ ] Inspect actual touched methods, callers, public contracts, ownership and failure paths; consequential defects, silent failures and invalid verification block release despite green tests.
- [ ] Use existing leases, preview fingerprints, guarded mutations, tests, independent acceptance, receipts and projection sync under the user workflow; minimize manual bookkeeping without weakening guarantees.

### Evidence (read-only)
- Tickets: None
- Tests: None
- Artifacts: None
- Decisions: None
- Code: None
- Gaps: missing_work_or_evidence
