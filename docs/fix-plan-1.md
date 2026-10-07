# Fix plan 1: dependable LLM composition

Status: design/planning only. Tracking ticket: `TKT-8D3F`. No implementation is authorized by this document.

## Actor story

**J2.4 — Compose an unfamiliar project question from basic operations**

A developer asks a compound or unusual question about the current project that is not exactly covered by one named AIWF capability. AIWF starts with a small dependable execution surface, gathers real project evidence by composing basic operations and any specialized capabilities it discovers, reasons over the observations, and returns the requested grounded answer. If the needed evidence cannot be obtained, it stops with the concrete missing evidence or execution failure. The developer does not need a query-specific command or for AIWF developers to pre-encode words such as “second”, “least”, or a particular comparison.

This journey is the reason for the work below. “Expose more tools” is not itself the requirement.

## Design

The Actor gets two kinds of capability:

1. **basic execution substrate** — a tiny dependable surface available from the first Actor step;
2. **specialized semantic capabilities** — narrow domain tools selected/discovered when they are useful.

Semantic discovery is therefore an optimization and specialization mechanism, not a prerequisite for basic competence.

The substrate must remain small enough to preserve tool-catalog isolation and understandable safety. Current candidates are `run_command`, `compile_codelet`, `run_codelet`, and `script_eval`, but this list is explicitly **not** the chosen API.

Current source suggests the likely minimum is `run_command` plus the existing `discover_tools` path. A compound shell command can inspect CLI/project evidence, while discovery supplies efficient canonical domain tools. Codelet/script facilities should remain on-demand unless the audit proves that a permanently exposed additional primitive is both necessary and properly isolated.

In particular, current `script_eval` receives the global registry and therefore can bypass a run-local catalog. It must not become a default primitive in that form.

No ranking API, ordinal parser, query-specific workflow tool, second execution engine, or full-registry fallback is allowed.

## 1. Audit the execution contract before changing exposure

Trace the current local Actor boundary end-to-end:

- initial tool selection and `discover_tools`;
- exact tool schemas placed in the run-local catalog;
- shell/codelet/script execution semantics;
- authorization/safety behavior;
- cancellation and timeout propagation;
- stdout/stderr/exit status/truncation;
- failure representation;
- multi-tool-call step recording;
- public MCP versus internal local Actor boundaries.

The audit must produce a short concrete defect list. Do not infer missing architecture from names or tests.

Known items requiring confirmation:

- `run_command` has its own timeout but currently does not use `ctx.signal`;
- command failure is returned as `{success:false,...}`, while shared Actor failure behavior is exception/observation based;
- codelet/script paths need explicit cancellation and async behavior verification;
- `script_eval` currently receives the global registry;
- `WorkflowActor` events currently retain only the first call/result from a step even though the shared Actor can issue multiple tool calls.

Affected artifacts are inspection scope, not edit scope: `src/actor/engine.ts`, `src/tools/{registry,index,os,compiler,scripting,discovery}.ts`, `src/mcp.ts`, and shared `llm-utils` Actor/session code only if the local contract is insufficient.

## 2. Make the chosen substrate truthful before making it permanent

Only after step 1, select the smallest baseline primitive set.

Any always-present primitive must satisfy the existing execution contract:

- parent cancellation reaches in-flight work;
- timeout behavior is bounded and distinguishable from cancellation;
- exit/failure/empty-output/truncation are unambiguous;
- mutation risk is not mislabeled read-only;
- per-run catalog isolation remains real;
- no global-registry escape hatch;
- ordinary failures become useful Actor observations rather than false success.

Prefer correcting existing tools over adding wrappers or another executor.

If `run_command + discover_tools` satisfies J2.4, stop there. Add codelet/script primitives to the baseline only when a real journey demonstrates the need.

## 3. Expose the substrate from the first local Actor step

The local `WorkflowActor` begins every natural-language run with:

- the chosen basic substrate;
- the small set of specialized tools returned by initial semantic discovery;
- `discover_tools` for bounded later specialization.

An empty or failed semantic lookup must not remove the substrate.

The public MCP surface remains intentionally narrower and is not changed merely because the local Actor has internal execution primitives.

Keep the current discovery/refinement machinery until live evidence shows a piece has become redundant. Simplification follows proof; it is not assumed in advance.

## 4. Give the Actor enough environment, not a workflow

The Actor should know:

- canonical project root;
- which baseline primitives exist and what they return;
- that `aiwf help` / existing CLI commands can expose deterministic project operations;
- that specialized capabilities can be discovered;
- that current-project claims require observed evidence.

Do not teach query-specific algorithms. Sorting, comparison, decomposition, traversal choice and synthesis remain model reasoning over observed data.

Do not encode “second”, “least”, “most”, or specific artifact-comparison wording in dispatch code.

## 5. Make composition fully observable

Reuse the existing shell trace. It must truthfully retain:

- every tool call in a step, not only the first;
- every corresponding result/error;
- command/codelet text where applicable;
- elapsed time;
- discovery/catalog changes;
- timeout/cancellation/failure reason;
- final answer.

Private chain-of-thought remains excluded.

This is a correction to the existing event/trace representation, not a new telemetry subsystem.

## 6. Acceptance: protocol first, autonomous journey second

Deterministic tests prove only the protocol:

- baseline availability when discovery is empty/fails;
- catalog isolation across runs;
- truthful success/failure/empty/truncated results;
- timeout and cancellation;
- async execution where supported;
- multiple calls/results preserved;
- bounded specialized discovery.

Then exercise the real actor journey with the ordinary configured route and actual project evidence.

Mandatory live acceptance requests:

- “give me the 2nd most recommended next ticket?”
- “give me the most recommended and the least recommended tickets and see if they are related to the same main artifacts”

Use realistic isolated fixtures with ties, related/unrelated artifacts and insufficient evidence. Independently inspect the fixture truth and compare the answer.

Mocked model decisions prove protocol only. A green suite does not close J2.4.

## 7. Persist proof and measure honestly

Run focused tests, full `bun test`, strict typecheck, and affected sibling suites only when sibling source changed.

Persist canonical TestNode evidence and Ticket acceptance proof. Record latency, model/tool calls, repeated work, provider/model identity and cost/tokens only when actually reported.

Separate:

- execution-contract defects;
- model reasoning failures;
- semantic-discovery failures;
- provider/model availability failures.

Keep `TKT-8D3F` open until the live J2.4 acceptance requests succeed on the intended route.

## Completion criteria

- basic project evidence gathering survives failed/empty specialized discovery;
- the baseline surface is small, truthful, cancellable and isolated;
- specialized discovery remains available without gating basic execution;
- the model answers both mandatory live requests by composing observed evidence;
- no query-specific ranking/ordinal logic was added;
- trace shows the complete observable execution;
- canonical tests/typecheck and live journey evidence are green.
