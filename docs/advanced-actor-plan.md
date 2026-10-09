# Sophisticated prompts — robust design and execution plan

**Status:** active plan for J2.4/J2.5 only.  
**Problem:** AIWF and ai-cli should handle genuinely compound user goals without query-specific workflows, excessive LLM/tool micromanagement, or dependence on one execution trick.  
**Out of scope:** repository code generation, Ticket implementation redesign, durable skill authoring, Product Intent redesign.

## 1. Actor journeys

### J2.4 — solve a sophisticated goal

A developer asks a compound question whose answer is not available from one named capability, for example:

> what's on the critical path of this project? what's the goal of the project? what's missing?

The system:

1. understands the whole requested outcome;
2. uses an adequate reasoning model;
3. gathers current evidence;
4. chooses the simplest useful way to work with that evidence;
5. observes results and replans when needed;
6. returns a grounded answer covering every requested part, or names the concrete blocker.

Possible means include direct reasoning, ordinary tools, capability discovery, environment execution, and temporary deterministic computation.

The user never needs a special command for “critical path”, “least”, “rank”, “second”, or another linguistic shape.

### J2.5 — understand and configure the cognitive runtime

A developer notices that difficult requests are slow, expensive or weak. From AIWF they can inspect the effective cognitive runtime—local/cloud availability, task routes, current recommendations and observed runtime behavior—and change high-level preferences without editing JSON manually.

After a run AIWF can say which route/model/provider actually executed it and which fallbacks/escalations occurred, without exposing secrets or pretending that configuration alone proves capability.

These journeys are the acceptance boundary. Everything else in this document is subordinate to them.

---

## 2. What we know, and what we do not

### Observed

- AIWF has failed sophisticated prompts despite having relevant project data and useful primitive capabilities.
- Long LLM → tool → observation loops can consume steps and latency without converging.
- Earlier AIWF leaned heavily on text/codelet compilation and still failed badly as a general agent.
- llm-utils already provides the important shared primitives: LLMActor, task/model routing, failover, System-1, metrics and model advice.
- AIWF already has OpenRouter, local Ollama, Model Radar, provider diagnostics and configuration machinery.
- The same general class of compound-prompt problem exists in ai-cli.

### Hypotheses to test, not assumptions

1. **Model adequacy:** some failures are caused mainly by a weak/slow executive model or an inappropriate route.
2. **Execution granularity:** some failures remain because the Actor must coordinate too many deterministic micro-steps.
3. **Shared abstraction:** AIWF and ai-cli may share enough behavior to justify @dharmax/advanced-actor.
4. **System-1 value:** the existing cheap assessment may improve tactic/model choice enough to justify using it.
5. **Temporary computation value:** text-compiler or another existing mechanism may be useful for some deterministic subproblems.

Any of these hypotheses may be rejected by evidence.

This is deliberate. The plan must not force implementation of its own guesses.

---

## 3. Core design law

> **Solve cognitive problems at the cognitive layer; use execution mechanisms only when they genuinely simplify the work.**

That means:

~~~text
goal
  ↓
adequate executive reasoning
  ↓
choose the simplest useful means
  ├─ reason directly
  ├─ use one/few capabilities
  ├─ discover missing capability
  ├─ inspect/execute in environment
  └─ perform temporary deterministic computation
  ↓
observe
  ↓
replan if necessary
  ↓
grounded outcome
~~~

No mechanism defines “sophisticated”.

In particular:

~~~text
sophisticated ≠ compile
sophisticated ≠ use stronger model
sophisticated ≠ discover more tools
sophisticated ≠ shell
~~~

Those are possible means chosen from the actual task/evidence.

---

## 4. Reference behavior: Codex/AGY

The useful lesson from Codex/AGY is **general agency with flexible execution**, not any one tool.

Their externally visible capability shape is:

~~~text
goal
 -> capable executive model
 -> dependable execution substrate
 -> choose useful action granularity
 -> act / inspect / compute
 -> observe
 -> replan
 -> finish
~~~

