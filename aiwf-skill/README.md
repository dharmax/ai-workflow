# aiwf-skill

Optional instruction-only bridge package for `ai-workflow`.

## What You Install

Install this package only when a host still benefits from local instruction assets in addition to the coded shell or MCP surfaces.

```bash
npm install -g aiwf-skill
aiwf-skill --project /abs/path/to/project --force
```

- User-facing command: `aiwf-skill`
- Pulls in: `aiwf-shell` and `aiwf-common-core`
- Does not replace `aiwf-mcp` as the primary host-extension surface

Use `aiwf-skill` as a thin bridge when you want host-local instructions plus the real tooling surface behind them.

Prefer `aiwf-mcp` for coded host integrations.
