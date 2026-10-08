# Agency restoration — integrated strategy, skills, compiled composition and canonical code writing

**Status:** authoritative design + implementation plan for J2.4, J3.1, J3.2 and J3.4 on `master`.  
**Companion design:** `docs/code-writing-design.md`.  
**Preserve:** the 2026-10-08 checkpoint improvements unless a reproduced defect requires changing them.

The full correction is now:

> **The Actor understands the goal. System-1 may advise. Skills provide reusable know-how. Capabilities provide operations/evidence. text-compiler provides deterministic composition and source synthesis. CausalChangeEngine is the only repository mutation authority. Tests/acceptance prove the result.**

No one mechanism is allowed to become the new gatekeeper.

---

## 1. Prime Directive and actor journeys

All implementation derives from the existing narrative journeys, not capability lists.

### J2.4 — unfamiliar project goal

A developer asks AIWF for an outcome not directly represented by one named capability. AIWF understands the outcome/evidence needs, receives optional cheap tactical advice, and chooses/composes useful means: direct reasoning, specialized capabilities, skills, compiled helper computation, environment execution or external knowledge. It replans when a tactic fails and grounds current-project claims in observed/derived evidence.

### J3.4 — grounded intent to verified source

A Ticket resolver or coding Actor already knows the intended implementation and exact source target. AIWF loads concise software-implementation know-how, asks one canonical writer for the smallest source change, applies it through CausalChangeEngine, verifies the real project, and feeds failures back through the same writer for bounded repair. Deterministic refactors bypass generative synthesis.

### J3.1/J3.2 — resolve and repair

`resolve_ticket` owns the full lifecycle: grounded investigation, preparation, target navigation, canonical implementation, project tests, bounded repair, independent acceptance and durable proof.

These stories are the acceptance boundary. Tool-selection tests are not.

---

## 2. What is already worth keeping

The stopped agency implementation produced useful infrastructure:

- discovery-independent truthful `run_command`;
- bounded dynamic capability discovery;
- mode as preference, not competence wall;
- cancellation/timeout/stdout/stderr/truncation truth;
- read-only project isolation + writable scratch on supported hosts;
- complete public tool/discovery trace;
- progress/no-evidence loop guards;
- routing/fallback corrections.

Do not undo those broadly.

But two conceptual defects remain:

1. **General goals are still too often forced through repeated LLM -> shell -> observation loops**, even when the work is naturally a deterministic analytical program.
2. **Repository source generation is duplicated and ad hoc**: direct LLM exact-target synthesis, Actor-authored replacement text, low-level actor-authored codelets, while text-compiler exists separately.

The integrated plan fixes both.

---

## 3. Semantic roles — keep them distinct

```text
Actor        = general goal pursuit and tactical decisions
System-1     = cheap tactical advice
Skill        = reusable know-how / procedure
Capability   = operation or evidence source
Codelet      = deterministic executable composition
write_code   = canonical repository source producer
text-compiler= text -> code/codelet synthesis + bounded repair machinery
ChangeEngine = repository mutation/structural verification
Tests        = execution evidence
Acceptance   = semantic proof of the actor/Ticket outcome
```

Do not collapse these merely for symmetry.

---

## 4. Target architecture

```text
USER GOAL
   |
   +--> optional bounded System-1 assessment
   |      task shape / evidence needs / promising means / uncertainty
   |
   v
GENERAL ACTOR  <---------------------------------------------+
   |                                                         |
   +-- direct reasoning over observed evidence               |
   +-- capability discovery                                  |
   +-- skill discovery + activation                          |
   +-- ephemeral compiled helper over explicit evidence      |
   +-- environment execution                                 |
   +-- write_code for grounded repository source mutation    |
   +-- external knowledge when methodology is actually absent|
   |                                                         |
   +---------------- observe / replan ------------------------+
   |
   v
grounded outcome
```

For Ticket work, `resolve_ticket` is a specialized high-level flow using the same underlying primitives:

```text
Ticket.resolve
 -> investigate/prepare/product constraints
 -> activate software-implementation skill
 -> exact target?
      yes -> write_code
      no  -> bounded Actor navigation -> write_code per grounded target
 -> deterministic refactors directly through ChangeEngine
 -> tests/TestNodes
 -> bounded repair through write_code
 -> independent acceptance
 -> verification receipt / Done
```

