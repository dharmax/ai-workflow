# Artifact Operations — Design

Status: authoritative implemented design for AIWF artifact operations. Historical implementation sequencing is retained in `artifact-operations-plan.md`; this document defines current semantics.

## 1. Purpose

AIWF should not make an expensive external coding agent orchestrate dozens of low-level engineering tools.

The primary public interface should operate on durable engineering artifacts.

Per Semantika's entity pattern, the in-process domain API is entity-oriented: Ticket/Epic/Feature/UserStory instances own their tightly-related operations. Shell/MCP names are transport aliases over those methods, not separate business-logic owners:

~~~
human / Codex / AGY / future host
             |
             v
   investigate_ticket
     prepare_ticket
     resolve_ticket
 process_epic / feature / story
             |
             v
        AIWF owns the work
             |
             v
 graph + exact code intelligence + changes + tests
~~~

Symbol lookup, graph traversal, LSP refactors, patches, tests, Git, claims, and Product Intent mutations remain important primitives. They are normally the hands underneath artifact operations, and remain available as expert/debug escape hatches.

The target is not "zero source reading". It is:

> the caller delegates an engineering artifact; AIWF performs the repository archaeology, preparation, execution and verification with bounded context and returns a grounded result.

## 2. Adversarial design corrections

This design deliberately rejects several tempting directions.

### No generic workflow engine

Do not model artifact processing as configurable stages, persisted plans, arbitrary transition graphs, or a generic processArtifact framework.

Ticket and Product Intent lifecycles are known domain semantics. Ordinary control flow should look ordinary in code.

### No hidden continuation state

An operation is re-entrant over durable project state.

If more information is needed, return needs_input. The caller updates the canonical artifact/graph and retries the same operation.

Do not introduce resume tokens, pending conversations, opaque run records, or a second workflow database.

### No mandatory LLMPipeline / LLMSession architecture

Use @dharmax/llm-utils primitives where they earn their keep:

- Asker.json() for structured semantic judgments;
- LLMActor for bounded tool-using implementation work;
- existing model routing/metrics.

LLMPipeline may be used internally only if it makes a concrete implementation simpler. It is not the lifecycle owner.

LLMSession is not the persistence mechanism. Durable graph state is.

### No premature semantic-registry adoption

Artifact operations know their lifecycle and usually know which small capability family is needed.

Use exact run-local tool sets first.

Adopt semantic-registry later only if real execution demonstrates that dynamic capability discovery is materially better than operation-owned capability sets.

### System-1 is the preferred first semantic gate

Do not send every semantic question to an autoregressive LLM.

When the needed answer is a typed decision rather than generated content, use a fast System-1 pass first.

The generic System-1 contract belongs in @dharmax/llm-utils. AIWF consumes it; AIWF must not copy ai-cli's Laya wrapper or depend on ai-cli.

The first backend is Laya, which supports batched:

- choice;
- ordinal score over an ordered rubric;
- yes/no probability (noul).

AIWF uses System-1 in three distinct roles.

#### A. Artifact triage

Over a compact Ticket/Product state:

- classify work kind;
- estimate scope/breadth;
- estimate reasoning depth;
- classify likely atomic vs decomposition-worthy;
- decide which evidence families are worth retrieving;
- estimate ambiguity/escalation need.

#### B. Evidence/candidate ranking and pruning

After deterministic retrieval has already produced a bounded candidate set:

- rank likely relevant symbols/files;
- shortlist Decisions/Lessons/docs;
- shortlist tests when explicit graph verification links are absent;
- shortlist existing Features/Stories/Tickets for semantic reuse.

Deterministically mandatory evidence is never pruned: explicit Ticket targets/modifies edges, governing Decisions, blockers/dependencies, acceptance criteria, directly linked Product Intent, and explicit verifying tests always survive.

System-1 operates only on optional candidates discovered beyond that mandatory neighborhood. Prefer conservative ranking/top-N retention over hard elimination when false negatives would be costly.

This is a major token-saving path:

~~~
deterministic retrieval
      ↓
