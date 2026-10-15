# AIWF Architecture

This document describes the durable architecture of AIWF: what owns what, how work flows through the system, and which boundaries must remain simple. It is intentionally about current architectural truth rather than the history of how the design was reached.

**Design authority / target:** [Dharmax-way design](../plans/AIWF-DHARMAX-WAY-DESIGN.md). **Staged implementation:** [plan](../plans/AIWF-DHARMAX-WAY-PLAN.md). This document distinguishes pushed/current behavior from future target behavior. A plan is not proof of implementation or Gate 5 acceptance.

## 1. What AIWF owns

AIWF turns product and engineering intent into verified repository changes while preserving the evidence needed to explain what happened.

Its durable state is the **project repository plus semantic graph**. The graph is backed by `@dharmax/semantika`. Human-readable Markdown projections are views of that state, not a competing database.

The important consequence is re-entrancy: another human or agent should be able to resume work from repository + graph state without reconstructing a hidden conversation.

AIWF does not own everything in the ecosystem. In particular:

- `llm-utils` owns model/provider routing and general Actor machinery.
- `@dharmax/semantic-registry` owns semantic discovery of executable capabilities.
- `@dharmax/skill-manager` owns skill lifecycle, discovery, activation and execution.
- language/LSP and change packages own exact source operations.
- AIWF composes these around its product/work graph and engineering lifecycle.

If AIWF starts reimplementing one of those responsibilities, that is normally an architectural defect.

## 2. Product intent and work

The governing relationship is **not** an immutable hierarchy or a mandate to generate artifacts mechanically:

```text
Developer intent → Goals / Concepts / Features / authoritative Aspects
                 → complete User/Actor Stories (Intent, State, Action, Result)
                 → reviewed Epic (delivery grouping), Tickets and Story tests
                 → Architecture / execution Flow / Implementation
                 → observed public behavior and current evidence
```

Corrections may flow backward to existing definitions. Feature = product functionality. Epic = delivery organization. Ticket = bounded engineering action. Product `Flow` is an existing optional entity for larger actor journeys; it is not the engineering call-flow analysis. Pure technical maintenance can use a direct Ticket grounded in existing behavior without a fabricated product hierarchy.

An **Aspect** is one authoritative reusable policy, e.g. Persistency, applied explicitly to supported artifacts. Consumers obtain applicable policy via graph relationships rather than copying its text; changing it exposes exact known dependents and honest uncertainty, not an automatic project rewrite. Rules continue to govern engineering action separately.

**Current pushed model:** Goal/Concept/Flow/Feature/Aspect/UserStory/Epic/Ticket/TestNode already exist. Legacy Story fields (`actor`, `story`, `context`, `acceptanceCriteria`) do not yet enforce complete scenario form. Current `processIntent()` applies critic-approved proposals without a separate developer acceptance step. Canonical product-edit atomicity, complete Story testing and UI editing are staged corrections, not present-tense claims. See S1–S5 of the plan.

## 3. Artifact operations

High-level artifact operations are AIWF's normal engineering interface.

### Investigate

Investigation gathers the smallest evidence set needed to understand the artifact: relevant intent, decisions, exact source targets, dependencies, tests and prior proof. It should use graph/index/language machinery before broad repository reading.

The output is a bounded dossier with provenance. Missing material evidence remains explicit.

### Prepare

Preparation resolves only what is missing for safe execution. It may clarify acceptance, identify exact targets or establish an implementation mechanism. It should not rewrite an already adequate Ticket into a larger plan.

### Resolve

Resolution owns the engineering lifecycle:

```text
investigate → prepare if necessary → implement → test → bounded repair → independent verify
```

A resolution may reuse still-valid proof when the acceptance contract and relevant inputs have not materially changed. Changed source, tests, intent or obligations invalidate stale proof.

### Process

The current Epic/Feature/Story processor expands bounded candidate work; its current auto-application is a known product defect relative to Dharmax-way. The target is inert, editable AI proposals followed by explicit developer-approved canonical mutation. Depth and breadth remain bounded. Artifact count is never completeness.

## 4. Evidence and verification

AIWF distinguishes structural graph coverage, intended Story behavior and **currently observed** Story results. A complete relationship graph is not behavioral acceptance.

The ordinary test is derived from an accepted User/Actor Story: establish its actual initial state, perform the action through a real public interface, and assert observable result and material exceptions/Aspects. Keep the Story's related outcomes together. An exceptional isolated unit test is justified by a genuinely complex mechanism (e.g. cross-process atomic batch). Raw internal pass counts never prove the product.

The planned lifecycle is: accepted Story → runnable test (skipped only before its work begins) → activate and establish expected red → guarded implementation → real green → independent current acceptance. Existing implemented work may be verified as it stands; do not invent a historical red phase. This lifecycle is **target** until stages S4–S7 pass.

A model saying “done” is not evidence. A generated test cannot certify its own behavioral oracle. Verification should inspect authored acceptance and material product obligations independently of the implementation attempt.

Verification receipts are reusable only while their contract and relevant source/evidence hashes remain valid.

Failures are first-class evidence. A failed test, missing target, malformed skill or unavailable verifier must remain observable rather than collapsing into “not found” or success.

## 5. Safe change

All concrete mutations use one safe change path.

The change layer owns preview/apply semantics, fingerprints, exact targets and deterministic language operations. Product-graph mutations and source mutations may differ in representation, but neither should bypass validation merely because an LLM proposed them.

Prefer exact operations:

- replace/rename a known symbol;
- replace exact text;
- create or rename a known file;
- language-server quick fixes/refactors;
- product graph links or field changes.

Do not introduce a second mutation engine for generated code.

