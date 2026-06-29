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
- `capability_catalog`
- `list_tickets`
- `create_ticket`
- `update_ticket_lifecycle`
- `extract_ticket`
- `extract_guidelines`
- `plan_work_tickets`
- `plan_coding_workflow`
- `analyze_code`
- `review_code`
- `debug_issue`
- `plan_code_change`
- `refactor_code`
- `execute_ticket`
- `sweep_bugs`
- `project_status`
- `route_task`
- knowledge_graph
- `find_dependencies`
- `search_artifacts`
- `judge_artifacts`
- `write_projections`
- `list_codelets`
- `get_codelet`
- `search_codelets`
- `run_codelet`
- `forge_project_codelet`
- `upsert_project_codelet`
- `remove_project_codelet`

Mutating tools dry-run unless `apply: true`. `run_codelet` refuses mutating codelets unless `allowMutation: true`, the manifest declares `canMutate: true`, and required flags such as `args.apply === true` are present.

If a host such as Codex shows only a small subset of these tools, rerun `ai-workflow install --project . --host codex` from the updated package and restart the host. The installer rewrites stale Node/dist MCP launch entries to the current Bun `aiwf-mcp/server.ts` launch.

Use `aiwf-skill` only as an optional bridge for hosts that still benefit from extra instructions.
