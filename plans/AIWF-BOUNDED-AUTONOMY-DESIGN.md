# Bounded Autonomy — core execution invariant

**Status:** Design proposal for developer review. No runtime implementation or Product acceptance is authorized by this document.
**Basis:** Developer request; accepted canonical `PRODUCT`, version 1; current source at `b394b6b`.
**Scope:** Every AIWF autonomous workflow: Actor execution, investigation/preparation, Product processing/planning, implementation, tests and verification, discovery, delegation, retries, escalation and recovery. Future workflows, including Digest, inherit the same contract. This does not advance delivery stages or reopen earlier Product Intent work.

## Invariant and lifecycle distinction

An autonomous execution has one finite, authorized governing budget, explicit terminal outcome and durable report. Every descendant consumes that budget or a reserved portion of it. Creating another Actor, Asker, pipeline, span, project store or recovery attempt cannot create fresh authority or capacity.

A Ticket is long-lived work; an execution is one bounded attempt at the currently requested operation. One execution can advance several Tickets, and a Ticket can span several explicitly authorized executions. A successful publication does not assert Story acceptance. An unfinished Ticket does not authorize indefinite execution. Exhaustion must preserve legitimate completed changes, evidence, receipts and child-Ticket completions.

## Current owners and demonstrated gaps

| Existing owner | Reuse | Gap to close |
| --- | --- | --- |
| [`WorkflowStore.withExecutionContext`](../src/graph/store.ts), [`ToolContext` / `ToolRegistry.execute`](../src/tools/registry.ts) | Trusted execution authority, inherited signals, active-context checks and common dispatch | No governing budget; execution context is store-instance-local, so cross-store delegation needs explicit propagation. |
| [`ArtifactBudget`](../src/artifact-policy.ts) | Visited artifacts, depth, breadth and remaining IDs | Each constructor creates a new local allowance; nested preparation/processing must not reset governing bounds. |
| [`resolveTicket`](../src/ticket/resolve.ts), [`implementTicket`](../src/ticket/implementation.ts) | Existing traversal, repair/tranche bounds, shared implementation-token object, mutation/proof ownership and lease cleanup | Tokens are shared within a resolver invocation, but not uniformly across all phases, entry points and nested invocations. |
| [`createActorTokenBudgetPolicy`](../src/actor-budget-policy.ts) | Existing token-extension policy hook | Default local execution can replenish the token baseline without a governing finite total. |
| [`WorkflowActor.runAttempts`, `runOptions`, `discoveryHandler`](../src/actor/engine.ts) | Existing Actor/session, escalation and bounded capability recovery | Escalation calls the session again with per-run limits; a new discovery handler resets its local attempt counter. Root exhaustion is not currently a universal non-retryable outcome. |
| `llm-utils` `TokenBudget`, `Asker.ask`, `LLMActor.run`, `LLMPipeline.run` | Shared token accounting, structured-response correction, Actor steps and pipeline retry/stage limits | Local limits alone do not compose into an end-to-end limit. Input-token estimates must not be mistaken for proven hard reservation bounds. Keep these generic library owners independent of AIWF persistence. |
| [`budgetedInference`](../src/paid-inference.ts) | Authorization, conservative pre-call reservation, usage settlement and unknown-cost refusal | The counter currently belongs to a constructed inference closure, principally used by verification; a new closure must not reset a root execution's spending allowance. |
| [`run_command`](../src/tools/os.ts) | Parent cancellation, per-command timeout and process-group termination | Timeouts need the minimum of their local bound and the governing remaining deadline. |
| [`withArtifactMetrics`](../src/performance-metrics.ts), [`systemJournal`](../src/graph/journal.ts), [`saveShellTrace`](../src/shell-trace.ts) | Trace/span identity, existing journal storage, metrics and human-readable trace presentation | Metrics persistence is intentionally best-effort and the shell trace is replaceable. Neither is an authoritative, durable execution-budget record. |

These are source findings, not new execution tests or claims that universal enforcement already exists.

## One mechanism, inside the existing execution lifecycle

Extend the existing trusted execution context with **one budget handle**, backed by **one internal execution record in the existing Semantika system journal**. Reuse the root trace ID as execution identity and existing span IDs for children. Do not create another executor, scheduler, workflow graph, Ticket hierarchy, database or retry manager.

The record holds the requested operation/scope reference, original limits, spent and reserved capacity, deadline, active/terminal disposition, and compact completed/remaining-work references. It is internal execution bookkeeping, not a new Product entity. Existing meaningful history entries and evidence remain authoritative for their contents.