A sophisticated request can therefore become one tool call, ten investigative steps, or a temporary program depending on what the problem actually needs.

That is the behavior to reproduce.

The old AIWF mistake was closer to:

~~~text
goal
 -> favored mechanism
 -> force problem through mechanism
 -> hope generated execution compensates for weak strategy
~~~

This plan explicitly prevents that regression.

---

## 5. Minimal shared contracts

Do not start by creating @dharmax/advanced-actor.

First identify the smallest contracts that both hosts actually need.

### 5.1 Cognitive route

The Actor needs a task/model route appropriate to the work.

Advanced behavior may request a semantic class such as fast, reasoning, code, or local, but **never chooses vendor/model names itself**.

llm-utils remains the sole routing authority.

The host/user configuration determines what reasoning means: local model, OpenRouter model, direct provider, fast/cheap remote route, etc.

### 5.2 Tactical hint

System-1 may provide a compact assessment of useful task characteristics, for example:

~~~ts
{
  reasoningDemand: 'routine' | 'moderate' | 'demanding'
  deterministicCompositionLikelyUseful: boolean
  dominantShape?: 'traverse' | 'filter' | 'aggregate' | 'compare' | 'correlate' | 'transform'
}
~~~

This is advisory evidence only.

No System-1 result may:

- forbid a route;
- force compilation;
- declare the task solvable/unsolvable;
- shrink the Actor's available powers.

Malformed/unavailable/low-confidence assessment means: continue normally.

### 5.3 Temporary deterministic computation

If real runs prove the need, expose one semantic capability such as:

~~~text
compute(intent, explicit input, explicitly bound capabilities)
~~~

The Actor supplies behavior, not source code.

Its implementation may use text-compiler.

The capability is appropriate only when it reduces a deterministic multi-step subproblem such as traversal, filtering, aggregation, comparison or correlation.

It is not a general reasoning substitute.

### 5.4 Runtime profile

Hosts may expose a small sanitized profile:

~~~ts
interface CognitiveRuntimeProfile {
  taskRoutes: readonly string[]
  localAvailable: boolean
  remoteAvailable: boolean
  observed?: {
    recentLatencyByRoute?: Record<string, number>
    recentSuccessByRoute?: Record<string, number>
  }
  constraints?: {
    localOnly?: boolean
    maxCost?: number
  }
}
~~~

No credentials, giant model catalog or raw provider configuration enters the Actor context.

---

## 6. Model adequacy and OpenRouter

A sophisticated Actor needs an adequate executive model. This is not optional architecture trivia.

Reuse existing AIWF/llm-utils machinery:

- Asker;
- ModelRouter;
- task routes;
- configured fallbacks;
- model advice;
- OpenRouter;
- provider options;
- metrics;
- Model Radar.

Do not build another router.

### Route policy

System-1 or the Actor may indicate that a request is demanding. The host then asks for the configured reasoning route.

That route can resolve to a fast/cheap/strong OpenRouter model rather than a slow local model.

Provider choice remains configuration, not code. Groq or another high-throughput provider may be preferred through OpenRouter when configured, but no shared module contains Groq/OpenRouter-specific strategy logic.

### Escalation

Escalation is triggered only by **observable no-progress**, not by prompt wording.

Examples of no-progress evidence:

- repeated unchanged observations;
- repeated inability to select a viable next action;
- malformed/invalid Actor decisions;
- exhausted useful local capabilities with unresolved requested outcome;
- repeated timeout/failure on the selected cognitive route.

The first implementation should test the smallest bounded escalation policy. “One escalation” is a starting experiment, not an architectural invariant.

Explicit local-only/model/provider constraints always win.

---

## 7. Temporary computation must earn its existence

Earlier AIWF overused compilation. Therefore temporary computation is behind an explicit evidence gate.

Before implementing it, prove from preserved runs that:

1. the executive model understood the goal;
2. relevant evidence/capabilities were available;
3. the failure came from long deterministic coordination rather than misunderstanding/routing;
4. collapsing that coordination into one computation is likely to reduce steps or error.