---

## 5. System-1 — tactical advisor, never dispatcher

One cheap/bounded assessment may run before the general Actor.

Conceptual shape:

```ts
interface TacticalAssessment {
  taskShape: string
  evidenceNeeds: string[]
  usefulMeans: Array<{
    kind:
      | 'direct'
      | 'capability'
      | 'skill'
      | 'compile-helper'
      | 'write-code'
      | 'environment'
      | 'external-knowledge'
    reason: string
    query?: string
  }>
  uncertainties: string[]
}
```

Rules:

- multiple means are normal;
- Actor may ignore or revise every suggestion;
- no route enum;
- no solvability judgment;
- no reduction of available powers;
- timeout/malformed/error => continue without assessment;
- use existing llm-utils fast/cheap routing;
- no repeated assessment by default; at most one bounded re-consult after objective no-progress evidence if later measurement proves useful.

Wrong-advice recovery is an acceptance case.

---

## 6. Skill-manager integration

AIWF should consume `@dharmax/skill-manager` rather than inventing a parallel skill registry.

Minimum runtime operations:

- find skills by semantic task query;
- activate a chosen skill to obtain its bounded context, declared tools and capability requirements.

Do not implement durable skill authoring in the restoration path.

### Built-in `software-implementation` skill

Add only when the runtime integration exists. It is instructional, not executable.

It contains AIWF-specific engineering discipline, not generic programming education:

- start from accepted actor/Ticket outcome;
- inspect actual target/conventions;
- preserve accepted Decisions/Aspects/Lessons/project instructions;
- prefer smallest correct change and existing abstractions;
- deterministic refactor when possible;
- AIWF-generated new/replacement source must use `write_code`;
- never weaken tests/acceptance;
- verification failures feed bounded repair;
- generated examples/tests are not project proof.

Hard safety remains code-enforced; missing skill cannot bypass it.

### Sources

Use explicit configured skill sources. The AIWF built-in source must be packaged/resolvable deliberately; do not guess user directories. Reuse skill-manager's semantic-registry-backed search. No second index.

---

## 7. Two text-compiler roles

### A. Ephemeral analytical composition

For J2.4 tasks such as filtering/ranking/aggregation/graph computation:

```text
compile_and_run_helper(intent, explicitInput, acceptance?)
 -> ephemeral codelet
 -> sandboxed execution
 -> verified derived output + provenance
```

Properties:

- behavior-level intent; Actor does not manufacture source;
- memory/scratch only;
- no promotion/persistence;
- explicit input provenance;
- generated tests/examples cannot become project facts.

### B. Repository source synthesis

For J3.4:

```text
write_code(exact intent + target + constraints)
 -> text-compiler source synthesis
 -> CodeChangeRequest
 -> ChangeEngine preview/apply
```

Do not misuse `compileCodelet()` for class methods/interfaces/modules if its artifact shape is wrong.

If Phase 0 confirms no suitable public text-compiler source-synthesis API, add the **smallest generic sibling extension** (see `docs/code-writing-design.md`): a `compileSource`-style API that returns source text/diagnostics, performs no repository mutation and knows nothing about AIWF Tickets.

---

## 8. One generated-code execution authority

Generated code must not create a safety side door.

### Repository source

Source synthesis itself should not execute arbitrary generated repository code in the AIWF process. Real verification is:

- ChangeEngine preview/language tooling;
- project typecheck/build;
- relevant tests/TestNodes;
- independent acceptance.

### Ephemeral helpers

Executable generated helpers and their dynamic tests must run through the existing ToolContext execution authority/sandbox, with cancellation and cleanup.

If text-compiler cannot inject/delegate its probe execution today, add one minimal execution hook in text-compiler. Do not duplicate its verification pipeline or add another sandbox.

---

## 9. Canonical `write_code` capability

The detailed contract is authoritative in `docs/code-writing-design.md`.

First version is intentionally narrow:

- exact existing symbol replacement;
- exact bounded source-range/block replacement using freshly observed old text;
- explicit new source file.

It does not perform broad target discovery.

Inputs: implementation intent, exact target, acceptance/constraints/guidance/failure feedback.

It loads fresh source/context itself, asks text-compiler for source, constructs the existing change request, then preview/applies through CausalChangeEngine under caller authority.

### Critical invariant