The existing lifecycle owners perform admission and finalization. Registry dispatch and the model boundary enforce the same handle. Artifact traversal, Actor/session/pipeline loops and recovery paths check it at their existing boundaries. Metrics reuse its identity and observe it; optional telemetry never grants execution permission or overrides its outcome.

Only a developer-triggered root request can admit a new governing budget. Ordinary requests use approved finite defaults without an extra approval ceremony. Trusted host context supplies it; model-authored tool arguments cannot grant, replace or enlarge it. A nested public call inherits the root even when it constructs another store or changes project. Direct SDK and CLI autonomous entry points must join this same admission path, not rely solely on MCP wrapping.

### Finite limits and accounting

- Require a positive finite deadline and action allowance, plus a finite aggregate model-token ceiling. Reuse existing artifact depth/breadth and paid-provider/task/ceiling policy as additional constraints. Zero paid authorization means no paid execution.
- Proposed initial defaults for review: **10 minutes, 128 actions, 128,000 aggregate model tokens**; paid authority remains absent by default. These are configuration proposals, not measured optimums. Keep the existing Actor token baseline as a local allocation setting rather than silently redefining its meaning.
- Charge one action before each model request or tool dispatch. An autonomous retry/transition/recovery iteration that would otherwise do no charged work also consumes an action. Internal wrappers do not charge the same dispatch twice. Repeated visits to an already-counted artifact still consume action/time allowance for actual work.
- Carry the governing execution handle through every model call, including discovery, proposal, critique, correction, verification and synthesis. Reuse existing shared `TokenBudget` objects as local/per-run constraints. Their extension hooks cannot enlarge the governing token limit; the actual model-dispatch guard still refuses an unreservable request. Explicit developer hard limits remain hard limits.
- Reserve a conservative input/output-token and, where applicable, monetary upper bound before starting a model request. Reuse current serialization, token and pricing owners; an estimate that may undercount cannot establish a hard bound. Unknown pricing or unbounded billable options block the request.
- Use existing Semantika optimistic/atomic writes to reserve shared capacity before work. Concurrent children cannot each spend the same remainder. Spent usage never decreases. Original limits never increase automatically. Release only proven unused reservations, exactly once; uncertainty retains the reservation and produces an explicit blocker.
- Reserve a small finalization allowance **inside** the root deadline. It permits only deterministic cancellation, settlement, lease release and report persistence, never another model call or repair. Children do not each acquire an extra cleanup budget.

Accounting has one authority: the journal-backed governing record. Reuse the existing token/pricing reservation and settlement logic at the actual model-dispatch boundary; do not charge the same request again in an Asker wrapper. Existing local counters remain additional constraints, not a second governing ledger. Model factories must consult the active trusted execution at dispatch, so constructing a new Asker or paid-inference closure cannot capture a fresh allowance.

For every limited resource: **spent + outstanding reservations must not exceed the original authorized limit**. Timeouts, local caps and child allowances may tighten this bound, never relax it.

### Delegation, retry and recovery

In-process descendants share the handle. Cross-process/project delegation must carry the trusted root identity, cancellation/deadline and a reservation deducted before launch. The child cannot obtain another root through its normal entry point. Child settlement is idempotent; a lost or uncertain child is not refunded as if no work occurred.

Preserve existing local retry, repair, stage and discovery limits as additional bounds. Switching model, rebuilding an Asker, making another Actor run, starting another pipeline, reopening a store, or calling a resolver recursively does not renew any governing allowance. Exhaustion is terminal and non-retryable: it must not enter fallback, Critic correction, model escalation or capability recovery. Other recovery is allowed only within the original authorized scope, existing policy and remaining budget.

Persist admission and reservations before effects so restart/reconnection cannot erase consumed capacity. Reopening a stopped or interrupted execution does not grant more work. An explicit developer continuation admits a new finite execution linked to the previous report; automatic continuations must retain the old execution and its limits. Resume recomputes safe next work from existing canonical state and evidence, not a serialized execution stack or duplicate planner.

### Terminal outcomes and durable reporting

Every admitted root ends as **complete, needs_input, blocked, budget_exhausted, cancelled, failed or interrupted**. These are outcomes of one execution, not new Ticket lanes or an additional workflow state machine. Keep existing artifact result compatibility: for example, budget exhaustion can remain `status: blocked` with an explicit structured execution reason. Actor and pipeline results expose the same governing outcome rather than disguising it as a provider or acceptance failure.

Finalization stops new dispatch, propagates cancellation, revokes late mutation permission through the existing active-context guard, stops supervised processes, settles known usage, releases claims/admission and durably records:

