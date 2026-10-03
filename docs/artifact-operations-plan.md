# Artifact Operations — Implementation Plan

Design authority: docs/artifact-operations.md.

This plan is intentionally staged. Each ticket must be independently useful and green before the next starts.

## External shared capability gate

System-1 infrastructure is owned by @dharmax/llm-utils, not AIWF.

AIWF must not duplicate ai-cli's Laya wrapper.

The separate llm-utils ticket LLMUTILS-SYSTEM1 provides the shared typed System-1 contract/adapters. AIWF-PRIMITIVE-TRUTH can proceed independently, but AIWF-TICKET-INVESTIGATION must not implement its own Laya wrapper if that shared gate is not yet available.

First-class Aspects are a separate AIWF-owned gate defined in `docs/aspects.md` / `docs/aspects-plan.md`. Complete `AIWF-ASPECTS` after `AIWF-OPERATION-POLICY` and before `AIWF-TICKET-INVESTIGATION`, because investigation/preparation/resolution consume applicable Aspect context.

Start every ticket AIWF-native:

~~~
aiwf sync
→ ensure/reuse the named plan ticket
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

# 2. AIWF-OPERATION-POLICY

## Goal

Implement the small cross-cutting policy substrate before any structure-producing artifact operation.

Do not implement ticket investigation/preparation/resolution yet.

## Completeness target

Add:

~~~
type CompletenessLevel = 'poc' | 'functional' | 'advanced' | 'production'
~~~

Add optional completenessTarget to:

- Module;
- Epic;
- Feature;
- UserStory.

Do not persist completenessTarget on Ticket. Ticket completion remains its explicit acceptance contract; inherited/run completeness may cause additional work to be created without reopening historical verified Tickets.

Add project config defaultCompletenessTarget.

Add deterministic helpers/tools:

~~~
set_completeness_target(entityId, level | null)
get_completeness_target(entityId)
resolve_effective_completeness(entityId, override?)
~~~

Implement only the constrained inheritance rules from the design. No generic policy traversal.

Tests must prove:

- explicit operation override wins for the root artifact;
- an explicit descendant target wins over recursively inherited run completeness;
- explicit artifact target wins over ordinary inherited target;
- Story inherits strictest containing Feature target;
- Ticket effective target is derived from current run override + containing Epic/implemented Feature/addressed Story/targeted Module + project default; no Ticket target is stored;
- Feature does not inherit from targeting Epic;
- project default is final fallback;
- explicit lower artifact target can deliberately override stricter inherited work;
- clearing explicit target restores inheritance/default behavior.

Do not persist achieved/current completeness.

## Operation options

Define one small shared ArtifactOperationOptions contract:

~~~
completeness?: CompletenessLevel
depth?: number | 'all'
maxArtifacts?: number
critic?: ArtifactCritic | 'auto' | 'none'
~~~

Transport-facing MCP/shell schemas use critic IDs rather than executable objects.

Every artifact-operation result later must report its resolved effective policy and source.

## Depth semantics

Implement/validate the depth value and shared accounting rules only.

No recursion engine.

Depth counts artifact-expansion/decomposition edges:

- 0 = current artifact only;
- 1 = immediate next artifact layer;
- N = N expansion edges;
- all = no user depth cap, still bounded by real graph/safety constraints.

Add one simple maxArtifacts guard (project default + operation override) so shallow-but-wide work cannot explode. Reaching it reports remaining work and must not mark the root complete. No generic cost/budget framework in this phase.

## Critic contract

Add the small read-only ArtifactCritic interface and CriticResult types.

Do not build a registry/plugin framework.

Provide only the smallest resolver needed for transport-level IDs, backed by injected/configured critics.

At this gate, critic tests use injected fake critics. The first real AI critic is earned by Ticket 4 when there is a real proposal to review.

## Derived completeness

Define the CompletenessAssessment result shape, but do not pretend structural Coverage proves semantic maturity.

At this gate it may compose deterministic Product Coverage + known policy facts only. After `AIWF-ASPECTS`, completeness assessment also consumes AspectAssessment. Semantic gap discovery arrives with later operations/Critics.

## Acceptance

Run:

~~~bash
bun run typecheck
bun test
~~~

