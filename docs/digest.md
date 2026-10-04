# Digest — High-Level Semantic Reconciliation

**Status:** proposed AIWF high-level operation.

## Purpose

AIWF already owns engineering-domain truth, repository evidence, Product Intent, Aspects, Decisions, safe change, artifact processing and bounded cognition.

A separate `aiwf-digest` package would now mostly export AIWF context out of the system and then pass a synthesis back in.

Digest therefore belongs inside AIWF as one high-level semantic operation:

```text
substantial subject material
        +
bounded authoritative project evidence
        ↓
      digest
 analyze → reconcile → independent review
        ↓
 complete | needs_input | blocked
```

Digest is **not** a durable entity, workflow engine, planner, Ticket generator or mutation subsystem.

Its responsibility is:

> turn substantial, imperfect engineering/product material into a coherent, evidence-grounded, independently reviewed semantic synthesis.

## Position in AIWF

The high-level AIWF surface becomes:

```text
digest
  understand / challenge / reconcile accepted meaning

process_epic / process_feature / process_story
  turn accepted Product Intent into coherent project work

resolve_ticket
  execute and verify engineering work
```

Typical flow:

```text
rough design / requirements / proposal
        ↓
      digest
        ↓
reviewed coherent definition
        ↓
optional ordinary AIWF change / Product Intent mutation
        ↓
process_* / resolve_ticket
```

These operations may compose, but none emulates another.

## Core contract

Keep the public contract small.

```ts
interface DigestSource {
  id: string
  text: string
  kind?: 'subject' | 'evidence'
  location?: string
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
      required: RequiredInput[]
    }
  | {
      status: 'blocked'
      blockers: Blocker[]
    }
```

Do not persist Digest sessions or results merely because the operation ran. The durable truth remains the repository and AIWF graph.

A retry receives the subject again plus any user decisions. Re-entrancy comes from durable project state, not hidden continuation state.

## Inputs

Digest should accept:

- one or more workspace files;
- direct text supplied by an in-process/MCP caller;
- selected Product Intent / Decision / Aspect text projected into source form;
- explicit evidence supplied by the caller.

CLI v1:

```bash
aiwf digest docs/debugging-design.md
aiwf digest docs/a.md docs/b.md
aiwf digest docs/debugging-design.md --against docs/artifact-operations.md
```

MCP/in-process callers use the structured contract rather than CLI path syntax.

## Evidence policy

Digest benefits from AIWF because the host already knows the project.

Evidence gathering must remain bounded and inspectable.

Order:

1. explicit evidence supplied by the caller;
2. direct semantic relations already known by AIWF:
   - governing Decisions;
   - applicable Aspects;
   - directly related Product Intent;
   - directly related Modules/files;
3. explicitly referenced local documents;
4. a small optional candidate set selected from deterministic project search and, where useful, System-1 ranking.

Never dump the repository or whole graph into the prompt.

Mandatory explicit evidence is never pruned. Optional candidates may be conservatively ranked.

The result should report which evidence sources materially participated.

## Semantic algorithm

Only three semantic operations exist.

### 1. Analyze

One structured reasoning call extracts:

- intended objectives/behavior;
- explicit constraints and decisions;
- assumptions;
- contradictions;
- omissions;
- duplication;
- weak abstractions;
- conflicts/support from evidence;
- material unresolved questions.

Understanding and critique are one operation.

### 2. Reconcile

Given subject, evidence, analysis and prior user decisions:

- preserve explicit intent;
- resolve supported contradictions/gaps;
- simplify duplication;
- avoid unsupported invention;
- produce a coherent synthesis;
- return `needs_input` when a material ambiguity changes the design.

Clarification is an outcome, not a stage.

### 3. Independent review

A fresh structured call reviews the synthesis against the original subject and authoritative evidence.

It attacks:

- lost intent;
- invented requirements;
- unresolved contradictions;
- invalid simplification;
- patch-level reasoning;
- evidence conflict;
- unsupported certainty.

If review finds concrete defects, permit **one** bounded reconcile → review retry.

After that, return the truthful result. No generic retry framework.

## Cognition

Use current `@dharmax/llm-utils`:

- `Asker.json(..., { maxRetries: 1 })` for structured calls;
- configured model routing and context/output budgets;
- existing correlated metrics.

Do not use `LLMActor` in the core semantic pass. Digest is synthesis over already selected evidence, not tool exploration.

Do not use System-1 merely because it exists. It is useful only for cheap bounded candidate ranking when evidence discovery produces optional alternatives.

The model context must be budget-aware. If input does not fit coherently, use the smallest earned extension:

```text
semantic sections
  → compact section analyses with provenance
  → global reconcile
  → final review against important source evidence
```

No vector database, corpus or resumable pipeline.

## Provenance

Findings should cite source IDs and, where practical, headings/sections or bounded excerpts.

Provenance exists to answer:

- what claim came from where?
- which evidence caused a change?
- which original intent was preserved?

Do not invent content hashes or a permanent source corpus in v1.

## Mutation boundary

V1 Digest is read-only.

It does **not**:

- edit the subject;
- call `apply_change`;
- create/update Product Intent;
- generate implementation Tickets;
- mark artifacts complete.

A caller may take an accepted synthesis and use ordinary AIWF mutation surfaces afterward.

A later convenience command may safely apply a synthesis only by composing existing preview/apply primitives. That convenience must remain outside Digest semantics and must not introduce a second mutation path.

## Interaction

Digest should integrate naturally with shell-ui once available:

- `needs_input` → semantic elicitation/form;
- completed synthesis → editable review;
- revise → one explicit user decision/feedback round;
- accept/cancel → caller action.

The Digest contract itself must stay UI-neutral.

## First dogfood

Subject:

```
docs/debugging-design.md
```

Authoritative evidence should include only the relevant current AIWF design:

- `docs/artifact-operations.md`;
- `docs/product-intent-graph.md` where Product semantics matter;
- `docs/aspects.md` where cross-cutting intent matters;
- current code/contracts when the document makes implementation claims.

Success means the run identifies real contradictions, duplication, missing invariants or unnecessary complexity and produces a synthesis that survives human review.

It must not manufacture criticism to appear useful.

## Rejection criteria

Reject implementation that introduces:

- a Digest entity;
- a DigestManager/Service;
- persisted Digest sessions/results;
- a generic workflow/pipeline engine;
- a mirrored project/product graph;
- another search/vector/index system;
- duplicate model routing/metrics;
- Actor-driven wandering through project tools;
- mutation logic inside Digest;
- Ticket/Product work generation;
- ceremonial multi-stage cognition beyond analyze/reconcile/review.

The invariant is:

> **Digest reconciles meaning. AIWF already owns the project, evidence and execution around it.**
