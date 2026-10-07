# Agency restoration plan

**Status:** authoritative implementation plan for restoring general Actor competence on `master`.  
**Tracking context:** supersedes the discovery-centered implementation direction of `docs/fix-plan-1.md`.  
**Constitution:** `docs/agency-constitution.md`.

The objective is not “better tool discovery”. It is:

> **An AIWF Actor understands the user's goal and can pursue it generically using reasoning, observed evidence, universal primitives, specialized capabilities, temporary self-extension and external knowledge where available.**

The implementation must remain small. Do not add a planner/orchestrator around the LLM; the LLM Actor already is the planner.

---

## 1. Proven current failure

Current `WorkflowActor.execute()` performs semantic discovery **before** the Actor run and constructs the run-local catalog from discovered tools. When discovery is empty/insufficient, the Actor can be left without general project hands.

Additional observed/design defects:

- DEV/DESIGN/TRIAGE prompts explicitly say to use only discovered capabilities.
- Natural-language mode selection is coupled to discovery; discovery failure can leave a request in an unhelpful mode.
- `run_command` exists but is not guaranteed in the initial Actor surface.
- `run_command` does not currently propagate `ctx.signal` and truncates output without explicit truncation metadata.
- self-extension already exists through `compile_codelet`, `run_codelet` and `promote_codelet`, but those facilities can themselves become unreachable when discovery fails.
- `script_eval` exposes the global registry and therefore is not an acceptable default bootstrap primitive.
- the registry has a `web` category but AIWF currently registers no web implementation; do not invent a web subsystem merely to pass the present regression.
- the shared `LLMActor` already supports run-local tools and dynamic missing-capability recovery. Inspect the **actual local sibling source/API** before editing AIWF; do not assume repository snapshots and installed sibling code are identical.

The real-world regression that exposed the architecture:

> “what's on the critical path of this project? what's the goal of the project? what's missing?”

The model already knows the methodology. It only needs project evidence. “No suitable tool” is therefore not a legitimate answer.

---

## 2. Target architecture: goal pursuit, not pre-routing

The critical path becomes:

```text
USER GOAL
   ↓
Actor understands desired outcome
   ↓
What evidence/actions are needed?
   ↓
┌──────────────────────────────────────────┐
│ use existing observations                │
│ use a specialized capability if useful  │
│ inspect/act through universal substrate  │
│ create a temporary helper if useful      │
│ obtain external knowledge if available   │
│ ask user only for a genuine blocker      │
└──────────────────────────────────────────┘
   ↓
observe → replan → verify
   ↓
grounded outcome
```

There is **no mandatory semantic-discovery step before cognition**.

### Bootstrap substrate

First hypothesis:

```text
run_command
+ one explicit bounded capability-discovery mechanism
```

This hypothesis must be proven by the Agency Gate, not defended architecturally.

Why it may be enough:

- `run_command` can inspect files, invoke AIWF deterministic CLI commands, use standard Unix/Bun tooling, and synthesize/run temporary scripts.
- capability discovery can expose efficient canonical tools when they exist.
- the Actor's own model supplies methodology and decomposition.

Do **not** automatically add `compile_codelet`, `run_codelet` or `script_eval` to the baseline. If the Agency Gate proves `run_command` insufficient for self-extension, expose the smallest additional safe primitive. `script_eval` is specifically disallowed as baseline in its current global-registry form.

### Specialized discovery

Discovery moves **inside** goal pursuit.

Preferred order:

1. Actor starts immediately with the bootstrap substrate.
2. Actor reasons about the goal and evidence/actions needed.
3. Actor requests specialized capabilities only when useful.
4. Runtime adds only those capabilities to the isolated current run.
5. If discovery fails, Actor continues with its bootstrap substrate.

Initial semantic prefetch may be reintroduced later only as a measured optimization that:
- is non-authoritative;
- cannot remove baseline tools;
- cannot delay the Actor materially when slow;
- cannot determine whether the request is solvable;
- cannot be required for mode correctness.