Then KISS audit the policy implementation.

Reject if it introduces:

- generic policy engines;
- persistent current-completeness state;
- arbitrary graph inheritance;
- critic registry/plugin infrastructure;
- recursion framework;
- hard-coded model names.

---

# 3. AIWF-TICKET-INVESTIGATION

## Goal

Introduce the shared artifact-operation contract and implement investigate_ticket only.

This is deliberately read-mostly and is the safest proof of the new abstraction.

Consume the shared llm-utils System-1 primitive here, because investigation is where cheap semantic triage can be proven without granting mutation authority.

## Domain corrections

Add only what investigation/preparation demonstrably need:

- Ticket.acceptanceCriteria?: string[];
- allow Decision --governs--> Ticket;
- centralize coherent Ticket lane/status transitions:
  - Backlog/Todo → planned;
  - In Progress → in_progress;
  - Blocked → blocked;
  - Done → verified or rejected.

Fix the current Blocked→planned behavior.

Do not add child Tickets yet; Ticket 4 introduces decomposition.

## Operation contract

Implement only:

~~~
complete
needs_input
blocked
~~~

with operation-specific disposition inside complete.

No persisted operation state.

## System-1 assessment

Use the llm-utils System-1 primitive. AIWF owns only its question set, confidence/escalation policy and compact-state builder.

Given a compact Ticket state (intent + acceptance criteria + a bounded candidate/fact list), batch a small typed assessment such as:

- work_kind: bug_fix | refactor | feature_work | test_work | docs_config | mixed;
- scope: single_symbol | single_file | multi_file | cross_subsystem | unclear;
- preparation: likely_atomic | likely_split | unclear;
- reasoning_depth: direct | moderate | deep;
- needs_product_context: yes/no probability;
- needs_code_context: yes/no probability;
- needs_test_context: yes/no probability.

Use the answers to choose what evidence to retrieve, which candidates survive, which small tool family is likely relevant, and whether to escalate.

Rules:

- unavailable System-1 → ordinary bounded path;
- low confidence → ordinary bounded path;
- contradiction with deterministic graph/code evidence → ignore/escalate;
- never persist a graph relation or terminal Ticket state from System-1 alone;
- batch questions at one decision point rather than scattering classifier calls.

Also apply System-1 after deterministic retrieval to a bounded shortlist of optional candidate symbols/files/Decisions/Lessons/tests/Product Intent entities. Explicit graph neighbors and other deterministically mandatory evidence always survive. Prefer conservative ranking/top-N retention; System-1 may remove only optional low-relevance candidates from model context, never from canonical graph state.

Expose timing, raw probabilities/distributions, candidate counts before/after pruning, and escalation outcome in debug/metrics output so usefulness can be measured.

## Investigation behavior

For one Ticket:

1. perform one freshness reconciliation;
2. collect existing graph/product/work/code/test/decision/lesson evidence;
3. run the compact System-1 assessment to prioritize missing evidence;
4. validate stale code anchors;
5. derive exact/semantic enrichment candidates with provenance;
6. use bounded autoregressive reasoning only when System-1/deterministic evidence is insufficient;
7. return a compact dossier with proposed enrichments and one disposition:
   - ready;
   - needs_preparation;
   - rejectable.

Ambiguous semantic ownership returns needs_input.

No child Ticket creation.
No Ticket/Product semantic mutation.
No implementation code mutation.
No lane movement merely because investigation ran.

Derived code-index freshness may update because it is not canonical Ticket/Product state.

## Shell/MCP

Expose the same structured tool.

Shell may interactively satisfy needs_input, persist canonical state, and retry.

MCP returns required inputs; caller updates ordinary artifact fields/relations and retries.

## Acceptance cases

At minimum:

- already-well-grounded Ticket: mostly graph reads, no autoregressive semantic call if unnecessary;
- System-1 high-confidence routing correctly avoids irrelevant evidence families;
- bounded candidate pruning keeps the actually relevant artifact(s);
- low-confidence System-1 cleanly escalates rather than guessing;
- contradictory deterministic evidence overrides/escalates System-1;
- System-1 unavailable: behavior remains correct;
- stale/missing code target: repaired exactly;
- ambiguous Feature/Story ownership: needs_input, no guessed relation;
- duplicate/already-satisfied Ticket: grounded rejectable;
- technical Ticket with missing completion contract: asks for or derives Ticket acceptance criteria;
- explicit applicable Aspect is present in the dossier and cannot be pruned by System-1.

