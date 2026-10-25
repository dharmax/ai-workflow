# Dharmax Architecture

**The default system architecture within [Dharmax-way](dharmax-way.md).** This is a strong starting point for most projects, not a mandatory framework, stack, or deployment pattern. Its layers describe **responsibilities and boundaries**, not a demand to invent components or force every call through every layer. Apply the [Prime Directive](prime-directive.md): the simplest correct design for the actual product wins.

## When and how to establish it

For a new project, use the accepted [Product charter](product.md) to establish an initial architecture **normally before any User Story is elaborated/processed into work Tickets**. User Stories may already have been defined. This is a preferred sequence, **not a rigid gate**.

Architecture inception usually includes actual scaffolding, not just a diagram:

- Identify the principal top-level topics/domains, their API resources and managers. These often correspond to important product concepts/entities; utility domains such as `system/admin` are exceptions.
- Identify the main model entities **and their important relationships**: the initial domain ontology.
- Create the project folders and principal API and manager classes and model entities. Where useful, create skeletons for expected services.
- Establish the main responsibilities and boundaries; detailed entity fields and method signatures need not be decided yet.

Start with what is reasonably foreseeable, not an exhaustive class inventory. As real requirements emerge, improve the architecture rather than multiplying local exceptions or treating the initial structure as immutable.

## Typical logical structure

```text
UI (if applicable)
       |
REST API / resource handlers ----\
                                  +--> Domain manager --> Model entities --> Persistence
Shell / MCP / scheduler adapters -/           |                 |
                                              |                 +--> other entities
                                              +--> helpers
                                              +--> services <--- other relevant components
```

The drawing illustrates common **entry points and calls**, not mandatory call chains. Services are logically alongside the layers, available to whichever components legitimately need them. Helpers are functions used where appropriate. The UI has its own architecture, outside this definition.

## Component responsibilities

### API and other entry adapters

- Normally use REST. **Resource = domain = top-level topic** in the application's organization.
- Typically keep a separate API handler file per resource.
- Keep the HTTP layer **thin**: parse/validate requests, serialize responses, handle transport concerns, authenticate and establish the acting user/actor through suitable shared helpers or framework mechanisms (e.g., Hapi's standard authentication flow).
- Invoke the corresponding manager operation; don't place application business logic in API handlers.
- Other adapters (CLI, shell, MCP, scheduler, etc.) likewise enter through managers. How actor/context is conveyed to a manager is an implementation detail.

### Managers

- Normally **one manager per top-level topic** and **one method per corresponding application/API operation**. A manager is the transport-independent application entry point.
- Managers are **stateless instances**, not per-user session objects.
- Own *meta-business logic*: operation-level permission checks (normally here, not redundantly inside entities), transaction boundaries where relevant, journaling where relevant, and top-level orchestration.
- Execute substantive business behavior by invoking high-level entity methods, helpers and services. Keep managers lean rather than putting the underlying business algorithms inside them.
- **Managers do not call other managers.** Cross-entity logic that belongs to no particular entity normally goes into a helper, called by the manager.
- May extend a small abstract/base manager providing convenient shared mini-helper methods; do not turn that base into a framework.

### Model / entities

- Domain entities encapsulate their high-level behavior and **own their persistence**. Usually these are Semantika-backed entities (using its entity abstractions) or an equivalent entity/persistence mechanism.
- Entity methods commonly interact with other entities and may occasionally call services.
- Entities enforce their intrinsic business invariants; application-level authorization normally occurs at the manager boundary. Exceptions are possible when truly necessary.
- The model can be rich or extremely simple. Some products mostly orchestrate services. **Semantika and a rich object model are not mandatory.**

### Persistence

- Underlies the entity model where persistent state is needed. Entities perform their own persistence work; managers may delimit transactions but do not substitute for entity CRUD.
- Choose the store and persistence abstraction according to the product. A persistence layer is not mandatory if the product has no such requirement.

### Helpers

- Reusable functions, including substantial or **asynchronous** business logic, that do not naturally belong inside an entity or warrant an encapsulated service.
- A typical home for business logic involving several entities when none naturally owns the operation.
- A helper need not be trivial or synchronous. `am-i-allowed` is approximately an example of this style.

### Services

- Cohesive, encapsulated **API-oriented functional facilities**. Their API is a programming contract, not necessarily HTTP.
- May be small or substantial; may use dependencies, plugins, resources or internal state, supplied at initialization when appropriate.
- Can use other services through explicit dependencies; this is permitted, though not usually common.
- Design boundaries that permit a service to **be extracted if needed** into an npm package, distinct system or remote service. Do **not** pre-build network protocols, distributed coordination or microservice infrastructure for hypothetical extraction.
- A service is **not** automatically a microservice. `llm-utils` is an example of service-like functionality.

The helper/service distinction is practical: functions that fit naturally as functions versus cohesive facilities benefiting from their own encapsulated API. Asynchronicity, size and implementation language do not determine the category.

## Testing and deployment defaults

- **Test through managers directly in almost all cases.** Going through REST merely to test business behavior is usually pointless. Test through HTTP or another adapter when that transport/adapter behavior itself matters.
- Logical modularity, deployment distribution and scalability are separate concerns.
- When horizontal scaling is needed, the usual preference is **multiple stateless instances of the whole application**, keeping authoritative shared mutable state and required coordination outside those instances. Exceptions are justified by actual requirements.
- Independently deployed services are an option, **not** the default scalability strategy. Physical packaging need not mirror the logical structure.

## How to apply the default

Use this topology unless a concrete project need favors a simpler or different arrangement. Do not force a manager, entity, service, helper or persistence mechanism into existence just to fill a slot. Conversely, do not abandon the established boundaries merely because an AI agent prefers a fashionable pattern. Revisit decisions when the product or evidence warrants it.

This is a general Dharmax-way architectural definition, **not** a claim that AIWF itself already implements all these conventions.
