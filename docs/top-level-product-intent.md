# Top-Level Product Intent

**Status:** design authority for the `toplevel1` work.

AIWF must preserve the reason a product exists, not only its implementation work.

The semantic refinement is:

```text
actor reality / observations / motivations
                  │
                Idea
                  │ inspires
                  ▼
                Goal
                  │ inspires
                  ▼
              Concept
                  │ governs
                  ▼
                Flow ──serves──> Goal
                  │ contains
                  ▼
             UserStory
                  ▲
                  │ enables
               Feature
                  ▲
                  │ implements
               Ticket
                  │
              Code / Tests
```

This is a semantic graph, not a compulsory hierarchy. A Flow may serve several Goals, a Goal may have several Flows, one Story may need several Features, one Feature may enable several Stories, and Concepts may govern many scopes.

Epics remain orthogonal temporary work scopes:

```text
Epic --targets--> Goal | Concept | Flow | UserStory | Feature
Epic --contains--> Ticket
```

## Meanings

### Idea

Loose upstream material: observations, circumstances, motivations, pain, possibilities, raw intentions, and undeveloped product ideas.

Do not create entity classes for every psychological or circumstantial category. Preserve those meanings in narrative content until real use demonstrates a queryable distinction.

### Goal

A meaningful outcome worth producing for an actor or the product.

A Goal answers **why this matters**, not how it will be implemented.

### Concept

A product idea, mental model, philosophy, or design principle that shapes how Goals should be pursued.

Examples in AIWF include artifact-first engineering, evidence before claims, and the Prime Directive.

A Concept is not a Decision. A Decision records a concrete accepted choice. A Concept is durable product philosophy/design meaning.

### Flow

A coherent actor journey through the product, serving one or more Goals and shaped by Concepts.

A Flow is broader than a single UserStory and may contain several Stories.

### UserStory

A concrete temporal episode within a Flow.

A Story has a beginning situation/intention, interaction/progression, and useful observable end state. It may be very concise. The actor can be a human, coding agent, API client, scheduler, webhook, service, or other system actor.

A capability sentence such as “user can clean branches” is **not** a UserStory.

### Feature

A durable product/system capability needed to enable one or more Stories.

Canonical relation:

```text
Feature --enables--> UserStory
```

The previous `Feature --contains--> UserStory` relation is feature-first and conceptually wrong. Existing data may be read as legacy compatibility while new product intent uses `enables`.

### Ticket

Executable engineering work. Tickets implement Features or directly address Stories when a separate Feature would be ceremony.

## Product judgments

AIWF may derive and explain these judgments from the graph:

- **relevance** — semantic alignment with Goals, Flows, Stories and Concepts;
- **severity** — damage a defect/risk causes to important actor journeys/outcomes;
- **priority** — actionable ordering informed by severity, relevance, explicit urgency, dependencies, effort and other evidence.

AIWF must not silently persist model-generated relevance/severity scores. It may recommend changes; canonical Product Intent changes remain explicit reviewed mutations.

## Development rule

**Development starts from actor journeys, not capability lists.**

Before implementing a product capability, establish at least one concrete actor journey that gives it meaning. From the journey derive requirements, capabilities, architecture and tests.

The journey states, as briefly as useful:

1. actor and circumstances;
2. intention/goal;
3. interaction/progression;
4. important branch or failure where material;
5. observable useful end state.

Internal/API actors count equally.

Technical maintenance that has no meaningful product journey may remain direct Ticket work. Do not manufacture product ceremony.

## Reasoning rule

Existing AIWF reasoning should look upward when useful:

```text
Ticket
  -> Feature / UserStory
  -> Flow
  -> Goal
  + governing Concepts / Decisions / Aspects
```

This context should guide product review, implementation design, severity/priority advice and gap detection. It must not become another workflow engine or shadow database.

## Implementation constraints

Use the existing Semantika entity/DCR pattern, Product mutation engine, graph, Critic, projections and reasoning surfaces.

Add no ProductDesignManager, requirements service, second graph, or persisted reasoning session.

The conceptual change is large. The mechanism change should remain small.
