# aiwf-shell

Shell and operator package for `ai-workflow`: CLI entrypoints, runtime wrappers, project-init scripts, and terminal-facing tooling.

## What You Install

Install this package when you want the CLI surface.

```bash
npm install -g aiwf-shell
ai-workflow --help
```

- User-facing command: `ai-workflow`
- Pulls in: `aiwf-common-core`
- Does not require `aiwf-skill`

Use `aiwf-shell` by itself when you want workflow commands, shell mode, project init, audit, dogfood, and operator tooling.

Use it together with `aiwf-skill` only if you also want the skill installer/assets on the same machine.
