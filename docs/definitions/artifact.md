# Artifact

In ordinary AIWF work, an **artifact** is an identifiable project work product or object acted on or used as evidence: a product definition, Ticket, source/module reference, test, report, decision, etc. AIWF operations may investigate, prepare, resolve or process the appropriate kind through its established owner. This general noun does not impose a shared schema, mutation API or lifecycle.

**Important naming distinction:** the specific graph entity named `Artifact` in `src/graph/ontology.ts` is a *particular record type* used for outputs/reports/verification-related records, not the universal superclass of every artifact. Other kinds (Feature, Ticket, TestNode, File, etc.) retain their own explicit identities and contracts.

A generated document or projection is not automatically the canonical record. See [Canonical Project Graph](project-graph.md) and [architecture](../architecture.md#3-artifact-operations).
