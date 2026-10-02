# Artifact Operations — Implementation Plan

Design authority: docs/artifact-operations.md.

This plan is intentionally staged. Each ticket must be independently useful and green before the next starts.

Start every ticket AIWF-native:

~~~
aiwf sync
→ claim the one active ticket
→ use current AIWF graph/context to locate implementation details
→ read source surgically
→ implement
→ focused tests
→ full gate
→ KISS audit
→ sync + close
~~~

Do not preload a fixed file list.

---

# 1. AIWF-PRIMITIVE-TRUTH

## Goal

Make the low-level operations trustworthy enough to support autonomous artifact resolution.

Do not build artifact operations yet.

## Work

1. Make aiwf sync reconcile changed code/index state as well as Markdown projections.
2. Remove unnecessary write behavior from repeated read/query freshness checks, especially unchanged external dependency indexing.
3. Make freshness reusable within one higher-level operation rather than forcing every primitive to perform a full independent refresh.
4. Fix get_symbol_source so "exact symbol source" is actually exact; otherwise explicitly return an excerpt.
5. For TS/JS correctness-sensitive definitions/references/callers, use existing TS LSP facilities where appropriate; retain cheap graph facts for broad discovery.
6. Add one small exact symbol replacement/change primitive through the existing Causal Change safety path if current primitives cannot replace a known function/method without the caller supplying its old body.

No general editing framework.

## Acceptance

Benchmark on the AIWF repository:

- locate a known symbol;
- return its exact source;
- find exact TS references;
- inspect dependencies;
- perform an existing rename/refactor;
- replace one known function/method in a disposable worktree;
- run its targeted test.

Record wall time, result size and whether any "read" caused graph rewrites/lock warnings.

Gate:

~~~bash
bun run typecheck
bun test
~~~

Then method-by-method KISS review.

---

# 2. AIWF-TICKET-INVESTIGATION

## Goal

Introduce the shared artifact-operation contract and implement investigate_ticket only.

This is deliberately read-mostly and is the safest proof of the new abstraction.

## Domain corrections

Add only what investigation/preparation demonstrably need:

- Ticket.acceptanceCriteria?: string[];
- allow Decision --governs--> Ticket.

Do not add child Tickets yet unless Ticket 3 requires them.

## Operation contract

Implement only:

~~~
complete
needs_input
blocked
~~~

with operation-specific disposition inside complete.

No persisted operation state.

## Investigation behavior

For one Ticket:

1. perform one freshness reconciliation;
2. collect existing graph/product/work/code/test/decision/lesson evidence;
3. validate stale code anchors;
4. deterministically fill exact missing facts where safe;
5. use bounded semantic reasoning only when necessary;
6. persist only confirmed canonical facts;
7. return a compact dossier with provenance and one disposition:
   - ready;
   - needs_preparation;
   - rejectable.

Ambiguous semantic ownership returns needs_input.

No child Ticket creation.
No implementation code mutation.
No lane movement merely because investigation ran.

## Shell/MCP

Expose the same structured tool.

Shell may interactively satisfy needs_input, persist canonical state, and retry.

MCP returns required inputs; caller updates ordinary artifact fields/relations and retries.

## Acceptance cases

At minimum:

- already-well-grounded Ticket: mostly graph reads, no semantic call if unnecessary;
- stale/missing code target: repaired exactly;
- ambiguous Feature/Story ownership: needs_input, no guessed relation;
- duplicate/already-satisfied Ticket: grounded rejectable;
- technical Ticket with missing completion contract: asks for or derives Ticket acceptance criteria.

Gate with typecheck/tests + KISS audit.

Stop here and inspect real output before Ticket 3.

---

# 3. AIWF-TICKET-PREPARATION

## Goal

Implement prepare_ticket and ordinary Ticket decomposition.

## Graph change

Add exactly:

~~~
Ticket --contains--> Ticket
~~~

No SubTask/ManagementTicket/Plan entity.

## Behavior

prepare_ticket:

1. calls/uses the same investigation owner;
2. returns immediately when the Ticket is already executable;
3. clarifies missing material requirements through needs_input;
4. when decomposition is genuinely useful, proposes a small coherent set of child Tickets;
5. gives every executable child a clear body + Ticket acceptance criteria;
6. connects children to relevant Epic/Feature/Story/code context;
7. adds depends_on only for real ordering constraints;
8. applies graph changes through the existing Product Intent/Causal Change mutation path;
9. is idempotent on rerun.

Do not split based on token count or arbitrary maximum size.

## Acceptance

Cases:

- atomic ticket remains atomic;
- large cross-cutting ticket becomes 2–4 meaningful children;
- technical ticket decomposes without fake Stories;
- rerun produces zero duplicate children;
- ambiguous split returns needs_input;
- child dependency cycle is rejected.

Gate + KISS audit.

---

# 4. AIWF-TICKET-RESOLUTION-FIRST-PROOF

