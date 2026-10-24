# Dharmax Architecture

**The default architectural approach within [Dharmax-way](dharmax-way.md).** It provides a coherent starting structure for most projects, not a compulsory framework, technology stack or deployment topology. Establish the architecture in proportion to the accepted [Product charter](product.md), preferably before detailed User Stories make independent implementation choices. Adapt it to the actual product; do not add layers or components merely to satisfy the diagram. The [Prime Directive](prime-directive.md) applies throughout.

## Typical structure

```text
UI (when relevant)
        |
REST API layer                 Services
        |                     (parallel, reusable)
Managers  <----------------------+
        |                        |
Model / entities  <--------------+
        |
Persistence

Helpers: functions available where appropriate.
```

The diagram expresses the usual responsibilities and main flow, **not** a rule that every interaction must pass through every box. Services sit alongside the main layers and can be used by relevant components.

### API layer

- Normally REST-based.
- **Resource = Domain = top-level topic**: API resources reflect the product's principal topics.
- A UI layer may sit above the API where relevant. UI architecture is a separate concern.

### Managers

- Normally one manager per top-level topic, with one corresponding method per API operation.
- Own the top-level orchestration and **meta-business logic**: authorization/permission checks, transaction boundaries where needed, journaling where needed, and coordination of the operation.
- Perform business operations chiefly through high-level model/entity methods and services. Avoid turning managers into containers for all business logic.

### Model layer

- Represents domain entities and their high-level behavior. Where appropriate, entity classes derive from Semantika's `AbstractEntity` abstractions.
- Entity methods may work with other entities and occasionally use services.
- The model sits above the persistence layer. **Semantika is not mandatory**; some products need only a very simple model, and some are predominantly service orchestration.

### Persistence layer

- Supplies the persistence needed by the chosen model and product. Its design and even its necessity follow actual requirements; no particular store is prescribed by this architecture.

### Services

- Cohesive, encapsulated, **API-oriented functional units** (an API in the general interface sense, not necessarily REST).
- Logically parallel to managers, models and other components; usable by them as appropriate, rather than another compulsory step in the vertical call chain.
- Designed with boundaries that allow a service, when worthwhile, to remain ordinary in-process code or be extracted as a separate npm module, system or remote service without unnecessarily entangling its consumers.
- May receive other services, plugins or dependencies at initialization when relevant; `llm-utils` is an example of service-like functionality.
- A service may be small or large. **A service is not automatically a microservice.**

### Helpers

Functions that do useful work without belonging naturally inside a model entity or service. They prevent unrelated responsibilities from polluting those components. `am-i-allowed` is approximately an example; helper does not mean insignificant.

## Adaptation and deployment

- Rich model, thin model, or mostly service orchestration: choose what the product calls for.
- Modularity, distribution and scalability are distinct decisions. A modular service boundary does not oblige a remote deployment.
- The **whole application** can be horizontally scalable through multiple instances, instead of scaling only by splitting services into microservices. Account for shared state and coordination when that deployment is chosen.
- Physical packaging and deployment need not mirror the logical diagram.
- Keep architecture simple, cohesive and revisable as actual requirements emerge. Neither introduce speculative abstractions nor silently depart from an accepted project-specific architectural decision.

This definition describes the Dharmax default, not a claim that every existing AIWF component currently follows it.