bounded candidates
      ↓
System-1 relevance filter
      ↓
small evidence set
      ↓
reasoning/code model
~~~

Never send whole files or an unbounded repository candidate set to System-1.

#### C. Execution/failure routing

Before a generative Actor run or after failed verification:

- choose likely mechanism family: native refactor / exact symbol edit / bounded patch / test/config/docs work;
- choose likely model tier;
- classify failure family: compile / type / assertion / tool / environment / semantic / unknown;
- decide whether the next step is cheap inspection or deeper diagnosis.

System-1 is **advisory, not authoritative**.

It may:

- route retrieval;
- rank/prune optional evidence conservatively;
- prune a run-local tool surface;
- choose a cheaper vs stronger reasoning path;
- shortlist candidates;
- identify likely unmet criteria/gaps for follow-up;
- trigger escalation.

It must not by itself:

- persist a semantic graph relation;
- reject or complete a Ticket;
- choose destructive mutation;
- positively declare acceptance criteria satisfied;
- create/reuse/link a Product Intent artifact as canonical truth;
- suppress deterministic verification or required reasoning review.

Low confidence, disagreement with deterministic evidence, or a materially consequential semantic choice escalates to the normal reasoning path.

Use one batched assessment at a meaningful decision point rather than many tiny classifier calls.

The assessment state must stay compact: artifact intent, acceptance contract, a few graph facts/candidate labels, and current failure/evidence summary. Laya's practical state window is small, so deterministic retrieval must narrow first. Do not feed source files to System-1.

System-1 availability is an optimization, not a correctness dependency. If unavailable, AIWF falls back to the ordinary bounded reasoning path.

Do not build a System-1 framework inside AIWF. Consume the shared llm-utils primitive and keep only AIWF's question sets, thresholds and policy here.

### No "context pack" as the product abstraction

@dharmax/context-manager is useful internally for selecting, budgeting and rendering evidence.

The public abstraction is artifact investigation/resolution, not "give the caller context so it can do AIWF's job".

### No Insight/Investigation entity yet

Investigation derives canonical-fact candidates in the terms where they would belong:

- graph relations;
- exact code anchors;
- acceptance criteria;
- Decisions when there is a real durable decision;
- Lessons when there is a real reusable lesson/trap.

It does not persist those semantic enrichments itself. A mutating operation applies accepted/confirmed changes through the ordinary canonical path while leased.

The investigation dossier itself is derived output. Do not create a shadow narrative state model merely to cache an LLM answer.

## 3. Operation policy: completeness, critic and depth

Artifact operations need a small explicit policy. This is not a workflow framework.

Conceptually:

~~~
interface ArtifactOperationOptions {
  completeness?: CompletenessLevel
  depth?: number | 'all'
  maxArtifacts?: number
  critic?: ArtifactCritic | { id: string } | 'auto' | 'none'
}
~~~

In-process callers may inject an ArtifactCritic object directly.

Shell/MCP cannot transport executable objects, so they select a configured critic by ID:

~~~
aiwf process epic EPIC-X --completeness production --depth 2 --critic strict
~~~

The transport-level value is resolved to an ArtifactCritic by AIWF. Do not create a generic plugin/registry framework merely for this lookup.

Every operation result reports the effective policy actually used:

~~~
effectivePolicy:
  completeness: advanced
  completenessSource: feature:FEAT-X
  scopeCompleteness: [...]
  depth: 2
  maxArtifacts: 24
  critic: strict
  criticSource: explicit
~~~

This makes behavior inspectable and reproducible.

### Completeness is a target, never persisted achievement

Persist only the desired target.

Do not persist "this Feature is production-complete" or "current completeness=advanced". That would rot just like persisted coverage.

Legacy `Module.completionPercent` is the same stale-state smell. It must not be reused as completeness. The operation-policy implementation should remove/deprecate that persisted field and any ProjectHealth percentage that pretends to be semantic completeness; operational progress may be derived separately if still useful.

Use four ordered initial targets:

~~~
poc < functional < advanced < production
~~~