## Goal

Make resolve_ticket finish a realistic prepared Ticket from start to verified completion.

Do not redesign the whole shell actor.

## Deterministic lifecycle

The operation owns:

~~~
investigate
→ prepare when required
→ claim
→ execute ready leaf work
→ verify
→ bounded repair
→ verify acceptance
→ mark verified/Done
→ release
→ sync
~~~

For parents, build a bounded child work set, topologically order real dependencies, resolve executable leaves, then verify parent acceptance.

Do not use uncontrolled recursive agent calls.

## Cognition

For each leaf:

- gather bounded evidence with @dharmax/context-manager where useful;
- use an exact small run-local AIWF tool set;
- use Asker/LLMActor from llm-utils;
- choose/escalate model by actual task complexity/blast;
- prefer deterministic refactor/edit/test primitives.

Do not require LLMPipeline, LLMSession, or semantic-registry.

If one of those demonstrably makes the implementation smaller during this ticket, document the evidence before adopting it.

## Failure/control behavior

- missing semantic fact → needs_input;
- real external/dependency/lease blocker → blocked;
- demonstrably obsolete/duplicate/already-satisfied ticket → verified rejection with evidence;
- tool/runtime failure → operation error, not a fake project status.

Never mark Done if Ticket acceptance criteria are not explicitly verified.

## Acceptance

Use several real tickets, including:

1. one surgical code fix;
2. one function-level implementation/change;
3. one safe TS refactor;
4. one prepared parent with dependent children;
5. one case requiring user input;
6. one failing-test repair loop.

For each record:

- external caller tool calls;
- source reads performed by external caller;
- AIWF internal tool calls;
- model usage/tokens where measurable;
- verification evidence.

Gate + adversarial KISS audit.

---

# 5. AIWF-PRODUCT-PROCESSING

## Goal

Add:

~~~
process_story
process_feature
process_epic
~~~

using the same operation-result and needs_input contract.

## Rules

### Story

Reconcile existing work first, then create/reuse only necessary addressing Tickets.

### Feature

Create/reuse meaningful Stories when they clarify observable behavior; direct Tickets remain valid when Stories would be ceremony.

### Epic

Reuse stable Features/Stories. Technical Epics may produce direct Tickets.

Preserve:

~~~
Epic --targets--> Feature/UserStory
Epic --contains--> Ticket
~~~

Never revert to Epic owning Features.

Existing Epic proposal/apply code should be reused or simplified into internal machinery; avoid two competing semantic decomposition paths.

## Model policy

Product processing normally receives stronger reasoning than mechanical ticket investigation.

Epic processing in particular should use:

1. deterministic current Product Intent retrieval;
2. bounded extraction/reuse candidate pass;
3. reasoning-grade decomposition;
4. coherence/reuse review;
5. escalation when ambiguity, breadth or disagreement warrants it.

No model tier is trusted merely because it returned valid JSON.

## Acceptance

Use realistic cases proving:

- Feature reuse;
- Story reuse;
- technical Epic with no fake Story;
- Story → useful Tickets;
- ambiguity → needs_input;
- rerun idempotence;
- no duplicate intent/work entities;
- Product Coverage/Impact remains coherent.

Gate + KISS audit.

---

# 6. AIWF-PRIMARY-INTERFACE

## Goal

Only after the artifact operations are proven, make them AIWF's first-choice shell/MCP/skill interface.

## Work

1. Shell help/normal language flow prioritizes:
   - resolve_ticket;
   - prepare_ticket;
   - investigate_ticket;
   - process_epic/feature/story.
2. Canonical installed skill tells external coding agents to delegate artifact work first.
3. Existing primitives remain exposed as drill-down/debug/expert operations.
4. Measure whether the old bucket-router/WorkflowActor path is now redundant.
5. Remove/replace it only if the new operations cover its real responsibilities more simply.

Do not introduce semantic-registry merely to replace the router. Evaluate it only if a real remaining dynamic-discovery problem exists.

## Final acceptance: external-agent A/B

Repeat a known historical engineering ticket from a pre-change commit/worktree.

A: external coding agent works normally with repository/tool access.

B: same model begins with resolve_ticket and uses primitives only if AIWF returns a genuine gap.

Compare:

- task correctness;
- external paid input/output tokens;
- external tool calls;
- external source reads;
- total latency;
- AIWF local/cheap model use;
- manual intervention.

Claim paid-token savings only from measured data.

---

# Global rejection criteria

Stop and simplify if implementation introduces:

- generic workflow/state-machine machinery;
- a second project/product model;
- operation session tables/resume tokens;
- duplicate context/vector/search subsystem;
- hidden LLM writes to graph semantics;
- broad tool catalogs rendered to every actor step;
- arbitrary decomposition thresholds;
- new entities/predicates without a concrete acceptance case;
- complex code for an operation whose domain behavior is simple.

A simple artifact lifecycle must look simple in code.