Dirty target files require explicit authorization. AIWF does not silently overwrite unrelated user work and does not automatically commit engineering changes.

## 6. Source synthesis

Source synthesis exists for the part that is genuinely generative: producing candidate source when the intended behavior and exact target are already grounded.

The boundary is deliberately narrow:

```text
investigated Ticket dossier
        ↓
bounded synthesis context
        ↓
source synthesizer
        ↓
candidate source
        ↓
ordinary safe change
        ↓
real tests + independent verification
```

The dossier is the authoritative synthesis evidence. The synthesizer does not perform a second hidden repository investigation and does not invent a target. If there is no exact justified target, synthesis blocks.

The synthesizer returns source, not mutation strategy. `Ticket.resolve()` decides how that source becomes an ordinary change such as `replace_symbol`.

Deterministic changes bypass synthesis entirely.

## 7. Actor and cognition

The Actor is a reasoning layer over a dependable execution substrate, not a replacement for that substrate.

A natural-language request should lead to the simplest useful tactic:

```text
goal
 ↓
bounded evidence / semantic discovery
 ↓
adequate reasoning
 ├─ answer directly
 ├─ use one or a few capabilities
 ├─ discover a missing capability
 ├─ inspect/execute in the environment
 └─ perform deterministic computation where useful
 ↓
observe and replan
 ↓
grounded outcome or concrete blocker
```

No single mechanism defines “sophisticated”. Compilation, a stronger model, shell execution or more tools are possible means, not goals.

### Capability discovery

The Actor begins with a small dependable surface. `@dharmax/semantic-registry` selects a bounded set of relevant functions and may perform targeted recovery for a missing capability.

A semantic miss must **not** expose the entire global registry. Tool abundance is not intelligence.

### System-1

Cheap/System-1 assessment may classify or advise tactics. It is advisory. Low-confidence or unavailable System-1 should degrade gracefully rather than blocking the Actor or forcing a mechanism.

### Models

Model adequacy matters, but AIWF does not own vendor routing. `llm-utils` resolves configured task routes, providers, fallback and model advice. AIWF may request an appropriate task class or reasoning level; it should not grow another router.

Runtime observations should report what actually executed, not infer success from configured credentials or model names.

## 8. Skills and knowledge

Skills are executable project capabilities, not static prompt snippets glued into AIWF.

`@dharmax/skill-manager` owns discovery, synchronization, activation and execution. AIWF's bridge supplies the requested project root and explicit additional sources. Automatic discovery is project-local; sibling checkout layouts and host-specific global directories are not implicit configuration.

Skill lookup is exposed through the same canonical registry path used by Actor/CLI integrations. A real synchronization or activation error remains visible. An optional missing project skills directory is simply absence.

Manager lifetime must respect project identity. A process-global manager whose first project root wins is invalid.

## 9. Product truth and actor journeys

Product changes must be justified by a named actor journey or explicitly classified as technical maintenance. The durable journey catalog is in [journeys.md](journeys.md).

This protects AIWF from capability-driven development: adding mechanisms because they sound powerful rather than because an actor outcome requires them.

Product severity is about damage to actor outcomes; implementation size is not severity.

## 10. Public boundaries

AIWF has several surfaces with different purposes:

- **CLI/shell** — human operation and drill-down.
- **MCP** — intentionally narrow external-agent contract.
- **internal registry** — larger implementation capability set.
- **AIWF skill** — instructions for coding agents to delegate correctly.

The internal registry is not automatically the public API. MCP names are explicitly selected.

## 11. Architectural stop signs

Stop and simplify if a change introduces:

- a second workflow/product database;
- a second model router;
- a second skill/capability registry;
- a second source mutation engine;
- query-specific handlers for ordinary language shapes;
- full-registry fallback after discovery failure;
- hidden global project state;
- silent failure swallowing;
- mandatory product hierarchy for pure technical maintenance;
- broad repository scans where graph/index evidence can narrow first;
- generated tests as self-certifying acceptance;
- persistent audit/plan documents that merely duplicate AIWF state or Git history.

The target is not a larger framework. It is a small system that remembers why work exists, finds the relevant evidence, makes the smallest justified change, and proves the result.

## Human command adapters and configuration ownership

Config, setup, ticket flow and model commands use shared family-specific functions from the CLI and shell. `artifactCommand` remains the canonical artifact parser; the shell only supplies missing identifiers before invoking it. Entity inspection uses `buildEntityView` in both adapters, with one plain-text fallback. Complete inputs bypass facilitation. Ordinary CLI and plain shell inputs never acquire missing arguments interactively.

AIWF owns settings, raw override layers, setup steps and graph operations. `@dharmax/shell-ui` owns facilitation, View/Review interaction and process presentation. No command bus, second registry or configuration/setup database exists. Source/graph commands with little duplicated behavior remain ordinary registry adapters.

Configuration resolves defaults/environment, global overrides, then project overrides. Nested radar/escalation/routes/provider-option maps merge in that order. Global legacy Ollama host/planner-model aliases remain readable. Writes change only the selected raw layer; reset removes an override and reveals inheritance. Configuration inspection reports effective values and their layer, excludes credential settings and redacts sensitive option fields. Credentials resolve from environment and global credential structures. Malformed relevant configuration fails with its path rather than becoming defaults.

Setup uses concrete step results: satisfied, needed, changed, skipped and failed. Inspection computes required changes without writes. Application backs up existing host files once, replaces only changed content, and verifies writes. Absent hosts remain skipped; MCP schema export is applicable only to a detected Antigravity/Gemini environment. Provider construction errors propagate separately from missing providers; configured credentials never prove connectivity.
