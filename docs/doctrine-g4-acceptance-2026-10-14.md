# Doctrine Gate 4 — verified recovery and completion, 2026-10-14

Ticket: `TKT-DOCTRINE-G4-REFS-SURFACE`.
Baseline: `56fb827a623829efa406d71f96315eb6b0108577`.
[Acceptance, source hashes, model usage and exact diagnostics](doctrine-g4-acceptance-2026-10-14.json).
[Preserved failed-attempt report](doctrine-g4-blocked-2026-10-14.md).
[Canonical requirements](../plans/AIWF-ENGINEERING-RULES-DESIGN-PLAN.md).

## Outcome

All three authored Gate 4 criteria and all three mandatory engineering Rules
passed actual independent acceptance through
`openrouter/anthropic/claude-sonnet-4.6`. Native Ticket.resolve recorded the
verification receipt and Done/verified transition. The final source includes
explicit export schema/default-pack versions and safe rejection of deleting
Rule layers that still have graph relationships.

The final parent acceptance used one real model call: 24,917 prompt tokens and
2,022 completion tokens, approximately 37.76 seconds. Real model responses,
Rule verdicts, source hashes and limitations are retained in the JSON evidence.
Implementation was operator-assisted through AIWF guarded edits; autonomous
producer completion is not claimed.

Semantika's required batch capability is published on master at
`0d395ee2b2cef6a03a7cdee23b3a23fe9073e575` (feature commit `11adc8b`).
The initial push encountered one newer documentation-only remote commit.
It was inspected and merged normally; no source conflict, force push or branch
was introduced. Its separate storage-session design remains a future proposal;
this gate implements only the approved narrow native SQLite batch requirement.
Unrelated Semantika projection changes remain local.

## Root cause and recovery method

The failed producer imported resolvePinnedReferences and executeAtomicBatch
from WorkflowStore despite neither export existing, then called the invented
batch function from CLI sync. It wired a consumer before implementing or
verifying its provider, in an unrelated command. Initial Ticket graph evidence
had no code-target relationships. Reading the large CLI method grew the next
request beyond the remaining hard budget.

The materialization/change check verified fingerprint and source writes,
not import linkage or CLI startup for ordinary text replacement. A successful
safe_change therefore did not demonstrate an executable program. The retained
trace does not establish the model's internal reason for inventing those names;
Ollama availability was not the stopping cause.

Recovery first inspected RuleStore, Rule schemas, actual Semantika exports and
collection methods, registry/public MCP surface, CLI/shell/entity-view contracts,
call sites and existing tests without feature mutations. It then added the
provider operation before its consumer, checked actual runtime exports, and
used claim plus preview/fingerprint/apply for implementation in bounded slices.
CLI startup was checked after each slice.

The canonical Ticket was investigated and prepared. Fourteen exact source
targets, including Semantika through the installed dependency path, and two
authored TestNodes grounded the final native resolution. Existing source
context limits were preserved. No new planner, registry, Rule database or
verification pipeline was introduced. The previous broad producer attempt
was not repeated or given more tokens.

## Actual changes

- Semantika SqliteStore.applyBatch: prevalidated record snapshots, exact native
  revision/absence checks, one synchronous native SQLite savepoint transaction,
  rollback across collections and index state, explicit rejection of nesting,
  and fresh committed DTOs. RuleStore creates fresh entities only after commit.
  There are no asynchronous calls inside the transaction.
- RuleStore.saveBatch, previewPack, applyPack and exportPack: existing layer ID
  derivation, optimistic concurrency, full before/after approval fingerprint,
  explicit mandatory-change authorization, audit records in the same atomic
  batch, originating-project checks, graph-grounded modules and safe deletion.
  Existing universal/project/module resolution and defaults are preserved.
- Pinned references: existing TypeScript source APIs inspect explicitly
  authorized, clean local Git checkouts. File bytes are compared to pinned Git
  objects; inventory, exclusions, manifest, coverage and bounded source
  exemplars are recorded. New approval rechecks the actual source. Tampered
  manifests, mismatched snapshots, dirty/unavailable/unsupported sources and
  ambiguous selectors do not fabricate evidence.