Until the Agency Gate is green, remove it from the competence-critical path.

---

## 3. Capability acquisition ladder

The Actor should naturally choose among these routes; this is not a deterministic workflow engine.

### A. Native reasoning

Use model knowledge to understand the method.

Example: the model already knows what a project critical path is and what evidence could establish one.

### B. Existing specialized capability

Use a discovered graph/ticket/product/test/etc. tool when it is a convenient high-level fit.

### C. Universal execution

Use `run_command` to inspect the project, invoke `aiwf help` / deterministic CLI operations, read files, combine commands, or run a small calculation.

### D. Ephemeral self-extension

When shell composition becomes awkward, construct a temporary helper/script/codelet and execute it.

Default: ephemeral.  
Promote/persist only when reuse or explicit user intent justifies it.

The architecture must prove this path works even when semantic discovery is disabled.

### E. External knowledge

If methodology is genuinely unknown, use a registered web/docs/knowledge capability or another available environment route. This is an escape hatch, not a requirement for the present critical-path regression.

### F. Genuine blocker

Only after viable routes are exhausted may AIWF stop for:
- unavailable required evidence;
- denied authorization/safety boundary;
- unavailable external dependency that is genuinely necessary;
- ambiguous user decision that cannot safely be inferred.

The final answer must name that concrete blocker, not “tool limitations” generically.

---

## 4. Implementation phases

### Phase 0 — falsify before fixing

Before production changes, create black-box regression fixtures that demonstrate the current architecture failing.

Do not mock model tool choices for journey acceptance.

Record the current traces for the exact live regressions. They are evidence, not expected behavior.

**Gate 0:** the failure is reproducible and independently understood.

### Phase 1 — make the bootstrap primitive truthful

Audit and harden `run_command` before making it universally available.

Required contract:

- parent `AbortSignal` cancels in-flight execution;
- timeout and cancellation are distinguishable;
- exit code is explicit;
- stdout and stderr are explicit;
- empty output is distinguishable from failure;
- truncation is explicit (`stdoutTruncated` / `stderrTruncated` or equivalent);
- working directory behavior is explicit and tested;
- failures are observations the Actor can reason from;
- no second shell executor/wrapper is introduced.

Do not redesign shell safety in this ticket unless a reproduced defect requires it.

**Gate 1:** primitive-truth mechanism tests pass.

### Phase 2 — remove discovery from the entrance gate

Change the local Actor so the bootstrap substrate is present from step 1 regardless of discovery outcome.

The Actor must start even when:
- semantic classifier throws;
- classifier returns no match;
- refiner rejects all candidates;
- discovery is intentionally disabled.

Prefer no mandatory pre-Actor discovery. If any prefetch remains temporarily, its result may only add optional tools; it must not define the run catalog.

The exact dynamic-discovery mechanism should use the smallest contract supported by the **actual local `llm-utils`** (`onMissingTool`, explicit discovery hook/tool, or equivalent). Do not fork a second Actor implementation.

**Gate 2:** discovery-disabled mechanism tests still expose bootstrap competence.

### Phase 3 — correct Actor instructions

Remove instructions equivalent to “use only discovered capabilities”.

Shared invariant to express in every mode:

> You are responsible for achieving the user's goal. Specialized tools are conveniences, not the boundary of what you may attempt. Use general knowledge to choose methods; ground current-project claims in observed evidence. If a capability is missing, discover, compose or construct an alternative before declaring a blocker.

Modes remain preferences:
- DEV biases implementation/code evidence;
- PRODUCT biases Product Intent/work evidence;
- DESIGN biases architecture;
- TRIAGE biases failures/tests.

They must not make other generally solvable requests impossible.

Do not encode query-specific procedures.

**Gate 3:** the critical-path journey succeeds while forced to DEV mode.

### Phase 4 — prove self-extension

Do not add a new capability framework.

With specialized discovery disabled, give the Actor a fixture requiring a small computation not directly served by a baseline command/tool. It must use universal execution to create/run a temporary helper and finish correctly.