Their meaning is qualitative and domain-sensitive, not a quota of Stories or tests.

- poc — prove the core concept/happy path with the minimum meaningful acceptance and verification needed to establish viability.
- functional — cover the main intended behavior and important failure paths with useful acceptance and verification.
- advanced — cover meaningful breadth, edge cases, integration/recovery and relevant non-functional concerns.
- production — cover the known accepted behavior plus robustness and relevant security/performance/observability/migration/documentation concerns, with strong verification.

No target requires ceremonial Stories or arbitrary counts.

A technical Feature/Epic may still have zero UserStories at production level when Stories add no semantic value.

Completeness is evaluated across applicable dimensions, not by raw artifact counts:

- intent breadth — known required behaviors/capabilities are represented at the useful level;
- failure/edge behavior — important invalid, boundary and failure cases are not silently omitted;
- verification — evidence depth matches the target, from proof-of-concept checks through meaningful integration/end-to-end coverage where relevant;
- integration/recovery — interactions, persistence, restart/retry/recovery and compatibility are covered when relevant;
- non-functional concerns — security, performance, concurrency/resource limits and privacy only when materially applicable;
- operability — configuration, migration, observability and documentation when the target and domain require them.

System-1 may cheaply classify which dimensions are likely applicable. The Critic/reasoning path judges adequacy. Do not encode universal quotas such as minimum Story counts or fixed test percentages.

### Persistent target and inheritance

Durable work/product scopes may carry an optional completenessTarget where meaningful:

~~~
Module
Epic
Feature
UserStory
~~~

Also add a project default in AIWF project config.

Effective completeness resolution is scope-aware:

For the root artifact of a call:

1. explicit operation override;
2. explicit target on the root artifact;
3. inherited target from defined semantic work scopes;
4. project default.

For descendants reached recursively:

1. explicit target on that descendant;
2. completeness inherited from the current operation/root path;
3. other defined semantic-scope inheritance;
4. project default.

Thus a root run override does not silently erase a deliberate child-scope target.

### Ticket completeness context

Tickets can simultaneously serve scopes with different targets. Do not collapse these into one semantic level.

Example: a POC Feature may be implemented inside a production-quality Module. Product breadth may remain POC while the Module's security/maintainability/operability expectations still apply to the code.

For Ticket investigation/preparation/resolution derive:

~~~
scopeCompleteness:
  epic?: [...]
  feature?: [...]
  story?: [...]
  module?: [...]
  runOverride?: ...
~~~

Use the strongest contributing level only as a conservative hint for model/Critic strength. Acceptance and Aspect review must preserve the individual scope targets rather than pretending they are one scalar.

Inheritance is intentionally constrained rather than generic graph traversal:

- UserStory may inherit from its containing Feature(s); strictest inherited target wins.
- Ticket has no persisted completeness target. It carries a completeness context from the scopes it serves: containing Epic(s), implemented Feature(s), addressed UserStory(ies), explicitly targeted Module(s), plus any operation override and project fallback.
- Feature does not inherit from targeting Epics: Epics do not own durable Features.
- Epic and Module use their own explicit target or project default.

An explicit target on a persistent completeness scope overrides inherited targets, including a deliberate lower target such as a POC Feature inside broader production work.

Ticket completion remains governed by its acceptance criteria. Raising a Feature/Module/Epic/Story target does not retroactively reopen verified Tickets; completeness assessment creates/adds new work for newly exposed gaps.

An operation-level override sets the root run target and is inherited by recursive descendants that do not have their own explicit target. It is not persisted unless the caller explicitly asks to remember it on the root scope.

Provide one small deterministic mutation/query surface for target management rather than hiding it in natural-language state:

~~~
set_completeness_target(entityId, level | null)
get_completeness_target(entityId)  // explicit + effective + source
~~~

### Derived completeness assessment

Structural Product Coverage remains what it is today: deterministic causal/graph evidence.

Do not overload Coverage with semantic maturity.

Artifact operations may derive a CompletenessAssessment against the effective target:

~~~
target
structuralCoverage
knownGaps[]
meetsTarget
evidence
~~~

meetsTarget means no known unmet requirements under the selected target and available evidence. It is not a guarantee that unknown requirements do not exist.

A higher target may reveal additional required Stories/Tickets/tests/docs/operational work. Lowering the target never deletes already-valid work.

Raising a target is additive and idempotent: poc → production means find and fill the additional known gaps, not regenerate the artifact tree.

### Aspects are part of completeness, not a fifth policy axis

First-class Aspects are defined in `docs/aspects.md`.

Completeness assessment must include applicable Aspect coverage/evidence. Do not add a separate `aspectLevel` knob.

At higher completeness, System-1/reasoning/Critic examine a broader Aspect candidate set and demand stronger evidence where material. Explicit accepted Aspects are mandatory evidence for the stronger path and are never pruned away.

### Recursion depth is independent of completeness

Completeness answers how thorough. Depth answers how far down the artifact/work graph this call should continue.

Do not conflate them.

Use:

~~~
depth = 0     current artifact only; analyze/review, no recursive child processing
depth = 1     process immediate next-level artifacts
depth = N     recurse at most N artifact-expansion/decomposition edges
depth = all   continue through the reachable work tree, subject to leases/blockers/safety
~~~

Defaults:

- investigate_ticket: 0;
- prepare_ticket: 1;
- process_story/feature/epic: 1;
- resolve_ticket: all, because resolve means end-to-end unless explicitly capped.

Depth counts artifact processing/decomposition edges, not individual code/tool calls.

Aspect processing is not a separate recursion tree. Discovering/reviewing Aspects on the current artifact does not consume depth; child work created to address an Aspect behaves like ordinary child artifacts and does.

Concrete expansion edges:

- Epic → produced/reused Feature, UserStory or Ticket batch = one level;
- Feature → produced/reused UserStory or Ticket batch = one level;
- UserStory → produced/reused addressing Ticket batch = one level;
- Ticket → child Ticket decomposition = one level;
- Ticket → code execution is implementation, not another recursion level.

Thus `process_epic(..., depth=1)` may establish its immediate coherent Feature/Story/Ticket layer but does not recursively process those children. `depth=2` may process the immediate children once more.

Depth does not bound breadth. Therefore every recursive operation also has a simple `maxArtifacts` safety budget (operation override then project config default). Hitting it stops further expansion/resolution, reports remaining artifacts, and never falsely marks the root complete. Do not build a generic budget subsystem around this first guard.

If requested depth is reached while unresolved descendants remain, the operation itself may return complete for the requested scope, but it must report artifactComplete=false, remaining IDs, and stoppedAtDepth; it must not mark the parent Ticket verified.

Cycle detection and existing dependency ordering rules still apply.

### Critic

Generated Product Intent/work structure should not be trusted merely because the producer returned valid JSON.

Use a small domain-level critic contract:

~~~
interface ArtifactCritic {
  id: string
  review(input: CriticInput): Promise<CriticResult>
}

type CriticResult =
  | { verdict: 'accept'; findings?: Finding[] }
  | { verdict: 'revise'; findings: Finding[] }
  | { verdict: 'needs_input'; required: RequiredInput[] }
  | { verdict: 'reject'; findings: Finding[] }
~~~

A critic may be an independent AI reviewer, deterministic rules, or a small composition of both supplied behind one Critic object.

The critic is read-only. It never mutates Product Intent/work state.

Review input includes parent artifact/intent, relevant graph neighborhood, proposed Features/Stories/Aspects/Tickets/relations, applicable and candidate Aspects, effective completeness target, current recursion depth, and acceptance/coverage evidence.

The critic checks especially:

- omission against requested completeness;
- duplicate/redundant artifacts;
- bad abstraction level;
- ceremonial or unnecessary Stories/Tickets;
- missing acceptance criteria;
- inappropriate reuse/create decisions;
- incoherent dependencies;
- mismatch with Decisions/constraints;
- omitted material cross-cutting Aspects or weak Aspect evidence;
- irrelevant Aspect ceremony;
- overproduction/story explosion.

