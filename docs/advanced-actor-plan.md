# Advanced Actor — focused design and implementation plan

**Status:** active plan for J2.4 only: solving sophisticated/compound user goals without query-specific workflows.  
**Out of scope:** repository code generation, `write_code`, Ticket implementation redesign, durable skill authoring, Product Intent redesign.

## 1. Prime Directive: start from the actor journey

A user asks a host application a compound question whose answer is not available from one predeclared tool.

Examples:

- AIWF: “what's on the critical path of this project? what's the goal of the project? what's missing?”
- ai-cli: inspect a repository, correlate several kinds of evidence, compute/rank/compare the results, and explain the conclusion.

The journey is:

1. the user states the goal naturally;
2. the Actor understands the requested outcome;
3. it obtains the required evidence through ordinary host capabilities/discovery;
4. when the work contains substantial deterministic composition, it may compile a temporary helper instead of spending many LLM turns manually coordinating primitive calls;
5. it observes the helper result, reasons over the evidence, and answers;
6. if the suggested tactic or helper fails, it replans rather than surrendering;
7. current-system claims remain grounded in observed evidence.

The user never needs a special “critical path”, “second”, “least”, “rank”, or other query-shaped command.

This journey is the acceptance boundary. Everything below is derived from it.

---

## 2. The actual defect

The shared `LLMActor` is already a capable general reasoner with tool use, missing-tool recovery and dynamic discovery. The recurring failure is narrower:

> compound requests that are naturally a small deterministic program are often executed as a long LLM → tool → observation → LLM loop.

That is slow, token-heavy and fragile. The Actor may understand the task correctly and still fail because its execution granularity is wrong.

Typical shape:

```text
retrieve several evidence sets
→ traverse/filter/correlate
→ aggregate/rank/compare
→ derive a result
→ explain it
```

The missing capability is therefore **ephemeral deterministic composition**, not another domain-specific workflow and not a larger tool catalog.

---

## 3. Shared solution, not an AIWF patch

The same problem exists in AIWF and ai-cli. The implementation should therefore be host-independent.

The likely clean boundary is a new package:

```text
@dharmax/advanced-actor
```

Dependency direction:

```text
                 @dharmax/llm-utils
                    ↑          ↑
                    |          |
          text-compiler    advanced-actor
                    ↑          ↑
                    └────┬─────┘
                         |
                  aiwf / ai-cli
```

More precisely:

```text
text-compiler  -> llm-utils
advanced-actor -> llm-utils + text-compiler
aiwf           -> advanced-actor
ai-cli         -> advanced-actor
```

This avoids putting text-compiler-dependent behavior into `llm-utils`, which would create the wrong dependency direction/cycle. It also avoids duplicating the same orchestration in two hosts.

**Package creation is still a Phase-0 hypothesis:** if inspection shows the supposedly shared behavior is actually host-specific, do not create a package merely for architectural symmetry.

---

## 4. Module boundary

`advanced-actor` should be small enough to explain in one sentence:

> A general LLM Actor with optional cheap tactical advice and one bounded ability to compile and execute temporary deterministic helpers over host-provided capabilities.

It owns:

- wrapping/composing the existing `LLMActor`;
- one small generic System-1 tactical assessment;
- exposing ephemeral helper composition to the Actor;
- binding only explicitly supplied host capabilities to that helper;
- helper lifetime, budgets, cancellation and provenance;
- forwarding observations/failures back to the Actor.

It does **not** own:

- AIWF graph/product semantics;
- ai-cli shell semantics;
- capability registries or semantic indexes;
- authorization policy;
- filesystem/network policy;
- durable codelet/skill persistence;
- repository source editing;
- task scheduling;
- another planner, workflow engine or model router.

Hosts remain responsible for domain capabilities, discovery and execution authority.

---

## 5. System-1: use the call we already have

System-1 is already a shared `llm-utils` primitive and is cheap enough to help here.

Do not ask it to generate a plan. Its actual contract is typed assessment, so keep the questions small and generic, for example:

```ts
{
  compound: {
    type: 'score',
    criteria: ['single-step', 'small composition', 'substantial composition']
  },
  deterministicCompositionUseful: {
    type: 'noul'
  },
  compositionShape: {
    type: 'choice',
    criteria: {
      traverse: 'relationship traversal',
      filter: 'filter/select a set',
      aggregate: 'count/group/aggregate',
      compare: 'rank/compare/select extrema',
      correlate: 'combine several evidence sets',
      transform: 'structured deterministic transformation',
      none: 'no meaningful deterministic composition'
    }
  }
}
```