> Any nontrivial new/replacement source text **generated by AIWF** must pass through `write_code`.

Deterministic rename/refactor/source actions remain direct ChangeEngine operations.

Do not expose `write_code` on public MCP initially. `resolve_ticket` remains the normal external implementation entrypoint.

---

## 10. Ticket.resolve migration

### Exact target

Delete the current parallel path:

```text
asker.json -> ExactImplementationSchema -> replacement source
```

after `write_code` parity is proven.

Target:

```text
exact target + dossier + software skill guidance
 -> write_code
 -> ChangeEngine
 -> tests/acceptance
```

### Navigational/multi-target implementation

The implementation Actor remains useful for **navigation and orchestration**, not as a competing code generator.

Its mutation surface should permit:

- `write_code`;
- deterministic rename/refactor/source actions;
- navigation/source/reference tools.

It should not have a generic path to hand-author replacement/new source directly into `replace_symbol/create_file/replace_text`.

### Repair

Fresh failing test/acceptance evidence becomes feedback to a new `write_code` invocation against current source.

No hidden fallback to direct source synthesis.

---

## 11. Evidence/provenance

Keep four categories distinct:

1. observed project/runtime evidence;
2. deterministic derived computation over explicit observed inputs;
3. generated code/tests/examples;
4. model inference/synthesis.

Generated examples/tests never establish project facts.

For compiled helpers record intent, input provenance, artifact hash, verification, authority, output and cleanup.

For `write_code` record target, source hash, compiler identity/attempts, ChangeEngine fingerprint/result and changed files. Aggregate metrics must not persist generated source.

Ticket verification receipts remain the durable acceptance truth.

---

## 12. Implementation phases and gates

### Phase 0 — audit, no production mutation

Inspect **actual local sibling versions** of skill-manager, text-compiler and llm-utils.

Produce:

- exact skill-manager find/activate lifecycle;
- exact text-compiler codelet/source synthesis and execution hooks;
- exact current Ticket.resolve source-producing paths;
- call graph/usages of `compile_codelet/run_codelet/promote_codelet`;
- execution-authority/cancellation boundaries;
- concrete defect table for at least two stopped J2.4 runs and one J3.1 code-writing route;
- smallest proposed sibling API delta.

**Gate 0:** no guessed APIs; plan assumptions validated or corrected before coding.

### Phase 1 — shared skill runtime

Integrate skill-manager find/activate only, using a small test fixture skill to prove the host integration.

Do **not** add the production `software-implementation` skill before its required canonical writer exists; avoid shipping guidance that points at a missing capability.

No skill authoring/promotion.

**Gate 1:** find/activate works lazily with no duplicate index; skill absence cannot bypass hard safety.

### Phase 2 — text-compiler boundaries

A. Implement/confirm behavior-level ephemeral helper compilation with sandboxed execution.  
B. Implement/confirm generic source-synthesis API needed by `write_code`.

Do not yet modify Ticket.resolve.

**Gate 2:** helper computation is safe/ephemeral/provenant; source synthesis produces valid bounded source without repository mutation.

### Phase 3 — canonical `write_code` + built-in implementation skill

Register one internal capability using text-compiler + existing source intelligence + CausalChangeEngine.

Support exact symbol, exact bounded source range/block and explicit new source file. Mark the capability as a mutation through the existing registry semantics; project-write authority remains mandatory.

Now add the concise built-in `software-implementation` skill and declare/use the canonical writer without inventing a second capability resolver.

Test exact symbol, range/import-block, new file, dirty target, cancellation, compiler failure, deterministic control and skill activation.

Do not expose `write_code` publicly yet.

**Gate 3:** source-generation mechanism tests prove one canonical producer and the production skill points only to real available capabilities.

### Phase 4 — migrate Ticket.resolve

1. exact-target branch uses `write_code`;
2. implementation Actor activates software skill and uses `write_code` for generative source;
3. deterministic edits remain deterministic;
4. repair reuses `write_code`;
5. remove direct source-synthesis prompt path;
6. remove Actor bypass for arbitrary generated source.

**Gate 4:** realistic J3.4 exact-target + J3.1 multi-change + J3.2 repair + deterministic rename control all pass.

### Phase 5 — System-1 tactical advisor + general Actor powers

Add one bounded advisory assessment.

Expose to the general Actor:

- capability discovery;
- skill discovery/activation;
- ephemeral helper compilation;
- environment execution;
- `write_code` only when write authority/grounded coding intent makes it relevant.

Simplify shell-centric Actor instructions.

**Gate 5:** different task shapes choose sensible tactics; wrong advice and failed discovery remain recoverable.

### Phase 6 — integrated Agency Gate

#### General-analysis cases
- three real J2.4 requests;
- paraphrases;
- discovery disabled/misleading/slow;
- wrong System-1 advice;
- compiler unavailable fallback;
- skill-only know-how fixture;
- provenance trap.

#### Coding cases
- exact-target Ticket through canonical writer;
- multi-target Actor navigation + writer;
- failing implementation repaired through writer;
- deterministic rename without writer;
- MCP `resolve_ticket` delegation proving internal canonical path;
- text-compiler failure produces concrete blocker, not direct-LLM bypass.

#### Efficiency
Measure:
- Actor steps;
- shell calls;
- model calls;
- latency;
- compilation attempts.

Do not set arbitrary numeric targets before measuring the preserved baseline, but reject an architecture that adds layers without materially improving success or reducing wandering.

**Gate 6:** independently reviewed outcomes are correct/grounded; all mechanism-specific gates hold.

### Phase 7 — cleanup

Only after Gate 6:

- remove obsolete direct exact-source synthesis;
- remove resolver Actor source-generation bypass;
- audit/remove old Actor-authored codelet generation paths superseded by behavior-level ephemeral compilation;
- retain deterministic ChangeEngine/block-patching functionality still used;
- update README/current operational docs to describe the actual implemented architecture.

No branch forest. Work on `master`; tag a useful rollback point if needed.

### Phase 8 — future durable learning, separate journey

Only after repeated evidence:

> a useful one-off procedure recurs enough to justify durable reuse.

Then use existing `SkillManager.create + TextCompilerSkillAuthor`.

Do not auto-promote ordinary helpers or implementation snippets during restoration.

---

## 13. Harsh failure-mode checks

### System-1 becomes the router
Reject. Advice may not remove/force means.

### Skill becomes a giant programming prompt
Reject. Keep AIWF-specific procedure; model already knows programming.

### write_code becomes a second resolver
Reject. Exact target/source synthesis only; Ticket lifecycle stays in Ticket.resolve.

### text-compiler becomes a second editor
Reject. It returns code; CausalChangeEngine owns disk mutation.

### compileCodelet is abused for repository declarations
Reject. Add the smallest source-synthesis contract instead.

### Actor still writes replacement source through apply_change
Reject. That preserves duplicate source producers.

### Everything is compiled
Reject. Deterministic and trivial operations remain deterministic/direct.

### Everything becomes a skill
Reject. One-off computation stays ephemeral.

### Generated tests become acceptance evidence
Reject. Project tests/TestNodes + actor/Ticket acceptance remain proof.

### Public MCP grows unnecessarily
Reject. Keep `resolve_ticket` as the delegation surface until a real external journey requires direct `write_code`.

### Safety rests on prompts/skill
Reject. Enforcement stays in ToolContext, leases, ChangeEngine and acceptance code.

---

## 14. Completion criteria

Restoration is complete only when:

- Actor remains sovereign over tactics;
- System-1 is cheap advice only;
- skill-manager supplies reusable know-how without another index;
- the built-in software skill is concise and actually useful;
- ephemeral analytical composition is behavior-level and sandboxed;
- one canonical `write_code` producer owns AIWF-generated repository source;
- text-compiler is the synthesis engine for that producer;
- CausalChangeEngine remains the only repository mutation authority;
- Ticket.resolve uses the canonical writer internally;
- deterministic refactors bypass unnecessary synthesis;
- repair returns through the same writer;
- generated/example data cannot masquerade as project evidence;
- J2.4/J3.1/J3.2/J3.4/J5.1 realistic journeys pass;
- duplicate source-producing paths are removed after proof;
- full AIWF and affected sibling tests/typechecks pass;
- no new planner/orchestrator/manager/repository/registry/workflow engine or branch forest is introduced.

Final architectural sentence:

> **Actor decides. System-1 advises. Skill guides. Capabilities provide hands. text-compiler composes/writes. ChangeEngine mutates. Tests and acceptance prove.**
