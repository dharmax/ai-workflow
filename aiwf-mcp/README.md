# aiwf-mcp

Primary coded host-extension surface for `ai-workflow`.

Install this package when you want a real MCP adapter on top of `aiwf-common-core` instead of relying on instruction-only skill assets.

```bash
npm install -g aiwf-mcp
aiwf-mcp
```

This package exposes the shared workflow core through MCP tools such as:

- `project_summary`
- `sync_project`
- `extract_ticket`
- `extract_guidelines`
- `project_status`
- `route_task`
- `knowledge_graph`
- `write_projections`

Use `aiwf-skill` only as an optional bridge for hosts that still benefit from extra instructions.