The assessment is advisory only.

It may tell the Actor, in effect:

```text
likely compound
deterministic composition probably useful
likely traversal + correlation
```

The Actor decides whether to compile anything.

If System-1 is unavailable, wrong or low-confidence, ordinary Actor execution continues. No correctness dependency is introduced.

---

## 6. Ephemeral helper composition

The core new means should be conceptually tiny:

```text
compile_helper(intent, bounded capabilities, explicit context)
    -> temporary verified helper
    -> execute under supplied authority
    -> structured result + provenance
    -> discard
```

The Actor supplies **behavioral intent**, not source code.

Example:

```text
"Using the available project graph readers, traverse active work dependencies,
correlate each candidate with its Goal/Flow context and blockers, and return
the dependency chain(s), bottlenecks and missing evidence needed to determine
the critical path."
```

text-compiler synthesizes the helper. The helper is ephemeral by default.

### First-version scope

Keep the first version deliberately analytical:

- read-only capability composition;
- traversal;
- filtering;
- aggregation;
- ranking/comparison;
- correlation;
- deterministic transformation.

No repository mutation, no package installation, no durable promotion, no code-writing feature.

This makes the safety boundary much easier to reason about and directly targets the demonstrated sophisticated-prompt failure.

---

## 7. Execution authority

Generated code must not gain ambient powers merely because it was compiled.

`advanced-actor` therefore depends on an injected execution boundary:

```ts
interface EphemeralHelperExecutor {
  execute(request: {
    source: string
    input: unknown
    services: readonly BoundReadCapability[]
    signal?: AbortSignal
  }): Promise<unknown>
}
```

Rules:

- only host-approved read-only capabilities are bound;
- no implicit access to the host registry;
- no direct project mutation;
- cancellation/time limits propagate;
- capability calls remain observable in the host trace;
- helper output is derived evidence, not original project evidence;
- helper source/result is not persisted unless a future actor journey explicitly requires that.

Phase 0 must inspect text-compiler's actual current execution API. If it cannot cleanly separate synthesis from host-authorized execution, make the **smallest generic text-compiler API adjustment** needed to return the compiled helper/source without forcing ambient in-process execution. Do not fork the compiler or build a second compiler.

---

## 8. Actor behavior

The Actor starts with ordinary host-provided capabilities plus the composition ability.

Control direction:

```text
user goal
   ↓
optional System-1 hint
   ↓
LLMActor
   ├─ reason directly
   ├─ use existing tools
   ├─ discover missing tools
   ├─ compile one-off deterministic helper when useful
   └─ replan from observations/failures
   ↓
grounded answer
```

Important invariants:

1. **Actor remains sovereign.** System-1 and compiler are means, not routers.
2. **Discovery is an optimization.** Empty/misleading discovery cannot erase general competence.
3. **Compilation is optional.** Simple work stays simple.
4. **No phrase-shaped behavior.** No special cases for critical-path/ranking wording.
5. **No durable self-extension yet.** One-off helper disappears after the run.
6. **Evidence stays typed conceptually:** observed evidence ≠ deterministic derived result ≠ model inference.
7. **Failure becomes observation.** Helper failure returns to the Actor; it may simplify, gather more evidence, retry differently, or use ordinary tools.
8. **No second Actor.** The compiled helper performs deterministic work; it is not an embedded reasoning agent.

---

## 9. Minimal package surface

Do not over-design the public API before Phase 0, but the target shape should remain approximately:

```ts
const actor = new AdvancedActor({
  asker,
  systemOne,
  helperCompiler,
  helperExecutor
})

const result = await actor.run(goal, {
  tools,
  discoverTools,
  context,
  signal
})
```

The host supplies tools/discovery/context/authority. The package supplies advanced general execution behavior.

Prefer interfaces around compiler/executor dependencies so tests can use tiny fakes and hosts can enforce different authority models.

Do not expose compiler internals, repositories, skill managers or host registries through this API.

---

## 10. Implementation plan

### Phase 0 — audit and baseline, no production mutation

Inspect current `llm-utils`, text-compiler, AIWF and ai-cli.

