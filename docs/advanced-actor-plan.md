# Advanced Actor — focused design and implementation plan

**Status:** active plan for J2.4/J2.5 only: reliably solving sophisticated compound prompts, with transparent cognitive-runtime selection and configuration.  
**Out of scope:** repository code generation, Ticket implementation redesign, durable skill authoring, Product Intent redesign.

## 1. Actor journeys

### J2.4 — sophisticated goal

A developer asks a host application a compound question whose answer is not available from one named tool—for example:

> what's on the critical path of this project? what's the goal of the project? what's missing?

The system understands the whole requested outcome, chooses an adequate reasoning model, gathers current evidence, and uses the simplest useful execution granularity: direct reasoning, ordinary tools, discovery, shell/environment execution, or a temporary deterministic helper. It observes results and replans until it can give a grounded answer or name a concrete blocker.

The user never needs a query-shaped command or predeclared workflow.

### J2.5 — understandable cognitive runtime

A developer notices that sophisticated requests are slow or weak. From AIWF's TUI/configuration surface they can see which cognitive resources AIWF actually has—local models, OpenRouter/cloud access, configured task routes and relevant speed/cost/quality guidance—and adjust preferences without editing JSON by hand. AIWF can explain which route/model was selected for a run and why, without exposing credentials or pretending that configuration implies successful inference.

These journeys are the acceptance boundary. The architecture below derives from them.

---

## 2. Historical lesson: do not rebuild old AIWF

Earlier AIWF leaned heavily on codelet/text compilation as the supposed universal answer. It did not produce a reliably capable general agent.

That failure is important evidence.

The mistake was not that temporary programs are useless. The mistake was making **compilation the default strategy** instead of one execution means selected by an intelligent Actor.

A compiler cannot compensate for:

- a model that misunderstood the goal;
- poor evidence selection;
- bad decomposition;
- a weak/slow reasoning route;
- missing or misleading capabilities;
- inappropriate execution granularity;
- an Actor that cannot recognize when *not* to compile.

Therefore this plan explicitly rejects:

```text
sophisticated prompt
    -> text-compiler
    -> hope
```

The target is:

```text
sophisticated prompt
    -> adequate executive reasoning
    -> choose the simplest useful means
       ├─ answer directly
       ├─ one/few tools
       ├─ discover capability
       ├─ environment/shell
       └─ temporary deterministic composition
    -> observe
    -> replan
    -> grounded answer
```

**text-compiler is optional machinery, never the architecture.**

---

## 3. Why Codex/AGY are a better reference

The useful lesson from Codex/AGY is not “they can generate scripts”.

Their capability shape is broader:

1. a strong general model owns the goal;
2. it has a dependable execution substrate;
3. it can choose action granularity dynamically;
4. it can create temporary procedures/scripts when that is actually easier;
5. it sees observations and continues reasoning;
6. the harness preserves context, execution boundaries and recovery.

That is why sophisticated prompts remain tractable.

The important comparison is:

```text
Codex / AGY
goal
 -> capable executive model
 -> rich but bounded execution substrate
 -> choose granularity
 -> act / compute / inspect
 -> observe
 -> replan
 -> finish

old/current weak AIWF pattern
goal
 -> narrow/weak route
 -> guessed strategy or compiler/tool bias
 -> many expensive micro-steps
 -> latency / wandering / budget pressure
 -> incomplete answer
```

Our design should reproduce the **general agency**, not any one mechanism.

---

## 4. The likely shared abstraction

The same defect exists in AIWF and ai-cli, so the preferred boundary is a small shared package:

```text
@dharmax/advanced-actor
```

but package creation remains a Phase-0 hypothesis.

Its one-sentence responsibility:

> Run a general LLM Actor with enough runtime self-awareness to choose an adequate reasoning route and enough execution flexibility to solve compound goals without query-specific workflows.

Dependency direction:

```text
@dharmax/llm-utils  ← advanced-actor
@dharmax/text-compiler ← advanced-actor   (optional composition backend)
advanced-actor ← aiwf / ai-cli
```

It must not become a framework.

### It owns

- composing the existing `LLMActor`;
- consuming one cheap System-1 tactical assessment;
- selecting an appropriate **task class/reasoning tier**, not hardcoded vendor model names;
- exposing optional ephemeral deterministic composition;
- bounded recovery/escalation when objective no-progress is observed;
- trace metadata explaining tactic/model selection.

