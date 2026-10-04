# Digest — Native Semantic Reconciliation

**Status:** accepted AIWF design; implementation pending.

## Purpose

Digest is AIWF's high-level operation for reconciling substantial engineering/product material before that material becomes canonical work or code.

```text
subject material + authoritative evidence + accepted decisions
                           ↓
                         digest
              analyze → reconcile → review
                           ↓
             complete | needs_input | blocked
```

Its single responsibility is:

> **Reconcile meaning into a coherent, evidence-grounded synthesis without owning mutation or engineering execution.**

A separate `aiwf-digest` package is no longer justified. AIWF already owns the project graph, engineering evidence, model routing, correlated metrics, Product Intent, Aspects, Decisions and safe execution surfaces. Exporting project context to a sibling package and then importing its synthesis back would create an artificial boundary.

## Position in AIWF

The high-level surface has three distinct layers:

```text
digest
  understand, challenge and reconcile meaning

process_epic / process_feature / process_story
  turn accepted Product Intent into coherent work

resolve_ticket
  execute and verify engineering work
```

Typical composition:

```text
rough design / requirements / proposal
        ↓
      digest
        ↓
reviewed coherent definition
        ↓
explicit caller acceptance
        ↓
ordinary AIWF change/Product Intent mutation when desired
        ↓
process_* / resolve_ticket
```

Digest does not emulate either downstream layer.

## Non-entity operation

Digest is not durable project truth by itself.

Do **not** add:

- a Digest entity;
- a DigestSession;
- persisted workflow stages;
- resume tokens;
- a second graph/database;
- a Digest manager/service wrapper.

Retrying Digest means re-running it against durable source/project state plus explicit prior decisions.

## Core contract

Keep the semantic contract compact and explicit.

```ts
interface DigestSource {
  id: string
  text: string
  location?: string
}

interface DigestSourceRef {
  sourceId: string
  section?: string
  excerpt?: string
}

type DigestFindingKind =
  | 'contradiction'
  | 'omission'
  | 'duplication'
  | 'assumption'
  | 'evidence_conflict'
  | 'weak_abstraction'

interface DigestFinding {
  id: string
  kind: DigestFindingKind
  material: boolean
  statement: string
  sources: DigestSourceRef[]
}

interface DigestQuestion {
  id: string
  question: string
  why: string
  sources: DigestSourceRef[]
  choices?: string[]
}

interface DigestAnalysis {
  summary: string
  findings: DigestFinding[]
  questions: DigestQuestion[]
}

interface DigestReview {
  verdict: 'accept' | 'revise' | 'needs_input'
  findings: Array<{
    statement: string
    sources: DigestSourceRef[]
  }>
  required?: DigestQuestion[]
}

interface DigestInput {
  subject: DigestSource[]
  evidence?: DigestSource[]
  decisions?: Array<{ questionId: string; answer: string }>
}

type DigestResult =
  | {
      status: 'complete'
      analysis: DigestAnalysis
      synthesis: string
      review: DigestReview
      sources: DigestSourceRef[]
    }
  | {
      status: 'needs_input'
      analysis: DigestAnalysis
      required: DigestQuestion[]
    }
  | {
      status: 'blocked'
      blockers: Array<{ reason: string }>
    }
```

These are semantic concepts, not a demand for one file/type per interface.

### Subject vs evidence

The distinction is strict:

- **subject** — material whose meaning may be reconciled/re-written;
- **evidence** — authoritative/reference material used to judge the subject;
- **decisions** — explicit answers already supplied by the user/caller.

Evidence is not silently rewritten. Subject intent is not silently overridden merely because an evidence source differs; the conflict must be surfaced and resolved according to authority.

## Source loading boundary

The semantic core receives text sources.

Workspace path loading belongs to the AIWF transport/adapter layer:

```bash
aiwf digest docs/debugging-design.md
aiwf digest docs/a.md docs/b.md
aiwf digest docs/debugging-design.md --against docs/artifact-operations.md
```

The loader:

- confines paths to the active project;
- reads existing regular files only;
- records source ID/location and source-size metrics;
- performs no mutation;
- fails clearly when input cannot fit the configured reasoning route.

Do not make file I/O part of the semantic algorithm.

## Evidence policy

### V1: explicit and deterministic evidence only

The first implementation does **not** perform heuristic repository archaeology.

Evidence may come from:

1. caller-supplied `evidence`;
2. explicit `--against` workspace sources;
3. directly related AIWF facts when the subject itself is an AIWF artifact:
   - governing Decisions;
   - applicable Aspects;
   - directly related Product Intent;
   - explicitly linked Modules/files.

No semantic search over the whole repository is needed for the first proof.

If real dogfooding later demonstrates that important evidence is repeatedly missed, add the smallest bounded candidate lookup then. System-1 may rank optional candidates only after deterministic retrieval has produced a bounded set.

Never create another retrieval/index/vector subsystem.

## Semantic algorithm

Exactly three semantic operations exist.

### 1. Analyze

One structured reasoning call determines:

- intended objectives/behavior;
- explicit constraints and accepted decisions;
- important assumptions;
- contradictions;
- omissions;
- duplication;
- weak abstractions;
- evidence support/conflict;
- material unresolved questions.

Every substantive finding references source evidence.

A question is material only when different plausible answers would materially change the synthesis. Non-material uncertainty does not block.

If unresolved material questions remain, return `needs_input` before reconciliation.

### 2. Reconcile

Given subject, evidence, analysis and explicit user decisions:

- preserve supported intent;
- resolve supported contradictions/gaps;
- simplify duplication;
- strengthen weak abstractions when evidence supports it;
- avoid unsupported invention;
- produce one coherent synthesis.

Reconciliation does not expose or depend on private chain-of-thought. The structured analysis is the explicit reasoning artifact.

### 3. Independent review

Review is a fresh structured call against:

- the original subject;
- authoritative evidence;
- accepted user decisions;
- the proposed synthesis.

Do **not** feed it the reconciler's hidden rationale.

Review attacks:

- lost intent;
- invented requirements;
- unresolved contradictions;
- invalid simplification;
- evidence conflict;
- unsupported certainty;
- patch-level reasoning where a stronger invariant is already explicit.

If review returns concrete `revise` findings, allow exactly **one** reconcile → review retry.

If a material question is discovered, return `needs_input`.

If the second review still requires revision, return `blocked` with the unresolved findings. No generic retry framework.

## Cognition and model routing

Use current `@dharmax/llm-utils` only:

- `Asker.json(..., { maxRetries: 1 })`;
- existing model routing;
- configured provider context/output budgets;
- existing correlated metrics.

No `LLMActor` is needed in the semantic core.

No `LLMPipeline` or `LLMSession` owns the lifecycle.

System-1 is not used in V1. It becomes relevant only if a later bounded evidence-candidate set benefits measurably from cheap ranking.

AIWF may define normal route names:

```text
digest.analyze
digest.reconcile
digest.review
```

They use the existing router. They do not create a Digest-specific routing system.

The same model may serve all three routes; independent review means a separate call/context, not necessarily a different model.

## Context and output budgets

The Consuela dogfood showed that model context/output configuration is part of correctness, not merely performance.

Digest must therefore:

- use the configured provider context window;
- set explicit output budgets per semantic call;
- record actual provider/model/token/finish information;
- fail truthfully on timeout/quota/output exhaustion;
- never convert truncation into a semantic conclusion.

For V1, keep source composition simple. The first dogfood corpus fits the configured large context.

If a real source set does not fit coherently, earn the smallest extension:

```text
semantic sections
   → compact analyses with provenance
   → global reconcile
   → independent review against important originals
```

Do not build a permanent corpus/chunker/index in anticipation.

## Provenance

Provenance is mandatory but minimal.

A source reference identifies:

- source ID;
- useful heading/section when available;
- optionally a short bounded excerpt.

It exists to answer:

- what claim came from where?
- what evidence caused a material change?
- what original intent was preserved or rejected?

Do not store source/prompt contents in operational metrics.

Do not introduce source hashes as semantic infrastructure. Benchmark evidence may record repository revisions separately.

## Mutation boundary

V1 Digest is strictly read-only.

It does not:

- edit the subject;
- call `apply_change`;
- mutate Product Intent;
- create Tickets;
- mark artifacts complete.

After explicit acceptance, a caller may use ordinary AIWF mutation operations.

A future convenience command may compose Digest with existing preview/apply, but the mutation remains owned by the normal CausalChangeEngine. There is never a Digest mutation engine.

## Interaction boundary

Digest semantics are UI-neutral.

With shell-ui:

- `needs_input` → renderer-neutral elicitation/form;
- completed synthesis → editable review;
- revise → explicit feedback/decision;
- accept/cancel → caller action.

Plain/non-interactive mode returns the semantic result and never fabricates user decisions.

## Metrics and benchmark evidence

Every Digest run is an AIWF high-level operation and participates in `withArtifactMetrics`.

At minimum record without source contents:

- study/scenario/variant/trial tags when benchmarking;
- AIWF revision and target-project revisions;
- provider/model;
- per-phase calls/tokens/latency;
- total duration;
- source/evidence item counts and bounded size statistics;
- structured-repair attempts;
- findings count by kind/materiality;
- `needs_input` count;
- reconcile/review revision count;
- terminal/failure/finish reasons;
- final review verdict.

Quality is not reduced to a synthetic score.

Human acceptance/rejection of the synthesis is benchmark evidence, not something Digest self-awards.

Controlled benchmark runs must export sanitized metric evidence into a versioned file under `docs/verification/benchmarks/`.

## First dogfood

Subject:

```text
docs/debugging-design.md
```

Explicit evidence:

- `docs/artifact-operations.md`;
- `docs/aspects.md`;
- `docs/product-intent-graph.md`.

Current implementation contracts may be added only when the document makes a concrete claim that the design docs cannot verify.

Success requires more than “the model produced criticism”:

1. explicit source intent is preserved;
2. every material criticism is evidence-backed;
3. no criticism is manufactured merely to change something;
4. real contradictions/duplication/missing invariants are surfaced;
5. the synthesis is materially clearer/stronger when change is warranted;
6. unresolved material choices become `needs_input`;
7. independent review catches controlled seeded omissions/inventions;
8. a human evaluator accepts the substantive improvements or explicitly concludes the original was already stronger.

## Rejection criteria

Reject implementation that adds:

- Digest entities/sessions;
- managers/services around three calls;
- generic workflows/stage engines;
- mirrored Product Intent schemas;
- repository-wide semantic retrieval in V1;
- vector/index/corpus infrastructure;
- Actor wandering;
- duplicate routing or metrics;
- mutation/apply logic;
- Ticket/work generation;
- unbounded retries;
- hidden quality scores;
- benchmark claims without frozen provenance.

The governing invariant is:

> **Digest reconciles meaning. AIWF owns the truth, evidence and execution around it.**
