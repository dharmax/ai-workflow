# Codex/AGY goal — restore AIWF agency

Execute the authoritative agency restoration plan on `master`.

Read first, in order:

1. `docs/agency-constitution.md`
2. `docs/agency-restoration-plan.md`
3. `docs/use-story-catalog.md` — especially J2.4
4. `docs/fix-plan-1.md` — only for historical defect details; where it conflicts, the agency plan wins
5. current `src/actor/engine.ts`, `src/tools/os.ts`, `src/tools/discovery.ts`, `src/tools/compiler.ts`, `src/tools/scripting.ts`
6. the **actual local sibling** `../llm-utils` Actor/session source and types

## Goal

Make AIWF's local Actor a real general problem solver again.

The Actor must understand a user goal first, decide what evidence/actions are needed, and pursue the outcome using:
- its own general reasoning;
- a tiny discovery-independent bootstrap substrate;
- specialized discovered capabilities when useful;
- universal shell/project operations;
- temporary self-created helpers when needed;
- external knowledge when available and genuinely required.

Semantic discovery must become an optional specialization/optimization, **not an entrance gate or competence boundary**.

## Hard constraints

- Work on `master`; do not create a branch.
- Do not add a planner/orchestrator around the LLM.
- Do not add query-specific code for critical path, “second”, “least”, ranking, or the acceptance prompts.
- Do not expose the full registry.
- Do not make `script_eval` a baseline primitive while it exposes the global registry.
- Do not add a new web subsystem merely to pass the current regression.
- Do not claim success from mocked model decisions or green component tests.
- Preserve current-project grounding: general model knowledge may choose methodology; repository facts require observations.

## Required implementation sequence

1. Reproduce/falsify current behavior with black-box agency regressions before fixing.
2. Audit/harden `run_command` truthfulness: cancellation, timeout, stdout/stderr, exit status, empty output, truncation metadata.
3. Make the smallest bootstrap substrate available from Actor step 1 regardless of discovery. First hypothesis: `run_command` + the existing explicit bounded discovery mechanism.
4. Remove mandatory semantic discovery from the competence-critical entrance path. Discovery may add specialized tools later inside the Actor loop.
5. Remove mode prompts/instructions that restrict the Actor to discovered tools. Modes are preferences, not competence walls.
6. Prove ephemeral self-extension with discovery disabled. Use universal execution to create/run a temporary helper. Add baseline codelet primitives only if this cannot be done cleanly with the smaller substrate.
7. Preserve/repair complete trace observability.
8. Run the full Agency Gate in `docs/agency-restoration-plan.md`.
9. Run focused tests, full `bun test --concurrency=1`, strict typecheck, diff check, and affected `llm-utils` tests/typecheck if sibling source changed.
10. Run the mandatory live requests on the ordinary configured route.

Mandatory real requests:

- “what's on the critical path of this project? what's the goal of the project? what's missing?”
- “give me the 2nd most recommended next ticket?”
- “give me the most recommended and the least recommended tickets and see if they are related to the same main artifacts”

Also prove discovery-disabled, misleading-discovery, forced-DEV-mode and missing-capability/self-extension cases from the Agency Gate.

## Stop/report contract

Do not proceed to Product Intent Phase C or unrelated cleanup.

When the Agency Gate is genuinely green, stop and report:

1. root cause proven from source/runtime;
2. final architecture in 5-10 lines;
3. exact bootstrap substrate and why it is minimal;
4. production files changed and why;
5. adversarial Agency Gate results;
6. exact live-request answers/traces and observed tool routes;
7. focused/full/typecheck/sibling verification;
8. measured before/after latency/tool-call effects where available;
9. remaining risks or blockers.

If a live gate fails, leave the work open and report the failure. Do not weaken the gate, special-case the prompt, or declare success from tests.
