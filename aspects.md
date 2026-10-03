# Aspects & Cross-cutting Intent

## ASP-AIWF-KISS: Maintainability / KISS

- **Status**: `accepted`
- **Scopes**: `EPIC-AIWF-ARTIFACT-OPS`

### Description


### Acceptance Criteria
- [ ] Entity-owned behavior and thin adapters; no service wrappers, shadow graph or generic workflow infrastructure.
- [ ] Method-level review finds the smallest implementation that meets acceptance.

### Evidence (read-only)
- Tickets: None
- Tests: None
- Artifacts: REPORT-AIWF-GATE10, REPORT-AIWF-GATE7, REPORT-AIWF-GATES-1-2, REPORT-AIWF-GATES8-9
- Decisions: None
- Code: None
- Gaps: None

## ASP-AIWF-TRUTH: Robustness / truthfulness

- **Status**: `accepted`
- **Scopes**: `EPIC-AIWF-ARTIFACT-OPS`, `FEAT-AIWF-TICKET-OPS`, `FEAT-AIWF-TRUTHFUL-PRIMITIVES`

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
- **Scopes**: `EPIC-AIWF-ARTIFACT-OPS`, `FEAT-AIWF-PRIMARY-INTERFACE`, `FEAT-AIWF-TICKET-OPS`

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
