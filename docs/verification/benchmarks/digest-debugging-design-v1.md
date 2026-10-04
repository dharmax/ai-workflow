# Benchmark: Native Digest on Debugging Design

**Study ID:** `digest-debugging-design-v1`  
**Status:** pre-registered; no outcome recorded yet.

## Question

Does native AIWF Digest improve evidence-grounded semantic reconciliation of a substantial engineering design compared with a direct model response using the same source material?

## Frozen task

Subject:

- `docs/debugging-design.md`

Authoritative evidence:

- `docs/artifact-operations.md`
- `docs/aspects.md`
- `docs/product-intent-graph.md`

At execution time the evidence bundle must record the exact AIWF/project revisions and model configuration.

No additional source may be introduced for one variant only.

## Variants

### A — direct model

Same configured reasoning model, same subject/evidence, same practical context/output budget.

Instruction: reconcile the subject against the evidence and return a coherent improved definition, asking only for materially unresolved decisions.

No native Digest analyze/reconcile/review orchestration.

### B — AIWF Digest

Native `aiwf digest` with the same subject/evidence.

Metric tags:

```text
study=digest-debugging-design-v1
scenario=debugging-design-reconciliation
variant=aiwf-digest
trial=1
```

## Controlled seeded case

Before the real-document comparison, use an ephemeral derived subject containing three known defects:

1. one explicit invariant removed;
2. one statement contradicting authoritative evidence;
3. one unsupported requirement invented.

The oracle is fixed before either variant runs.

Record whether each variant:

- detects the defect;
- corrects it without losing surrounding intent;
- introduces a new unsupported material claim.

The seeded fixture is test evidence, not a replacement for the real dogfood.

## Real-document evaluation rubric

Evaluate each output on factual criteria:

- **intent fidelity:** explicit important subject intent lost? yes/no + examples;
- **evidence grounding:** unsupported material findings? count + examples;
- **real issue yield:** evidence-supported material problems identified;
- **resolution quality:** identified issues actually resolved rather than merely restated;
- **unresolved decisions:** material ambiguity surfaced as a question rather than guessed;
- **fabrication:** invented AIWF behavior/requirements;
- **coherence:** evaluator decision `accept | revise | reject`.

Do not create a weighted composite score.

If practical, present outputs without variant labels during qualitative review.

## Efficiency evidence

Record separately:

- wall time;
- provider/model calls;
- prompt/completion/total tokens;
- API cost only when genuinely available;
- source/tool reads;
- schema repair calls;
- review/revision rounds;
- user interventions;
- termination/failure reasons.

External-client metrics that are not observable remain `unavailable`.

## Claim rules

Allowed claims must match the evidence.

Examples:

- “Digest used X tokens vs Y for the baseline” only if both were measured comparably.
- “Digest caught all three seeded defects” only if the fixed oracle confirms it.
- “Digest produced a preferred real design” only if human evaluation records that outcome.

Do not claim general coding productivity from this semantic benchmark.

## Evidence files

Planned:

- `digest-debugging-design-v1.json` — sanitized metric export;
- this file — benchmark definition + later concise results/evaluation.

Failed trials remain recorded.
