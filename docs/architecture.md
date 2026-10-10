# AIWF Architecture

This document describes the durable architecture of AIWF: what owns what, how work flows through the system, and which boundaries must remain simple. It is intentionally about current architectural truth rather than the history of how the design was reached.

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

For product behavior, the useful chain is:

```text
Goal
 ├─ Concepts / Decisions / Aspects
 ↓
Flow
 ↓
User Story
 ↓
Feature
 ↓
Ticket
 ↓
source + tests + evidence
```

These are semantic relationships, not a mandatory bureaucracy.

A **Goal** says what outcome matters. A **Concept** captures durable product meaning or philosophy. A **Flow** describes an actor's larger path. A **User Story** is a narrative slice of that path. A **Feature** is durable capability that enables one or more Stories. A **Ticket** is executable work.

Technical maintenance may begin directly with a Ticket and architectural evidence. AIWF must not invent Goals or Stories simply to satisfy a hierarchy.

Cross-cutting **Aspects** express obligations that apply across artifacts. They matter when they materially constrain implementation or acceptance; they are not a reason to inflate every operation with global context.

Product meaning should flow downward as bounded context. Evidence and implementation facts flow upward as proof. AI-generated relevance or severity scores are not durable truth unless explicitly accepted as product decisions.

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

Epic/Feature/Story processing moves accepted intent toward useful lower-level work. Depth and breadth are bounded. Artifact count is never treated as completeness.

## 4. Evidence and verification

AIWF distinguishes mechanism evidence from product acceptance.

**Mechanism tests** prove exact machinery: graph relations, mutation validation, tool isolation, parsing, timeouts, deterministic selection and compatibility.

**Journey acceptance** proves that the real configured path produces the intended actor outcome across components.

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