### It does not own

- provider credentials/config storage;
- AIWF graph semantics;
- ai-cli shell semantics;
- semantic registries;
- authorization policy;
- durable codelets/skills;
- repository mutation;
- another planner;
- another model router.

Existing `llm-utils` remains the model-routing authority.

---

## 5. Cognitive adequacy comes before compilation

A sophisticated Actor cannot be better than the model driving the executive loop.

AIWF already has useful foundations:

- `Asker` task routes such as `fast` and `reasoning`;
- configured `modelRoutes`;
- provider failover;
- persisted model advice;
- OpenRouter support;
- Model Radar / provider diagnostics;
- local Ollama support.

Use them. Do not invent another router.

### System-1 assessment

The existing System-1 call should cheaply estimate **two independent things**:

```ts
{
  reasoningDemand: {
    type: 'score',
    criteria: ['routine', 'moderate', 'demanding']
  },
  deterministicCompositionUseful: {
    type: 'noul'
  },
  compositionShape: {
    type: 'choice',
    criteria: {
      traverse: 'relationship traversal',
      filter: 'filter/select',
      aggregate: 'aggregate/count/group',
      compare: 'rank/compare/select extrema',
      correlate: 'combine several evidence sets',
      transform: 'structured deterministic transformation',
      none: 'no substantial deterministic composition'
    }
  }
}
```

These answers are **advice, not gates**.

The two axes must not be collapsed:

- a task can require strong reasoning but no helper;
- a task can be conceptually easy yet benefit from deterministic aggregation;
- some tasks need both.

### Model selection

Use `reasoningDemand` only to choose a task class / configured route:

```text
routine/moderate -> existing normal/fast route as configured
demanding        -> reasoning route
```

The host/user controls what `reasoning` means.

With OpenRouter this can be a fast, inexpensive but strong remote model rather than a slow local model. Do not hardcode Groq or any provider into AdvancedActor. A user may configure an OpenRouter model/provider optimized for throughput, latency, price or another requirement.

Current OpenRouter supports provider-level speed/price/latency preferences, so AIWF should pass such preferences through its existing provider-options/config machinery rather than adding provider-specific code.

### Bounded escalation

If a run starts on a weaker route and produces objective no-progress evidence—repeated observations, inability to form a viable tactic, malformed decisions, or exhausted useful local options—AdvancedActor may perform **one bounded escalation** to the configured reasoning route with the accumulated observations.

This is not a second planner. It is the same goal and same Actor contract with a more adequate model.

Explicit user model restrictions/local-only policies remain authoritative.

---

## 6. Temporary computation is one tool, not the default

The optional composition capability should be exposed semantically as something like:

```text
compute(intent, explicit inputs/capabilities)
```

not as “please use text-compiler”.

The Actor provides behavioral intent. The backend may use text-compiler to synthesize a temporary helper.

Appropriate cases:

- traverse a relationship graph;
- filter and aggregate a substantial set;
- rank/compare candidates;
- correlate several evidence sets;
- perform a deterministic transformation that would otherwise take many LLM/tool turns.

Inappropriate cases:

- one or two ordinary tool calls;
- open-ended reasoning;
- methodology selection;
- asking the compiler to compensate for missing evidence;
- repository code implementation;
- “all sophisticated prompts”.

### Critical regression against old AIWF

The acceptance suite must contain sophisticated prompts that **do not use the compiler**.

If compound-prompt success becomes correlated with “compiler was invoked”, we have rebuilt the old mistake.

---

## 7. Execution authority for temporary helpers

Generated helpers get no ambient power.

Conceptual boundary:

```ts
interface EphemeralComputation {
  run(request: {
    intent: string
    input: unknown
    services: readonly BoundReadCapability[]
    signal?: AbortSignal
  }): Promise<DerivedResult>
}
```

Rules:

- only explicitly bound host-approved capabilities;
- first implementation read-only;
- no implicit registry access;
- no repository mutation;
- no package installation;
- cancellation/time limits propagate;
- service calls stay visible in trace/provenance;
- result is **derived evidence**, not source evidence;
- ephemeral by default; no promotion/persistence.

Phase 0 must inspect the current text-compiler execution path. If it forces ambient in-process execution, add only the smallest generic seam required to synthesize/execute under the host's authority. Do not fork text-compiler or build a second compiler.

---

## 8. AIWF runtime self-awareness