If those conditions are not met, do not add compilation.

### Safety boundary

If implemented, temporary computation is initially read-only and ephemeral:

- only explicitly bound host-approved capabilities;
- no ambient registry;
- no repository mutation;
- no package installation;
- cancellation/time limits propagate;
- calls remain traceable;
- output is derived evidence;
- no persistence/promotion.

If text-compiler cannot support that boundary cleanly, add the smallest generic seam needed or reject it for v1.

---

## 8. Shared package decision

@dharmax/advanced-actor is created **only if the implementation evidence shows a stable shared core** across AIWF and ai-cli.

The package must satisfy all of these:

1. same behavior is needed by both hosts;
2. host-specific graph/shell/config semantics remain outside;
3. extracting it removes meaningful duplication;
4. its API can be described in one short paragraph;
5. it does not become another planner/router/framework.

Expected shape, if justified:

~~~ts
const actor = new AdvancedActor({
  asker,
  systemOne,
  computation
})

await actor.run(goal, {
  tools,
  discoverTools,
  runtimeProfile,
  context,
  signal
})
~~~

Expected responsibility:

> compose LLMActor with optional tactical assessment, route adequacy, optional ephemeral computation and bounded evidence-driven recovery.

If the real shared core is smaller than this, extract the smaller thing.

---

## 9. AIWF self-awareness and TUI

J2.5 is an independent product requirement, not a reason to complicate AdvancedActor.

Reuse existing AIWF sources of truth:

- config.ts;
- model-runtime.ts;
- doctor.ts;
- Model Radar;
- llm-utils model advice/metrics.

The TUI should expose only useful high-level controls:

- effective gateway/provider availability;
- default route;
- fast route;
- reasoning route;
- local-only / auto policy;
- supported speed/cost preference;
- current recommendation/advice when available;
- recent observed latency/success where measured.

Required actions:

1. inspect effective runtime;
2. change high-level route/preference;
3. validate target reachability;
4. save through existing config;
5. immediately display effective configuration;
6. show actual model/provider used by the current/recent run.

No second settings store. No secrets in the UI.

Configuration is evidence of intent, not proof of successful inference.

---

## 10. Execution plan

### Phase 0 — establish truth, no architecture work

Reproduce and preserve:

- at least two AIWF sophisticated-prompt failures;
- at least one equivalent ai-cli failure;
- at least one historical compiler-heavy AIWF failure/path.

For each run capture:

~~~text
requested outcome
actual model/provider
route/task class
System-1 output if any
tools/capabilities exposed
tool/discovery sequence
Actor steps
timeouts/retries
latency
final correctness/grounding
~~~

Classify each failure by evidence:

~~~text
A. goal misunderstanding
B. inadequate/slow executive model
C. missing/wrong evidence
D. poor tactic selection
E. bad execution granularity
F. compiler misuse
G. tool/discovery defect
H. termination/budget defect
~~~

Several classes may apply; identify the earliest causal failure rather than the last symptom.

Also inspect the exact current contracts in AIWF, ai-cli, llm-utils and text-compiler.

**Gate 0:** produce a causal defect matrix. No production architecture is allowed merely because this plan predicts it.

### Phase 1 — cheapest falsification experiments

Run controlled experiments against the same preserved prompts. Change **one dimension at a time** where practical:

1. same tools, stronger/faster configured reasoning route;
2. same model, corrected/expanded evidence surface if evidence was the defect;
3. same model/evidence, different execution granularity if micro-step coordination was the defect.

No new shared package yet.

**Gate 1:** identify which intervention(s) actually improve correctness/grounding and which do not.

A failed experiment is useful evidence and must not be “fixed” by silently combining three more changes.

### Phase 2 — implement only proven general correction(s)

Possible outcomes:

~~~text
routing alone fixes the class
  -> improve route selection/self-awareness; stop there

evidence/discovery contract is the main defect
  -> repair that contract; stop there

deterministic micro-step coordination remains a material defect
  -> add optional ephemeral compute

several independent defects are real
  -> fix each at its owning layer; do not hide them behind AdvancedActor