Gate with typecheck/tests + KISS audit.

Stop here and inspect real output before Ticket 4.

---

# 4. AIWF-TICKET-PREPARATION

## Goal

Implement prepare_ticket and ordinary Ticket decomposition, including the first real proposal Critic path.

## Graph change

Add exactly:

~~~
Ticket --contains--> Ticket
~~~

No SubTask/ManagementTicket/Plan entity.

## Behavior

prepare_ticket:

1. calls/uses the same semantically read-only investigation owner;
2. uses the existing System-1 assessment as a cheap atomic-vs-split/escalation hint;
3. returns immediately when no canonical enrichment or decomposition is needed and the Ticket is already executable;
4. claims the Ticket before the first durable preparation mutation;
5. applies confirmed investigation enrichments through the canonical Product Intent/Causal Change path;
6. clarifies missing material requirements through needs_input;
7. when decomposition is genuinely useful, asks a reasoning model to propose a small coherent set of child Tickets;
8. gives every executable child a clear body + Ticket acceptance criteria;
9. connects children to relevant Epic/Feature/Story/code context;
10. adds depends_on only for real ordering constraints;
11. applies graph changes through the existing Product Intent/Causal Change mutation path;
12. releases any lease acquired by this call before returning needs_input/blocked;
13. is idempotent on rerun.

System-1 never invents child tickets or decomposition text.

## Critic flow

Before applying any generated child-ticket batch:

~~~
proposal
→ selected Critic
→ accept | revise | needs_input | reject
→ deterministic validation
→ apply
~~~

Implement one real built-in independent AI critic behind the ArtifactCritic contract, selected through critic=auto for the normal path.

Critic policy depends on effective completeness but remains overridable by an explicit critic ID/object.

Bound revision attempts. Critic failure/non-convergence must not silently downgrade the requested completeness.

Acceptance must include:

- critic catches an omitted child required by the target;
- critic catches duplicate/redundant child work;
- critic catches ceremonial decomposition;
- critic requests revision and producer converges;
- critic needs_input flows through the normal interaction contract;
- critic=none explicitly bypasses only the critic, not deterministic validation;
- custom injected critic is honored.

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

# 5. AIWF-TICKET-RESOLUTION-FIRST-PROOF

## Goal

Make resolve_ticket finish a realistic prepared Ticket from start to verified completion.

Do not redesign the whole shell actor.

## Deterministic lifecycle

The operation owns:

~~~
investigate
→ claim before first mutation
→ prepare when required
→ execute ready leaf work
→ verify
→ bounded repair
→ verify acceptance
→ mark verified/Done
→ release
→ sync
~~~

For parents, build a bounded child work set, topologically order real dependencies, resolve executable leaves, then verify parent acceptance.

Lease each child before mutating it. If another agent owns an active lease, return a temporary blocked result; do not mutate that child's lifecycle and do not leave newly acquired leases behind on needs_input/blocked returns.

Do not use uncontrolled recursive agent calls.

## Cognition

For each leaf:

- deterministically gather a bounded candidate set;
- use System-1 to prune candidate evidence and classify likely change mechanism, scope and reasoning depth;
- pack the surviving evidence with @dharmax/context-manager where useful;
- use that assessment to choose an exact small run-local AIWF tool set and model tier;
- use Asker for semantic/code synthesis that needs no tools;
- use LLMActor only when implementation genuinely needs tool interaction;
- prefer deterministic refactor/edit/test primitives.

On a failed verification pass, System-1 may cheaply classify the failure family (compile/type/test assertion/tool/environment/semantic/unknown) before the next diagnostic step. It does not decide that the Ticket is fixed.

Do not require LLMPipeline, LLMSession, or semantic-registry.

If one of those demonstrably makes the implementation smaller during this ticket, document the evidence before adopting it.

## Failure/control behavior