AIWF must know enough about its cognitive environment to make and explain good choices.

Reuse existing mechanisms rather than inventing state:

- `modelRuntime()` for configured providers;
- `Asker/ModelRouter` for routes/fallbacks;
- `ProviderDiscovery` / persisted model advice;
- Model Radar for recommendations;
- existing metrics for actual model/latency/success evidence;
- `doctor` for runtime diagnostics.

The runtime profile exposed to AdvancedActor should be sanitized and small:

```ts
interface CognitiveRuntimeProfile {
  availableTaskRoutes: string[]
  localAvailable: boolean
  remoteAvailable: boolean
  reasoningRouteAvailable: boolean
  constraints?: {
    localOnly?: boolean
    maxCost?: number
  }
}
```

Do not give the Actor API keys, full provider configuration or a giant model catalog.

### Truthfulness

AIWF may say:

- “OpenRouter is configured”;
- “the reasoning route currently resolves to X”;
- “this run actually used X/Y”;
- “local inference appears unavailable/slow based on observed metrics”.

It may not infer model quality merely from a configured name or credential.

---

## 9. TUI-aided cognitive configuration

This is part of J2.5, not an incidental settings screen.

The user should be able to inspect and adjust high-level policy without editing `.ai-workflow/config.json`.

A small TUI/config panel should expose:

- active gateway: auto / OpenRouter / direct / local-only;
- configured provider availability, without secrets;
- default route;
- `fast` route;
- `reasoning` route;
- optional preference: balanced / fastest / cheapest, mapped onto existing provider options where supported;
- current Model Radar/advice recommendation;
- observed recent latency/success for configured routes when metrics exist.

It should support:

1. inspect current effective configuration;
2. choose/change a route or high-level preference;
3. validate that the target is actually reachable;
4. save through the existing configuration system;
5. immediately show the effective result.

Do **not** build another settings store.

OpenRouter/Groq-style fast inference is a configuration option, not a new provider abstraction. If the chosen OpenRouter route is served by Groq or another high-throughput provider, AIWF should benefit automatically.

---

## 10. Minimal AdvancedActor surface

Do not freeze the API before Phase 0, but the target should stay this small:

```ts
const actor = new AdvancedActor({
  asker,
  systemOne,
  computation
})

const result = await actor.run(goal, {
  tools,
  discoverTools,
  runtimeProfile,
  signal,
  context
})
```

Internally:

```text
1. cheap tactical assessment
2. choose configured reasoning task class
3. run existing LLMActor
4. Actor chooses direct/tool/discovery/compute
5. observe + replan
6. one bounded model escalation only on objective no-progress
7. final grounded answer
```

No plan graph. No state machine beyond the ordinary Actor loop. No persistent strategy object.

---

## 11. Implementation plan

### Phase 0 — harsh audit; no production implementation

Inspect actual current versions of AIWF, ai-cli, llm-utils and text-compiler.

Produce evidence for:

- at least two preserved AIWF sophisticated-prompt failures;
- at least one equivalent ai-cli prompt;
- at least one historical old-AIWF compiler-heavy path/failure, so we do not repeat it;
- current System-1 call site and whether one call can be reused;
- current Actor model/task route on those failures;
- actual local-model latency;
- available OpenRouter route(s) and configured provider options;
- exact text-compiler synthesis/execution contract;
- current TUI/config/doctor/model-radar surfaces.

For every failed run classify the dominant cause:

```text
goal understanding
model adequacy / latency
evidence acquisition
tactic selection
execution granularity
compiler misuse
tool/discovery defect
termination/budget
```

**Gate 0:** the plan may change. In particular, if compilation is not a material improvement in real failures, do not make it part of v1.

Also answer whether `@dharmax/advanced-actor` is truly shared enough to justify a package.

### Phase 1 — cognitive-route vertical slice

Before adding compilation, prove that an adequate configured model materially improves the sophisticated journey.

Implement only the minimum shared behavior needed for:

- System-1 reasoning-demand hint;
- route to existing `fast/reasoning` task classes;
- truthful trace of selected/actual model;
- one bounded escalation on objective no-progress.

Use existing llm-utils routing and AIWF config.

Test local-only, normal configured route and a fast strong OpenRouter reasoning route.

**Gate 1:** stronger/appropriate routing improves the real journey without query-specific logic and without changing tools.

If this alone solves the problem robustly, stop. Do not add a compiler because the plan expected one.

