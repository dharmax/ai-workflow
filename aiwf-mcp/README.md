# aiwf-mcp

Primary coded host-extension surface for `ai-workflow`.

Install this package when you want a real MCP adapter on top of `aiwf-common-core` instead of relying on instruction-only skill assets.

```bash
bun add -g aiwf-mcp
aiwf-mcp
```

This package exposes the shared workflow core through MCP tools such as:

- `project_summary`
- `sync_project`
- `search_project`
- `plugin_status`
- `list_tickets`
- `create_ticket`
- `update_ticket_lifecycle`
- `extract_ticket`
- `extract_guidelines`
- `plan_work_tickets`
- `plan_coding_workflow`
- `project_status`
- `route_task`
- `knowledge_graph`
- `write_projections`
- `list_codelets`
- `get_codelet`
- `search_codelets`
- `run_codelet`
- `forge_project_codelet`
- `upsert_project_codelet`
- `remove_project_codelet`

Mutating tools dry-run unless `apply: true`. `run_codelet` refuses mutating codelets unless `allowMutation: true`, the manifest declares `canMutate: true`, and required flags such as `args.apply === true` are present.

Use `aiwf-skill` only as an optional bridge for hosts that still benefit from extra instructions.
