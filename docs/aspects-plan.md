# Aspects — Implementation Plan

Design authority: docs/aspects.md.

This is an AIWF-owned development flow.

Aspects must land before ticket investigation/preparation/resolution is considered complete, because those operations consume applicable Aspect context.

# AIWF-ASPECTS

## Start

1. aiwf sync
2. create/reuse and claim AIWF-ASPECTS
3. use AIWF graph/context first; read source surgically.

## Gate 1 — entity + deterministic graph semantics

Add:

- Aspect entity using IntentStatus;
- optional acceptanceCriteria;
- applies_to predicate;
- allowed relations from the design;
- Product Intent mutation support for Aspect;
- deterministic CRUD/query;
- aspects.md projection.

Do not add semantic generation yet.

Acceptance:

- CRUD round trip;
- relation validation;
- Decision→Aspect;
- Ticket→Aspect;
- Test/Artifact→Aspect;
- projection round trip without duplicate relation ownership.

Run typecheck/tests + KISS audit.

## Gate 2 — applicable Aspect resolution

Implement get_applicable_aspects(entityId) with only the bounded rules in the design.

Acceptance covers:

- Feature direct Aspect;
- Story inheritance from Feature;
- Epic Aspect reaches contained Ticket but not targeted Feature;
- Module Aspect reaches Ticket targeting that Module;
- parent/child Ticket inheritance;
- deduplication;
- cycle safety;
- no unrelated graph traversal.

Gate + KISS audit.

## Gate 3 — derived assessment

Implement assess_aspects(scopeId).

Return structural evidence only:

- applicable Aspects;
- addressing Tickets;
- verifying Tests;
- evidence Artifacts;
- governing Decisions;
- known structural gaps.

Do not invent numerical completeness.

Do not let the deterministic layer decide whether a qualitative Aspect is semantically satisfied.

Gate with realistic security/performance/persistence examples.

## Gate 4 — cognition integration

Integrate Aspects into the artifact-operation policy:

- System-1 may shortlist candidate missing Aspects from a bounded common vocabulary plus existing project Aspects;
- reasoning/Critic adjudicates applicability;
- advanced/production auto-critic reviews Aspects;
- accepted changes use proposal → Critic → deterministic validation → apply.

Prove both:

- a materially missing concern is surfaced;
- irrelevant standard concerns are not manufactured as ceremony.

## Gate 5 — operation integration

Wire applicable Aspect context into:

- investigate_ticket;
- prepare_ticket;
- resolve_ticket;
- process_story;
- process_feature;
- process_epic.

Acceptance must include:

- existing Ticket work addressing an Aspect;
- decomposition creating dedicated Aspect work only when justified;
- benchmark/report evidence for performance/cost;
- Decision-only consideration where implementation is unnecessary;
- POC→production upgrade revealing additional material Aspect gaps without duplicating existing structure.

## Completion

~~~bash
bun run typecheck
bun test
~~~

Then full diff + method-by-method KISS audit + one real project case.

Reject if implementation creates a taxonomy framework, Aspect workflow engine, percentage scoring, generic graph inheritance, or shadow metrics system.