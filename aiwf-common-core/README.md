# aiwf-common-core

Shared judgment core for `ai-workflow`: services, persistence, codelets, routing, graph sync, projections, and reusable runtime utilities.

This package is the canonical owner of:

- workflow DB control
- bidirectional textual projections
- capability/problem/plan/governance graph state
- provider routing
- status and ticket-context retrieval

Shell, MCP, and optional skill surfaces should stay thin and consume this core rather than rebuilding workflow truth.