### Phase 2 — execution-granularity experiment

Only if Gate 1 shows remaining failures caused by long deterministic micro-step loops:

Add one **ephemeral read-only computation** capability backed by text-compiler or the smallest suitable existing mechanism.

Compare on the same prompts:

- no computation capability;
- computation capability available but not forced;
- System-1 wrong about composition usefulness.

**Gate 2:** the Actor uses computation selectively and it improves correctness/steps/latency on tasks with real deterministic structure. At least one difficult prompt must succeed without it.

If it becomes the default hammer, reject the design.

### Phase 3 — extract shared AdvancedActor

Only now create `@dharmax/advanced-actor` if both AIWF and ai-cli require the same behavior.

Move only proven shared behavior:

- tactical assessment consumption;
- reasoning-route selection;
- optional computation capability wiring;
- bounded escalation;
- trace metadata.

Host-specific discovery/config/authority remains outside.

**Gate 3:** both hosts use the package with materially less duplicate code than two local implementations.

### Phase 4 — AIWF self-awareness + TUI

Complete J2.5 using existing config/model-runtime/radar/doctor infrastructure.

Add the smallest TUI configuration surface necessary to:

- show effective routes/providers;
- configure default/fast/reasoning routes;
- configure supported OpenRouter speed/cost preference;
- test reachability;
- show actual selected model for recent/current run.

Also reconcile installed/canonical AIWF skill text with this plan so setup cannot reintroduce deleted agency-document references.

**Gate 4:** a user can configure a fast remote reasoning route from TUI, run the sophisticated prompt, and see which model/provider actually executed it.

### Phase 5 — adversarial shared gate

Both AIWF and ai-cli must demonstrate:

- simple prompt stays simple;
- difficult reasoning prompt selects adequate route but need not compile;
- deterministic-heavy prompt may compile selectively;
- System-1 unavailable;
- System-1 wrong;
- local model slow/unavailable;
- remote reasoning route unavailable/fails over;
- explicit local-only restriction;
- misleading/insufficient initial discovery;
- compiler unavailable;
- helper cannot mutate;
- cancellation;
- paraphrased prompts;
- exact AIWF critical-path/goal/missing-work regression.

Measure:

- correctness/grounding;
- Actor steps;
- LLM calls;
- tool calls;
- helper compilations;
- actual model/provider;
- latency;
- retry/escalation count;
- approximate cost when metrics support it.

No arbitrary performance target. Compare to preserved baseline.

### Phase 6 — cleanup

Only after acceptance:

- delete superseded host-specific agency glue;
- delete stale prompt clauses/workarounds;
- keep `LLMActor` small;
- keep text-compiler generic;
- keep AdvancedActor narrow;
- update setup-installed skill/docs;
- no branch forest.

---

## 12. Hard rejection list

Reject any implementation that introduces:

- compiler-first routing;
- “sophisticated = compile” logic;
- a second planner/Actor;
- a second model router;
- hardcoded Groq/OpenRouter model names in AdvancedActor;
- phrase-specific critical-path/rank/ordinal logic;
- full model or tool catalogs dumped into prompts;
- persistent helper storage;
- a second semantic registry;
- ambient generated-code authority;
- AIWF graph semantics inside the shared package;
- a large strategy framework.

---

## 13. Definition of done

This work is done when:

1. the exact sophisticated AIWF prompt is reliably answered and grounded;
2. an equivalent sophisticated ai-cli journey succeeds through the same shared behavior;
3. difficult prompts are driven by an adequate configured model, not accidentally by a slow/weak default;
4. OpenRouter can supply fast/cheap/strong reasoning through existing routing/config without provider-specific architecture;
5. temporary computation is selective and demonstrably useful, not the old universal hammer;
6. sophisticated prompts that need no compiler succeed without one;
7. System-1 helps cheaply but is never required for correctness;
8. the user can inspect/configure cognitive routes through AIWF's TUI and see the actual model/provider used;
9. failure of local, cloud, System-1, discovery or compiler degrades honestly and predictably;
10. no query-specific workflow was added.

The intended abstraction is now:

```text
AdvancedActor
 = LLMActor
 + cognitive-route awareness
 + cheap tactical hint
 + optional temporary computation
 + bounded evidence-driven escalation
```

The decisive principle is:

> **Give the Actor adequate intelligence and flexible means; never mistake one means—especially compilation—for intelligence.**
