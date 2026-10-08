# Agency restoration — strategy, skills and compiled composition

**Status:** authoritative design + implementation plan for J2.4 on `master`.  
**Supersedes:** the shell-centric portions of the earlier agency-restoration plan.  
**Preserve:** the 2026-10-08 checkpoint improvements unless a reproduced defect requires changing them.

## 0. Actor journey

### J2.4 — solve an unfamiliar goal without a predeclared workflow

A developer asks AIWF for an outcome that is not directly represented by one specialized capability. AIWF understands the outcome, cheaply assesses the shape of the work, and chooses useful means rather than guessing a tool name.

It may:

- reason directly from already observed evidence;
- discover a specialized capability;
- find and activate reusable know-how through skill-manager;
- compile a bounded one-off deterministic helper when the task is naturally a computation/composition;
- use general environment execution for inspection and glue;
- obtain external knowledge when methodology is genuinely missing.

The Actor remains responsible for the decision. A cheap System-1 assessment may advise it but cannot permit, forbid, or force a route. If one tactic fails, the Actor can choose another. Current-project conclusions remain grounded in observations.

Observable end state: the requested outcome is produced correctly, or AIWF names a concrete inaccessible/unsafe/unauthorized dependency or unresolved user decision. “No matching tool” is never itself the blocker.

### Representative real requests

1. “what's on the critical path of this project? what's the goal of the project? what's missing?”
2. “give me the 2nd most recommended next ticket?”
3. “give me the most recommended and the least recommended tickets and see if they are related to the same main artifacts”

These are acceptance examples, not production keywords.

---

## 1. What the stopped implementation proved

Keep the useful checkpoint work:

- discovery-independent `run_command`;
- dynamic bounded capability discovery;
- mode as preference rather than competence wall;
- truthful cancellation/timeout/stdout/stderr/truncation;
- read-only project filesystem + writable scratch on supported hosts;
- complete public tool/discovery trace;
- progress-loop protection;
- routing/fallback corrections.

But the remaining failures expose a different bottleneck.

The current Actor is still effectively asked to solve nontrivial analytical programs through:

```text
LLM step
 -> shell command
 -> observation
 -> LLM step
 -> shell command
 -> ...
```

This is a poor fit for tasks requiring retrieval + filtering + ranking + graph traversal + aggregation + comparison. The Actor burns expensive reasoning steps acting as an interpreter, manually invents helpers, loses provenance, and hits its budget.

**Correction:** `run_command` is universal hands, not the universal strategy.

---

## 2. Existing ecosystem facts

Do not reinvent these.

### skill-manager already provides reusable know-how

Current sibling `@dharmax/skill-manager` supports:

- `retrieve(query)` via semantic-registry;
- `activate(...)` returning full `SKILL.md` context, declared tool descriptions and required capability IDs;
- `find_skills` host adapter for mid-run discovery;
- durable `create(...)` through an optional `SkillAuthor`;
- `TextCompilerSkillAuthor`, which uses text-compiler to create and test a persistent executable skill.

Important boundary: skill-manager **discovers/describes/activates skills**; it does not automatically resolve capability IDs or execute arbitrary declared MCP tools.

### text-compiler already provides deterministic composition

Current sibling `@dharmax/text-compiler` supports:

- `compileCodelet(intent, options)`;
- generated/static/dynamic verification machinery;
- caller-authored acceptance tests;
- execution of compiled codelets;
- memory-backed codelet repositories;
- services/capability hooks and bounded recovery.

This is a substantially stronger foundation than AIWF asking the Actor to hand-write ad-hoc shell scripts.

### AIWF's existing compiler tools are not the desired runtime composition path

`src/tools/compiler.ts` currently asks the Actor itself to supply `sourceCode` and `testSourceCode`, then persists records under `.ai-workflow/codelets`.

That is useful as a low-level facility, but it is the wrong abstraction for J2.4:

- the Actor should request **behavior**, not manufacture source as tool arguments;
- one-off composition should be ephemeral by default;
- read-only analysis must not persist project codelets;
- text-compiler already owns synthesis/repair/testing.

Do not build a second compiler.

---

## 3. Target architecture

```text
USER GOAL
   |
   +--> bounded System-1 tactical assessment (optional advice)
   |       - task shape
   |       - evidence needs
   |       - promising means
   |       - uncertainty/risk
   |
   v
GENERAL ACTOR  <-----------------------------------+
   |                                               |
   +-- direct reasoning over observations          |
   +-- specialized capability discovery            |
   +-- skill discovery -> activation/context       |
   +-- compiled one-off deterministic composition  |
   +-- universal environment execution             |
   +-- external knowledge when genuinely needed    |
   |                                               |
   +-------------- observe / replan ----------------+
   |
   v
grounded outcome
```

