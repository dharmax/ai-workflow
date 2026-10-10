# Graph-Grounded Source Synthesis — Design and Execution Plan

**Status:** active design for J3.4 and TKT-CODE-SYNTHESIS-ENGINE  
**Scope:** generative source changes inside an AIWF-managed project  
**Direction:** deliberately compatible with a future shared synthesis core used by Semantic Studio, without importing Semantic Studio's source-of-truth model into ordinary repositories

## 1. Actor journey

### J3.4 — turn grounded implementation intent into verified source

A developer asks AIWF to resolve a leaf Ticket that genuinely requires new source rather than a deterministic rename/refactor/edit.

AIWF has already established the implementation intent and acceptance contract through the Ticket lifecycle. It identifies the exact existing source target, or the bounded location for a new source artifact. It then builds a small synthesis context from the project's semantic graph plus exact language/runtime evidence.

The synthesis context answers:

- what behavior is required;
- what exact source is being changed or created;
- what nearby implementation should be reused rather than duplicated;
- what contracts, Decisions, Aspects and product intent constrain the implementation;
- what callers/dependencies/types materially constrain it;
- what tests and acceptance evidence must verify it.

A source synthesizer turns that bounded context into a candidate. AIWF performs cheap candidate sanity checks, converts the candidate into an ordinary existing change request, and applies it only through the Causal Change Engine.

The real project then verifies the result. If verification fails, AIWF preserves the concrete failure, refreshes only the relevant semantic/code neighborhood, and performs bounded repair through the same synthesis boundary. It stops with a concrete blocker when repair cannot be justified.

If the requested mutation is deterministic and already owned by TypeScript/LSP or another mature primitive, AIWF bypasses generative synthesis completely.

The developer sees one coherent Ticket resolution. They do not manually gather graph context, write replacement source, invent tests, or reproduce the repair choreography.

This journey is the acceptance boundary. Architecture below derives from it.

---

## 2. Core idea

The useful idea is simple:

> **Code generation in an AIWF-managed repository should be grounded by the project's semantic graph, not driven by an arbitrary source-text dump.**

The graph is not the code generator and not a planner.

It is the semantic spine that lets AIWF construct the smallest useful synthesis context.

Canonical flow:

~~~text
accepted implementation intent
        ↓
graph-grounded context construction
        ↓
bounded source synthesizer
        ↓
candidate source
        ↓
cheap candidate sanity
        ↓
existing Causal Change Engine
        ↓
real project verification
        ↓
success
   or failure evidence
        ↓
refined bounded context
        ↓
repair candidate
~~~

This is intentionally smaller than the previous design.

---

## 3. What the graph owns in synthesis

The graph has six jobs.

### 3.1 Target

Identify what the change belongs to and where it should land:

~~~text
Ticket
  → Product Intent / Decisions / Aspects
  → code anchor / file / module
~~~

For correctness-sensitive TypeScript/JavaScript target identity, the persistent graph supplies the anchor and TypeScript LSP resolves the exact declaration/range.

The graph must not pretend to replace TypeScript's live semantic model.

### 3.2 Context

Select the minimum relevant neighborhood:

- exact target source;
- containing declaration/module when needed;
- directly relevant types/contracts;
- callers/dependencies that constrain the implementation;
- neighboring implementation patterns when materially useful.

Do not dump whole files or the repository merely because they are available.

### 3.3 Reuse

Before inventing a helper/type/service, look for an existing one in the bounded graph/code neighborhood.

Reuse is evidence-driven, not mandatory ceremony. If no credible reusable implementation exists, synthesize the needed source.

### 3.4 Constraints

Carry the obligations that the source must respect:

- Ticket intent and acceptance criteria;
- linked Story/Feature/Flow/Goal when relevant;
- governing Decisions;
- applicable material Aspects;
- exact API/type contracts;
- explicit project conventions or skill knowledge when activated.

Constraints must retain provenance. A generated summary must not silently become canonical truth.

### 3.5 Verification

Derive likely proof from existing relations and code impact:

- explicitly linked TestNodes/tests;
- affected callers/dependents;
- diagnostics/typecheck;
- Ticket acceptance criteria;
- relevant material Aspects.

The graph helps select proof. It does not declare proof passed.

### 3.6 Lineage

AIWF should be able to explain:

~~~text
Ticket/intent
→ evidence/context used
→ target changed
→ verification performed
→ final result
~~~

