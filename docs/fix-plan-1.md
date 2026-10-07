# Fix plan 1: let the LLM compose basic AIWF operations

Status: planning only. Tracking ticket: `TKT-8D3F`. Implementation and live acceptance remain open.

## Goal and boundaries

Give the Actor a stable basic execution surface so the LLM can retrieve evidence, compose Linux commands or a codelet, and reason over results. Specialized semantic discovery is optional assistance; it must not gate basic execution. Reuse existing tools and contracts. Do not add query-specific ranking handlers, a new execution engine, branches, or changes to debug/fix/digest. Preserve configured model choices and unrelated work.

## Evidence and artifact mapping

Artifacts below were grounded using AIWF `investigate TKT-8D3F`, `symbol WorkflowActor`, `graph TestNode --type TestNode`, and `blast` on `src/actor/engine.ts`, `src/tools/os.ts`, `src/tools/compiler.ts`, and `src/shell.ts`, followed by bounded source inspection. “Affected” means inspect or verify; it does not authorize editing every listed file. Existing TestNode IDs are retained as canonical test inventory. Cross-repository runtime files are dependencies, not newly invented AIWF product artifacts.

Current findings: basic shell and codelet primitives already exist. The Actor builds its initial execution catalog from semantic discovery results. Some current tests explicitly require shell/codelet tools to be absent. Audit the intended local Actor versus public MCP boundary before changing those expectations. Codelet invocation currently receives `args` and `ctx`; establish how existing scripting/tool composition works before adding any contract. No architecture change is assumed necessary.

## 1. Audit the execution contract

Trace initial tool selection, exact schemas, prompts, result history, limits, and termination. Exercise existing compound-command and codelet paths. Identify demonstrated restrictions, including intentional public capability boundaries, before editing. Produce a short defect list and the smallest justified changes.

Affected artifacts: `src/actor/engine.ts` (`WorkflowActor.execute`, mode prompts); `src/tools/discovery.ts`; `src/tools/registry.ts`; `src/tools/index.ts`; `src/tools/os.ts` (`registerOsTools`); `src/tools/compiler.ts` (`registerCompilerTools`, `createCallableFunction`); `src/tools/scripting.ts`; `src/mcp.ts`; sibling `../llm-utils/src/actor.ts` and session implementation if implicated.

Verification artifacts: `test:tests/actor.test.ts`, `test:tests/tool-discovery.test.ts`, `test:tests/tools.test.ts`, `test:tests/compiler.test.ts`, `test:tests/mcp.test.ts`.

## 2. Expose existing basic primitives directly

Make existing basic execution primitives available from the first local Actor step independently of semantic classification. Candidate primitives are `run_command`, `compile_codelet`, `run_codelet`, and existing `script_eval`; choose the smallest useful surface after step 1, avoiding redundant paths. Keep specialized discovery optional. Remove machinery rendered redundant by direct composition. Preserve per-run catalog isolation and the public MCP contract unless a demonstrated defect requires a separate justified change.

Affected artifacts: `src/actor/engine.ts`; `src/tools/discovery.ts`; tool registration/capability policy identified in step 1. Inspect `src/tools/index.ts` and `src/mcp.ts` as boundary dependencies, not automatic edit targets. Shared Actor changes only if its existing run-local tool contract is insufficient.

Verification artifacts: `test:tests/actor.test.ts`, `test:tests/tool-discovery.test.ts`, `test:tests/mcp.test.ts`; sibling Actor regression tests if changed. Assert basic execution survives empty or failed discovery and does not expose the whole registry or leak capabilities between runs.

## 3. Give the model a usable environment

Describe the project directory, available execution primitives, and how to inspect AIWF help and obtain real evidence. Allow the model to choose direct tools, compound shell commands, or a codelet. Leave sorting, comparisons, decomposition, and conclusions to the model. Preserve explicit model configuration. Do not encode words such as “second” or “least” into dispatch logic.

Affected artifacts: `src/actor/engine.ts` (mode prompts and tool context); `src/cli.ts` (existing help/eval interfaces, inspect first); `src/tools/os.ts`; `src/tools/compiler.ts`; `src/tools/scripting.ts`. Read-only evidence dependencies: `src/tools/tickets.ts`, `src/tools/graph-queries.ts`, existing product graph entities and their relations. No ranking API changes planned.

