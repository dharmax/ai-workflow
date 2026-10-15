# AIWF ticket-resolution recovery — controlled dogfood plan

Status: execution brief; **not evidence of completion**. Target: the current AIWF `master` and the legitimate ticket `TKT-GKDN-C-BYTE-CEILING` in `~/work/llm-utils`.

## Mission and boundary

Restore trustworthy real-world `aiwf resolve` on the original ticket. Failure observed: `Stalled navigation: implementation tranche 1/3 terminated after two consecutive duplicate observations without workspace mutation (5 steps)` after 181274 ms. The source shows that Ticket resolution has a local duplicate-observation guard; the general `llm-utils` Actor has a separate read-only-aware observation guard. AIWF's interactive ticket tools were not marked read-only in the inspected version, so the local guard produced the reported termination. Why the model repeated calls is **unknown**. Do not equate stopping repetition with fixing navigation.

**Prime Directive / am-i-allowed bar for every changed method:** smallest correct solution; one owner per responsibility; no shadow state or framework; simple flow, explicit invariants, sound types, no unnecessary statement-ending semicolons where governing guidelines require that; remove superseded code; precise errors; realistic tests. Read and obey current governing project instructions (including nested instructions) before changing each scope. Preserve existing change-engine and lease safety. Do not turn this task into a generic guideline/quality initiative or a wholesale Ticket.resolve rewrite. Note and defer unrelated findings.

## Crucial operational hazard: no self-modification of the running engine

AIWF may resolve packages through a locally linked executable or current source. **Never run a long AIWF operation while changing the source/dependency it executes.** First identify precisely the installed executable, its import graph, symlinks and `file:` dependencies, and whether it is compiled, linked, or source-backed. Record SHA, binary resolution, dependency revisions, worktree/dirty status. `which aiwf` alone is insufficient. Do not assume a packaged binary is isolated: verify actual dependency resolution. Prefer a proven frozen installed build / immutable checkout / isolated execution copy, with fixed dependencies; only if it is truly independent of the target tree. Do not create branches or worktrees as ceremony; isolation is for stable execution, not branch proliferation. A static, verified baseline can be tagged for recovery. If isolation cannot be proved, do source changes with Codex/manual editor, stop the runner, build/install, and start a fresh process for each gate—never use a running AIWF process to mutate itself. Do not modify `llm-utils` concurrently if the frozen AIWF runner imports it live. No automatic reinstall or background mutating watcher during execution.

## Kanban first: prepare durable work, without touching code

Use AIWF's **actual help** to establish available commands (`aiwf help`, relevant ticket/graph/claim help). Inspect `aiwf status` and existing graph/kanban first. Use the canonical ticket/product mutation API or CLI to add/reuse the following three atomic tickets in `~/work/ai-workflow`; **do not hand-edit `kanban.md`**, which is a graph projection. Never duplicate extant work or claim the old llm-utils ticket in AIWF's own graph. Add actual executable acceptance criteria and real dependencies; export/sync projections once and inspect the Kanban. Keep user-authored Product intent and existing work intact. The titles below are identifiers to match/reuse, not commands or presumed IDs:

* **R1 — Preserve stalled-navigation evidence.** A bounded, actionable report of the Actor's recent calls, params, observation outcomes/errors and mutation epoch is available when the existing local guard terminates. Reuse the compact report path already present for other Actor halts. No new tracing subsystem or behavioral threshold change. A deterministic regression proves that a failed live run would not discard the relevant records.
* **R2 — Fix demonstrated navigation root cause.** Depends on R1's evidence and a reproduced real/fidelity trace. Identify the first incorrect step and the owning boundary (prompt, tool schema/result, history propagation, or guard). Correct only that cause. Add a regression that reproduces the cause, not just a scripted repeated read. Delete obsolete workaround code if made redundant. No change in guard thresholds as a substitute.
* **R3 — Live acceptance and closure.** Depends on R2. Prove full local tests/typecheck/build on pinned revisions and a fresh-process real run of `aiwf resolve TKT-GKDN-C-BYTE-CEILING` from `~/work/llm-utils`. Verify tool calls, actual changes, lease/ticket state, acceptance/test receipts, and no unrequested modifications. If already legitimately resolved, use an equivalent real pending ticket or an isolated faithful reproduction, explicitly distinguish it from the original. Record the outcome and limitations; update graph, export projections and close only proven tickets.

If the installed AIWF cannot safely register/manage these tickets, seed the graph via its existing deterministic project primitives with an *external* operator, then re-open it in a fresh stable runner. Do not ask a broken Actor to create its own repair plan through a live implementation loop.

## Execution gates (each a separate, short run)

### Gate 0 — Freeze and inventory (no edits)
1. Read relevant AGENTS.md/instructions; inspect repository HEAD/status and installed binary/dependency resolution, current AIWF graph and original llm-utils ticket state. Check whether the original ticket was fixed manually or remains open. Capture a rollback point without proliferating branches.
2. Choose and **prove** an execution mode that does not load changing sources. State which repo is editable in each run. If no safe freeze: use deterministic edit/test outside AIWF and restart it after changes.
3. Register/reuse R1–R3 in the AIWF graph, set dependencies, export projections, and verify the Kanban. Gate passes only when runner provenance and durable work scope are unambiguous.

