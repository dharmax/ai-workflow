# Artifact Operations — Design

Status: authoritative target design for the next AIWF phase.

## 1. Purpose

AIWF should not make an expensive external coding agent orchestrate dozens of low-level engineering tools.

The primary public interface should operate on durable engineering artifacts:

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

### No "context pack" as the product abstraction

@dharmax/context-manager is useful internally for selecting, budgeting and rendering evidence.

The public abstraction is artifact investigation/resolution, not "give the caller context so it can do AIWF's job".

### No Insight/Investigation entity yet

Investigation persists canonical durable facts where they belong:

- graph relations;
- exact code anchors;
- acceptance criteria;
- Decisions when there is a real durable decision;
- Lessons when there is a real reusable lesson/trap.

The investigation dossier itself is derived output. Do not create a shadow narrative state model merely to cache an LLM answer.

## 3. First-class public operations

### investigate_ticket(ticketId)

Make the Ticket as grounded as current evidence allows.

It reads existing state first:

- Ticket fields/lifecycle/claim;
- parent Epic and child Tickets;
- implemented Feature / addressed UserStory;
- blockers and dependencies;
- governing Decisions;
- relevant Lessons;
- existing code targets/modifications;
- tests and current verification evidence;
- repository state needed to validate stale anchors.

Then it fills genuine gaps as cheaply as possible:

1. deterministic graph/code lookup;
2. exact language tooling where correctness matters;
3. bounded semantic reasoning only for unresolved meaning.

It may persist confirmed canonical facts. It never edits implementation code and never creates child work.

It returns a derived dossier and disposition such as:

~~~
ready
needs_preparation
rejectable
~~~

or the shared control result needs_input / blocked.

A model guess must not silently become a durable semantic relation. Ambiguous product ownership or intent returns needs_input.

### prepare_ticket(ticketId)

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

### resolve_ticket(ticketId)

Own the Ticket from current state to a truthful terminal outcome.

Canonical happy path:

~~~
investigate
    |
prepare if needed
    |
claim
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

### process_story(storyId)

Make an accepted UserStory actionable.

Reconcile against existing work first. Create/reuse addressing Tickets only when implementation work is actually missing.

Do not manufacture extra Tickets to satisfy a hierarchy.

### process_feature(featureId)

Make the Feature's next meaningful intent/work layer explicit.

Depending on the capability, this may:

- reuse/create meaningful UserStories;
- create/reuse direct implementation Tickets when ceremonial Stories add no value;
- return needs_input when behavior/scope is materially ambiguous.

### process_epic(epicId)

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

## 4. Shared operation control contract

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

## 5. Shell and MCP interaction

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

## 6. Ticket execution contract

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

## 7. Small graph extensions

Only two relation corrections are justified now:

~~~
Ticket   --contains--> Ticket
Decision --governs---> Ticket
~~~

Ticket contains Ticket expresses decomposition without another entity type.

Decision governs Ticket is already part of the documented conceptual model and should be accepted by deterministic Product Intent validation.

Do not add a new predicate.

Do not add Test-verifies-Ticket yet. Verification evidence can be returned/recorded through existing tests, ticket lifecycle, artifacts, and product verification. Add that relation only if real usage proves the graph cannot represent needed evidence cleanly.

## 8. Primitive quality bar

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

## 9. Internal cognition and evidence

The deterministic operation owns lifecycle.

LLMs own only judgments that cannot be deterministic:

- whether a broad Ticket has coherent separable work;
- semantic intent/product relation when not explicit;
- implementation design/code generation;
- difficult failure diagnosis;
- Product Intent decomposition.

Use @dharmax/context-manager to bound evidence passed to a model when useful.

Use exact run-local AIWF tool surfaces. A typical leaf implementation actor should see only the few relevant capabilities, not all MCP tools.

## 10. Model policy

Do not equate every semantic operation with the cheapest available model.

Use task class + escalation:

- investigation: deterministic first; cheap/local semantic pass when needed;
- ticket preparation: moderate reasoning; escalate for broad/cross-cutting decomposition;
- leaf implementation: code-capable model selected by complexity/blast;
- Story/Feature processing: reasoning-grade when semantics are nontrivial;
- Epic processing: normally stronger-than-minimal reasoning, with escalation for broad impact, ambiguity, conflicting evidence, or weak first-pass confidence;
- final verification remains deterministic wherever possible.

A stronger model should receive a small prepared problem, not compensate for poor retrieval with a giant repository dump.

## 11. Public surface priority

Once proven, shell/MCP/skills should teach callers this order:

~~~
resolve_ticket
prepare_ticket
investigate_ticket
process_epic / process_feature / process_story
~~~

Primitive tools remain available for explicit inspection, debugging and unusual expert control.

Do not remove or hide primitives during the first proof.

## 12. Non-goals

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

## 13. Success criterion

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
