# AIWF Coding Capability Report

Date: 2026-05-15
Scope: `TKT-SHELL-002`, `BUG-PLANNER-001`, operator `ask`/shared-harness coding-analysis behavior

## Goal

Use `ai-workflow` itself more aggressively, verify where it still fails at code review / code analysis / code-fixing work, improve the product where the capability is missing, and record the practical experience.

## What Was Done Through AIWF

- `ai-workflow sync --json`
- `ai-workflow extract ticket TKT-SHELL-002 --json`
- `ai-workflow extract guidelines shell --json`
- `ai-workflow ask "What workflow-aware capabilities already exist for code review, code analysis, and code fixing? ..." --mode tool-dev --evidence-root ... --json`
- `ai-workflow ask "Review the ask path, inspect the relevant code and tests, and explain the top risks with evidence." --mode tool-dev --evidence-root ... --json`
- `ai-workflow ask "Audit the current state of the shell and ask harnesses, inspect the relevant code and tests, map the gaps, and produce an implementation plan." --mode tool-dev --evidence-root ... --json`

## Faults Observed Before The Fix

- `ask` classified some long code-analysis prompts into the shared harness, but still failed by sending them into compiler generation instead of producing a graph-backed analysis reply.
- The failure mode was user-visible and bad: `Compiler job 'logic-generation' failed.` instead of an honest grounded answer.
- The graph DB already had useful state, but the operator layer was not using it deterministically for repo review / analysis prompts.
- Target resolution quality is still uneven. Some prompts resolve to weak targets like `init`, broad `workflow`, or unrelated symbols when the query is underspecified.
- `sync` output still shows a trust problem: top-level `indexedSymbols` / `indexedClaims` can disagree with the detailed summary counts. This remains a real blocker for full DOD confidence.

## Product Changes Made

### 1. Shared harness context is now more graph-backed

File: `aiwf-common-core/core/services/operator-harness.ts`

- Added graph-backed target collection through `resolveProjectStatus(...)` using the normalized request subject/goals plus matched modules/tickets.
- Added `relevantTargets` to the shared context pack.
- Expanded workflow prompts to include graph-backed targets, related files, and linked tests instead of only generic status/module lists.

### 2. Added deterministic graph-backed analysis/review replies

File: `aiwf-common-core/core/services/operator-harness.ts`

- Added `renderExecutionProgramReply(...)`.
- For `analysis-plan` and `repo-investigation`, the harness can now synthesize a structured grounded answer from DB-backed state, related files, tests, and evidence.
- This avoids depending on compiler success for code-review / code-analysis prompts.

### 3. `ask` now uses the graph-backed reply path for analysis/review workflows

File: `aiwf-common-core/core/services/operator-brain.ts`

- `resolveHostRequest(...)` now short-circuits `analysis-plan` and `repo-investigation` requests to the deterministic graph-backed reply path.
- Mutating or implementation-oriented workflow programs still use the execution path.
- Result: code-analysis/review prompts no longer need the compiler to succeed before the operator can answer.

## Gains After The Fix

- `ai-workflow ask` can now answer long planning / repo-investigation prompts without crashing in compiler generation.
- The reply now includes:
  - current workflow state
  - relevant graph-backed targets
  - linked files and tests
  - gap map or findings
  - implementation / verification plan
- The answer is honest when target resolution is weak.
- The improvement is visible from the real CLI surface, not just internal helpers.

## Remaining Faults

- Graph target ranking is still too weak for some prompts. It needs better selector extraction and ranking so review prompts land on the intended module/service more often.
- Feature implementation and code-fixing flows still rely on compiler/orchestrator execution. They now get a richer graph-backed prompt, but they are not yet deterministic the way analysis/review now is.
- Some existing `tests/operator-brain-fallback.test.ts` failures remain outside this slice and appear to reflect older planner/compiler expectations.
- The sync/index integrity issue remains open and is still serious enough to block any claim that the graph DB is fully trustworthy.

## Evidence

### Successful `ask` after the change

Observed route for code-analysis prompt:

- `intent: repo-investigation`
- `operation: shared_operator_graph_reply`

Observed route for long planning prompt:

- `intent: analysis-plan`
- `operation: shared_operator_graph_reply`

Observed reply qualities:

- structured current state
- graph-backed target listing
- absolute file paths for related files
- verification section
- evidence section

## Practical Assessment

This was a meaningful improvement, but not full DOD.

`ai-workflow` is now better at:

- code analysis
- repo investigation
- evidence-backed review-style answers

`ai-workflow` is still not yet good enough at:

- precise graph-backed target resolution for arbitrary code questions
- autonomous code-fixing / implementation with the same level of reliability
- proving full graph integrity under sync pressure

## Additional Pass: Live Registry Integrity

After rebuilding the live CLI and using `ai-workflow` again as the primary operator, one more workflow-truth defect surfaced directly from `ai-workflow sync --json`:

- `codeletRegistry.backingIssues` reported bogus missing entries with doubled shell roots like `/home/dharmax/work/ai-workflow/aiwf-shell/aiwf-shell/scripts/...`.
- This was not just cosmetic. It made the live workflow DB claim that stable toolkit codelets were missing even when the files existed.

### Root Cause

File: `aiwf-common-core/core/services/codelets.ts`

- Toolkit codelet manifests store entries relative to the workspace root, for example `aiwf-shell/scripts/ai-workflow/kanban.ts`.
- Registry refresh was resolving toolkit entries from `toolkitRoot`.
- When the runtime was launched from the shell package root, `toolkitRoot` could be `/home/dharmax/work/ai-workflow/aiwf-shell`, so path resolution produced `/home/dharmax/work/ai-workflow/aiwf-shell/aiwf-shell/...`.

### Fix

File: `aiwf-common-core/core/services/codelets.ts`

- Toolkit codelet manifests now resolve from `getWorkspaceRoot(toolkitRoot)` instead of the raw `toolkitRoot`.
- This keeps toolkit manifest resolution stable whether the live CLI is entered from the workspace root or the shell package root.

### Regression

File: `tests/workflow-db.test.ts`

- Added coverage for `refreshCodeletRegistry(...)` with `toolkitRoot` explicitly set to the shell package root.
- The regression asserts that backing issues do not contain doubled `aiwf-shell/aiwf-shell` paths and that stable toolkit codelets like `execute-ticket` and `artifact-judge` are not reported missing.

### Live Outcome

- After rebuilding `aiwf-shell`, `ai-workflow sync --json` now reports:
  - `codeletRegistry.backingIssues: []`
- This is a concrete gain in DOD terms:
  - `aiwf` found the defect through its own DB-backed output
  - the product was fixed
  - the fix was verified through the same live `ai-workflow` surface

### Remaining Fault Exposed By This Pass

- Even after the product fix, `sync` correctly marked `protocol.ok: false` until a new `ai-workflow` mutation record was written for the latest code edits.
- That is good enforcement behavior, but it also shows the current loop is still brittle when code is edited outside a first-class `aiwf` mutation path.
- Full DOD still wants more of the implementation flow itself to happen through explicit `aiwf` execution primitives instead of manual code edits plus later reconciliation.

## Next Recommended Moves

1. Close `BUG-PLANNER-001` fully by auditing remaining planner/compiler failure paths in `shell` and `host`.
2. Fix `BUG-SYNC-001` before trusting the graph DB as canonical for all coding flows.
3. Improve target resolution/ranking for review/debug/fix prompts so `ask` lands on the right files/modules more reliably.
4. Extend the graph-backed harness so feature-implementation / code-fixing flows consume the same resolved working set before mutation.
