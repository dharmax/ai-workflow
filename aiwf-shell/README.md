# aiwf-shell

Shell and operator package for `ai-workflow`: CLI entrypoints, runtime wrappers, project-init scripts, and terminal-facing tooling.

## What You Install

Install this package when you want the CLI surface.

```bash
bun add -g aiwf-shell
ai-workflow --help
```

- User-facing command: `ai-workflow`
- Pulls in: `aiwf-common-core`
- Does not require `aiwf-skill`
- Pairs cleanly with `aiwf-mcp` when you also want a host-facing extension surface

Use `aiwf-shell` by itself when you want workflow commands, shell mode, project init, audit, dogfood, and operator tooling.

Use it together with `aiwf-mcp` when you want the same core available to external MCP hosts.

Use it together with `aiwf-skill` only when an instruction-only bridge is still useful for a specific host.