If this fails because `run_command` is genuinely insufficient, only then expose the smallest existing codelet primitive(s), after fixing their execution/cancellation contract. Do not expose `script_eval` globally.

**Gate 4:** missing specialized capability causes composition/creation, not surrender.

### Phase 5 — complete observability

The existing trace must show the evidence needed to diagnose agency:

- bootstrap tools present at start;
- discovery requests/results/failures;
- every tool call/result in multi-call steps;
- commands/helper executions;
- errors, timeout/cancellation and truncation;
- catalog additions;
- elapsed time and termination;
- final answer.

No private chain-of-thought.

**Gate 5:** an interrupted/failing run remains completely inspectable.

### Phase 6 — Agency Gate: adversarial black-box acceptance

Use realistic isolated fixtures with independently known truth **and** live runs on the AIWF repository.

#### A. Discovery-off project analysis

Disable semantic discovery.

Ask:

> “what's on the critical path of this project? what's the goal of the project? what's missing?”

Fixture contains an explicit Goal, dependency chain/blocker, active work and a known missing/gap condition. The answer must identify them from observed evidence.

#### B. Hidden ideal capability

Hide the preferred recommendation selector.

Ask:

> “give me the 2nd most recommended next ticket?”

The Actor must obtain underlying candidates/evidence and reason to the answer without query-specific production code.

#### C. Compound comparative reasoning

Ask:

> “give me the most recommended and the least recommended tickets and see if they are related to the same main artifacts”

No specialized comparative/ranking handler may exist.

#### D. Misleading discovery

Return an irrelevant or insufficient specialized capability. The Actor must reject/route around it rather than conclude impossibility.

#### E. Self-extension

Disable discovery and request a novel but locally computable aggregate/transformation with no direct specialized tool. The Actor must construct/run a temporary helper and answer correctly.

#### F. Paraphrase/metamorphic check

Ask semantically equivalent versions of A/B/C using substantially different wording. Correctness must survive wording changes. Tool sequences need not be identical.

#### G. Mode independence

Run a Product-like analysis in forced DEV mode. It must still succeed.

#### H. Discovery failure/latency degradation

Make discovery throw or time out. The Actor must continue through the baseline substrate rather than wait for a full discovery retry chain or surrender.

#### I. No special-case implementation

Acceptance prompt strings/phrase fragments may appear in tests/docs, but production `src/` must contain no query-specific critical-path/ordinal/least/second handlers created to pass the gate.

### Acceptance rule

Mechanism tests may mock models. **Agency Gate journeys may not mock the model's action choices.** They must run through the ordinary configured Actor route.

A green suite without Agency Gate success is failure.

---

## 5. Success criteria

The restoration is complete only when all are true:

- the Actor starts with discovery-independent bootstrap competence;
- mandatory pre-Actor semantic discovery no longer defines solvability;
- discovery failure degrades convenience/efficiency, not competence;
- general model knowledge can determine methodology while project claims remain observed;
- missing specialized capabilities can be composed/created;
- mode misclassification does not destroy competence;
- the three real user regressions succeed generically;
- adversarial discovery-off/misleading-discovery/self-extension gates pass;
- no query-specific production handlers were added;
- focused tests, full `bun test`, strict typecheck and affected sibling tests pass;
- live trace evidence is retained;
- latency/tool-call counts are measured before/after rather than guessed.

---

## 6. Stop conditions

Stop implementation and redesign if any proposal introduces:

- another planner/orchestrator around `LLMActor`;
- a deterministic classifier that decides whether the Actor may attempt a goal;
- a full global tool catalog in the prompt;
- query-specific ranking/critical-path/ordinal logic;
- a second tool registry/discovery system;
- a second shell executor;
- automatic durable promotion of one-off helpers;
- baseline `script_eval` with global registry access;
- mode-specific capability walls;
- component tests presented as proof of agency.

The intended correction is mechanically small:

> **Start the existing Actor with universal hands, move specialization inside its reasoning loop, preserve grounding, and prove that discovery can disappear without making the Actor stupid.**