Establish:

- exact `LLMActor` extension points already available;
- exact System-1 call already performed by each host and whether it can be reused rather than duplicated;
- exact text-compiler API for compiling a one-off codelet;
- whether synthesis can be separated from execution;
- how each host currently enforces cancellation/read-only authority;
- two preserved AIWF failures and at least one equivalent ai-cli compound failure;
- step/tool/model-call/latency baseline for those runs.

Then answer one architectural question:

> Is there a genuinely shared host-independent behavior large enough to justify `@dharmax/advanced-actor`?

If yes, create the package. If no, stop and revise the boundary before coding.

### Phase 1 — smallest shared vertical slice

Implement only:

- AdvancedActor wrapper around existing LLMActor;
- one batched System-1 composition hint;
- one ephemeral `compile_helper` path;
- read-only bound capabilities;
- injected helper executor;
- structured trace/provenance;
- no persistence.

No skills. No code writing. No scheduler. No Product Intent changes.

**Gate 1:** one fixture compound task succeeds through the real Actor → helper → capability → answer path, while a simple task does not compile anything.

### Phase 2 — AIWF integration

Replace only the host-specific agency glue that the shared package actually supersedes.

Preserve AIWF's existing truthful `run_command`, dynamic discovery, trace, cancellation and read-only project protections.

Run the exact live regression:

> what's on the critical path of this project? what's the goal of the project? what's missing?

Acceptance requires a grounded answer to all parts, not merely successful tool execution.

Then run paraphrases and unrelated compound questions.

### Phase 3 — ai-cli integration

Use the same package, not a copied strategy.

Representative live/fixture journey:

> inspect the repository, identify the source module imported by the most other modules, correlate it with tests that cover it, and explain which module is the highest-risk change point.

The exact fixture may change during Phase 0, but it must require real multi-step evidence + deterministic composition and must not have a predeclared special tool.

### Phase 4 — adversarial shared gate

Both hosts must demonstrate:

- simple prompt: no unnecessary compilation;
- compound prompt: helper used when useful;
- System-1 unavailable: still solvable;
- System-1 wrong: Actor can ignore/recover;
- initial discovery insufficient: bounded discovery can add needed capabilities;
- compiler failure: Actor gets a concrete observation and can fall back/replan;
- repeated/changed wording: no query-shaped production behavior;
- helper cannot obtain mutation powers;
- cancellation works;
- current-project claims are grounded.

Compare before/after:

- Actor steps;
- LLM calls;
- tool calls;
- compiled-helper count;
- wall time;
- correctness/grounding.

The goal is not “always compile”. The goal is **better general problem solving with less wandering**.

### Phase 5 — cleanup

Only after both hosts pass:

- delete superseded host-specific agency orchestration;
- remove obsolete prompt clauses/workarounds;
- keep `LLMActor` itself small;
- keep text-compiler generic;
- document the shared package with the two actor journeys and minimal API.

Do not add durable helper promotion until a separate repeated-use journey justifies it.

---

## 11. Hard rejection list

Stop and reconsider if implementation introduces any of these:

- a deterministic strategy router;
- a second model/Actor planner;
- a full capability catalog in context;
- phrase-specific critical-path/rank/ordinal logic;
- persistent helper/codelet storage;
- a second semantic registry;
- a second compiler;
- direct generated-code access to ambient host/project state;
- host-specific AIWF concepts inside the shared package;
- source-code editing under the guise of “advanced actor”;
- a large framework where one composition primitive would suffice.

---

## 12. Definition of done

This work is done when:

1. the sophisticated-prompt journey succeeds reliably in AIWF;
2. the same abstraction solves an equivalent compound journey in ai-cli;
3. simple prompts remain simple;
4. System-1 improves tactics but is not required for correctness;
5. the Actor can choose ephemeral compiled composition without being forced into it;
6. generated helpers have only explicitly bound read-only powers;
7. no query-specific production logic was added;
8. the implementation is materially smaller than duplicating equivalent logic in both hosts;
9. live acceptance shows fewer/wiser Actor steps and grounded correct answers;
10. obsolete agency experiments and superseded plans are gone.

The intended result is:

```text
LLMActor
  + cheap tactical hint
  + optional ephemeral deterministic composition
  = AdvancedActor
```

Nothing more unless the actor journeys prove it is needed.
