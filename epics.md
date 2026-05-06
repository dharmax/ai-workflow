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
- BUG-WORKFLOW-HYGIENE-001 Sanitize malformed synthetic workflow tickets before shell status resolution [Todo]
- BUG-SHELL-CONT-001 Stop stale continuation state from hijacking fresh standalone requests [Todo]
- BUG-SHELL-NOAI-001 Enforce strict no-AI shell mode for non-primitive prompts [Todo]
- BUG-SHELL-GATE-001 Remove In Progress ticket gating from shell admin and maintenance commands [Todo]

## EPC-SHELL-SKILL-01 Formalizing Shell and Skill Architectural Separation

### Goal

Formalize the architectural separation between human-centric Shell (REPL) and agent-centric Skill (headless tool) while maintaining a shared, LLM-capable Common Core.

### Status

- [ ] Active
<!-- status: open -->

### User stories
#### Story 1

**As a developer**, I want to move core logic (Kanban, status, providers, orchestrator) and internal LLM capabilities out of the CLI layer and into a shared common package so that both Shell and Skill can consume it consistently and perform internal task reasoning.

#### Story 2

**As an AI agent**, I want ai-workflow to detect when it is being used as a skill so that it can suppress human-centric UI and use its own internal LLM for delegated tasks without triggering a nested shell planner.

#### Story 3

**As a human user**, I want a rich interactive shell with spinners, colors, and setup wizards that doesn't break the deterministic requirements of the agent-facing Skill mode.

### Ticket batches
- Phase 1: Engine Purity (Core Extraction)
- Phase 2: Agent-Aware Skill Mode
- Phase 3: State-Sharing Shell REPL

### Kanban tickets
- TKT-ANALYSIS-002 Implement ai-workflow tool locate-trapped-logic [Todo]
- TKT-ANALYSIS-001 Implement ai-workflow project map-dependencies [Todo]
- TKT-SHELL-001 Polish shell interactive mode with shared terminal handle [Todo]
- TKT-SKILL-002 Refactor --no-ai to allow internal delegated reasoning [Todo]
- TKT-SKILL-001 Implement skill-awareness via environment and flags [Todo]
- TKT-CORE-002 Decouple llm-utils from shell-specific heuristics [Todo]
- TKT-CORE-001 Extract core workflow logic from cli/lib to core/services [Todo]
