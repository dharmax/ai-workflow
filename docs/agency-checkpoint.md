# Agency preservation checkpoint — 2026-10-08

> **Historical checkpoint.** Its preserved evidence remains authoritative for what was observed at this point, but its “Stop and resume point” instructions are superseded by `docs/agency-constitution.md`, `docs/code-writing-design.md`, `docs/agency-restoration-plan.md`, and `docs/codex-agency-goal.md`. Do not resume from the old shell-centric sequence.

The checkpoint is a preservation milestone, not general-agency acceptance. The user explicitly authorized stabilizing, committing and pushing the reviewed master changes, then stopping implementation. This checkpoint authorization overrides the constitution's merge prohibition for these preservation commits only; it does not relax the original Agency Gate or authorize skill-manager integration. TKT-8D3F and sibling TKT-GKDN remain In Progress, without Done or restored-agency claims.

## Retained changes and evidence

| Classification | Retained change | Evidence and limit |
| --- | --- | --- |
| Architectural | Discovery-independent run_command bootstrap; optional model-led discovery; modes are preferences | Native discovery-off, misleading, failed/slow discovery and forced-DEV journeys execute evidence gathering. Discovery stays bounded to two lookups, five candidates and five seconds each. This proves access, not reliable reasoning. |
| Architectural | Same executor enforces host-declared read-only filesystem scope with disjoint scratch | Real project write/install attempts fail; reads, temporary computation and explicitly authorized writes remain functional. Native self-extension accepted2/3 targeted runs; full Gate self-extension still fails. No baseline script_eval, full catalog, second executor/planner or query-specific implementation. |
| Supporting infrastructure | Concurrent streams, real exit/cwd, explicit truncation, cancellation and POSIX descendant termination | OS regressions, aborted native command and full suites. Native Bash pipeline semantics remain unchanged after pipefail regressed bounded streaming. |
| Supporting infrastructure | Structured tool errors and retained failed observations across session follow-ups | Shared ToolExecutionError plus session tests and earlier native3-pair follow-up experiment0/3→3/3. Historical observations remain distinct from current facts. |
| Supporting infrastructure | Mixed-effect and failed-read repetition uses existing progress guard | Host-measured scratch effects feed the existing callback. Repeated reads/failures stop; identical legitimate mutations and changed-input recovery remain allowed. Guard termination is not accepted goal completion. |
| Supporting infrastructure | Configured mode/task routing, concrete gateway/origin/local fallbacks, HTTP402 quota, hard provider restrictions | Before/after routing/adapter tests and native quota/network failover captures. Configured OpenRouter mini now receives ordinary DEV requests. Explicit choices stay pinned; no stronger model or configuration upgrade. |
| Supporting infrastructure | Requested output schema must validate; valid falsy repaired data retained | Initial focused42 pass/2 fail, corrected object-schema transform control and after regression verification. Requested schema failure now returns error with final text preserved; completion is still not semantic verification. |
| Checkpoint stabilization | Output repair inherits Actor route/model/locality defaults, with run overrides authoritative | Before45 pass/1 fail; targeted60 pass. Earlier native repair dropped task and reached Qwen. New native diagnostic records code/OpenRouter mini on all three calls, then rejects invalid repaired output. It is a failed typed-output diagnostic, not accepted agency. |
| Supporting infrastructure | Complete public tool/discovery trace, metrics, CLI help before dispatch and installed invariant | Trace/CLI/setup regressions and retained native captures. Public committed inputs exclude credentials and private reasoning. |
| Unproven prompts | Existing common evidence/provenance/completion clauses, schema descriptions, decision examples and recovery wording | Retained transparently as existing experimental work. Controlled negative experiments did not establish their benefit. No new clause added for this checkpoint; full suites do not prove these prompts improve agency. |

The three pre-existing unpushed sibling commits93faa91,2568bda,e9508fa are part of the reviewed checkpoint: unavailable-tool/progress bounds and isolated model-led discovery, with prompt wording separately unproven. Detailed file audit: [agency-diff-audit.md](agency-diff-audit.md); chronology and failed experiments: [agency-restoration-evidence.md](agency-restoration-evidence.md).

## Verification and acceptance

Final production verification: AIWF293 pass/0 fail (36 files); llm-utils176 pass/6 gated skips/0 fail (21 files); strict typecheck passes in both repositories; both whitespace checks pass. Relevant Actor/session/fallback60 pass. Full checks run after the sole new checkpoint stabilization edit. Receipts are in [evidence/agency-checkpoint](evidence/agency-checkpoint/).

**No complete Agency Gate rerun for this checkpoint.** Last complete configured-mini run remains8/13 fixtures accepted and0/3 live requests accepted. Failed fixtures: A invalid final-answer object despite correct input; B unrelated readings ranked as tickets; E malformed helper loop; analysis/comparison paraphrases unfinished. Live analysis invents critical-path/missing-work conclusions after truncated reads; second-ticket and comparison requests exhaust budget without requested answers. Read-only bun install remains an acceptance failure; its historical artifact is preserved. HTTP200, schema-valid output, keyword matches, component results and runtime completed do not qualify general agency.

All original run archives remain local under .ai-workflow/state/agency-evidence/runs. The committed preserved-runs manifest identifies original bytes by SHA256. Committed public failed-ordinal input captures show exact systems, whole goals, schemas, observations and response fields, excluding credentials/private reasoning. Earlier unsuccessful native output probes and rejected verifier/pipeline/structured-final experiments remain preserved. No failed run was replaced by a fortunate success.

## Remaining limits and regressions to investigate

- Read-only authority must be declared by the host; ordinary CLI/shell calls do not yet infer or require that scope. Linux bubblewrap is required for restricted commands; other platforms fail closed. Network effects are not isolated. Scratch-generated records can still be mistaken for facts.
- The configured mini still substitutes goals, ignores relevant files or truncation, emits invalid finals and proposes malformed helpers. The proposed same-model verifier falsely accepted unsupported answers and is not integrated.
- Stdout/stderr reporting is truncated explicitly, but full streams are currently accumulated before slicing. Windows descendant cleanup is not qualified. Existing model inventory metadata may be incomplete; configured fallback targets are not model availability research.
- Existing prompt changes are executable and tested for compatibility, but their causal benefit remains unproven. These preservation commits do not establish no model-behavior regression.
- The unrelated sibling bun.lock change and root package-lock.json remain untouched and uncommitted. docs/prompt1.md is the user's existing instruction document, retained in the reviewed documentation checkpoint. No unrelated code is staged.

## Stop and resume point

After pushing, stop implementation. Do not implement skill-manager integration or expand the bootstrap in this checkpoint. Resume with **read-only research** of the existing skill-manager → TextCompilerSkillAuthor → text-compiler path:

1. Which existing entrypoints generate a helper/codelet, compile it, generate tests, execute those tests, and expose successful output? What exact schemas and lifecycle statuses connect them?
2. Does testSourceCode persist with the generated source? What proves tests actually execute, and how are failed generation, compilation and test runs retained?
3. Which execution/environment contracts carry cwd, scope, scratch, credentials, cancellation and provider/model restrictions through generation and test execution?
4. Can this existing path serve temporary self-extension without becoming a mandatory competence boundary, full catalog or second planner? What bounded end-to-end experiment could falsify that hypothesis?
5. How will generated examples be distinguished from observed project facts, and model-selected completion from verified testing and requested outcomes?

Use AIWF investigation/symbol/blast evidence first, read applicable sibling instructions, and establish concrete reproductions before proposing integration. No integration ticket or implementation is invented here. Original agency work resumes only under its unchanged full acceptance criteria.
