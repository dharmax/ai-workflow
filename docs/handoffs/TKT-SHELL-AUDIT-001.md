# TKT-SHELL-AUDIT-001 Handoff

## Goal

Make the shell dogfood evidence and metrics audit-grade so an operator can answer, from the artifacts alone:

- which turns were deterministic routing vs AI-planned
- whether a turn used English -> JS or English -> JSON envelope
- what JS was generated when JS planning was used
- which provider/model handled each planning or judging step
- what codelet or command actually mutated files
- what the session actually cost in tokens, latency, and success/failure terms

## Why this exists

The current pushed dogfood evidence at commit `ed3d773a4bd8bdfc9e088e4b955aab947212b2fd` is useful but still not trustable enough for audit.

Observed gaps:

1. `dogfood-projects/space-invaders-emoji-3d/REPORT.md` does not provide per-turn model provenance.
2. The raw transcript is dominated by shell JSON envelopes, so it does not cleanly prove English -> JS.
3. The key build turn used deterministic English -> `run_codelet programming-dogfood-build`, not model-authored JS planning.
4. Metrics still show `totalPromptTokens: 0` and `totalCompletionTokens: 0`, which makes the efficiency story incomplete.
5. The transcript judge is still unreliable and returns malformed output in at least one dogfood run.

## Evidence

- Dogfood report: `dogfood-projects/space-invaders-emoji-3d/REPORT.md`
- Raw transcript: `dogfood-projects/space-invaders-emoji-3d/artifacts/shell/raw-transcript.md`
- Turn log: `dogfood-projects/space-invaders-emoji-3d/artifacts/shell/turns.jsonl`
- Raw per-turn logs: `dogfood-projects/space-invaders-emoji-3d/artifacts/shell/raw/`
- Dogfood driver: `runtime/scripts/ai-workflow/programming-dogfood.mjs`
- Dogfood builder: `runtime/scripts/ai-workflow/programming-dogfood-build.mjs`
- Shell planner: `cli/lib/shell.mjs`
- Operator brain: `core/services/operator-brain.mjs`

## Concrete findings to preserve

### English -> JS is not yet the main protocol

- `core/services/operator-brain.mjs` still says `NL -> JS`, but the planner request is still `format: "json"`.
- `cli/lib/shell.mjs` still requires JSON planner output and throws on non-JSON text.
- When JS is used, it is nested as `plan.code` inside a JSON envelope.
- In the pushed dogfood run, the important build turn did not use `plan.code`; it routed to `run_codelet programming-dogfood-build`.

### The report is missing the trust table the user needs

The report should have an explicit per-turn table with columns like:

- turn number
- human prompt
- planning path
- deterministic or AI
- provider/model
- generated JS artifact path, if any
- executed action
- mutated files
- verification result

### Metrics are still not adequate

Current `ai-workflow metrics --json` shows zero prompt/completion tokens. That means the metrics surface still cannot answer actual usage questions for this session.

## Required implementation slice

1. Add per-turn provenance capture in the dogfood run:
   - planning path
   - provider/model
   - deterministic-vs-AI flag
   - executed action type
   - generated JS path when present

2. Write explicit JS artifacts when a turn uses JS planning:
   - `artifacts/shell/raw/turn-XX.plan.js`
   - optionally `turn-XX.plan.json` for the outer planner payload

3. Make the report explicit about routing:
   - distinguish deterministic `run_codelet`
   - distinguish AI-planned JS
   - distinguish judge/model calls
   - list the models actually used

4. Fix session metrics:
   - record real prompt/completion tokens when available
   - do not silently collapse to zeros without a reason field
   - add per-run metrics to the dogfood report
   - expose model/provider usage for the session

5. Finish transcript verification hardening:
   - close the gap tracked by `TKT-SHELL-TRANSCRIPT-001`
   - keep malformed model output from being reported as a normal result

## Acceptance criteria

- A fresh dogfood run produces a report that names the provider/model for every planning and judge step.
- The report clearly states whether the build turn used deterministic routing or JS planning.
- Any JS-planned turn writes a readable `.plan.js` artifact.
- The report contains enough data for a skeptical operator to verify that the shell, not a hidden manual edit, drove the work.
- `ai-workflow metrics --json` no longer reports a misleading all-zero token story for sessions that used remote models.
- The transcript judge either returns a structured verdict or a clearly labeled structured failure.

## Suggested execution order

1. Fix provenance capture and `.plan.js` artifact writing.
2. Fix metrics capture and reporting.
3. Harden transcript judge fallback and malformed-output handling.
4. Re-run dogfood.
5. Re-run workflow audit.
6. Update the report and verify it answers the audit questions without external explanation.

## Related workflow items

- Ticket: `TKT-SHELL-AUDIT-001`
- Ticket: `TKT-SHELL-TRANSCRIPT-001`
- Historical note id: `a3a653434895a7f72017159fdbb217fec9fa4acd`
