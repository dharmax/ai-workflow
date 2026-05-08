# aiwf-skill

Skill package for `ai-workflow`: install flow plus agent-facing skill assets.

## What You Install

Install this package when you want the skill surface.

```bash
npm install -g aiwf-skill
aiwf-skill --project /abs/path/to/project --force
```

- User-facing command: `aiwf-skill`
- Pulls in: `aiwf-shell` and `aiwf-common-core`
- Does not require a separate `aiwf-shell` install step

Use `aiwf-skill` by itself when you only need the skill installer and agent-facing assets.

Use it together with `aiwf-shell` only if you also want the standalone CLI/operator surface available directly on the machine.
