# Gemini CLI Handout (Switch Guide)

This handout is for fast daily use when moving to Gemini CLI from another coding agent workflow.

## 1) Install and verify

```bash
# run without install
npx @google/gemini-cli

# or install globally
npm install -g @google/gemini-cli

# verify
gemini --version
```

## 2) First run and auth

```bash
gemini
```

On first run, complete the login/auth flow in the terminal prompts.

## 3) Core usage

```bash
# interactive session in current repo
gemini

# one-shot prompt (non-interactive)
gemini -p "Summarize this repository architecture"

# force a model
gemini -m gemini-2.5-flash

# include extra directories as context
gemini --include-directories ../shared,../docs
```

## 4) Most useful in-session commands

```text
/help          Show commands
/quit          Exit
/memory reload Reload GEMINI.md context files
/mcp reload    Reload MCP integrations
```

Prefix behavior:
- `/...` controls the CLI/session.
- `@name ...` calls an MCP tool/server (when configured).
- `!command` runs shell commands from inside the session.

## 5) Safe defaults you should use

Prefer these habits while switching:
- Start each task with a short, explicit objective and constraints.
- Ask it to show a plan before edits on risky changes.
- Keep changes small and checkpoint often.
- Run tests after each meaningful edit set.
- Ask for exact file list changed before accepting large patches.

Example prompt:

```text
Goal: fix failing tests in auth module.
Constraints: no API contract changes, keep diff minimal.
First: show a 5-step plan. Then execute step-by-step and run targeted tests after each edit.
```

## 6) Add persistent project context

Create `GEMINI.md` in repo root for coding standards, architecture boundaries, and guardrails.

Suggested structure:
- Project purpose and critical modules
- Coding rules (style, boundaries, testing expectations)
- Safe/unsafe operations
- Definition of done

Then reload in-session:

```text
/memory reload
```

## 7) Scripting and automation mode

```bash
# plain text output
gemini -p "Generate a changelog entry from recent commits"

# structured JSON output
gemini -p "Summarize current TODOs" --output-format json

# stream JSON events for long runs
gemini -p "Run full test plan and report" --output-format stream-json
```

## 8) Codex-style to Gemini CLI mapping

- Start agent in repo:
  - Before: start coding agent session
  - Gemini: `gemini`
- One-shot query:
  - Before: quick ask in terminal
  - Gemini: `gemini -p "..."` 
- Repo instructions file:
  - Before: `AGENTS.md`-style guidance
  - Gemini: `GEMINI.md`
- Reload project instructions:
  - Gemini: `/memory reload`
- Shell from inside agent:
  - Gemini: `!<command>`
- Tool/integration call:
  - Gemini: `@<tool-or-server> ...`

## 9) High-signal prompt templates

Bugfix template:

```text
Find the root cause of <issue>.
Return:
1) diagnosis
2) minimal fix
3) tests added/updated
Then apply changes and run relevant tests.
```

Refactor template:

```text
Refactor <module> for readability with zero behavior change.
Constraints: preserve public API, keep patch under 300 LOC.
Show plan first, then implement, then prove with tests.
```

Code review template:

```text
Review current branch for:
1) correctness bugs
2) regression risk
3) missing tests
Return findings ordered by severity with file/line references.
```

## 10) Common pitfalls

- Overly broad prompts produce large, risky diffs.
- Missing `GEMINI.md` leads to inconsistent style/decisions.
- Skipping incremental tests hides regressions until late.
- Allowing unrestricted shell/tooling without review increases risk.

## References

- Gemini CLI README: https://github.com/google-gemini/gemini-cli/blob/main/README.md
- Commands reference: https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/commands.md
- Configuration reference: https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
- CLI reference: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md