### Gate 1 — Evidence preservation (R1)
1. Review the exact local stall branch and existing compact recent-observation formatter in `Ticket.resolve()`; inspect the llm-utils Actor step/result shape.
2. Make the smallest code change to include the existing step records in the blocker. Ensure bounded output, meaningful call arguments and error/outcome, and no secrets/full source dumps. Prefer a shared tiny formatting expression/function only when it removes actual duplication. Preserve the current guard behavior exactly.
3. Focused regression + typecheck + relevant tests; inspect the entire changed method against the Prime Directive. Run in a fresh process. Save concrete evidence. Update R1, rebuild/install/verify runner provenance **after** the editing process has exited.

### Gate 2 — Establish the cause (R2 diagnosis, no speculative edit)
1. Re-run the original ticket with the stable runner, only after checking ticket status, clean/allowed target edits and provider readiness. Collect the five (or new) steps: model-request inputs (bounded/redacted), tool names/arguments, returned observation/error, whether visible in next prompt, mutation epoch, and stall decision. Preserve failures, don't rerun blindly.
2. If the original ticket is no longer pending, inspect prior durable metrics/trace and use a faithful isolated reproduction of the failing navigation contract; clearly label the substitution. If reproduction instead succeeds, do not manufacture a defect: move to Gate 4 and record that root cause was not reproduced.
3. Write a concise causal chain: expected action, first divergence, evidence, owning layer, simplest correction. Distinguish model choice from a broken tool/observation contract. R2 implementation is blocked until this chain is evidenced.

### Gate 3 — Minimal correction (R2 implementation)
1. Edit only the actual owner. Before edits, read every directly touched method and governing instruction. Prefer deletion/consolidation over another coordinating abstraction. Leave working navigation, CausalChangeEngine, locks/lease, model budgets and test evidence alone unless the trace directly implicates them.
2. A focused test must reproduce the root-cause behavior and demonstrate successful progression to a valid change or truthful blocker. Keep the existing duplicate-guard regressions. No ticket-specific exception, invented observation, extra fallback loop, arbitrary step/time/token increase, or second navigation registry.
3. Run focused suite, `bun run typecheck`, full `bun test`, build/pack as defined by the *actual* package scripts; run dependency tests only for changed dependency packages. Inspect full diff method-by-method, identify any redundant lines removed, and `git diff --check`. Close R2 only if the behavioral gate passes. Stop and report external blockers instead of broadening scope.

### Gate 4 — Real fresh-process dogfood (R3)
1. Stop all active AIWF resolution processes. Install/build the verified revision atomically through the project's supported method; verify binary/source/dependency provenance again.
2. Fresh process in `~/work/llm-utils`: inspect project/ticket state; run `aiwf resolve TKT-GKDN-C-BYTE-CEILING` only if still a valid unresolved ticket. Never overwrite dirty user changes. Record exact calls, edits, test results, verifier evidence and final ticket graph/projection state.
3. Run final clean validations of touched repos and inspect final Git diff/status. Record any unresolved concern without saying 'fully verified'. Sync/export projections, close R3 only on measured acceptance. Stable fix goes to `master` promptly; delete temporary branches if any, optional rollback tag. Do not modify unrelated ecosystem repos.

## Failure rules / anti-loop

* One stage = one bounded operation and one review before the next. Never permit recursive `aiwf resolve` of AIWF itself or repair it while its executable is running from the same source tree.
* If Gate 1 diagnostics still fail to capture the repeated observation, stop; correct observability, not limits.
* If Gate 2 cannot produce a causal trace, report the exact missing evidence and stop R2, rather than guessing.
* If a stage introduces fresh failures, revert only its scoped changes or restore the checkpoint, then review. Do not layer fixes onto an unknown-bad tree.
* Keep a concise artifact per gate: HEAD/dependency identity, changed files, factual result, failed checks, deferred issues, and next safe command. Claims about tests/live success require captured evidence.
* Do not rewrite plans or modify unrelated files while doing implementation; new discoveries are notes, not scope expansion.

## Acceptance / definition of done

- The specific repeated-navigation failure's cause is demonstrated, and the smallest canonical correction is reviewed against the Prime Directive.
- Relevant regression reproduces the former failure and proves corrected behavior; old safety tests continue to pass.
- Full AIWF test/typecheck/build are green on the **same** immutable revision used for real acceptance (and touched dependency suites if relevant).
- A fresh, version-identified runner either resolves the original legitimate ticket with actual verified changes and correct durable status, or states a concrete external reason that makes that exact original run impossible while a faithful real equivalent succeeds. An unresolved navigation stall is **not** success.
- AIWF graph and generated Kanban reflect truthful states; no manual projection edits, no untracked side effects, no unneeded branches.

## Launch prompt (copy/paste to Codex or an external coding operator)

Read `plans/AIWF-ticket-resolution-recovery.md` in full and obey it as the execution contract. Start **only at Gate 0**: verify runner/source/dependency isolation and original ticket state, discover actual AIWF commands, then register or reuse R1–R3 with correct acceptance/dependencies in the canonical graph and export the Kanban. Do not edit code or start a resolution Actor until Gate 0 evidence is reported. Thereafter execute one gated ticket at a time, using stable execution primitives, reviewing every touched method to am-i-allowed/Prime-Directive quality. The old live `llm-utils` ticket is the final acceptance criterion, not a task to modify opportunistically. Do not claim completion from tests alone. Stop at an unproven gate and give the exact blocker.