- Rule context: approved snapshots are delimited as untrusted cited data,
  delivered to producer and verifier, and included in effective governance
  fingerprints. Required unavailable/unapproved evidence blocks mandatory
  evaluation. Existing approved snapshots require no upstream access at
  routine acceptance.
- Shared adapters: registry and public MCP operations, aiwf rule command,
  shell commands, Rule selection and the existing entity view/form. Nested
  examples/references/checkers use structured JSON fields; saving requires a
  separate full-diff approval. There is no new frontend or editor framework.

## Verified journeys and adversaries

Native SQLite tests inject a real later-write failure and unique-index
violations, checking rollback of earlier inserts, updates, deletes, versions
and index-visible values. Tests reject stale concurrent versions, duplicate
identities, nesting, silent inherited mandatory weakening, cross-project local
layers, missing required reference approval, stale fingerprints, read-only
mutation and unsafe deletion with graph links. Rule and audit writes roll
back together. Lossless underscore/hyphen identities and layered restart
persistence are exercised.

The opt-in live test resolves a real pinned reference containing a hostile
comment, activates it through explicit governed approval, removes the upstream
checkout, and investigates an actual Ticket. Native arithmetic tests pass after
a guarded AdditionRegistry edit; the real OpenRouter verifier still fails the
mandatory Rule and refuses a receipt. A guarded removal then passes and
produces proof using the approved offline snapshot. No mock verifier, silent
fallback or manufactured acceptance verdict is used.

A fixture initially omitted the Ticket body required by existing investigation;
that pre-model failure was corrected once in the fixture. It did not trigger
provider retries or changes to production investigation semantics.

## Validation and preservation

- Read-only grounding checks: 47 passed.
- Final focused contract tests: 11 passed.
- Final AIWF suite: **437 passed, 4 opt-in skips, 0 failed**, 2,776 assertions.
- Semantika complete suite: **46 passed, 0 failed**; TypeScript build passed.
- AIWF packaging passed before commit; packaging is repeated after commit.
- AIWF typecheck retains **19 pre-existing diagnostics in 10 files**.
  Before/after primary headers are recorded. File/column/error-code identities
  match; moved lines and expanded schema types can change diagnostic text.
  No introduced diagnostic identities are claimed as baseline failures.
- Gate 2/3 exact receipt bodies and evidence are preserved. Gate 5 is untouched.
- Unrelated files and database backups are retained; no destructive Git
  operations, stashing or new branches were used.
- A pre-existing whitespace issue in Semantika decisions.md is outside this
  change; checks on the changed source/test files pass.

## Usage and limits

```sh
aiwf rule list --status active --type architecture
aiwf rule get <layer-id>
aiwf rule export
aiwf rule preview request.json
aiwf rule apply request.json <approved-fingerprint>
aiwf rule resolve reference.json <authorized-local-checkout>
```

A change request contains pack, reason and explicit allowWeakening /
approveReferences flags when applicable. The pack contains version, packName,
rules and projectOrigin for project/module layers. Deletion uses the request's
remove list. Authorized checkout mappings for URL locators use
authorizedRepositories. CLI, MCP and shell share these same domain operations.

This gate does not clone or fetch repositories. Complete structural inventory
is bounded to 32 supported TS/JS files; larger or unsupported complete requests
block rather than silently sample. Source analysis contains at most eight
bounded exemplars, not a quality certificate for an entire repository.
New approvals require source access; saved approved snapshots work offline.
Private snapshots are excluded from export unless explicitly exportable.
The SQLite batch operation is not a claim of generic asynchronous
storage-session, PostgreSQL or MongoDB transaction support. Semantic LLM
judgments remain fallible. Unrestricted native host edits remain outside the
managed Ticket boundary. Gate 5 has not begun.
