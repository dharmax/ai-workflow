# Product Intent Change — Design

Status: authoritative AIWF design for Product Intent mutation through the Causal Change Engine.

## Purpose

AIWF already owns the Product Intent Graph and deterministic product/ticket tools. The next AIWF capability is to make Product Intent changes use the same safe change path as code changes:

```text
ChangeRequest
    ↓
preview_change
    ↓
ChangePreview + fingerprint
    ↓
explicit apply_change
    ↓
Product Intent Graph
    ↓
coverage / impact verification
```

This work belongs entirely to `ai-workflow`. Consumers such as `aiwf-digest`, MCP clients, coding agents, or a future Consuela skill consume the capability; they do not own its semantics.

## Ownership

AIWF owns:

- Epic / Feature / UserStory / Ticket semantics and lifecycles;
- allowed Product Intent relations;
- Product Impact and Coverage;
- Product Intent mutation validation;
- preview / fingerprint / apply / verification;
- public CLI/MCP/tool surfaces.

Semantika owns generic graph persistence/search primitives. Product semantics must not leak into Semantika.

External consumers own interpretation of higher-level intent. AIWF's deterministic mutation layer does not implement semantic verbs such as `enhance` or `simplify`.

## Primitive mutations

Extend the existing `ChangeMutation` contract only with:

```text
product_create
product_update
product_delete
product_link
product_unlink
```

One `ChangeRequest` may produce several mutations.

Do not create another ProductChange/Work API.

## Reuse existing Product Intent semantics

The existing Product Intent Graph remains authoritative.

- Epic lifecycle: draft / planned / active / completed / cancelled.
- Feature/UserStory lifecycle: draft / proposed / accepted / deprecated.
- relation shapes remain those validated by the Product Intent tools.
- do not add Feature/UserStory priority merely because an external caller asks to "change priority".
- hard deletion is never an uncontrolled cascade.

Existing deterministic product/ticket tools remain useful public surfaces. Their mutation mechanics and the Change Engine must converge on one small product-domain implementation rather than duplicate rules.

## Delete / retirement

Natural product retirement and physical deletion are distinct.

Preview must expose durable incoming/outgoing relations before destructive deletion.

A coherent request may:

- update lifecycle to deprecated/cancelled;
- explicitly unlink relations;
- physically delete only when valid and explicitly requested.

Otherwise block and explain dependents.

## Preview

Product preview performs zero graph mutation.

It must:

- resolve exact existing IDs;
- validate the complete mutation set before apply;
- reject invalid relation shapes and lifecycle transitions;
- expose affected Product Intent neighborhood, warnings and blockers;
- include relevant current graph state in the existing fingerprint;
- derive appropriate coverage/impact verification.

No persisted ChangePlan.

## Apply

`apply_change(request, fingerprint)` recomputes preview and rejects a stale fingerprint.

Before the first write, validate the complete coherent mutation set.

Then apply through the single Product Intent mutation owner and run derived verification.

Do not invent a generic transaction/rollback framework. Use existing storage guarantees where they fit and keep the implementation proportionate.

## Existing flows

`src/product/apply.ts` / Epic decomposition is an existing semantic proposal flow.

Preserve its behavior, but converge accepted writes on the canonical Product Intent mutation path where practical. It must not remain a second implementation of Product Intent rules.

## External compatibility

AIWF exposes Product Intent change through its existing tool/CLI/MCP boundaries.

This deliberately permits, without coupling AIWF to them:

- `aiwf-digest` to compile large definitions into previews;
- coding agents to use Product Intent change;
- Consuela/ai-cli to consume AIWF as a capability or skill;
- future semantic-registry/skill-manager integration if separately justified.

AIWF must not depend on `aiwf-digest` or `ai-cli` for this capability.