Do not create a new persistent synthesis-plan entity merely to record this. Existing Ticket/change/verification evidence should carry the useful lineage.

---

## 4. Exact code truth vs persistent semantic truth

Do not build a second exact code graph.

The existing ownership remains:

~~~text
Semantika / AIWF graph
  = why, ownership, Product Intent, Decisions, Aspects,
    durable code anchors, tests and causal relations

TypeScript LSP
  = exact declarations, ranges, references, callers,
    type semantics and diagnostics
~~~

Graph-grounded synthesis composes these two.

A typical bounded context build is:

~~~text
Ticket + semantic neighborhood
        ↓
durable code anchor
        ↓
TypeScript exact target/source/references
        ↓
optional bounded related-symbol lookup
        ↓
SynthesisContext
~~~

Heuristic AST facts may help discovery. They must not be presented as exact TypeScript truth when LSP can answer directly.

---

## 5. SynthesisContext: host-owned, small and provenance-aware

Do not create a giant repository-context object.

The conceptual contract is:

~~~ts
interface SynthesisContext {
  intent: {
    summary: string
    acceptanceCriteria: readonly string[]
  }

  target:
    | {
        kind: 'existing_symbol'
        filePath: string
        symbolName: string
        existingSource: string
      }
    | {
        kind: 'new_source'
        filePath: string
      }

  evidence: readonly SynthesisEvidence[]
  verification: readonly VerificationExpectation[]
}
~~~

This shape is illustrative, not frozen API.

A SynthesisEvidence item should carry the fact plus its source/provenance and role, for example:

~~~text
constraint
reuse_candidate
dependency_contract
caller_contract
project_convention
product_intent
decision
aspect
~~~

The context builder belongs to the host because AIWF and Semantic Studio start from different authoritative intent.

### AIWF adapter

AIWF derives context from:

- Ticket investigation/preparation;
- Product Intent graph;
- Decisions/Aspects;
- exact source anchors;
- TypeScript/LSP evidence;
- tests and verification links;
- optional activated implementation skills.

### Future Semantic Studio adapter

Semantic Studio may derive the same conceptual context from:

- authoritative intent/module specification;
- API/wiring/service contracts;
- ontology;
- neighboring modules;
- capability constraints.

That possible shared middle is important, but **AIWF must not adopt Semantic Studio's “intent is source” semantics for ordinary repositories**.

---

## 6. SourceSynthesizer: one generative source boundary

AIWF currently has more than one path capable of authoring replacement source. The Phase-0 agency audit already identified duplicate source production as a real architectural problem.

Generative source production should converge on one narrow internal boundary:

~~~ts
interface SourceSynthesizer {
  synthesize(
    context: SynthesisContext,
    options?: {
      feedback?: readonly VerificationFailure[]
      signal?: AbortSignal
    }
  ): Promise<SynthesisCandidate>
}
~~~

Conceptual output:

~~~ts
interface SynthesisCandidate {
  source: string
  assumptions?: readonly string[]
}
~~~

The synthesizer:

- receives bounded grounded context;
- returns candidate source or a concrete inability/ambiguity result;
- does not mutate the repository;
- does not own Git;
- does not own Tickets;
- does not own leases;
- does not own CausalChangeEngine;
- does not own project verification;
- does not decide Product Intent truth.

A candidate may report assumptions for traceability, but a material unresolved assumption about behavior, target identity, API contract or destructive effect must become needs_input/blocked before apply. “The model guessed correctly” is not an acceptance mode.

“One generative source boundary” is a responsibility boundary, not a demand for one model, one prompt shape, or one-file architecture. The first proof is deliberately single-target because that is the smallest falsifiable slice.

### Backend choice

Do **not** hardwire the architecture to @dharmax/text-compiler.

The current audit established that text-compiler does not yet provide a clean bounded repository-source synthesis contract, has in-process probe execution, and lacks the cancellation/host-execution contract AIWF would need for stronger isolation claims.

Therefore:

1. define/prove the host-side synthesis boundary first;
2. use the smallest existing model path that satisfies it for the first vertical slice;
3. evaluate text-compiler as a backend;
4. make the smallest sibling improvement only if it materially improves the journey.

If an ordinary Asker call performs better and more simply for a source form, the architecture must allow that.

Mechanism is replaceable. Grounded synthesis behavior is the product.

