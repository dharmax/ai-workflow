# Epics

_Generated from the workflow DB._

## EPIC-001 Make ai-workflow shell trustworthy for operator prompts

### Goal

Make the shell behave like a reliable project operator: it should answer planning and explainer prompts correctly, stay honest about local-first routing and fallback, and expose enough evidence that the result can be audited.

### Status

- [ ] Active
<!-- status: open -->

### User stories
#### Story 1

**As an operator**, I can ask the shell for planning help or repo explanations and get a grounded, appropriately detailed response instead of a shallow status lookup.

#### Story 2

**As an operator**, I can tell when the shell is using local models, when it is unavailable locally, and when escalation is happening, without the tool pretending those states are equivalent.

#### Story 3

**As an operator**, I can verify the shell with repeatable dogfood and benchmark evidence before trusting changes to the operator surface.

### Ticket batches
- Phase 1: stabilize shell routing and status after dogfood fix.
- Phase 2: lock shell trust with benchmarks and provenance.

### Kanban tickets
- TKT-SHELL-PHASE2-003 Phase 2: lock shell trust with benchmarks and provenance [Deep Backlog]
- TKT-SHELL-PHASE1-004 Phase 1: stabilize shell routing and status after dogfood fix [Done]
- TKT-SHELL-PHASE1-003 Phase 1: make shell pass planning and explainer dogfood [Done]
- TEST-TICKET-EPIC-CHECK temp [Done]
