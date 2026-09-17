# 🤖 AI-Workflow Agent Protocols & Role Specifications

## 1. Core Operating Guidelines
- **Zero Hallucinated Parameters**: All tool calls must strictly conform to their Zod parameter schemas.
- **Lease Invariant**: No agent may modify files associated with a ticket without an active lease recorded via `claim_ticket`.
- **Extreme KISS**: Implement the simplest working solution first. Avoid monolithic components or complicated wrappers.
- **Verification Gate**: Every code modification must be verified by running the corresponding unit test suite via `resolve_test_target` and `triage_test_failures`.
- **Graph As Truth**: Never edit markdown files directly without running `aiwf sync` to reconcile changes back into the AST+ Graph.

---

## 2. Dynamic Modes & Agent Personas

### [DESIGN] Mode
- **Focus**: System architecture, module boundaries, ADR proposals, and scalability trade-offs.
- **Key Tools**: `find_symbol`, `get_file_outline`, `propose_decision`, `read_scratchpad`.
- **Rule**: Never write implementation code in Design mode without proposing an ADR or outlining interfaces first.

### [DEV] Mode
- **Focus**: Surgical code changes, block patching, codelet compilation, and test pairing.
- **Key Tools**: `claim_ticket`, `get_symbol_source`, `analyze_blast_radius`, `apply_block_patch`, `compile_codelet`.
- **Rule**: Always verify blast radius before editing shared modules.

### [TRIAGE] Mode
- **Focus**: Rapid failure diagnosis, Playwright log distillation, and regression isolation.
- **Key Tools**: `triage_test_failures`, `run_playwright`, `get_git_hotspots`.
- **Rule**: Minimize log volume. Extract only failing assertions and stack frames.

### [PRODUCT] Mode
- **Focus**: Requirements gathering, user stories, acceptance criteria, and sprint planning.
- **Key Tools**: `create_ticket`, `list_tickets`, `recommend_next_task`, `update_ticket_state`.
- **Rule**: Keep ticket descriptions actionable with clear acceptance criteria.
