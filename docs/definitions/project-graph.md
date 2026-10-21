# Canonical Project Graph

**Recommended name:** *Canonical Project Graph* (short: *Project Graph*). The project's existing “semantic graph” / “AST+ Semantic Graph” refers to this Semantika-backed interconnected model.

It connects the **mandatory Product charter** and other product intent (Goals, Concepts, Features, Aspects, Stories), **delivery/work** (Epics, Tickets), **source/architecture**, **governance**, **Tests**, **Decisions** and relevant execution/evidence through typed entities and relationships. Its Product Intent Graph is a **part/area of the same graph**, not a separate database.

The durable project state consists of **repository plus canonical graph**. The graph is the authority for authored AIWF records and relationships; the repository remains the authority for actual source files/history. Source-derived graph evidence needs freshness checks. Human-readable Markdown projections/manifest are views or explicit exports, **not competing live authorities**. Git is not a shadow product database.

The graph enables grounded navigation, dependencies, applicability, impact, charter-alignment review and re-entrant work. A warning and its developer answer must remain traceable, not silently inferred as resolved. Missing actual charter data cannot be replaced with an edge or a projection. **A well-connected or structurally covered graph is not proof of working product behavior**; [Test](test.md) execution and valid current evidence are separate.