---

## 7. Keep CausalChangeEngine pure

This is a hard boundary.

The Causal Change Engine accepts a **concrete desired mutation**. It previews, fingerprints, applies, reconciles and verifies the mutation.

It must not become the code-generation engine.

Therefore do **not** add:

~~~text
synthesize_function
synthesize_construct
generate_component
compile_class
~~~

to ChangeRequest.

Instead:

~~~text
SynthesisContext
    ↓
SourceSynthesizer
    ↓
candidate
    ↓
existing request:
  replace_symbol
  create_file
  or another already justified concrete mutation
    ↓
CausalChangeEngine
~~~

This preserves the clean law already documented in docs/causal-change-engine.md:

> Mature engines own mechanics. AIWF owns intent, causal context, orchestration, preview, safety, graph continuity and verification.

Source synthesis is upstream cognition, not mutation mechanics.

---

## 8. Do not design around a construct taxonomy

The previous design split synthesis into:

- functions/methods;
- types/interfaces/schemas;
- classes/services;
- UI components.

That is premature architecture.

The first useful target distinction is much smaller:

~~~text
existing bounded source target
new bounded source artifact
~~~

For an existing TypeScript symbol, prefer exact symbol replacement.

For a new file/artifact, use an explicit bounded destination plus surrounding module/contracts.

A synthesizer may internally benefit from knowing whether it is writing a declaration, executable function or module, but that is a hint/backend concern—not a top-level architecture branch.

Framework-specific know-how such as Riot.js conventions belongs naturally in activated skills/context, not in the synthesis engine's type system.

---

## 9. Candidate sanity is not acceptance proof

The previous design overclaimed generated tests and “pre-flight verification”.

A generator can produce implementation and tests that agree with each other and are both wrong.

Use three distinct proof levels.

### Level A — candidate sanity

Cheap checks before mutation where practical:

- source is non-empty and structurally plausible;
- candidate matches the requested target form;
- parser/LSP can understand the candidate when a cheap in-memory check exists;
- no obvious forbidden ambient assumptions are introduced.

Generated micro-tests may help here, but are not authoritative.

### Level B — project compatibility

After safe apply through CCE:

- diagnostics/typecheck;
- affected caller/dependency checks;
- existing targeted tests;
- project-specific build/runtime checks as appropriate.

### Level C — behavioral acceptance

Independently establish the Ticket outcome:

- explicit acceptance criteria;
- existing/authoritative tests;
- material Aspects;
- relevant Product Intent;
- independent Critic/reviewer when policy requires it.

A generated test is evidence only to the extent its behavioral oracle is independently grounded.

### Disk mutation policy

Do not promise “no unverified code ever reaches disk”.

AIWF already has a safe preview/apply/fix-forward model. Full project verification often requires the candidate to exist in the real workspace.

Default v1:

~~~text
candidate sanity
→ CCE apply
→ real verification
→ bounded fix-forward repair
~~~

A disposable worktree/overlay preflight is a possible later optimization for high-risk changes, only if real evidence justifies the added machinery.

---

## 10. Graph-aware repair loop

Repair should use the graph to improve context, not merely append stderr to the same prompt.

When verification fails:

1. preserve the concrete failure;
2. classify the failure using existing resolution policy where useful;
3. identify which caller/contract/test/criterion the failure corresponds to;
4. refresh the smallest relevant graph/LSP neighborhood;
5. rebuild the synthesis context with the new evidence;
6. synthesize a repair candidate;
7. apply through the same CCE path;
8. rerun the required proof.

Conceptually:

~~~text
intent
  ↓
bounded graph/LSP context
  ↓
candidate
  ↓
real verification
  ↓
failure evidence
  ↓
affected contract/caller/test
  ↓
refined bounded context
  ↓
repair
~~~

Failure evidence is run evidence. It does not automatically deserve a new persistent graph entity.

Bound repair attempts. When no new justified evidence/tactic remains, return the concrete blocker.

---

## 11. Deterministic changes bypass synthesis

Generative synthesis is never the default merely because the Ticket changes code.

Prefer the mature deterministic owner whenever one exists:

~~~text
rename
move/rename file
organize imports
supported refactor
exact mechanical source action
~~~

Use CCE + TypeScript/LSP directly.

Use source synthesis when the missing artifact is **behavior**, not mechanics.

Examples:

~~~text
"rename WorkflowStore to ProjectStore"
  → deterministic

"change parseConfig so malformed aliases produce the accepted diagnostic"
  → generative source synthesis may be appropriate

"add a new bounded adapter implementing this accepted interface"
  → generative source synthesis may be appropriate
~~~

System-1 may advise mechanism family, but cannot make a destructive/generative decision authoritative.

---

## 12. Skill-manager's role

Skills can provide specialized implementation knowledge without polluting the core synthesis architecture.

Examples:

- Riot.js project conventions;
- library-specific usage constraints;
- framework migration patterns;
- domain implementation rules.

Flow:

~~~text
Ticket intent
→ bounded skill discovery if useful
→ activated relevant skill context
→ provenance-bearing SynthesisEvidence
→ synthesizer
~~~

Do not sync/activate an unbounded skill catalog into every synthesis prompt.

The graph tells us what this project contains and what constrains the change. Skills tell us optional specialized know-how. They are complementary.

---

## 13. AIWF / Semantic Studio convergence

There is a credible future shared abstraction:

> **graph-grounded source synthesis from a host-provided intent/context contract**

The hosts remain different.

### AIWF

Existing source is normal project source. A Ticket/change asks AIWF to modify it safely.

~~~text
Ticket
→ project semantic/code graph
→ SynthesisContext
→ candidate
→ CCE
→ project verification
~~~

### Semantic Studio

Intent/contracts may be authoritative and generated source may be a derived revision.

~~~text
module intent/contracts
→ Studio semantic graph
→ SynthesisContext
→ candidate
→ Studio revision/verification boundary
~~~

The candidate synthesizer may eventually be shared.

The mutation/revision authority is not necessarily shared.

Do not merge the products merely because the middle looks similar.

Do not create a shared package until both hosts prove a stable common contract.

If that day comes, a narrow name such as @dharmax/source-synthesis is more accurate than embedding AIWF or Semantic Studio semantics into the package.

---

## 14. AIWF-friendly implementation plan

### Phase 0 — preserve current evidence and map the real producer paths

Do not invent another synthesis subsystem.

Using the existing Phase-0 agency audit as baseline, inspect current master and record:

- exact direct source producer in Ticket.resolve;
- navigational Actor source producer;
- deterministic CCE/LSP paths that should bypass synthesis;
- current investigation dossier inputs;
- exact graph/LSP evidence already available before generation;
- verification/repair loop inputs;
- current text-compiler repository-source capabilities and the previously observed gaps.

**Gate 0:** one short producer/context map. Any new abstraction must replace/simplify an existing source-producing responsibility rather than sit beside it.

### Phase 1 — graph-grounded single-target vertical slice

Choose one real, bounded J3.4 case:

- leaf Ticket;
- exact existing function/method target;
- behavioral implementation change;
- deterministic refactor is insufficient;
- existing project tests/acceptance provide an independent oracle.

Implement the smallest host-owned context builder from existing Ticket investigation + graph + exact LSP evidence.

Route **one** generative producer through the narrow SourceSynthesizer boundary.

Use the simplest backend that works. Do not require text-compiler.

Candidate becomes ordinary replace_symbol and goes through CCE.

**Gate 1:** compared with the old source producer, the same Ticket is correctly resolved with:
- bounded provenance-bearing context;
- no source dump;
- no new mutation path;
- real project verification;
- no generated-test-as-proof shortcut.

### Phase 2 — unify generative source production

Only after Gate 1 succeeds:

- route the other existing generative source path through the same boundary;
- remove duplicate source-authoring logic;
- preserve tool-using Actor investigation when it is genuinely needed;
- ensure the Actor cannot silently bypass the canonical generative source boundary for the same class of leaf implementation.

Do not interfere with deterministic refactors/changes.

**Gate 2:** one generative source boundary, one mutation boundary, no loss of current successful journeys.

### Phase 3 — graph-aware bounded repair

Use an actual failed implementation case.

Feed verification failure back through refreshed graph/LSP context and the same synthesizer.

Prove that repair uses new relevant evidence rather than simply repeating the original prompt.

**Gate 3:** failed test/type/acceptance case converges or stops with a concrete blocker within bounded attempts.

### Phase 4 — new source artifact

Only after exact-symbol replacement is sound, add a bounded new_source case.