There is no deterministic router selecting one path.

The Actor may combine paths. For example:

```text
critical-path request
 -> activate project-analysis skill if one exists
 -> discover graph/ticket evidence capabilities
 -> compile a small graph calculation if useful
 -> synthesize grounded explanation
```

Or, if no skill exists:

```text
 -> System-1 says multi-source graph analysis/computation likely
 -> Actor gathers evidence
 -> compiler builds deterministic helper over explicit evidence
 -> Actor checks result and answers
```

---

## 4. System-1 = tactical advisor, never dispatcher

Use one cheap/bounded LLM call before the main Actor **only if it stays cheap enough in measurement**.

It answers: **“What kind of work is this, what evidence is probably needed, and which means look useful?”**

It must not answer:

- which single tool is mandatory;
- whether the goal is solvable;
- whether the Actor may use a capability;
- the final project answer.

Suggested compact semantic result:

```ts
interface TacticalAssessment {
  taskShape: string
  evidenceNeeds: string[]
  usefulMeans: Array<{
    kind: 'direct' | 'capability' | 'skill' | 'compile' | 'environment' | 'external-knowledge'
    reason: string
    query?: string
  }>
  uncertainties: string[]
}
```

This shape is advisory. Multiple `usefulMeans` are normal. The Actor may ignore or revise all of them.

### Failure contract

- timeout/error/malformed assessment => continue with the Actor without it;
- no System-1 output may shrink the available bootstrap surface;
- no System-1 result becomes a persisted “route”;
- do not run it repeatedly by default.

A second tactical assessment is allowed only after an objective stuck condition (for example repeated no-progress/tool failures) and is bounded to one re-consult. First implementation should omit this unless the initial gate demonstrates a need.

### Routing

Use the existing cheap/fast task route through `llm-utils`; do not create another model router. Explicit model/locality/provider restrictions remain authoritative.

---

## 5. Bootstrap capabilities

The bootstrap should represent four **powers**, not one shell-centric fallback:

### A. Environment execution

Existing truthful `run_command`.

Use for:
- inspection;
- canonical AIWF CLI operations;
- small glue;
- executing sandboxed generated artifacts.

### B. Capability discovery

Existing bounded semantic capability discovery.

Use when an existing high-level AIWF capability is likely useful.

### C. Skill discovery and activation

Integrate skill-manager as a first-class source of reusable know-how.

Minimum runtime surface:

- `find_skills(query, limit?)` — summary cards only;
- `activate_skill(id)` — full instructions + declared tools + required capability IDs.

Activation returns context as an observation; it does not silently mutate the Actor system prompt and does not automatically grant tools.

If a skill requires capabilities, the Actor may discover them through the ordinary capability mechanism.

Do not author a new durable skill during ordinary J2.4 execution.

### D. Ephemeral compiled composition

Expose a thin **behavior-level** adapter over text-compiler, conceptually:

```text
compile_and_run_helper(
  intent,
  input,
  optional acceptance contract
) -> {
  output,
  verification,
  source/trace metadata
}
```

The Actor specifies *what deterministic transformation is needed* and the explicit input evidence. It does not provide source code.

Default properties:

- ephemeral / memory-backed;
- no `.ai-workflow/codelets` persistence;
- no promotion;
- no project write permission;
- bounded compilation/recovery;
- explicit verification result;
- explicit input/output provenance in trace.

If later reuse is demonstrated, a separate journey may promote the behavior into a durable skill through skill-manager. Runtime success must not depend on promotion.

---

## 6. Critical safety correction for compiled helpers

Do **not** directly execute generated text-compiler code in the AIWF process for read-only requests merely because the compiler API exposes `execute()`.

Generated JavaScript can potentially reach ambient runtime globals. That would bypass the read-only project boundary established around `run_command`.

The integration must reuse the existing execution authority.

Preferred design:

1. compile behavior with text-compiler;
2. place generated source + explicit input in the host-provided scratch area;
3. execute/verify through the existing sandboxed process path under the same `ToolContext.executionAuthority`;
4. return output + verification + provenance;
5. remove ephemeral artifacts when the run ends.

If text-compiler's normal verification executes generated source in-process, **do not call that unsafe path under read-only authority**. Either:
- invoke the compiler/verification in a child process under the existing sandbox, or
- add/reuse a generation-only contract and run all dynamic verification through the sandbox.

Choose the smallest solution after inspecting actual sibling APIs. Do not introduce a second sandbox/executor.

This is a hard gate, not polish.

---

## 7. Evidence and provenance model

The previous runs showed that generated scratch records can be mistaken for project facts. Composition must therefore distinguish:

1. **Observed source evidence** — repository/AIWF/runtime observations.
2. **Derived computation** — deterministic output computed from explicitly cited observed inputs.
3. **Generated examples/tests** — useful for verifying a helper, never evidence about the project.
4. **Model inference** — explanatory synthesis, clearly dependent on 1/2.

A compiled helper may derive facts only from explicit input passed by the Actor. It must not manufacture missing source records and then treat them as observations.

Trace each compiled run with:
- intent;
- input provenance references/summary;
- generated artifact identity/hash;
- verification result;
- execution authority;
- output;
- cleanup status.

No private reasoning is recorded.

---

## 8. Skill semantics: know-how, not just more tools

Skill discovery should be attempted when the task looks like a recognizable reusable practice: project analysis, release process, debugging procedure, domain workflow, etc.

Activation may teach the Actor:
- what evidence to gather;
- preferred algorithm/procedure;
- constraints;
- which capabilities are useful.

This is different from capability discovery:

```text
skill      = how to approach this class of task
capability = an operation/evidence source
codelet    = deterministic computation/composition
```

Do not collapse them into one registry item type merely for architectural symmetry.

Do not create a skill because a one-off helper happened to work. Durable authoring/promotion requires a separate reuse signal or explicit user intent.

---

## 9. Strategy selection principles

The Actor receives the System-1 assessment plus the four bootstrap powers and remains sovereign.

Useful heuristic, expressed as guidance rather than dispatch code:

- simple evidence lookup/action -> direct/capability;
- known domain procedure -> skill + capabilities;
- substantial filtering/ranking/aggregation/graph computation -> compile over observed inputs;
- environment archaeology/glue -> `run_command`;
- unknown methodology -> skill/external knowledge;
- combinations are normal.

There must be **no** production switch such as:

```ts
if (prompt.includes('critical path')) route = 'compiler'
```

and no mandatory route enum emitted by System-1.

---

## 10. Implementation plan

### Phase 0 — freeze and audit

No production mutation until this phase reports.

1. Preserve current checkpoint commit and evidence.
2. Inspect actual local sibling versions of:
   - skill-manager;
   - text-compiler;
   - llm-utils.
3. Trace exact lifecycle for:
   - `SkillManager.retrieve/activate`;
   - text-compiler codelet synthesis/test/execute;
   - execution authority/cancellation/model routing.
4. Identify the smallest safe adapter points.
5. Reproduce at least two stopped failures and classify whether failure is:
   - wrong tactic selection;
   - missing know-how;
   - missing deterministic composition;
   - model quality;
   - evidence/provenance;
   - execution contract.

**Gate 0:** concrete integration map + defect table. No guessed APIs.

### Phase 1 — System-1 tactical assessment

Implement one bounded advisory call.

Requirements:
- uses existing `Asker`/routing;
- structured compact result;
- timeout/error falls through;
- assessment included in Actor context as advice;
- cannot remove tools/powers;
- traced separately from discovery;
- measured latency/cost/model route.

Tests:
- computation-heavy request suggests compile as one useful means;
- recognizable skill-like request suggests skill discovery;
- simple lookup does not needlessly insist on compilation;
- malformed/failed System-1 leaves Actor runnable;
- adversarial wrong advice does not prevent another route.

**Gate 1:** advisory behavior improves route quality without becoming control flow.

### Phase 2 — skill-manager runtime integration

Add the minimum adapters for discovery + activation.

Do not implement skill authoring.

Requirements:
- configured source(s) explicit; do not invent repository paths;
- lazy activation; full SKILL context stays cold until requested;
- capability requirements are surfaced but resolved by existing capability discovery;
- no duplicate semantic index;
- recent activated skills may remain available through the current session using skill-manager's existing continuity support where useful.

**Gate 2:** Actor solves a fixture whose method is supplied by a skill but whose actual evidence comes from AIWF capabilities/environment.

### Phase 3 — safe ephemeral compiler integration

Replace manual Actor-authored helper scripts as the preferred path for bounded deterministic composition.

Requirements:
- thin adapter over `@dharmax/text-compiler`;
- behavior-level intent + explicit input;
- memory/scratch only;
- generated code dynamically executes only under the existing execution authority;
- bounded compile/repair attempts;
- cancellation propagates;
- verification result explicit;
- generated test/example data never becomes project evidence;
- cleanup guaranteed;
- no persistence/promotion.

First acceptance should be a pure transformation over explicit JSON input, then a project-analysis computation over observed structured evidence.

**Gate 3:** the self-extension fixture succeeds through text-compiler, not handwritten shell source, while project bytes remain unchanged.

### Phase 4 — Actor strategy guidance

Simplify `AGENCY_INSTRUCTIONS`.

