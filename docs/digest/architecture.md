# Digest Architecture

## Ownership

`digest` is a project operation owned by ai-workflow.

It uses:

- filesystem + Git metadata for source discovery/change detection;
- the existing WorkflowStore/Semantika graph for canonical state;
- the existing AST graph to resolve code targets;
- the configured LLM only for semantic extraction/matching that cannot be done reliably by code;
- existing projection sync after successful graph mutation.

It must not introduce a second persistence layer, planner, agent loop, event bus, or generic ingestion framework.

## Pipeline

```text
DigestRequest
  path
  optional code scope
  mode: preview | apply
        │
        ▼
1. Scan
   deterministic file discovery
   normalization
   hashes
   exclusions
        │
        ▼
2. Select
   compare with previous digest provenance
   unchanged files disappear from semantic work
        │
        ▼
3. Extract
   bounded document slices
   LLM returns typed semantic candidates only
        │
        ▼
4. Resolve
   deterministic graph lookup first
   fuzzy/LLM entity matching only for ambiguous cases
   AST graph resolves code targets
        │
        ▼
5. Reconcile
   compare candidates with current durable entities/relations
   preserve human-owned state
   produce ChangeSet
        │
        ├── preview → render
        │
        └── apply
              │
              ▼
6. Commit graph transaction
   upsert entities
   upsert/remove digest-owned relations
   record provenance
              │
              ▼
7. Projection sync
```

## Input model

First proof supports a directory or a single text file.

Supported text formats should initially be intentionally boring:

- Markdown
- plain text

Additional structured formats are not needed until evidence demands them.

The scanner must:

- resolve paths relative to project root;
- reject paths outside the project unless explicitly supported later;
- ignore `.git`, `.ai-workflow/state`, generated projections and obvious binaries;
- produce stable normalized relative paths;
- hash content;
- preserve heading/line ranges for provenance;
- order input deterministically.

## Semantic candidate model

The extractor does **not** write the graph. It returns typed candidates.

Minimum candidate kinds for the first proof:

- `epic`
- `ticket`
- `decision`
- `idea`
- `relation`
- `code_target`

Each candidate includes:

```ts
type Candidate = {
  kind: 'epic' | 'ticket' | 'decision' | 'idea' | 'relation' | 'code_target'
  title?: string
  body?: string
  explicitness: 'explicit' | 'inferred'
  confidence: 'speculative' | 'probable' | 'confirmed'
  source: {
    path: string
    startLine?: number
    endLine?: number
    heading?: string
    sourceHash: string
  }
  hints?: {
    existingId?: string
    parentTitle?: string
    dependencyTitles?: string[]
    codeRefs?: string[]
  }
}
```

This is an internal contract, not necessarily a new public ontology.

## What may become durable

Use existing durable entities wherever they fit:

- plan/theme → `Epic`
- executable work → `Ticket`
- explicit architectural choice → `Decision`
- undeveloped possibility → `Idea`
- source/run provenance → existing `Artifact` plus predicate metadata

Do not create Requirement, Risk, Question, Document, DigestRun or other new entity classes in the first proof unless implementation demonstrates that an existing entity cannot represent necessary semantics without distortion.

A digest run can be represented by an `Artifact` whose `action` is `digest` and whose metadata contains the source root, file hashes and operation summary.

## Provenance

Every digest-created relation must carry predicate payload provenance where possible:

```ts
{
  confidence,
  state,
  sourceRange,
  sourcePath,
  sourceHash,
  digestArtifactId,
  ownership: 'digest'
}
```

Digest-created entities carry equivalent provenance in entity metadata.

Provenance serves three purposes:

1. explain why a graph fact exists;
2. make re-digest incremental;
3. distinguish digest-owned material from human-owned state.

## Identity

Identity is the hard part. Do not use random IDs for digest-generated entities.

Identity resolution order:

1. explicit stable ID present in source, if valid;
2. prior provenance match for the same source anchor;
3. exact existing graph match on type + normalized title within the relevant parent/scope;
4. deterministic semantic matching against a **small candidate set**;
5. create a stable generated ID derived from project-local namespace + source lineage.

A title edit must normally update the same entity, not create another one.

Source line numbers alone are never identity because inserting lines would destabilize them.

## Human ownership rule

Digest may freely update fields and relations that it previously created **only while those fields remain digest-owned**.

If a durable entity has been manually edited/accepted/rejected, digest must not silently revert that state.

At minimum preserve:

- ticket lane/status/claim;
- explicit human priority;
- accepted/rejected decisions;
- manual body/title changes unless ownership metadata says the field is generated.

When source material conflicts with human-owned state, return a conflict in the ChangeSet.

## Reconciliation

Reconciliation produces a deterministic ChangeSet:

```ts
type DigestChangeSet = {
  create: Change[]
  update: Change[]
  relate: Change[]
  unlink: Change[]
  retire: Change[]
  conflicts: Conflict[]
  unchanged: number
}
```

No graph mutation happens during extraction or matching.

Apply occurs in one store transaction where practical.

Removing text from a design document must **not delete arbitrary project state**. Digest may retire/unlink only material it owns and can prove came from that source lineage.

## Code graph integration

A planning document frequently names implementation targets.

Resolution order:

1. exact relative file path;
2. exact symbol ID/name within explicit file/module;
3. graph query within provided code scope;
4. bounded fuzzy resolution;
5. unresolved target recorded in preview instead of guessed.

Resolved work should use existing predicates:

- Epic `contains` Ticket
- Ticket `targets` Module/File/Symbol
- Ticket `modifies` Module/File/Symbol when the source explicitly specifies modification
- Ticket `depends_on` Ticket
- Ticket `blocks` Ticket
- Decision `governs` Module/File/Symbol
- Artifact `generates` digest-created entities where useful

This is the bridge to later refactoring: a refactor design can be digested into work whose scope is already attached to the code graph.

## LLM contract

The LLM is not allowed to improvise persistence or infer repository facts from memory.

Its extraction prompt receives:

- one bounded document slice;
- compact document outline/context;
- relevant existing candidate entities from deterministic graph lookup;
- optional compact AST/code target matches.

It returns structured candidates only.

The host validates every result before reconciliation.

A bad or unavailable LLM must fail the semantic step clearly; deterministic scanning/state must remain intact.

## Incrementality

Persist per-source digest provenance in the digest Artifact metadata:

- normalized source root;
- file path;
- content hash;
- optional extraction schema version;
- optional model/prompt version;
- entities/relations previously attributed to that file.

On the next run:

- same hash + compatible extractor version → reuse prior semantic result;
- changed hash → re-extract only that file;
- removed file → reconcile only digest-owned claims from that file;
- new file → extract only that file.

This is sufficient for the first proof. Do not build a general cache framework.

## Preview and apply

Preview is a first-class operation.

```text
CREATE  EPIC-...  "Refactor scheduler"
UPDATE  TKT-...   title/body from scheduler-plan.md
RELATE  TKT-...   targets Symbol:ScheduleRunner
RETIRE  TKT-...   source requirement removed
CONFLICT ADR-...  source contradicts accepted human decision
```

The model does not format the authoritative ChangeSet; code does.

## Non-goals

First proof explicitly excludes:

- arbitrary PDFs/Office docs;
- embeddings-first ingestion;
- generic RAG;
- autonomous implementation of generated tickets;
- automatic source-document rewriting;
- project-wide semantic re-analysis;
- workflow orchestration;
- speculative ontology expansion;
- refactoring mutations themselves.

Digest prepares/refines the graph. Refactoring is a consumer built later.
