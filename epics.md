# Epics

_Generated from the workflow DB._

## EPC-SHELL-RECOVERY-01 Recover shell planner routing and workflow behavior

### Goal

Recover shell planner fallback, admin gating, no-AI strictness, continuation handling, and workflow hygiene for shell status resolution.

### Status

- [ ] Active
<!-- status: open -->

### User stories
#### Story 1

None captured yet.

### Ticket batches
- None captured yet.

### Kanban tickets
- BUG-SHELL-ROUTE-001 Restore shell planner fallback when Ollama is unavailable but AI is routeable [In Progress]
- BUG-WORKFLOW-HYGIENE-001 Sanitize malformed synthetic workflow tickets before shell status resolution [Todo]
- BUG-SHELL-CONT-001 Stop stale continuation state from hijacking fresh standalone requests [Todo]
- BUG-SHELL-NOAI-001 Enforce strict no-AI shell mode for non-primitive prompts [Todo]
- BUG-SHELL-GATE-001 Remove In Progress ticket gating from shell admin and maintenance commands [Todo]