A revise verdict feeds bounded critique back to the producer for another proposal pass.

A needs_input verdict uses the ordinary operation interaction contract.

A reject verdict means the proposal is unusable as produced. After a small bounded number of regeneration attempts, fail the operation with the critic findings; do not silently apply a weaker result.

### Critic selection

Critic selection is explicit and overridable.

- in-process API: pass an ArtifactCritic object;
- MCP/shell: pass a configured critic ID;
- none: explicit opt-out;
- auto: AIWF chooses the normal critic policy from the effective completeness target and operation type.

Do not hard-code model names into artifact semantics.

The default auto policy becomes stricter as completeness rises:

- poc: lightweight independent review;
- functional: independent semantic review;
- advanced: stronger independent review;
- production: strong independent review, with a final cross-level review when recursion produced multiple layers.

Independent means a separate review call/context. At advanced/production level, do not treat the producer's own self-critique as sufficient.

System-1 may cheaply classify likely critique dimensions or rank suspected problems. It is not the Critic and cannot accept a proposal.

### Review-before-apply invariant

For structure-producing operations:

~~~
derive context
→ produce proposal
→ Critic review
→ revise / needs_input if required
→ deterministic validation
→ apply
~~~

Do not create Product Intent/Ticket children first and critique them afterward.

Existing propose/apply boundaries are useful machinery for this.

### Policy memory

Only policy that describes durable project intent is remembered automatically through explicit state:

- project default completeness;
- Module/Epic/Feature/UserStory completenessTarget.

Critic choice and recursion depth are execution choices and are not silently persisted per artifact.

If later usage proves persistent critic/depth policy useful, add it from evidence rather than preemptively growing the graph.

---

## 4. First-class public operations

### investigate_ticket(ticketId) / ticket.investigate(options)

The MCP/shell operation loads the Ticket and delegates to the Ticket instance.

Make the Ticket as grounded as current evidence allows.

It reads existing state first:

- Ticket fields/lifecycle/claim;
- parent Epic and child Tickets;
- implemented Feature / addressed UserStory;
- blockers and dependencies;
- governing Decisions;
- relevant Lessons;
- applicable Aspects and their work/evidence;
- existing code targets/modifications;
- tests and current verification evidence;
- repository state needed to validate stale anchors.

Then it fills genuine gaps as cheaply as possible:

1. deterministic graph/code lookup;
2. exact language tooling where correctness matters;
3. System-1 triage/ranking where useful;
4. bounded semantic reasoning only for unresolved meaning.

Investigation is semantically read-only.

It may refresh the derived code index/freshness state, but it does not mutate Ticket/Product fields or semantic relations. Any confirmed/proposed enrichments are returned in the dossier and are applied later by prepare_ticket/resolve_ticket while holding the Ticket lease.

It never edits implementation code and never creates child work.

It returns a derived dossier and disposition such as:

~~~
ready
needs_preparation
rejectable
~~~

or the shared control result needs_input / blocked.

A model guess must not silently become a durable semantic relation. Ambiguous product ownership or intent returns needs_input.

### prepare_ticket(ticketId) / ticket.prepare(options)

The MCP/shell operation loads the Ticket and delegates to the Ticket instance.

Make a Ticket executable.

It always starts from investigate_ticket.

If the Ticket is already one coherent executable unit, preparation only fills the minimum missing execution contract.

If it is genuinely too broad or contains independently verifiable work:

~~~
ordinary parent Ticket
       |
     contains
       v
 child Ticket(s)

child B --depends_on--> child A
~~~

There is no SubTask entity and no ManagementTicket type.

A parent remains an ordinary Ticket. Its role is evident from its child relations.

Preparation must be idempotent: rerunning it reuses existing children and relations rather than regenerating a parallel decomposition.

Do not split by arbitrary token/line thresholds. Split only when the work has coherent independently verifiable boundaries.

### resolve_ticket(ticketId) / ticket.resolve(options)

