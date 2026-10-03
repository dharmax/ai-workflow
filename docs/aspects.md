# Aspects — Design

Status: authoritative target design for first-class cross-cutting concerns in AIWF.

## 1. Purpose

An Aspect is durable cross-cutting intent: a concern that applies to one or more higher-level scopes and must be addressed, measured, reasoned about, or explicitly decided to the degree required by the selected completeness target.

Examples include persistence/durability, security, privacy, performance/latency, scalability/capacity, robustness/resilience, availability/reliability, data consistency/integrity, concurrency/idempotency, observability/logging/tracing, operability/configuration/deployment, backup/recovery, maintainability/changeability, testability, operational cost/resource efficiency, compatibility/migration, interoperability/portability, accessibility, localization, compliance/auditability, safety, and AI-specific concerns such as determinism, explainability or model cost when relevant.

This is a starter vocabulary, not an enum.

An Aspect is not a Story, Ticket, tag, checklist item, or metric.

## 2. Canonical entity

Add one durable Aspect entity using the normal IntentStatus lifecycle:

~~~
draft → proposed → accepted → deprecated
~~~

Conceptually:

~~~
interface AspectData extends BaseEntityData {
  status?: IntentStatus
  acceptanceCriteria?: string[]
}
~~~

Do not persist satisfied, score, coveragePercent, or productionReady on Aspect. Satisfaction/coverage is derived.

Do not add a fixed Aspect category taxonomy in the first proof. Title/body/criteria carry the semantics.

### Aspect vs Feature

Use a Feature when the thing is a durable capability/behavior the system provides.

Use an Aspect when the thing is a cross-cutting quality/constraint that changes how one or more capabilities/scopes should be designed, implemented, measured or operated.

Example:

- `Durable scheduled execution` is a Feature.
- `Persistence/durability requirements across scheduler state` is an Aspect.

If scope-specific criteria differ materially, prefer a narrower Aspect entity (for example `Search latency` rather than one universal `Performance` node) instead of inventing structured policy on the `applies_to` edge.

## 3. Scope relation

One new semantic predicate is justified:

~~~
Aspect --applies_to--> Idea | Module | Epic | Feature | UserStory
~~~

Aspect deliberately does not apply directly to Ticket. Tickets are executable work and inherit concerns from the scopes they serve.

An Aspect attached to an Epic constrains that initiative's work; it does not become a permanent property of every Feature targeted by the Epic.

An Aspect attached to a Feature is durable with the Feature and flows to its contained Stories and implementing/addressing work.

### Project-wide scope

Project-wide Aspects are legitimate, but AIWF currently has no canonical Project graph entity.

Do not encode "no applies_to edge means global", duplicate the Aspect onto every Module, or add a Project entity incidentally inside this feature.

Leave project-wide Aspect representation as an explicit follow-up design question unless a canonical Project/root entity is introduced for broader reasons.

## 4. Work and evidence relations

Reuse existing predicates where their semantics fit:

~~~
Ticket   --addresses--> Aspect
Test     --verifies--> Aspect
Artifact --verifies--> Aspect
Decision --governs---> Aspect
~~~

Ticket addresses Aspect means executable work intentionally handles the concern.
Test or Artifact verifies Aspect means executable verification, benchmark, report, audit, or measurement provides evidence.
Decision governs Aspect means explicit architectural/product reasoning constrains how the concern is handled.

A Ticket may address both a UserStory and one or more Aspects.

Do not require every applicable Aspect to have a dedicated Ticket or Test. Existing work may address it; some concerns are primarily measured or reasoned about.

## 5. Applicable Aspect resolution

Expose one deterministic query:

~~~
get_applicable_aspects(entityId)
~~~

The resolver is constrained, not generic graph inheritance.

- Idea: direct Aspects applying to the Idea.
- Module: direct Aspects applying to the Module.
- Epic: direct Aspects applying to the Epic.
- Feature: direct Aspects applying to the Feature; do not inherit from targeting Epics.
- UserStory: direct Aspects plus Aspects applying to containing Features.
- Ticket: derive from containing Epics, implemented Features, addressed Stories (including their containing Features), explicitly targeted Modules, and parent Tickets through the same bounded scope resolution.

Deduplicate by Aspect ID and detect Ticket-containment cycles. No unrestricted traversal.

## 6. Aspect assessment

Structural Product Coverage remains unchanged.

Add a separate derived AspectAssessment containing:

- scope ID;
- applicable Aspects;
- each Aspect's criteria;
- addressing Tickets;
- verifying Tests;
- evidence Artifacts;
- governing Decisions;
- known structural gaps.

Do not turn this into a percentage.

Semantic adequacy is judged against the Aspect criteria, target scope, effective completeness target, current evidence/Decisions, and Critic where judgment is required.

A concern may be implemented, measured/benchmarked, explicitly reasoned about, or some combination. Do not force one universal satisfaction path.

## 7. Aspects and completeness

Completeness controls how aggressively cross-cutting concerns are discovered and evidenced. It does not make every common Aspect mandatory.

At lower levels, processing may surface only obvious/material risks. At production level, deliberately scan a broad candidate vocabulary and ask which concerns are materially applicable and insufficiently represented.

System-1 may cheaply shortlist candidate Aspects. A reasoning-grade pass/Critic decides whether a candidate is actually material. No model silently persists a new Aspect or applies_to relation.

Higher completeness may reveal new Aspects, new work addressing existing Aspects, or stronger evidence requirements. Raising completeness is additive/idempotent and does not regenerate existing Aspect structure.

## 8. Aspects and Critic

Every structure-producing Critic receives:

- applicable accepted Aspects;
- candidate missing Aspects suggested for the current completeness target;
- current work/evidence addressing them.

The Critic checks both under-consideration and Aspect ceremony: important concerns must not be omitted, but irrelevant concerns/tasks/tests must not be invented just because they exist in a catalog.

At advanced/production completeness, Aspect review is mandatory for critic=auto.

System-1 may rank likely Aspect candidates but cannot accept/reject a proposal or persist an Aspect.

## 9. Artifact-operation integration

investigate_ticket includes applicable Aspects in the dossier.

prepare_ticket ensures material applicable Aspects are reflected in the Ticket acceptance contract and/or child work. Separate Aspect Tickets are created only when justified.

resolve_ticket includes materially applicable Aspects in completion review. A Ticket need not directly address every inherited Aspect, but it must not violate or silently ignore those material to its work.

process_story/process_feature/process_epic reconcile existing Aspects, suggest materially missing Aspects, run Critic review, then apply accepted Aspect/work changes through the normal safe mutation boundary.

Module-level Aspects influence work targeting/modifying that Module.

## 10. Public operations

First-class deterministic surface:

~~~
create_aspect
update_aspect
get_aspect
list_aspects
link_aspect
unlink_aspect
get_applicable_aspects
assess_aspects
~~~

Normal high-level artifact operations call these internally as needed. Callers should not orchestrate them manually in the ordinary path.

## 11. Safe mutation

Aspect is part of AIWF's intent domain.

Extend the existing Product Intent/Causal Change mutation owner rather than creating AspectChange.

The mutation layer should distinguish mutable intent entities from valid relation-only endpoints such as Idea, Module, Test, Artifact and Decision instead of forcing every endpoint into one CRUD enum.

Required relation shapes:

~~~
Aspect   --applies_to--> Idea | Module | Epic | Feature | UserStory
Ticket   --addresses---> Aspect
Test     --verifies----> Aspect
Artifact --verifies----> Aspect
Decision --governs-----> Aspect
~~~

applies_to is the only new predicate. Preview/fingerprint/apply semantics remain unchanged.

## 12. Projection

Add aspects.md as a projection of canonical graph state.

It shows title/status/body/criteria, scopes, addressing Tickets, verifying Tests/evidence Artifacts, governing Decisions, and derived known gaps.

aspects.md owns editable applies_to relations. Work/evidence relations may initially remain graph/tool-owned and render read-only here to avoid competing projection ownership.

## 13. Non-goals

Do not build a fixed Aspect taxonomy, numerical scores, an Aspect workflow engine, one Ticket/Test per Aspect, a generic rule language, automatic creation of every standard Aspect, persisted satisfaction flags, or a duplicate metrics subsystem.

Operational metrics may provide evidence for an Aspect, but metrics are a separate feature.

## 14. Invariants

1. Aspect is durable cross-cutting intent, not a tag.
2. Aspects attach to higher-level scopes, not directly to Tickets.
3. Tickets inherit concerns from the scopes they serve.
4. Work/evidence/Decisions connect causally to Aspects.
5. Aspect satisfaction is derived, never persisted.
6. Completeness changes rigor, not a hardcoded item count.
7. Critic reviews both omitted and ceremonial Aspects.
8. System-1 only shortlists/ranks.
9. Aspect mutation uses the existing safe Product Intent change path.
10. Metrics and Aspects remain separate concepts.