~~~

Every correction must be general and supported by J2.4/J2.5.

### Phase 3 — cross-host proof

Apply the proven correction(s) to both AIWF and ai-cli with the smallest host-specific integration.

Do not extract a package yet if the two implementations differ materially.

**Gate 3:** demonstrate the same conceptual correction solves real sophisticated prompts in both hosts.

### Phase 4 — extract shared module only if earned

If Gate 3 reveals a clean shared core, extract it to @dharmax/advanced-actor (or a smaller/better-named package if that is what the evidence supports).

Move only behavior that is truly shared.

Then rerun both host acceptance journeys unchanged.

### Phase 5 — J2.5 TUI/runtime configuration

Implement the smallest TUI/configuration improvement needed to inspect and control the proven routing behavior.

This phase does not invent new cognitive policy; it exposes the policy already proven in earlier phases.

### Phase 6 — adversarial acceptance

Run a shared matrix including:

- simple prompt;
- difficult reasoning prompt;
- deterministic-heavy compound prompt;
- difficult prompt that should **not** compile;
- System-1 unavailable;
- System-1 misleading;
- slow/unavailable local model;
- remote reasoning route unavailable;
- explicit local-only restriction;
- insufficient/misleading discovery;
- temporary computation unavailable, if implemented;
- cancellation;
- paraphrases;
- exact AIWF critical-path/goal/missing-work regression.

Measure:

- correctness and grounding;
- completion of every requested part;
- Actor steps;
- LLM calls;
- tool calls;
- actual model/provider;
- latency;
- retries/escalations;
- helper invocations, if any;
- approximate cost when real metrics support it.

Compare against preserved baselines. Do not invent arbitrary success numbers.

### Phase 7 — cleanup

Only after acceptance:

- remove superseded host-specific workarounds;
- remove stale prompt clauses;
- update installed/canonical skill text;
- keep llm-utils small;
- keep text-compiler generic;
- keep any shared package narrow;
- no branch forest.

---

## 11. Anti-brittleness rules

These are stronger than any implementation suggestion above.

1. **No single tactic is required for all sophisticated prompts.**
2. **No classification result directly chooses a mechanism.**
3. **No vendor/model name appears in shared decision logic.**
4. **No exact step/escalation count is architectural truth; bounds are empirical policy.**
5. **No package is created before shared behavior is observed.**
6. **No compiler is added before execution-granularity failure is proven.**
7. **No routing fix hides an evidence/discovery defect.**
8. **No stronger model is used to conceal a broken execution contract.**
9. **No successful tool run counts as successful user outcome.**
10. **No query wording becomes production logic.**
11. **Every optimization must fail soft:** removing System-1, model advice, temporary compute or a preferred provider may reduce efficiency, but must not erase otherwise available competence.
12. **Prefer deletion over orchestration.** If one existing primitive can own the behavior cleanly, use it.

---

## 12. Definition of done

This work is done when:

1. the exact sophisticated AIWF prompt is reliably answered and grounded;
2. an equivalent sophisticated ai-cli journey succeeds from the same general correction;
3. simple prompts remain simple;
4. model selection is adequate, observable and user-configurable through existing routing/config infrastructure;
5. OpenRouter can provide fast/cheap/strong reasoning without provider-specific architecture;
6. temporary computation exists only if real evidence proves its value;
7. difficult prompts that do not benefit from compilation succeed without it;
8. System-1 is useful only insofar as measured and never a correctness dependency;
9. the user can inspect/configure the cognitive runtime in AIWF and see the model/provider actually used;
10. failures degrade truthfully under local/cloud/System-1/discovery/compiler loss;
11. no query-specific workflow or second planner/router/registry was added;
12. any extracted shared package is demonstrably smaller and cleaner than duplicated host logic.

The intended outcome is not a predetermined class hierarchy.

It is this behavior:

~~~text
strong enough Actor
+ truthful runtime self-awareness
+ flexible bounded means
+ evidence-driven recovery
= sophisticated goals solved without special-case workflows
~~~