Verification artifacts: `test:tests/actor.test.ts`, `test:tests/escalation.test.ts`, `TEST-AIWF-DELEGATION` / `test:tests/artifact-command.test.ts`.

## 4. Verify the execution boundary

Exercise stdout, stderr, exit status, explicit output truncation, timeout, cancellation, async codelets, and failure propagation. Inspect existing authorization behavior so shell/codelet composition honors it. Correct only reproduced semantic defects, using existing contracts. Do not add a second policy system or pretend arbitrary commands are read-only.

Affected artifacts: `src/tools/os.ts`; `src/tools/compiler.ts`; `src/tools/scripting.ts`; `src/tools/registry.ts`; `src/actor/engine.ts` (execution context and signal propagation); sibling shared Actor execution only if implicated.

Verification artifacts: `test:tests/tools.test.ts`, `test:tests/compiler.test.ts`, `test:tests/actor.test.ts`, `TEST-AIWF-PRIMITIVE-TRUTH`. Use isolated projects and harmless real command/codelet executions.

## 5. Make composition observable

Show actual commands/codelets, returned evidence, errors, elapsed time, and termination reason. Distinguish failed execution from empty successful output and truncated output. Preserve usable trace show/full/open behavior without private model reasoning. Reuse the existing trace record and viewport.

Affected artifacts: `src/shell-trace.ts`; `src/shell.ts`; `src/actor/engine.ts` (step/tool events); `docs/shell-trace.md`. The shell blast graph also identifies `src/cli.ts` and `@dharmax/shell-ui/src/shell.ts`; inspect these dependencies and change only if necessary.

Verification artifacts: `test:tests/shell-trace.test.ts`, `test:tests/shell.test.ts`, `test:tests/artifact-command.test.ts`; sibling shell-ui tests/typecheck only if changed.

## 6. Test protocol and reasoning separately

Deterministic regressions prove basic availability, execution, accumulated history, errors, and isolation. Live runs must answer these exact requests from actual project evidence:

- “give me the 2nd most recommended next ticket?”
- “give me the most recommended and the least recommended tickets and see if they are related to the same main artifacts”

Use isolated realistic fixtures covering related and unrelated artifacts, ties, and insufficient evidence. Check answers against independently inspected tickets and graph relations. Define candidate scope and how ties are handled transparently; do not implement special query parsing. Exercise compound shell and codelet composition as general mechanisms. Mocked model decisions prove protocol only, never autonomous reasoning. Qualify the ordinary configured route; diagnostic model overrides are reported separately.

Affected artifacts: existing Ticket, UserStory, Feature, Epic and relation fixtures; tests in `tests/actor.test.ts`, `tests/tools.test.ts`, `tests/compiler.test.ts`, `tests/shell-trace.test.ts`; isolated live qualification harness and its retained evidence. Any new test file must become a canonical TestNode rather than a parallel inventory.

Verification artifacts: corresponding existing TestNodes above; `TKT-8D3F` acceptance evidence. Provider failure or incorrect reasoning leaves acceptance open.

## 7. Qualify, measure, and persist proof

Run focused tests, then full `bun test` and `bun run typecheck`. Run affected sibling suites/typechecks if sibling source changes. Record live correctness, total latency, model/tool call counts, repeated work, provider/model identity, and tokens/cost only when actually reported. Separate execution defects, model reasoning failures, and provider blockers. Compare against retained earlier runs with their uncontrolled timing limitations stated.

Persist test executions on canonical TestNodes and independently verify acceptance through the existing Ticket lifecycle. Synchronize projections, release the lease, and keep the ticket open until both live requests are qualified. A green suite alone is insufficient. The requested document is a plan, not an instruction to start implementation now.

Affected artifacts: `TKT-8D3F`; canonical TestNodes; existing acceptance/receipt and performance telemetry contracts; `docs/fix-plan-1.md`; `docs/shell-trace.md` if results warrant updates; generated `kanban.md` and `modules.md` projections. Existing Ticket.resolve/TestNode lifecycle is reused, not redesigned.

## Completion criteria

- Basic execution is usable without specialized semantic discovery.
- The LLM composes existing operations without query-specific code.
- Commands and codelets produce truthful, useful observable results.
- Regression suites and affected typechecks pass.
- Both exact live requests are answered correctly from observed evidence on the intended route.
- Proof and measurements distinguish supervised guardrails from autonomous model performance.
