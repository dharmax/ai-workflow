# AIWF recovery — R2 continuation after historical live reproduction

**Status:** execution plan, not implementation evidence. Supersedes the old plan's Gate 2–4 sequencing where inconsistent; leave completed R1 untouched. Preserve existing local graph, current ticket IDs, R1 commit and historical evidence. Read `plans/AIWF-ticket-resolution-recovery.md` first.

## Evidence already reported (verify against local durable record)

Historical llm-utils source snapshot `248594a`, frozen AIWF builds `5ba469c` and `33208d3`. Baseline: qualified symbol read, `safe_change` successfully added guard, attempted `source.fixAll`, repeated test reads, stalled after 8 steps without autonomous test/acceptance. Pristine candidate: repeated qualified lookup, stalled after 3 steps without mutation. Continuation: read modified constructor, returned prose, output-repair invented placeholder changes/questions, resulting in `needs_input`. Codex's 49 tests/typecheck are *not* AIWF autonomous verification. Prior speculative R2 edit was rolled back; R2/R3 remain blocked. Local evidence reportedly lives in `docs/ticket-resolution-recovery-2026-10-11.json`; **check its actual path and content**, which were not independently available from remote GitHub at drafting time. Never infer missing observations from the summary.

## Design correction

Two independently observed failure modes are not one proven root cause:

**N — navigation:** the pristine run repeats a qualified lookup before structured final-answer processing. Locate the first repeated decision. Prove whether prior result was complete, conveyed in the next inference, understandable within context limits, and whether any host observation was transformed. Only then identify ownership: AIWF tool contract/prompt versus llm-utils history serialization versus provider decision. The fact that the guard fired is not a diagnosis.

**S — output contract:** in the inspected llm-utils `LLMActor.run()`, invalid schema output invokes a separate `asker.json` call with `effectiveGoal` and `finalText`, not prior tool history or the Actor's governing system instructions. This is a concrete context-loss gap, but **not** the cause of pristine navigation failure. More importantly, for action-bearing schemas (`changes`, `required`), generic LLM repair must not manufacture a new implementation. Investigate the ownership boundary and prefer a mechanical parse/format correction of the *same* observed final answer; if the answer lacks a recoverable schema-valid proposal, report failure/replan through existing Actor semantics rather than delegate ungrounded invention to a separate inference. Do not solve this solely by feeding more history to a second model; that adds cost and still lets a formatter make decisions. Assess existing `parseStructuredJsonResult` and Actor run contract before changing it. If faithful repair does use inference, constrain to lossless transformation and validate semantic equivalence or fail closed; no fabricated changes/questions. Do not modify unrelated structured-output consumers blindly.

## Safe staged tickets / gates

Use existing R2/R3 records and current project graph. Check actual ticket IDs, lease and work state before mutation; **never hand-edit kanban.md**. If useful add R2-N and R2-S as bounded child tickets through the canonical graph, with R2 depending on both; do not duplicate R1 or retroactively mark blocked work done. Avoid new ceremony if R2 already supports separate acceptance notes. Sync projections only following legitimate graph mutations.

### Gate 2A — Evidence adjudication (read-only)
- Inspect locally committed JSON and source revisions and map actual inference input → call arguments → actual observation → next inference input for pristine and baseline runs. Check the schema repair continuation separately.
- Build a small table of step number, invoked tool, parameters, success/error, observed content hash/summary, whether included in next prompt, mutation epoch, model output and guard decision. Redact secrets, bound raw logs.
- Identify earliest divergence for N and minimal reproducible setup. If model saw adequate correct evidence but chose same call, say so; do not invent a transport bug. If evidence lacks inference prompt, perform *one* controlled frozen reproduction that exposes it. No source edits at this gate.
- R2 implementation cannot begin without causal evidence. Stop honestly if missing.

### Gate 2B — Navigation correction (R2-N)
- Fix the earliest verified defect at its owner. Prefer existing primitives and delete superseded logic if applicable. Do not increase step/duplicate thresholds, add another guard, assume model disobedience is a code defect, or add ticket-specific prompts.
- Regression: observed prior lookup delivered to next inference, then the Actor can choose a distinct necessary observation, make a grounded change, or truthfully stop; original duplicate-loop safety remains intact. Include source/tool realism, not only fixed mocked decisions.
- Inspect each entire touched method against Prime Directive/am-i-allowed style; no unnecessary semicolons where applicable. Focused tests, typecheck, full affected suite, build and diff inspection. Stop all frozen runners before installation/replacement.

### Gate 2C — Output contract correction (R2-S; independently scoped)
- Prove the continuation's exact raw `finalText`, schema mismatch and proposed fabricated repair. Inspect `LLMActor.run`, `parseStructuredJsonResult`, caller schema and existing tests.
- Ensure schema repair does not convert unsupported prose into new tool/actions/required inputs. Preserve original observed final text and failure reason. Use existing parsing and decision flow; prefer fail-closed/replanning in the owning Actor contract over context-heavy LLM re-synthesis. Maintain compatibility with legitimate formatting-only repair where demonstrably safe.
- Regression covers: valid JSON direct acceptance; malformed but faithfully recoverable formatting; insufficient prose with prior successful edit must *not* invent `changes` or `required`; aborted signal; full observed tool history retained for decisions that legitimately replan. Existing consumers continue passing.
- Amend llm-utils only if it owns the demonstrated defect; rebuild dependent frozen AIWF after checks. Do not run AIWF linked to code being edited.

### Gate 3 — Stable build and honest end-to-end rerun
- Freeze/pin AIWF and dependency revisions, prove installed runner source isolation; preserve historical fixture independently. Use fresh process, clean/authorized target, no concurrent self-modification.
- Require **AIWF itself** to inspect, change, run tests, invoke independent acceptance and persist correct Ticket/lease/receipt/projections. Codex/lean-ctx command transport and Codex test runs are separately labeled, never substitutes.
- Verify any source change is materially correct, minimal and guideline-compliant. Run focused + full relevant tests/typechecks/build at the same revisions and inspect diff/status. No false success when Actor merely made an edit or emitted prose.
- If N and S pass separately but historical run fails again, record *new* first divergence and stop; do not layer speculative fixes. R2/R3 completion requires evidenced acceptance, with limitations explicitly recorded.

## Stable execution and commits

Never patch a source/dependency tree loaded by a currently running AIWF process. Existing R1 is immutable except a separately justified regression fix. Short bounded runs; clean `master` when stable, no forest of branches; optional rollback tag. Retain evidence in durable files and canonical graph; no raw secrets. Read governing instructions for every touched scope. Do not turn this incident into general quality architecture, broad refactoring, or more instrumentation by default.

## Launch prompt

Read `plans/AIWF-ticket-resolution-recovery.md` and **then this continuation file**. Resume from Gate 2A only. Confirm the actual locally committed execution JSON, code revisions, ticket/lease state and frozen runner. Do not rerun R1 or edit sources. Build the pristine and baseline step-to-step evidence map and independently inspect the structured-output continuation. Report first divergence and owner for navigation; record output-repair findings separately. If evidence is insufficient, perform at most one instrumented frozen reproduction, then stop with the exact missing item. Only after a supported causal finding, progress through Gates 2B, 2C and 3 as separately tested, reviewed, fresh-process work. No fabricated corrective implementation, speculative abstraction, extra thresholds or AIWF self-modification. Feed/update canonical tickets and sync Kanban; do not edit its projection. The final gate requires actual autonomous AIWF tests and independent acceptance, not Codex's tests.