The MCP/shell operation loads the Ticket and delegates to the Ticket instance.

Own the Ticket from current state to a truthful terminal outcome.

Canonical happy path:

~~~
investigate (read-mostly)
    |
claim before first durable preparation/code mutation
    |
prepare if needed
    |
resolve executable leaf work
    |
targeted verification
    |
repair when bounded/reasonable
    |
verify acceptance contract
    |
Done / verified
    |
release + sync
~~~

For a parent Ticket, resolve ready children in dependency order, then verify the parent's own completion contract.

### Lease discipline

Investigation does not require a claim because it does not mutate canonical Ticket/Product semantic state.

Refreshing the derived code index is not a Ticket mutation.

Any operation that may mutate Ticket/Product/code state must hold the relevant Ticket lease before its first mutation.

Standalone prepare_ticket therefore claims the Ticket before applying decomposition/clarification changes.

resolve_ticket claims the parent before preparation, then claims each executable child before mutating that child.

If an operation must return needs_input or blocked for an external caller, release leases it acquired during that call before returning. Do not leave an artifact accidentally locked while waiting for a human/client retry.

An existing active lease by another agent is a temporary operation blocker, not a durable Ticket Blocked state.

Do not implement this as uncontrolled recursion. Build a bounded work set from contains / depends_on, detect cycles, and execute leaves in dependency order.

Expected non-success outcomes:

- needs_input: canonical project state lacks a material fact;
- blocked: a real dependency/environment/lease condition prevents progress;
- rejected: the Ticket is demonstrably duplicate, obsolete, invalid, or already satisfied.

Rejection requires grounded evidence. If the reason is interpretive or product-dependent, return needs_input instead of letting a cheap model discard work.

System/tool failures are errors, not new Ticket lifecycle states.

### Workspace safety

resolve_ticket owns workspace safety before code mutation.

After investigation identifies the likely touched files:

- inspect current Git state;
- unrelated dirty files do not automatically block the Ticket;
- a dirty target file requires explicit permission or returns needs_input;
- capture the current target-file hashes in the normal Causal Change fingerprint before applying edits;
- never clean/reset/stash/commit user work automatically.

The existing snapshot helper is optional insurance, not a correctness boundary.

### process_story(storyId) / story.process(options)

Make an accepted UserStory actionable.

Reconcile against existing work first. Create/reuse addressing Tickets only when implementation work is actually missing.

Do not manufacture extra Tickets to satisfy a hierarchy.

### process_feature(featureId) / feature.process(options)

Make the Feature's next meaningful intent/work layer explicit.

Depending on the capability, this may:

- reuse/create meaningful UserStories;
- create/reuse direct implementation Tickets when ceremonial Stories add no value;
- return needs_input when behavior/scope is materially ambiguous.

### process_epic(epicId) / epic.process(options)

Turn the initiative into the next coherent Product Intent/work layer while reusing stable capabilities.

Typical semantic pass:

~~~
existing Product Intent
      +
Epic intent
      |
      v
reuse/create Feature targets
reuse/create meaningful Story targets
or direct Tickets for genuinely technical work
~~~

It must preserve the existing invariant that an Epic targets durable capabilities; it does not own Features.

Existing propose_epic_structure / apply_epic_structure may be reused internally while useful. They should no longer define the long-term public abstraction.

### Entity-method ownership rule

Artifact operations are not service objects.

- Ticket owns investigate/prepare/resolve behavior tightly coupled to Ticket state and relations.
- Epic, Feature, and UserStory own their process behavior.
- Entity methods may call small cross-entity helpers for mutation validation, ordering, completeness resolution, code/index access, Critic invocation, etc.
- MCP/shell/tool registrations should contain parsing/loading/serialization only.

Do not create TicketService, ArtifactOperationManager, or equivalent wrappers around methods that naturally belong to the entity.

---

## 5. Shared operation control contract

Keep the cross-operation control contract tiny.

Conceptually:

~~~
type OperationResult<T> =
  | { status: 'complete'; artifactId: string; value: T }
  | { status: 'needs_input'; artifactId: string; required: RequiredInput[] }
  | { status: 'blocked'; artifactId: string; blockers: Blocker[] }
~~~

Do not add partial, paused, waiting, resumable, etc. unless a concrete case proves one is necessary.

Operation-specific results carry domain conclusions such as ready, decomposed, verified, or rejected.

### Required input

A missing input must say:

- the question;
- why it materially matters;
- where the durable answer belongs;
- optional bounded choices already known from the graph.

Targets should be constrained to canonical state, for example:

~~~
artifact field: Ticket.acceptanceCriteria
artifact field: Ticket.body
relation: Ticket --implements--> Feature
relation: Ticket --addresses--> UserStory
relation: depends_on / blocks
durable Decision when the answer truly is a project decision
~~~

This is declarative missing state, not an arbitrary "write this JSON path" language.

## 6. Shell and MCP interaction

The same operation implementation serves both.

### Shell

When an operation returns needs_input:

1. show the question/reason;
2. collect the answer interactively;
3. persist it through the ordinary canonical mutation/relation path;
4. retry the same operation.

No hidden conversational continuation is required.

### MCP

Return the same structured needs_input.

The caller may already know the answer from its user/session. It updates the indicated canonical artifact/relation with existing AIWF mutation tools and retries.

If it does not know, it asks its user.

The caller should not have to reconstruct AIWF's investigation or implementation workflow itself.

## 7. Ticket execution contract

A Ticket needs a real completion contract.

Add:

~~~
interface TicketData {
  ...
  acceptanceCriteria?: string[]
}
~~~

This is execution acceptance, not a duplicate of Feature/UserStory product acceptance.

Examples:

- Feature criterion: "Interrupted upload can resume without restarting."
- Ticket criterion: "Resume token is persisted; restart integration test passes; legacy upload path remains green."

Technical Tickets with no Feature/Story still need verifiable completion criteria.

Preparation should add/clarify Ticket acceptance criteria when missing and material.

### Lane/status coherence

Ticket lane is workflow presentation; Ticket status is lifecycle meaning. They must never contradict each other.

Canonical combinations:

~~~
Backlog / Todo   → planned
In Progress      → in_progress
Blocked          → blocked
Done             → verified OR rejected
~~~

A rejected Ticket is terminal: status=rejected, lane=Done.

A temporary operation blocker such as another active lease does not automatically change the Ticket to Blocked. Persist lane=Blocked/status=blocked only for a durable project blocker.

One deterministic Ticket-state owner must enforce these combinations. Artifact operations must not hand-write lane/status pairs.

## 8. Small graph extensions

Only two relation corrections are justified now:

~~~
Ticket   --contains--> Ticket
Decision --governs---> Ticket
~~~

Ticket contains Ticket expresses decomposition without another entity type.

Decision governs Ticket is already part of the documented conceptual model and should be accepted by deterministic Product Intent validation.

Do not add a new predicate.

Do not add Test-verifies-Ticket yet. Verification evidence can be returned/recorded through existing tests, ticket lifecycle, artifacts, and product verification. Add that relation only if real usage proves the graph cannot represent needed evidence cleanly.

## 9. Primitive quality bar

Artifact operations are only as good as their hands.

Before relying on them, the following claims must be true.

### Freshness

aiwf sync must actually reconcile current code/index state as well as projections.

Read/query operations must not repeatedly cause unnecessary persistent rewrites.

One artifact operation should perform one bounded freshness reconciliation and reuse that snapshot.

### Symbol source

get_symbol_source must return the actual symbol body/range when it claims to do so.

A blind fixed line window is not acceptable.

When exact extraction is unavailable, the result must explicitly say it is an excerpt rather than pretend to be exact.

### References / dependencies

The cheap AST graph is discovery evidence.

For TypeScript/JavaScript correctness-sensitive references, use existing TypeScript LSP definitions/references/call hierarchy where applicable.

Do not present heuristic call edges as exact semantic truth.

### Editing

Existing Causal Change operations remain first choice for semantic refactors.