Remove shell-centric wording such as “compose commands or create/run a temporary helper” as the primary fallback.

Replace with concise hierarchy:

> Understand the outcome and evidence needs. Use specialized capabilities or activated skills when useful. Use compiled deterministic composition for nontrivial transformations over explicit evidence. Use environment execution for inspection/glue. Treat tactic failures as observations and replan. Current-project claims require observed evidence.

Do not teach algorithms for acceptance prompts.

**Gate 4:** actor traces show different sensible tactics for lookup, skill-guided work and computation.

### Phase 5 — acceptance redesign

Retain the three real requests, but stop treating “must solve through shell when discovery is off” as the architectural requirement.

New Agency Gate dimensions:

#### A. Outcome correctness
The answer is independently correct and grounded.

#### B. Tactic freedom
No exact tool sequence is required unless the fixture is specifically testing a mechanism.

#### C. Composition challenge
A fixture deliberately requires enough deterministic computation that compiler use is the expected efficient route. A direct route may still pass if demonstrably correct and within budget; production must contain no phrase-specific handler.

#### D. Skill challenge
A fixture makes key procedural know-how available only through an activated skill while source facts remain external. The Actor must find/use the skill.

#### E. Wrong System-1 advice
Inject plausible but bad advice. Actor must recover.

#### F. Discovery unavailable
Specialized capability discovery fails. Actor may still use skills/compiler/environment.

#### G. Compiler unavailable
Compiler fails. Actor should fall back when the task remains reasonably solvable; otherwise report the concrete failed dependency.

#### H. Provenance trap
Provide generated/example data alongside real source data. Final project claims must use only real observed evidence.

#### I. Paraphrase
Semantically equivalent requests remain successful.

#### J. Budget/efficiency
Compare against stopped shell-centric traces:
- Actor reasoning steps;
- shell calls;
- model calls;
- elapsed time.
Do not require arbitrary numeric wins before measuring baseline, but reject a design that adds layers without reducing wandering or improving acceptance.

**Gate 5:** all mechanism-specific fixtures + the three live requests accepted by independent truth review.

### Phase 6 — only after agency works: durable learning

Separate future journey:

> after a useful one-off procedure repeatedly recurs, AIWF may propose promoting it into a durable skill.

Use existing `SkillManager.create + TextCompilerSkillAuthor`.

Do not implement this during restoration unless repeated live evidence proves it is necessary to satisfy J2.4.

---

## 11. Critique / failure modes to actively prevent

### “System-1 becomes the new discovery gate”
Failure signature: bad assessment chooses one route and the Actor never sees alternatives.

Countermeasure: advice only; full bootstrap remains available; wrong-advice acceptance test.

### “Everything becomes a codelet”
Compilation has latency and verification cost. Do not compile trivial lookups or prose synthesis.

Countermeasure: tactic assessment + measured route quality; no mandatory compiler rule.

### “Everything becomes a skill”
Durable skill creation for one-off tasks pollutes the skill repository.

Countermeasure: retrieve/activate only during restoration; promotion separate.

### “Skill-manager duplicates semantic-registry”
It already uses semantic-registry. AIWF must consume it, not build another skill index.

### “Compiler bypasses safety”
In-process generated code under read-only authority is unacceptable.

Countermeasure: same sandbox/execution authority as ordinary environment execution.

### “Compiler output becomes evidence”
Generated code/tests/examples are not project observations.

Countermeasure: explicit provenance boundary.

### “More orchestration than intelligence”
Do not add a planner, strategy state machine or deterministic routing pipeline.

Countermeasure: one advisory assessment + existing Actor + four powers.

### “Acceptance overfits routes”
Do not require compiler merely because a prompt contains ranking or graphs.

Countermeasure: accept correct efficient alternate routes except in isolated mechanism fixtures.

---

## 12. Completion criteria

J2.4 restoration is complete only when:

- System-1 provides useful bounded tactical advice and failure is harmless;
- Actor retains final tactical authority;
- skill-manager discovery/activation is available without duplicating registries;
- text-compiler provides safe ephemeral behavior-level composition;
- generated execution respects read-only/cancellation boundaries;
- project evidence and generated/derived data remain distinguishable;
- no query-specific production handlers exist;
- the three real requests succeed live and are independently grounded;
- skill, compiler, discovery-failure and wrong-advice fixtures pass;
- full AIWF + affected sibling suites and strict typechecks pass;
- traces demonstrate less wandering or materially higher success than the preserved shell-centric baseline;
- no durable skill/codelet pollution occurs during one-off analysis.

The target is:

> **A general Actor that can cheaply choose how to think, acquire know-how, acquire operations, compile deterministic computation, and use the environment — without any one mechanism becoming a new gatekeeper.**