- missing semantic fact → needs_input;
- real external/dependency/lease blocker → blocked;
- demonstrably obsolete/duplicate/already-satisfied ticket → verified rejection with evidence;
- tool/runtime failure → operation error, not a fake project status.

Never mark Done if Ticket acceptance criteria are not explicitly verified.

Before code mutation, inspect Git state after target discovery. By default, a dirty target file returns needs_input; unrelated dirty files may remain. Never reset/stash/commit user changes automatically.

## Acceptance

Use several real tickets, including:

1. one surgical code fix;
2. one function-level implementation/change;
3. one safe TS refactor;
4. one prepared parent with dependent children;
5. one case requiring user input;
6. one failing-test repair loop;
7. one dirty unrelated file that does not block;
8. one dirty target file that safely returns needs_input.

For each record:

- external caller tool calls;
- source reads performed by external caller;
- AIWF internal tool calls;
- model usage/tokens where measurable;
- verification evidence.

Gate + adversarial KISS audit.

---

# 6. AIWF-PRODUCT-PROCESSING

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

## Completeness / depth / critic behavior

process_story / process_feature / process_epic all accept the shared operation policy.

- completeness controls semantic breadth/thoroughness, not item counts;
- depth controls how many artifact levels are recursively processed;
- critic reviews each generated batch before apply;
- advanced/production with depth > 1 gets a final root-level cross-layer critic review;
- raising completeness fills missing work idempotently rather than regenerating existing structure;
- lowering completeness never deletes already-valid structure.

Acceptance must include a POC→production upgrade on an existing artifact with no duplicate Stories/Tickets, including newly material Aspect gaps when appropriate.

## Model policy

Product processing normally receives stronger reasoning than mechanical ticket investigation.

Epic processing in particular should use:

1. deterministic current Product Intent retrieval;
2. System-1 to classify technical-vs-behavioral shape, breadth/ambiguity, and shortlist likely reusable candidates from a bounded candidate set;
3. reasoning-grade decomposition over that reduced evidence;
4. coherence/reuse review;
5. escalation when ambiguity, breadth or weak confidence warrants it.

System-1 may shortlist Product Intent candidates; it may not create/reuse/link one as canonical truth by itself.

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

# 7. AIWF-PRIMARY-INTERFACE

## Goal

Only after the artifact operations are proven, make them AIWF's first-choice shell/MCP/skill interface.

## Work

1. Shell/MCP expose the policy controls consistently:
   - --completeness / completeness;
   - --depth / depth;
   - --max-artifacts / maxArtifacts;
   - --critic / critic;
   - explicit remember/set-completeness operation rather than silently persisting run overrides.
2. Shell help/normal language flow prioritizes:
   - resolve_ticket;
   - prepare_ticket;
   - investigate_ticket;
   - process_epic/feature/story.
3. Canonical installed skill tells external coding agents to delegate artifact work first.
4. Existing primitives remain exposed as drill-down/debug/expert operations.
5. Measure whether the old bucket-router/WorkflowActor path is now redundant.
6. Remove/replace it only if the new operations cover its real responsibilities more simply.

Do not introduce semantic-registry merely to replace the router. Evaluate it only if a real remaining dynamic-discovery problem exists.

## Final acceptance: external-agent A/B

Repeat a known historical engineering ticket from a pre-change commit/worktree.

A: external coding agent works normally with repository/tool access.

B: same model begins with resolve_ticket and uses primitives only if AIWF returns a genuine gap.

Compare:

- task correctness;
- System-1 decisions, confidence, latency and how many autoregressive calls they avoided or escalated;
- evidence candidates before/after System-1 pruning;
- false-prune rate on optional artifacts later proven necessary;
- proof that mandatory graph evidence is never pruned;
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

---

## Separate deferred metrics feature

Performance telemetry is deliberately not implemented inside these artifact-operation tickets.

The separate cross-package feature is documented in:

- `docs/performance-metrics.md`
- `docs/performance-metrics-plan.md`
- `@dharmax/llm-utils/docs/performance-metrics.md`
- `@dharmax/llm-utils/docs/performance-metrics-plan.md`

Implement it after the artifact-operation core is proven, except for lightweight debug counters already required by acceptance tests.