- root identity, requested operation and relevant Ticket IDs;
- original limits, measured usage, retained/unknown reservations and termination reason;
- completed changes and valid evidence/receipt references;
- remaining authorized work and the precise input, dependency or renewed budget needed to continue.

Reporting is deterministic and compact. Preserve original journal entries and evidence; do not copy full prompts, code or test output, append logs to Ticket.body, or require an LLM to explain exhaustion. Ticket history references the report; existing trace/metrics inspection gains retrieval by root identity for executions without Tickets. A permanent report is not merely the shell's latest replaceable trace.

Fail admission if the initial durable record cannot be written. If final persistence fails, preserve completed work and return the explicit persistence failure and available report; never claim it was saved or run an open-ended reporting-recovery loop. On later inspection, an unclosed execution is reported as interrupted with conservative usage. A crash cannot truthfully guarantee a final write; persisted admission/reservations make that limitation recoverable. Late usage settlement may append accounting facts but cannot reopen execution or authorize more work.

## Review implications and limits

1. **Hard enforcement replaces advisory prose.** The current bounded-completion guidance remains useful but cannot establish this invariant by itself. All model factories and autonomous entry points must join the same native context; no verifier-only exception.
2. **Cancellation must be real.** Reuse the existing command process-group owner. An AbortSignal alone cannot preempt arbitrary synchronous code or an uncooperative delegate. Such work must use an existing supervised bounded path or be refused in autonomous mode; do not invent a universal worker framework to hide that gap.
3. **External host integration is necessary.** An MCP server cannot bound a coding agent's reasoning or tool calls outside AIWF. End-to-end compliant integrations must propagate trusted root identity and cancellation across the host's whole autonomous request. Without that capability, AIWF can promise bounded individual invocations only; it must not advertise whole-host compliance or launch an unbounded delegate.
4. **Durable accounting is stricter than metrics.** Keep best-effort metrics observational. Budget reservation and terminal reporting use the existing journal/store authority; internal reporting for read-only executions must not grant Product/source mutation authority.
5. **Finite defaults can stop useful work early.** Show remaining work and allow explicit continuation. Calibrate defaults with the public Story before adoption; never silently extend them to obtain green results.
6. **Acceptance remains truthful.** Exhaustion is a legitimate terminal outcome, not successful acceptance. It does not manufacture Done or invalidate previously legitimate receipts. A publish request stays a separate scoped operation; formal acceptance obligations remain explicit.

## Proposed charter amendment and implementation sequence

The exact proposed charter wording is in [Product Charter](../docs/product-charter.md#proposed-amendment--bounded-autonomy-pending-design-review). Accepted canonical `PRODUCT` version 1 is unchanged pending developer review and the existing reviewed Product mutation. This proposal strengthens existing authority, efficiency, integrity and durability constraints without adding a planning ceremony.

The [implementation plan](AIWF-DHARMAX-WAY-PLAN.md#bounded-autonomy--architectural-prerequisite-pending-design-review) records this as a cross-cutting prerequisite within the current authorized priorities. Design review does not authorize runtime implementation or advance a gate.

After design approval:

1. Apply the exact reviewed charter amendment through the existing canonical Product owner and regenerate its projection. Approve one complete outward Story and its public-interface test before coding.
2. Establish the real baseline using existing entry points. Implement root admission, shared accounting and durable finalization at the current execution/store owners, then wire existing model/tool owners to it. Retain existing authority, source/proof transactions and scope checks.
3. Run the **same Story**, parameterized across Actor execution, artifact investigation/preparation/resolution, Product processing/planning and supported nested/pipeline/host paths. A developer starts work with finite limits; a child delegates, encounters a repair/recovery path and exhausts the shared budget; the request returns promptly with a retrievable report, completed work and remaining work; reopening the Ticket preserves both; only explicit continuation admits new capacity. Also prove the ordinary within-budget completion path.
4. Add proportionate boundaries: concurrent reservation, nested store/process propagation, model escalation, correction/discovery retries, local token-extension denial at the governing cap, deadline/cancellation and late callbacks, persistence failure/crash/reopen, unknown usage, idempotent settlement, zero paid authority and legitimate receipt preservation. Unsupported host cancellation/identity must fail clearly rather than be counted as covered.
5. Audit every autonomous entry point and every model/Actor/pipeline construction against the common boundary. New features must name their existing entry owner, governing budget, terminal outcomes, report and child propagation. Qualify the complete public Story and relevant regressions/typecheck, then obtain independent current acceptance under separately authorized inference limits. No intermediate green is product completion.

**Review decision requested:** approve or revise the single shared execution-budget mechanism, journal accounting/reporting, host-boundary requirements and provisional default limits. Do not implement before that review.