Add the smallest exact symbol-edit capability necessary for ordinary function/method replacement so an AIWF actor does not need to make the external caller supply the old block merely to edit it.

Do not build a general AST editing framework.

## 10. Internal cognition and evidence

The deterministic operation owns lifecycle.

Use the cheapest cognition that can answer the actual question:

1. deterministic evidence/rules;
2. System-1 typed decision when the task is classification/scoring/triage;
3. bounded reasoning LLM when semantic adjudication/synthesis is required;
4. code-capable Actor only when actual implementation generation/tool use is required.

Do not invoke an Actor merely to classify or retrieve.

Autoregressive LLMs remain responsible for:

- actual decomposition boundaries and child-ticket content;
- semantic intent/product relation when System-1 cannot safely narrow it;
- implementation design/code generation;
- difficult failure diagnosis after cheap classification;
- Product Intent decomposition.

Use @dharmax/context-manager to bound evidence passed to an LLM when useful.

Use exact run-local AIWF tool surfaces. System-1 should help select that small surface before an Actor run. A typical leaf implementation actor should see only the few relevant capabilities, not all MCP tools.

No System-1 result becomes canonical graph truth without deterministic confirmation or the stronger semantic path appropriate to that fact.

A useful asymmetry: System-1 may cheaply flag a likely problem and trigger inspection, but terminal success must be proven by deterministic evidence and/or the stronger semantic verifier required by the acceptance criterion.

## 11. Cognition / model policy

Use System-1 aggressively for non-generative semantic decisions, but never confuse cheap classification with engineering authority.

Suggested flow:

~~~
deterministic evidence
      |
      v
System-1 typed assessment
      |
      +-- high-confidence, low-consequence routing decision --> cheap/direct path
      |
      +-- uncertain / broad / consequential ----------------> reasoning LLM
~~~

Examples:

- investigation: System-1 can classify work kind, scope, likely evidence families and reasoning depth;
- preparation: System-1 can cheaply distinguish likely-atomic / likely-decomposable / unclear, but the actual decomposition is generated/reviewed by a reasoning model;
- leaf implementation: System-1 can select likely mechanism/tool family and model tier before the code-capable Actor runs;
- failure repair: System-1 can classify compile/type/test/tool/environment/semantic failure and route the next diagnostic step;
- Story/Feature/Epic processing: System-1 can shortlist reuse candidates and estimate ambiguity/breadth, while the final semantic decomposition uses reasoning-grade cognition;
- final verification remains deterministic wherever possible.

Epic processing should normally use stronger-than-minimal reasoning even when System-1 is confident; the System-1 pass reduces and structures the problem rather than replacing the reasoning pass.

A stronger model should receive a small prepared problem, not compensate for poor retrieval with a giant repository dump.

## 12. Public surface priority

Once proven, shell/MCP/skills should teach callers this order:

~~~
resolve_ticket
prepare_ticket
investigate_ticket
process_epic / process_feature / process_story
~~~

Primitive tools remain available for explicit inspection, debugging and unusual expert control.

Do not remove or hide primitives; they remain the explicit drill-down/escape surface.

## 13. Non-goals

Do not build:

- generic workflow/state-machine infrastructure;
- a second project/product graph;
- a persistent investigation-plan model;
- hidden operation sessions/resume tokens;
- an Insight entity merely to cache reasoning;
- automatic arbitrary model-written graph facts;
- semantic-registry integration without demonstrated need;
- generic multi-language exact refactoring;
- a new context/RAG database;
- external-agent-specific behavior.

## 14. Success criterion

The decisive test is not whether AIWF helps Codex navigate.

It is whether an external agent can hand AIWF a realistic Ticket and mostly stop doing repository archaeology itself:

~~~
resolve_ticket(TKT-X)
      |
      v
AIWF prepares / executes / verifies
      |
      v
complete | needs_input | blocked
~~~

For the same task, AIWF should materially reduce external tool calls/source reads while preserving or improving correctness. Token savings must be measured, not asserted.