Multi-file generative orchestration is intentionally not part of the first architecture. If real leaf Tickets repeatedly require coordinated multi-file source invention that cannot be handled by decomposition plus existing concrete mutations, preserve those cases and extend the synthesis contract from evidence rather than predesigning a multi-file planner.

Use existing create_file through CCE.

Do not introduce function/class/component-specific mutation APIs.

**Gate 4:** a real leaf Ticket requiring one new source artifact succeeds without special construct architecture.

### Phase 5 — evaluate text-compiler as backend

Now compare:

- current minimal synthesizer backend;
- text-compiler with the smallest required sibling improvements, if any.

Measure:

- correctness/acceptance;
- context size;
- latency/cost;
- repair success;
- source quality/duplication;
- cancellation/authority behavior.

If text-compiler materially improves the journey, adopt it behind SourceSynthesizer.

If not, do not force it into the architecture.

### Phase 6 — adversarial gate

Prove at least:

- deterministic rename bypasses synthesis;
- exact function behavior change uses synthesis;
- existing helper/type is reused rather than duplicated;
- governing Decision constraint survives;
- material Aspect survives;
- irrelevant graph neighborhood is absent;
- target ambiguity stops rather than guessing;
- material unresolved synthesis assumptions stop rather than being silently accepted;
- stale graph anchor is reconciled through exact LSP evidence;
- generated test cannot self-certify wrong behavior;
- verification failure refines context;
- cancellation stops synthesis;
- dirty target safety remains intact;
- unrelated dirty file remains allowed according to Ticket.resolve policy;
- no direct repository mutation bypasses CCE.

### Phase 7 — cleanup and only then consider sharing

Delete superseded source-producer prompt/schema code.

Keep:

- Ticket lifecycle ownership in AIWF;
- semantic context building in AIWF;
- exact code semantics in TypeScript/LSP;
- mutation in CCE;
- synthesizer narrow/backend-neutral.

Only after a real Semantic Studio implementation needs the same context→candidate contract should a shared package be considered.

No branch forest.

---

## 15. Hard rejection list

Reject any implementation that:

- adds synthesize_* actions to CausalChangeEngine;
- makes text-compiler architecturally mandatory before comparison proves it;
- creates separate architecture branches for function/type/class/UI component generation;
- treats generated tests as behavioral acceptance;
- claims Semantika replaces exact TypeScript semantics;
- dumps the repository or full graph into a prompt;
- creates a second exact code graph;
- lets the synthesizer mutate disk/Git/Tickets;
- lets an Actor write repository source outside the canonical generative boundary for the same leaf-work class after unification;
- adds a persistent synthesis-plan/workflow entity;
- imports Semantic Studio's source-authority rules into ordinary AIWF projects;
- introduces a shared package before both hosts prove a stable shared contract;
- bypasses CCE for generated repository mutation;
- uses a stronger model to hide missing/incorrect grounding.

---

## 16. Definition of done

This work is complete when:

1. a real J3.4 leaf Ticket is implemented from bounded graph/LSP-grounded context;
2. deterministic changes bypass generative synthesis;
3. generative source production has one canonical internal boundary;
4. that boundary is backend-neutral;
5. CCE remains a concrete mutation/verification boundary and has no synthesis actions;
6. exact TypeScript semantics still come from LSP, not a shadow graph;
7. generated tests cannot independently certify acceptance;
8. real project verification drives bounded repair;
9. failed verification causes relevant context refinement rather than blind reprompting;
10. existing reusable source is preferred when the evidence supports reuse;
11. no construct taxonomy/framework is required for function replacement or one new source artifact;
12. material unresolved assumptions become needs_input/blocked rather than source guesses;
13. cancellation/authority/dirty-work rules remain truthful;
14. the final implementation is smaller than the two source-producing paths it replaces or clearly earns any added code;
15. multi-file synthesis is not added until real accepted journeys require it;
16. the design remains usable as the AIWF side of a future AIWF/Semantic Studio shared synthesis seam without coupling the products.

The intended architecture is:

~~~text
AIWF intent + semantic graph + exact language evidence
                    ↓
             bounded context
                    ↓
           source synthesizer
                    ↓
                candidate
                    ↓
          Causal Change Engine
                    ↓
        real project verification
                    ↓
         success / bounded repair
~~~

The decisive principle is:

> **The graph grounds generation. The synthesizer writes candidates. CCE mutates safely. The real project proves correctness.**
